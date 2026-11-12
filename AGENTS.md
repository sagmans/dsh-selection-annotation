# Repository guide

Selection Annotations carries quoted replies into the next user message.
The browser owns selection, cards, storage, and composer integration.
The [Host entry](index.js) has no state or services.

## Invariants

- Keep cards separate from the draft until submission.
- Preserve semantic file/session chips and quote nodes during prefix edits.
- Use revision-guarded insertion instead of reconstructing the draft.
- Remove only an unchanged prefix owned by the current submission attempt.
- Treat editable command claims as cancellation, not send acknowledgement.
- Clear only submitted card IDs after a transaction returns to an empty draft.
- Keep exports, the bundle patch, and locale keys aligned.

## Read by task

- Before changing selection, storage, rendering, or submission, read
  [Architecture](docs/ARCHITECTURE.md) for ownership and recovery boundaries.
- Before setup, validation, or hook changes, read
  [Development](docs/DEVELOPMENT.md) for gates and proof limits.
- Before changing payloads, dependencies, or distribution, read
  [Security](docs/SECURITY.md) for trust, privacy, and release boundaries.
- Before changing user instructions, read the [README](README.md).
  Keep that document focused on installation and use.

Use the owning source for commands, limits, and package metadata.
Keep generic hook entrypoints and libraries synchronized with their shared
source. Put repository-specific checks in the hook `.d/` directories.
