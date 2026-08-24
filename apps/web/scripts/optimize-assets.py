"""Build production-sized WebP variants from the lossless Room Riot masters."""

import json
from pathlib import Path

from PIL import Image


ASSET_DIRECTORY = Path(__file__).resolve().parent.parent / "assets"
MANIFEST_PATH = ASSET_DIRECTORY.parent / "asset-manifest.json"


def optimize(source_name: str, output_name: str, maximum_edge: int | None, quality: int) -> None:
    source = ASSET_DIRECTORY / source_name
    target = ASSET_DIRECTORY / output_name
    with Image.open(source) as opened:
        image = opened.convert("RGBA" if "A" in opened.getbands() else "RGB")
        if maximum_edge is not None:
            image.thumbnail((maximum_edge, maximum_edge), Image.Resampling.LANCZOS)
        image.save(target, "WEBP", quality=quality, method=6)
        with Image.open(target) as optimized:
            if "A" in opened.getbands():
                if "A" not in optimized.getbands() or optimized.getpixel((0, 0))[-1] != 0:
                    raise ValueError(f"{target.name} did not preserve transparent outer pixels")
            elif "A" in optimized.getbands():
                raise ValueError(f"{target.name} unexpectedly gained an alpha channel")
        print(f"{source.name}: {opened.width}x{opened.height} -> {image.width}x{image.height}")


if __name__ == "__main__":
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    for asset in manifest["productionAssets"]:
        optimize(asset["source"], asset["output"], asset["maxEdge"], asset["quality"])
