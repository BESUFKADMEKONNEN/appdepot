# Security Policy

## Threat Model & Invariants

AppDepot performs filesystem operations, handles untrusted archives, and communicates with a privileged Polkit helper. The following invariants must never be violated:

1. **Unprivileged GUI:** The GUI process (`appdepot`) must NEVER run as `root` or request elevated capabilities directly.
2. **Typed Helper Protocol:** `appdepot-helper` accepts strictly structured JSON payloads on standard input. It must NEVER accept arbitrary shell strings or un-canonicalized paths.
3. **Anti-Zip-Slip:** The archive extractor must reject any path containing upward directory traversal (`..`) or absolute path components.
4. **Decompression Bomb Protection:** Hard quotas must be enforced on archive extraction: maximum file count, maximum decompressed byte quota, and maximum nesting depth.

## Reporting a Vulnerability

If you discover a security vulnerability in AppDepot (especially in `appdepot-helper` or the archive extraction engine):

1. **Do not open a public issue.**
2. Send an email describing the vulnerability, proof of concept, and affected versions to `security@besifkad.dev` (or the project maintainer).
3. We will respond within 48 hours to acknowledge receipt and coordinate a patch release.
