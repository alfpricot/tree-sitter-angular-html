# Contributing to tree-sitter-angular-html

A tree-sitter grammar for Angular templates, with Node and Rust bindings.

## Before you start

1. Branch from **`main`**.
2. Read [ARCHITECTURE.md](ARCHITECTURE.md) for how the grammar, scanner and generated parser fit together.

## Local setup

```sh
npm ci --ignore-scripts
npm rebuild tree-sitter-cli
npx --no-install tree-sitter generate
cargo build
```

You need Node.js 24 (`.nvmrc`) and Rust 1.85 or newer. The exact tree-sitter CLI version is declared in `package.json` and resolved by `package-lock.json`; CI uses the same lockfile. `npm start` builds the WebAssembly parser and opens the tree-sitter playground.

The generated parser (`src/parser.c`, `src/grammar.json`, `src/node-types.json`) is committed. Regenerate and commit its diff after every change under `grammar/` or to `grammar.js`. A failed generation leaves the prior parser in place, so confirm that generation succeeded before trusting a test run.

## Validation before a pull request

```sh
npx --no-install tree-sitter test
node tools/node-kinds.mjs --check
node tools/fixture-check.mjs
npm run lint
npm run format:check
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test
npm test
```

`test/corpus/` holds per-construct tree assertions; `npx --no-install tree-sitter test -u --show-fields` rewrites their expected trees after a deliberate change (review the diff). `test/highlight/` holds highlight assertions. `test/fixtures/*.html` are whole templates checked for `ERROR`, `MISSING`, and zero-width nodes (see [test/fixtures/README.md](test/fixtures/README.md)). `npm test` needs a full `npm ci` so the native addon is built. Use `npm run format` to apply formatting; the generated parser under `src/` is excluded. CI also regenerates the parser and fails if it differs from what is committed.

## Pull requests

- Open pull requests against **`main`**.
- Use a Conventional Commit title (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, ...); CI rejects other titles.
- Regenerate and commit the parser and node-kind snapshot (`node tools/node-kinds.mjs > test/node-kinds.txt`) with any grammar change; CI rejects drift in either.
- Add a corpus case or extend a fixture for every newly supported construct.
- Keep node-kind renames for a breaking release: consumers match these names at runtime.
- Keep each pull request to one change, and link the issue it resolves in the body.

## Releases

Releases are cut by gala from the Conventional Commit history when `dev` is promoted to `main`; do not bump versions or edit `CHANGELOG.md` by hand. `feat` commits bump the minor version, `fix`, `perf`, `refactor` and `revert` bump the patch version, and a `!` suffix or `BREAKING CHANGE:` footer bumps the major version. The version lives in `Cargo.toml`, `package.json`, and `tree-sitter.json`, and a release bumps all three and regenerates the parser in the release commit. The `Gala release` workflow needs the `RELEASE_DEPLOY_KEY` secret and a matching write deploy key that is a bypass actor on the `main` and `dev` rulesets and the `v*` tag ruleset. The `Release` workflow it dispatches publishes to crates.io and npm with the `CARGO_REGISTRY_TOKEN` and `NPM_TOKEN` secrets, and to GitHub Packages with the workflow's own token.
