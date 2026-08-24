#!/usr/bin/env python3
"""Validate a Room Riot game's curated content and basic integration.

This intentionally uses only the Python standard library so it can run before
Node dependencies are installed. It validates the source packs and recognizes
the repository's deterministic expansion convention when raw packs are
smaller than the desired runtime target.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, NamedTuple

MODES = ("family", "standard", "after-dark")
VALID_KINDS = {"open", "player-targeted"}
VALID_ROUND_TYPES = {"standard", "alibi", "double-trouble", "false-accusation", "most-likely"}
GAME_ID_RE = re.compile(r"^[a-z][a-z0-9-]{1,31}$")


class PackResult(NamedTuple):
    count: int
    ids: set[str]
    texts: set[str]


def normalize(value: str) -> str:
    return " ".join(value.casefold().split())


def read_json(path: Path, failures: list[str]) -> dict[str, Any] | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        failures.append(f"missing file: {path}")
        return None
    except (OSError, json.JSONDecodeError) as exc:
        failures.append(f"cannot parse {path}: {exc}")
        return None
    if not isinstance(value, dict) or not isinstance(value.get("prompts"), list):
        failures.append(f"{path} must be an object with a prompts array")
        return None
    return value


def expansion_target(source: Path) -> int | None:
    try:
        text = source.read_text(encoding="utf-8")
    except OSError:
        return None
    if "expandCuratedPrompts" not in text:
        return None
    match = re.search(r"CURATED_PROMPT_TARGET\s*=\s*(\d+)", text)
    return int(match.group(1)) if match else None


def expansion_is_tested(tests: Path, min_prompts: int) -> bool:
    """Require a focused test to cover runtime expansion and uniqueness."""
    try:
        text = tests.read_text(encoding="utf-8")
    except OSError:
        return False
    has_count_assertion = bool(
        re.search(
            rf"(?:length|toHaveLength)[^\n]{{0,40}}{min_prompts}"
            rf"|{min_prompts}[^\n]{{0,40}}(?:length|toHaveLength)",
            text,
        )
    )
    has_mode_coverage = "contentMode" in text or all(mode in text for mode in MODES)
    return "new Set" in text and has_count_assertion and has_mode_coverage


def validate_pack(
    path: Path,
    min_prompts: int,
    source: Path,
    tests: Path,
    failures: list[str],
    warnings: list[str],
) -> PackResult:
    pack = read_json(path, failures)
    if pack is None:
        return PackResult(0, set(), set())
    prompts = pack["prompts"]
    if len(prompts) < min_prompts:
        target = expansion_target(source)
        if target is not None and target >= min_prompts:
            if expansion_is_tested(tests, min_prompts):
                warnings.append(
                    f"{path}: raw pack has {len(prompts)} prompts; runtime expansion declares {target}"
                )
            else:
                failures.append(
                    f"{path}: runtime expansion declares {target}, but its focused test does not verify count and uniqueness"
                )
        else:
            failures.append(f"{path}: {len(prompts)} prompts; expected at least {min_prompts}")

    ids: list[str] = []
    texts: list[str] = []
    saw_kind = False
    saw_round_type = False
    for index, prompt in enumerate(prompts):
        label = f"{path} prompt {index + 1}"
        if not isinstance(prompt, dict):
            failures.append(f"{label} must be an object")
            continue
        prompt_id = prompt.get("id")
        text = prompt.get("text")
        if not isinstance(prompt_id, str) or not prompt_id.strip():
            failures.append(f"{label} has a missing/empty string id")
        else:
            ids.append(normalize(prompt_id))
        if not isinstance(text, str) or not text.strip():
            failures.append(f"{label} has missing/empty text")
        else:
            texts.append(normalize(text))
        if "kind" in prompt:
            saw_kind = True
            if not isinstance(prompt["kind"], str) or prompt["kind"] not in VALID_KINDS:
                failures.append(f"{label} has invalid kind {prompt['kind']!r}")
        if "roundType" in prompt:
            saw_round_type = True
            if (
                not isinstance(prompt["roundType"], str)
                or prompt["roundType"] not in VALID_ROUND_TYPES
            ):
                failures.append(f"{label} has invalid roundType {prompt['roundType']!r}")

    if len(ids) != len(set(ids)):
        failures.append(f"{path}: duplicate prompt IDs")
    if len(texts) != len(set(texts)):
        failures.append(f"{path}: duplicate normalized prompt text")
    if saw_kind and any("kind" not in prompt for prompt in prompts if isinstance(prompt, dict)):
        failures.append(f"{path}: prompts must consistently include kind")
    if saw_round_type and any(
        "roundType" not in prompt for prompt in prompts if isinstance(prompt, dict)
    ):
        failures.append(f"{path}: prompts must consistently include roundType")
    return PackResult(len(prompts), set(ids), set(texts))


def validate_integration(repo_root: Path, game_id: str, failures: list[str]) -> None:
    checks = {
        "packages/contracts/src/index.ts": "contract ID",
        "apps/server/src/room-manager.ts": "server registration",
        "apps/server/src/http.ts": "HTTP routes and assets",
        "apps/server/package.json": "server dependency",
        "apps/web/src/main.ts": "web catalog",
        "apps/web/src/protocol.ts": "web protocol",
        "apps/web/package.json": "web dependency",
        "tsconfig.json": "root project reference",
        "apps/server/tsconfig.json": "server project reference",
        "apps/web/tsconfig.json": "web project reference",
        "pnpm-lock.yaml": "workspace lockfile",
        "Dockerfile": "Docker build and runtime packaging",
        "scripts/verify-deployment.mjs": "deployment verifier",
    }
    for relative, label in checks.items():
        path = repo_root / relative
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            failures.append(f"cannot read {label} file: {path}")
            continue
        if game_id not in text:
            failures.append(f"{label} does not reference {game_id!r}: {path}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument("--game-id", required=True)
    parser.add_argument("--min-prompts", type=int, default=100)
    parser.add_argument("--require-integration", action="store_true")
    parser.add_argument("--json", action="store_true", dest="as_json")
    args = parser.parse_args()

    root = args.repo_root.resolve()
    failures: list[str] = []
    warnings: list[str] = []
    counts: dict[str, int] = {}
    mode_ids: dict[str, set[str]] = {}
    mode_texts: dict[str, set[str]] = {}
    if not GAME_ID_RE.fullmatch(args.game_id):
        failures.append("game-id must match ^[a-z][a-z0-9-]{1,31}$")
    if args.min_prompts < 1:
        failures.append("min-prompts must be positive")

    game_root = root / "games" / args.game_id
    package_json = game_root / "package.json"
    source = game_root / "src" / "index.ts"
    tests = game_root / "src" / "index.test.ts"
    for required in (package_json, source, tests):
        if not required.is_file():
            failures.append(f"missing required game file: {required}")

    for mode in MODES:
        pack_result = validate_pack(
            game_root / "content" / f"{mode}.json",
            args.min_prompts,
            source,
            tests,
            failures,
            warnings,
        )
        counts[mode] = pack_result.count
        mode_ids[mode] = pack_result.ids
        mode_texts[mode] = pack_result.texts

    for index, left_mode in enumerate(MODES):
        for right_mode in MODES[index + 1 :]:
            duplicate_ids = mode_ids[left_mode] & mode_ids[right_mode]
            if duplicate_ids:
                failures.append(
                    f"{left_mode}/{right_mode}: {len(duplicate_ids)} prompt IDs are reused across modes"
                )
            duplicate_texts = mode_texts[left_mode] & mode_texts[right_mode]
            if duplicate_texts:
                warnings.append(
                    f"{left_mode}/{right_mode}: {len(duplicate_texts)} normalized prompt texts are reused across modes"
                )
    if args.require_integration:
        validate_integration(root, args.game_id, failures)

    result = {
        "gameId": args.game_id,
        "counts": counts,
        "warnings": warnings,
        "failures": failures,
        "ok": not failures,
    }
    if args.as_json:
        print(json.dumps(result, indent=2))
    else:
        for mode, count in counts.items():
            print(f"[INFO] {mode}: {count} source prompts")
        for warning in warnings:
            print(f"[WARN] {warning}")
        for failure in failures:
            print(f"[FAIL] {failure}")
        print("[PASS] game content validation succeeded" if not failures else "[FAIL] game content validation failed")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
