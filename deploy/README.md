# Deploying a hosted aurora

One small server with Docker and a domain. aurora runs in hosted mode (bearer keys, view-only share links, inline data only) behind Caddy, which gets a TLS certificate by itself.

## 1. DNS

Point an A record for `aurora.<your-domain>` at the server's public IP. Ports 80 and 443 must be open (Caddy needs both to issue the certificate).

## 2. Configure

```bash
cp deploy/.env.example deploy/.env
```

Fill in `deploy/.env`:

- `DOMAIN`: your domain (Caddy serves `aurora.$DOMAIN`).
- `AURORA_SECRET`: at least 32 characters, e.g. `openssl rand -hex 32`. It signs every key.
- `AURORA_PUBLIC_URL`: `https://aurora.<your-domain>` (share links are built from it).
- `AURORA_INVITE`: the word a person needs to get a key.

## 3. Deploy

```bash
docker compose -f deploy/docker-compose.yml up -d --build
```

Views live in the `aurora-data` volume (`/data` in the container).

## Get a key

```bash
curl -X POST https://aurora.<your-domain>/api/keys -H 'Content-Type: application/json' -d '{"invite":"<invite>"}'
# {"key":"<key>","ws":"<workspace id>"}
```

Each key is its own workspace: nobody sees another's views. Keep the key private; it is only ever sent as `Authorization: Bearer <key>`.

## Connect a harness

```bash
claude mcp add --transport http aurora https://aurora.<your-domain>/mcp --header "Authorization: Bearer <key>"
```

Tools: `render`, `patch`, `status`, `version`. Each result carries a `url` (`/v/<token>`), a view-only link to open or share. Data must be inline (`{"inline": [rows]}`); paths and `http(s)` datasets are refused.

## Check it

```bash
scripts/hosted-smoke.sh https://aurora.<your-domain> <invite>
```

It mints a key, lists the MCP tools, renders a view, opens its share link and checks that a request without a key gets 401. Exit 0 means all of it worked.

## Rotate the secret

Change `AURORA_SECRET` in `deploy/.env` and run `docker compose -f deploy/docker-compose.yml up -d`. Every existing key stops working (everyone is logged out); mint new ones. Share links are separate tokens and keep working until rotated per view (`POST /api/views/:id/share {"rotate": true}`).

## Back up

Everything is under `/data`. Archive the volume:

```bash
docker run --rm -v deploy_aurora-data:/data -v "$PWD":/backup alpine tar czf /backup/aurora-data.tgz -C /data .
```

(The volume is named `<compose project>_aurora-data`; check with `docker volume ls`.) Keep `AURORA_SECRET` with the backup: restored views are unreachable without keys signed by it.
