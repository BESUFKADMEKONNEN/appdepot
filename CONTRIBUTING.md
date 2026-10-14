# Contributing to AppDepot

Thank you for your interest in contributing to AppDepot!

## Engineering Principles & Workflow

1. **Architecture Decoupling:** All business logic, heuristic rules, database operations, and systemd integrations belong in `crates/appdepot-core`. The CLI (`appdepot-cli`) and GUI (`apps/gui`) are thin consumers.
2. **Conventional Commits:** We enforce the Conventional Commits specification:
   - `feat:` New user-facing features or CLI commands
   - `fix:` Bug fixes or repair heuristic corrections
   - `docs:` Documentation improvements or ADR additions
   - `test:` Test fixtures or unit/integration tests
   - `refactor:` Code restructuring without behavior changes
3. **Definition of Done (DoD):**
   - Unit tests covering success and failure rollback paths.
   - `--dry-run` output verified for mutating operations.
   - Documentation updated in [`docs/`](docs/).
4. **Code Quality Gates:**
   - Format: `cargo fmt --check`
   - Lints: `cargo clippy --all-targets -- -D warnings`
   - Tests: `cargo test`

## Architectural Decision Records (ADRs)
Any non-trivial architectural change (e.g. adding a new backend, modifying privilege separation, altering SQLite schema) must be accompanied by an ADR in `docs/adr/`.
