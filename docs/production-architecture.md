# Production implementation record

Baseline verified against Vercel deployment dpl_8Gr3GjQViUpQvVYithVzevJnp33D:
7a4b4346a21a3208035266df268950ee6496473b on codex/asbarix-v2-identity.
Development branch: codex/asbarix-local-production. No production release authorized.

Local PostgreSQL is authoritative. Local service owns identities, sessions, upload chunks,
orders, immutable pricing snapshots, events and archive operations. Existing cloud team
login is shared and cannot identify operators; named local accounts are required for audit.
The existing cloud admin session continues to protect the production tab.

Local agents POST allowlisted order metadata to a separate Redis namespace over HTTPS.
The transactional outbox is acknowledged only after cloud acceptance; versions make
retries safe. No customer file bytes, storage paths, passwords or purchasing costs leave
the machine. Local operation does not call cloud services in its critical path.
Cloud dashboard is a read-only projection and displays synchronization timestamps.

Storage lives below a configurable new production subdirectory, respecting existing
canon/Incoming and canon/Archive folders. An archive is copied exclusively, fsynced and
SHA-256 verified before the database points to it. Original retained copies are not
automatically deleted. A failed transaction can leave an extra file, never lose the source.
This deliberately consumes extra space; capacity checks are mandatory.

Uploads are sequential, resumable chunks with server offsets and hashes. Upload session
ownership, final digest, signature and extension are checked before order submission.
Idempotency keys belong to the submitting identity. File duplication across distinct
jobs is permitted (reprints); repeated submission with the same key is not.

Local HTTP is suitable only for initial loopback tests. LAN deployment requires a trusted
TLS reverse proxy and a narrowly scoped firewall rule approved by the owner. No database
port or inbound internet exposure is part of setup. Browser desktop notifications are
optional; SSE and visible in-page notifications are the primary channel.

Acceptance evidence must distinguish isolated tests, live database tests, designer-device
tests, real print-program opening, restart tests, and restore drills. Code alone does not
prove operational acceptance.
