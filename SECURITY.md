# Security policy

## Reporting a vulnerability

Do not open a public issue. Report it privately through [GitHub's private vulnerability reporting](https://github.com/meloncholic/tree-sitter-angular-html/security/advisories/new), and include what you found, how to reproduce it, and the impact you expect.

## Scope

This policy covers the grammar, the external scanner (`src/scanner.c`), the generated parser, and the Node and Rust bindings in this repository. Memory-safety bugs, hangs, or runaway memory use on untrusted template input are in scope. The tree-sitter runtime and the consuming editor or tool are not.

## Supported versions

Only the latest commit on `main` receives fixes.

## Practices

- Never commit credentials; none are needed to build or test this project.
- Keep dependencies current; Dependabot proposes npm, Cargo and GitHub Actions updates weekly.
- Pin third-party GitHub Actions to a commit SHA and keep workflow permissions minimal, as `verify.yml` does.
