# Release-candidate sign-off

Complete this record against one immutable commit and one published image digest. A green code check
alone is not release approval.

## Identity

- Release tag:
- Commit SHA:
- Image digest(s), including `linux/amd64` and `linux/arm64`:
- CI workflow run:

## Gates

| Gate                           | Required evidence                                                                        | Status / link                          |
| ------------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------- |
| G0 gameplay integrity          | Full compiled smoke, reconnect, rematch, and no open P0/P1 defects                       | Pending release run                    |
| G1 architecture/contracts      | Typecheck, contract tests, and compiled route verification                               | Pending release run                    |
| G2 host/player/display quality | Device matrix, visual review, zoom, motion, and screen-reader evidence                   | Manual evidence required               |
| G3 content/fairness            | Content count, taxonomy/safety review, playtest notes, and balance report                | Content and playtest evidence required |
| G4 operations/security         | Dependency and container reports, SBOM/provenance, backup/restore, metrics, and rollback | External release evidence required     |
| G5 deployment/release          | Multi-architecture image, immutable tags, branch protection, and named approvals         | External release evidence required     |

## Required attachments

- [ ] CI run URL and exact commit
- [ ] Dependency audit and container scan reports
- [ ] SBOM and provenance attestations
- [ ] Browser/device and visual-regression evidence
- [ ] Content safety/playtest and after-dark review
- [ ] Backup/restore and rollback rehearsal evidence
- [ ] Named release approval

Do not mark a gate complete when its evidence is only a source-level assertion or an unchecked
manual checklist.
