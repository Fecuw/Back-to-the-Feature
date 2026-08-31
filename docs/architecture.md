# Back to the Feature: Runtime Architecture

## Trust boundaries

```text
Browser
  | HTTPS / WSS (Google ID token, then short-lived BTF JWT)
  v
API :8080
  |-- PostgreSQL: users, sessions, progress, refresh-token hashes, audit logs
  |-- Redis: owner cache, active-session limit, TTL state
  |
  | internal HTTP / WS + shared service secret
  v
Orchestrator :8090 (not published)
  | Docker Engine API
  v
Per-session internal Docker network
  |-- edge / web / database training containers
  `-- no route to the internet or other sessions
```

The API never receives the Docker socket. The orchestrator is the only component with Docker Engine access and is reachable only on the internal control-plane network. Player terminals are never attached to PostgreSQL, Redis, the API, the orchestrator, or the attacker container.

## Authentication

1. Google Identity Services returns an ID token to the browser.
2. `POST /api/v1/auth/google` verifies its signature, issuer, audience, expiry and verified email with `google-auth-library`.
3. The API upserts the user and returns a 15-minute HS256 access token plus a random 30-day rotating refresh token.
4. Only a SHA-256 hash of each refresh token is stored. Refresh rotates and revokes the previous value.
5. WebSocket connections carry the short-lived access token. The API verifies the JWT and checks `sessions.user_id` before opening an internal terminal stream.

Local development may enable `/auth/demo`. Production must set `ALLOW_DEMO_AUTH=false`, unique secrets, TLS and an exact CORS origin.

## Terminal lifecycle

1. Starting a stage creates a database session and calls the internal orchestrator.
2. The orchestrator creates an `internal: true` Docker network and one container per shell-enabled stage server.
3. A terminal switch closes the current browser WebSocket and opens a new connection for the selected `server` ID.
4. The API checks ownership and proxies frames to the orchestrator.
5. The orchestrator resolves containers by trusted Docker labels, starts `bash --login` with a TTY, proxies raw bytes, and applies resize messages.
6. Browser disconnect closes stdin. Session deletion or the 30-minute TTL stops containers and removes their network.

## Container security profile

- UID/GID `10001:10001`; no root shell.
- Read-only root filesystem with bounded tmpfs at `/workspace`, `/tmp` and `/run`.
- `cap-drop=ALL` and `no-new-privileges`.
- 0.5 CPU, 256 MiB memory, 128 PIDs.
- Per-session internal network with no internet egress.
- No host ports, host mounts or Docker socket.
- Session/server identity comes from orchestrator-owned labels, not browser-supplied container IDs.

For public user-authored stages, replace runc with gVisor or Kata Containers before accepting untrusted images.

## Persistent data

PostgreSQL is authoritative for users, session history, progress, refresh-token hashes and audit events. Redis contains only recreatable TTL and concurrency state. Docker containers are ephemeral and are not a data store.

Volumes should be encrypted by the hosting platform. Back up PostgreSQL daily, test restores, and expire audit payloads according to the service retention policy.
