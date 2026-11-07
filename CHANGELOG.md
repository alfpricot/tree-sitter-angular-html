# Changelog

## 1.0.0 (2026-11-07)

### Breaking Changes

* **grammar:** parse ICU messages as icu_expression nodes (#14)
* **grammar:** match Angular on object keys and @for track and accept entity operators (#13)
* **scanner:** close paragraphs and table parts per HTML and match script ends in ASCII (#11)

## 0.2.0 (2026-10-29)

### Features

* add tree-sitter grammar for Angular HTML templates

### Bug Fixes

* **scanner:** end script and style raw text at the right end tag (#7)

### Performance

* **scanner:** drop per-token allocations and libc calls from the scan path (#6)
