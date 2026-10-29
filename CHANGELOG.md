# Changelog

## 0.2.0 (2026-10-29)

### Features

* add tree-sitter grammar for Angular HTML templates

### Bug Fixes

* **scanner:** end script and style raw text at the right end tag (#7)

### Performance

* **scanner:** drop per-token allocations and libc calls from the scan path (#6)
