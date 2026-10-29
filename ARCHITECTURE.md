# tree-sitter-angular-html architecture

tree-sitter-angular-html turns an Angular component template into a concrete syntax tree. It covers plain HTML, interpolation, bindings, template references, structural directives, built-in control flow (`@if`, `@for`, `@switch`), deferrable views (`@defer`), `@let`, and the Angular expression language, and it ships highlight and injection queries with Node and Rust bindings.

The design choice that shapes everything else is that the HTML layer is built in rather than extended from `tree-sitter-html`. Angular changes how text is lexed (`{{`, `@` followed by a letter, and `}` are syntax), so a hand-written external scanner owns text, tag names, quoted attribute text and block braces, while the grammar rules around it are written from scratch. The generated parser is committed so consumers never need the tree-sitter CLI.

## What tree-sitter-angular-html is not

- Not an Angular compiler or type checker: it produces a syntax tree and attaches no meaning to selectors, pipes or directives.
- Not an extension of `tree-sitter-html`: only the scanner's open-element logic and the HTML node names come from it (see [NOTICE](NOTICE)).
- Not error-tolerant by design: a template it cannot parse yields `ERROR` nodes rather than a best-effort tree.
- Not complete yet: ICU messages and `ngNonBindable` content are not parsed.

## Major components

### [grammar.js](grammar.js) and [grammar/](grammar)

`grammar.js` declares the language, its extras and the external token list, and merges the rule modules. `html.js` holds documents, elements, attributes and text; `bindings.js` the binding forms, template references and structural-directive microsyntax; `control-flow.js` the blocks, `@defer` and `@let`; `expressions.js` the expression language and its precedence; `helpers.js` the shared list helpers. The order of `externals` mirrors the scanner's `TokenType` enum.

### [src/scanner.c](src/scanner.c)

The external scanner, adapted from `tree-sitter-html`. It keeps a stack of open elements to produce matching and implicit end tags and raw text, and pushes a marker at each block `{` so an end tag cannot close an element outside the innermost block.

### [src/](src)

`parser.c`, `grammar.json` and `node-types.json` are generated from `grammar.js` by `tree-sitter generate` and committed, along with the vendored `tree_sitter/` headers.

### [queries/](queries)

`highlights.scm` and `injections.scm`, registered in [tree-sitter.json](tree-sitter.json) together with the file types `component.html` and `ng.html`.

### [bindings/node](bindings/node) and [bindings/rust](bindings/rust)

The Node addon (`binding.cc`, built by `binding.gyp`, with `index.js` and `index.d.ts`) and the Rust crate (`lib.rs` and a `build.rs` that compiles the parser and scanner). Both expose the language and the two queries.

### [test/](test) and [tools/](tools)

`test/corpus` asserts exact tree shapes, `test/highlight` asserts highlight captures, and `test/fixtures` holds whole templates that must parse with no `ERROR`, `MISSING` or zero-width nodes. `test/node-kinds.txt` snapshots the public node kinds. The `tools/` scripts run the fixture check and produce or check that snapshot.

## External systems and data flow

There are no runtime services. Template text goes to the scanner and parser, which produce a tree that consumers walk or query with the highlight and injection queries. Injections hand `<script>` content to a JavaScript grammar and `<style>` content and static `style` attributes to a CSS grammar; those grammars are supplied by the consuming editor or tool.

## Build, test, release, and deploy

The `Verify` workflow ([.github/workflows/verify.yml](.github/workflows/verify.yml)) runs on pull requests, pushes to `main`, and manual dispatch. It validates the pull request title, regenerates the parser and fails on drift in the generated files or the node-kind snapshot, lints and format-checks the JavaScript, runs the corpus, highlight and fixture checks, runs `cargo fmt`, `clippy` and `cargo test`, and builds and tests the Node binding on Linux and Windows. A final job rolls these up into one `Verify` status. Dependabot proposes npm, Cargo and GitHub Actions updates weekly against `dev`. The `Gala release` workflow ([.github/workflows/gala-release.yml](.github/workflows/gala-release.yml)) runs [gala](https://github.com/alfpricot/gala) on pushes to `main`: from the Conventional Commits since the last `v*` tag it bumps the version in `Cargo.toml`, `package.json`, and `tree-sitter.json`, refreshes `package-lock.json`, regenerates the parser (whose metadata embeds the `tree-sitter.json` version), writes `CHANGELOG.md`, commits, tags, pushes, and fast-forwards `dev` to the release commit (see [.gala.toml](.gala.toml)). It then dispatches the `Release` workflow ([.github/workflows/release.yml](.github/workflows/release.yml)) for the new tag, which re-verifies the tagged commit, builds Node prebuilds for Linux and Windows and the WASM grammar, publishes the crate to crates.io and the npm package to npm and GitHub Packages, and creates the GitHub Release with the WASM build attached. Nothing is deployed.

## Where things live

| Path | Holds |
| --- | --- |
| `grammar.js`, `grammar/` | Grammar source |
| `src/` | External scanner and the generated, committed parser |
| `queries/` | Highlight and injection queries |
| `bindings/` | Node addon and Rust crate |
| `test/` | Corpus, highlight and fixture tests, node-kind snapshot |
| `tools/` | Fixture check and node-kind snapshot scripts |
| `.github/` | `Verify` and `Release` workflows, Dependabot and code owners |
