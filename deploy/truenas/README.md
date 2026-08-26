# TrueNAS SCALE deployment

This deployment targets TrueNAS SCALE ElectricEel (24.10) using the Custom App YAML
workflow. The current image serves the host, display, player, QR, health, and Socket.IO
endpoints from one container.

## 1. Build and publish the image

The preferred path is to push a commit to `main`. The GitHub Actions workflow in
[`../../.github/workflows/truenas.yml`](../../.github/workflows/truenas.yml) runs the checks, compiles the
production assets, verifies the compiled routes, builds the Docker image, and publishes it to
GitHub Container Registry. Each successful run publishes:

- `ghcr.io/YOUR_ACCOUNT/room-riot:main` for the current main branch
- `ghcr.io/YOUR_ACCOUNT/room-riot:latest` as a convenience tag
- `ghcr.io/YOUR_ACCOUNT/room-riot:sha-COMMIT_SHA` as the immutable deployment tag
- `ghcr.io/YOUR_ACCOUNT/room-riot:vMAJOR.MINOR.PATCH` for a version-tagged release

The workflow also uploads a `room-riot-truenas-COMMIT_SHA` artifact containing a Compose file
with the immutable image tag already filled in. Download that artifact from the successful
workflow run when preparing a TrueNAS upgrade.

TrueNAS must be able to pull the image from a registry. If GitHub Actions is not being used, the
manual alternative from a machine with Docker and access to this repository is:

```bash
docker build --tag ghcr.io/YOUR_ACCOUNT/room-riot:0.1.0 .
docker push ghcr.io/YOUR_ACCOUNT/room-riot:0.1.0
```

Replace `YOUR_ACCOUNT` with the registry namespace you use. A private registry is fine for a
LAN-only installation; configure registry credentials in TrueNAS before installing if needed.
The image is self-contained and does not need internet access after it has been pulled.

### Image architecture and provenance decision

The release workflow intentionally publishes both `linux/amd64` and `linux/arm64`. That covers
the common x86 TrueNAS host and ARM-based installations without changing the application image or
the persistent `/data` contract. The exact `sha-COMMIT_SHA` tag is the deployment identity; `main`
and `latest` are convenience aliases only. Buildx is configured to emit an SBOM and maximum-detail
provenance attestation, and the published image must be inspected for both platforms before a
release is accepted. A registry/container-security scan and the rollback rehearsal remain release
environment checks, not local development checks.

## 2. Create the persistent dataset

Create a dataset before opening the Custom App wizard, for example:

```text
/mnt/tank/apps/room-riot
```

The container runs as the unprivileged `node` user (UID/GID 1000). Grant that UID/GID Modify
access to the dataset, or use the ACL controls in the Custom App storage configuration. Mount
the dataset at `/data`. Do not mount the application source tree or the Docker socket.

