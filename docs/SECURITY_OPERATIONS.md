# Security and release evidence

This repository treats dependency, container, provenance, and rollback evidence as release gates.
The workflow in `.github/workflows/truenas.yml` is the authoritative CI entry point.

## Required checks

1. Run `pnpm audit --prod --audit-level=high`; a release cannot ship with an unresolved high or
   critical production dependency finding.
2. Build the production image and scan it with Trivy for `HIGH,CRITICAL` vulnerabilities. Unfixed
   findings are reported but do not fail the gate until a remediation or risk acceptance is recorded.
3. Buildx must publish both `linux/amd64` and `linux/arm64` manifests with an SBOM and maximum-detail
   provenance attestation.
4. Record the immutable commit-SHA image reference and digest for every release. Convenience tags
   (`main`, `latest`, and semantic release tags) are never rollback evidence by themselves.
5. Every GitHub Action is pinned to an immutable commit SHA; `pnpm check:workflow-pins` enforces this
   invariant. Before release sign-off, attach the
   workflow run URL, dependency report, container report, SBOM/provenance evidence, and rollback
   rehearsal. The pinned SHA must retain a nearby human-readable version tag comment.

## Evidence record

For each candidate, record:

```text
Release tag:
Commit SHA:
Image digest (amd64):
Image digest (arm64):
Dependency audit run/report:
Container scan run/report:
SBOM and provenance attestations:
Backup/restore evidence:
Rollback evidence:
Reviewer:
```

The local production dependency audit currently reports `No known vulnerabilities found`. A local
container scan is not claimed until it runs in CI or on a host with a working Linux Docker daemon;
the local Docker client has no such daemon in this workspace.
