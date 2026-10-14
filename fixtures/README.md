# AppDepot Test Fixture Library

This directory contains synthetic and minimal test packages used by the testing pyramid (see [`docs/05-quality-packaging-and-portfolio.md`](../docs/05-quality-packaging-and-portfolio.md)).

## Fixtures Catalogue

| Fixture | Characteristics | Tests |
|---|---|---|
| `electron-like.tar.gz` | Main binary, `bin/` secondary binary, `chrome-sandbox`, crashpad handler, and `extensions/` noise | Executable scoring heuristics, icon filter exclusions, and setuid sandbox detection |
| `sdk-like.tar.xz` | Nested single root directory, executables in `bin/`, no desktop shortcut | Smart root stripping, PATH fragment generation |
| `multi-root.zip` | Archive without a single root directory | Automatic app folder wrapping |
| `evil-slip.tar` | Contains relative upward paths (`../../etc/passwd`) | Anti-zip-slip security rejection |
| `evil-symlink.tar` | Contains symbolic links pointing outside extraction destination | Symlink boundary security rejection |
| `bomb.zip` | 10 KB file expanding to > 50 GB | Decompression quota limits enforcement |