TrueNAS recommends preparing host-path datasets before installing a Custom App. See the
[TrueNAS Custom App storage guidance](https://www.truenas.com/docs/scale/26/apps/installcustomappscreens/)
for the current Host Path and ACL fields.

## 3. Install the Custom App

1. Open **Apps → Discover → Install via YAML**.
2. Use `room-riot` as the application name.
3. Paste [`room-riot.compose.yaml`](./room-riot.compose.yaml) into the YAML editor.
4. Replace the image repository and `/mnt/REPLACE_WITH_POOL/room-riot` host path.
5. If port 3000 is occupied, change only the host side of the mapping, for example
   `13000:3000`.
6. Install the app and wait for it to become **Running**.

The container port remains `3000`. From the LAN, use the TrueNAS address and the selected host
port:

```text
http://TRUENAS_IP:3000/host
http://TRUENAS_IP:3000/display
http://TRUENAS_IP:3000/play
http://TRUENAS_IP:3000/healthz
http://TRUENAS_IP:3000/readyz
http://TRUENAS_IP:3000/metrics
```

If you selected host port 13000, replace `3000` in each URL with `13000`. Open `/host` on the
host PC, `/display` on the shared screen after adding `?room=CODE`, and `/play?room=CODE` on
each phone. The QR code shown by the host/display page points players to the server origin.

TrueNAS documents the Custom App YAML flow, container/host port mappings, and host-path storage
configuration in its [Custom Apps guide](https://apps.truenas.com/managing-apps/installing-custom-apps/).

### HTTPS and HSTS

Room Riot does not send HTTP Strict Transport Security (HSTS) on its default LAN HTTP endpoint.
That is intentional: advertising HSTS before HTTPS works can make a hostname inaccessible in
browsers. For an HTTPS deployment, terminate TLS at a trusted reverse proxy, verify that every
player device can reach the HTTPS URL, and configure both of these container environment values:

```yaml
environment:
  PUBLIC_ORIGIN: https://room-riot.example
  ENABLE_HSTS: 'true'
```

HSTS is emitted only when `ENABLE_HSTS=true` and `PUBLIC_ORIGIN` is a valid `https://` origin.
Leave HSTS disabled for direct IP access or any deployment that still serves players over HTTP.
Because the policy includes subdomains and browsers cache it for one year, enable it only on a
hostname whose HTTPS configuration and subdomains you control.

## 4. Upgrade and rollback

Push the desired commit to `main`, wait for the GitHub Actions workflow to finish, and download
the generated TrueNAS bundle. Apply its Compose YAML in the Custom App editor and redeploy.
Keep the previous `sha-COMMIT_SHA` tag available so rollback is just changing the tag back.
Avoid using `latest` for a game-night server.

For the rehearsal, record the active immutable tag, deploy a newer tag, verify `/readyz` and one
room join, switch the Compose image back to the recorded tag, and verify the same SQLite-backed room
state. Keep the before/after image digests with the release evidence.

## 5. Backup and recovery

The image stores active-room snapshots in `/data/rooms.sqlite` using SQLite WAL mode. A clean
container replacement restores unexpired rooms, roster identities, private game state, and
deadlines from that file. Keep the dataset mounted and writable by UID/GID 1000:

```bash
tar -czf /mnt/tank/backups/room-riot-$(date +%Y%m%d).tar.gz \
  -C /mnt/tank/apps/room-riot .
```

Prefer ZFS snapshots/replication for routine backups. Before restoring, stop the Custom App,
restore the dataset contents, confirm the UID/GID ACL, and start the app again.

## 6. Verification

Security and release evidence requirements are recorded in
[`docs/SECURITY_OPERATIONS.md`](../../docs/SECURITY_OPERATIONS.md) and the release-candidate record
in [`docs/RELEASE_SIGNOFF.md`](../../docs/RELEASE_SIGNOFF.md). The CI workflow audits production
dependencies and scans both the candidate and published container image for high/critical findings.

From a PC on the same LAN, run the repository smoke test against the deployed URL:

```bash
node scripts/verify-deployment.mjs http://TRUENAS_IP:3000
```

For an HSTS-enabled HTTPS deployment, require the verifier to check that header too:

```bash
ROOM_RIOT_EXPECT_HSTS=true node scripts/verify-deployment.mjs https://room-riot.example
```

It checks `/healthz`, `/readyz`, `/metrics`, all three browser routes, and the Socket.IO client asset. Then perform the
manual game-night check: scan the QR code, join with at least 12 phones, start both Groupthink
and Hot Take, reload one player during input, and confirm that the display and phones recover.
The release workflow also seeds a room in the published image, replaces the container while keeping
the `/data` volume, and verifies host/player restoration with
`scripts/container-replacement-smoke.mjs`.

## Troubleshooting

- **The app is not Running:** inspect the Custom App logs and confirm the image tag is reachable.
- **The page does not open:** verify the host port is unused and that the TrueNAS firewall/LAN
  allows it.
- **The app starts but cannot write durable data:** verify the `/data` host path and ACL entry
  for UID/GID 1000.
- **Players join the wrong server:** open `/host` from the same LAN origin players will use;
  the QR code uses that origin automatically.
