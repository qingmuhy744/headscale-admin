# Headscale v0.29.2 compatibility fork

Target: Headscale `v0.29.2`, commit `8eea89488c642f3d5f617fab5493d5f51f6f4ad0`.
The local backend image is pinned to the same release digest as the inspected server:
`sha256:d337f1be4a9155b330aa9077bf6c82d24ff0581b8e69390ebc6d7c623bb339ce`.
The frontend starts from upstream commit `214a44a9c15c92d2b42383f131b51df10c84017c`.
Frontend release `hs-0.29.2-2` fixes the pre-auth key list width in user details,
including the list view and tile drawer on desktop and mobile.
Frontend release `hs-0.29.2-3` keeps node status icons at their original size
when long node names wrap in user details.
Frontend release `hs-0.29.2-4` adds Simplified Chinese/English localization and a
Claude cream theme. New browsers default to Chinese, Claude and light mode.
Existing theme and light/dark preferences remain selected after upgrade. Language
and theme changes in Settings take effect immediately and persist across reloads.
Translations reference [serein-213/headscale-admin-il18n](https://github.com/serein-213/headscale-admin-il18n)
at commit `07cf626`; its API implementation is not imported.

## Compatibility changes

| Area | v0.29.2 behavior in this fork |
| --- | --- |
| Nodes | Uses `tags`, handles nullable and synthetic owners, and excludes tagged devices from user counts. |
| Ownership | Removes the deleted node/user transfer operation. Assigning initial tags requires confirmation because ownership conversion is permanent. |
| Pre-auth keys | Lists all keys once, including tag-owned keys. Expiration and deletion use the key ID. |
| Key creation | Supports user-owned or tag-owned keys. Complete secrets are shown only in the creation dialog; masked list values cannot be copied as auth secrets. |
| Deployment commands | Accepts a complete key entered by the user. Does not select masked values from the key list or persist entered secrets as defaults. |
| API key rotation | Matches masked prefixes, verifies the replacement, switches credentials, then expires the old key by ID. Reports failed revocation. |
| Routes | Uses node `approve_routes` with the complete approved prefix set. |
| ACL | Preserves `grants`, `autoApprovers`, `nodeAttrs`, `tests`, SSH check options and other fields. Does not introduce an empty `acls` field into grants-only policies. |
| Policy users | Formats local users with the required `@` suffix, and uses OIDC email identifiers in groups, tag owners, ACLs and SSH rules. |
| ACL validation | Checks the policy before saving, guards advanced references, and blocks editing after initial load failure. An explicitly missing policy has a separate Create policy action. |

Visual editors cover the existing groups, tag owners, hosts, ACLs and SSH sections.
Advanced fields remain available in Config. JSON formatting normalizes whitespace and
does not retain HuJSON comments. Saving policies requires Headscale database policy mode.

## Local acceptance

Requirements: Node.js 22 or newer and Docker Compose. On macOS, browser tests use
installed Google Chrome; on Linux, run `npx playwright install --with-deps chromium`.
Set `PLAYWRIGHT_CHANNEL` to override the browser channel.

```sh
npm ci
npm run dev:up
```

Open `http://127.0.0.1:18080/admin/`. In Settings, set API URL to
`http://127.0.0.1:18080` and use `TEST_API_KEY` from the local `dev/.env` file.
That file is ignored by Git and contains only disposable test credentials.

The command starts an isolated Headscale server, two users, two Tailscale clients
(one user-owned and one tagged), and the built frontend. Clients use userspace
networking, with no privileged containers, TUN device or production configuration.
The fixture includes subnet/exit advertisements and a grants-only policy with
advanced fields. No production accounts, database, keys or DERP configuration are copied.

```sh
npm run check
npm run test:unit
npm run test:integration
npm run test:e2e
```

- Unit tests cover request formats, authentication failures, key rotation failures, ownership and policy preservation.
- Integration tests call the real local v0.29.2 API for users, keys, node registration/tags/expiry, route approval and policy saves.
- Browser tests exercise authentication, views, key lifecycle, tags/routes, policy failures and rotation at desktop and mobile sizes.
- Route tests verify control-plane advertisements and approval state. They do not certify forwarding to a real subnet or through an exit node.

`test:integration` is explicitly gated and its target is fixed to the local test stack.
Screenshots and browser output are written to ignored `test-results/`.
Re-running `dev:up` restores the fixture policy and refreshes expired test credentials.

```sh
npm run dev:down
```

This stops the test stack while retaining its named volumes. To remove only this
stack's data, use `docker compose -f dev/compose.yaml --profile ui --profile clients down -v`.

## Publish to GHCR

The workflow uses the repository's `GITHUB_TOKEN` with `packages: write`.
It runs checks, unit tests, a real backend and browser tests before publishing.
Push a version tag to publish both `linux/amd64` and `linux/arm64`:

```sh
git tag hs-0.29.2-4
git push origin hs-0.29.2-4
```

To retry publishing an existing tag without moving it:

```sh
gh workflow run docker-build.yml --ref main -f release_tag=hs-0.29.2-4
```

The artifact is `ghcr.io/qingmuhy744/headscale-admin:hs-0.29.2-4`.
The package must be public for an unauthenticated mirror to fetch it.
Record the release digest and source revision before deploying. Release tags
should be immutable; use a new suffix for subsequent changes.

## Replace the server frontend

Keep this short image name in the server's Compose file:

```yaml
image: qingmuhy744/headscale-admin:hs-0.29.2-4
```

The configured `docker.1ms.run` mirror returned `not found` when pulling this short
name. Millisecond Mirror uses a separate `ghcr.1ms.run` endpoint for GitHub packages,
as described in its [registry mapping documentation](https://mdoc.cc/mliev/1ms/v1.0.0/3).
Pull through that domestic endpoint, then tag the same image with the short name:

```sh
sudo docker pull ghcr.1ms.run/qingmuhy744/headscale-admin:hs-0.29.2-4
sudo docker tag ghcr.1ms.run/qingmuhy744/headscale-admin:hs-0.29.2-4 qingmuhy744/headscale-admin:hs-0.29.2-4
```

Compare the downloaded image identity and `org.opencontainers.image.revision`
with the published release and the source commit of its tag before deploying.
Retain the release index, platform manifest and source revision in the rollout record.
Docker's containerd image store may report the release index digest as the local
image ID, so compare the appropriate digest field along with the platform and revision.

Back up the existing Compose file,
record the old frontend image ID/digest, and tag the existing local image for rollback.
Only change the `headscale-admin` image value; retain its existing `8000:80` port,
network, restart policy and reverse proxy path.

```sh
sudo docker compose -f /home/ubuntu/headscale/docker-compose.yaml up -d --no-deps --pull never headscale-admin
```

For later releases, repeat the mirror pull, identity check and local tagging with
the new immutable version tag. A Compose `pull` using only the short name does not
select the mirror's GHCR endpoint.

Validate `/admin/`, a directly loaded subpage, static assets, authentication and
read-only users/nodes/routes/keys/policy requests through the existing HTTPS entry.
Confirm the backend container identity and start time did not change.

To roll back, restore the backed-up Compose file and use the recorded local rollback
image (or immutable old digest), then recreate only `headscale-admin` with
`up -d --no-deps --pull never headscale-admin`. Recheck the entry and backend identity.
Do not run a stack-wide `down`, remove volumes or recreate Headscale during frontend replacement.
