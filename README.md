# tree-sitter-angular-html

[![Verify](https://github.com/alfpricot/tree-sitter-angular-html/actions/workflows/verify.yml/badge.svg?branch=main)](https://github.com/alfpricot/tree-sitter-angular-html/actions/workflows/verify.yml)

A [tree-sitter](https://tree-sitter.github.io/tree-sitter/) grammar for Angular component templates: `*.component.html` files and the contents of inline `template:` strings. The HTML layer is built in rather than extended from `tree-sitter-html`, because Angular changes how HTML text is lexed: `{{`, `@` followed by a letter, and `}` are syntax, not text. HTML node names follow `tree-sitter-html` (`element`, `start_tag`, `attribute`, `quoted_attribute_value`, ...) so existing HTML queries mostly carry over. A template the grammar cannot parse produces `ERROR` nodes, never a permissive best-effort tree.

## Installation

Install from the Git repository:

```sh
npm install github:alfpricot/tree-sitter-angular-html
cargo add tree-sitter-angular-html --git https://github.com/alfpricot/tree-sitter-angular-html
```

The generated parser (`src/parser.c`, `src/grammar.json`, `src/node-types.json`) is committed, so consumers build the C parser without the tree-sitter CLI. `src/scanner.c` must be compiled with it: it tracks open elements and block braces, and lexes text, tag names and quoted attribute text. The C symbol is `tree_sitter_angular_html`, so this grammar links alongside grammars that export `tree_sitter_html` or `tree_sitter_angular`.

### Requirements

- Node.js 24 and a C/C++ toolchain for the Node binding (see `.nvmrc`).
- Rust 1.85 or newer, edition 2024, for the Rust crate.

## Usage

Parse a template from Node:

```js
import Parser from 'tree-sitter';
import angularHtml from 'tree-sitter-angular-html';

const parser = new Parser();
parser.setLanguage(angularHtml);
const tree = parser.parse('@if (user) { <p>{{ user.name }}</p> }');
```

Or from Rust:

```rust
let mut parser = tree_sitter::Parser::new();
parser
    .set_language(&tree_sitter_angular_html::LANGUAGE.into())
    .expect("Error loading Angular HTML parser");
let tree = parser.parse("@if (user) { <p>{{ user.name }}</p> }", None).unwrap();
```

### What it parses

- **HTML**: elements, void and self-closing elements, implicit end tags (`<li>`, `<p>`, `<td>`, `<option>`, ...), `<script>`/`<style>` raw text, comments, doctype, entities.
- **Interpolation**: `{{ expr }}` in text and inside plain attribute values (`title="Hi {{ name }}"`).
- **Bindings**: `[prop]`, `[attr.x]`, `[class.x]`, `[style.x.px]`, `(event)`, `(keydown.enter)`, `(window:resize)`, `[(ngModel)]`, `[@trigger]`, `@trigger`, and the prefixed `bind-`/`on-`/`bindon-` spellings.
- **Template references and inputs**: `#ref`, `#ref="ngForm"`, `ref-x`, `let-x`.
- **Structural directives**: full microsyntax (`*ngIf="obs$ | async as v; else tpl"`, `*ngFor="let x of xs; trackBy: fn; let i = index"`, `index as i`).
- **Control flow**: `@if`/`@else if`/`@else` (with `; as alias`), `@for` with `track`, context variables and `@empty`, `@switch`/`@case`/`@default`.
- **Deferrable views**: `@defer` with `on`/`when`/`prefetch`/`hydrate` triggers, `@placeholder`, `@loading`, `@error`.
- **`@let`** declarations.
- **Expressions**: the Angular expression language with Angular's own precedence, including safe navigation, non-null assertions, `typeof`/`void`/`in`, `??`, `**`, template literals, assignments and compound assignments in event handlers, and pipes with arguments.

Not covered yet: ICU messages (`{count, plural, ...}`; a lone `{` is text) and `ngNonBindable` content.

Like the Angular compiler, the grammar treats an unescaped `@` followed by a letter, or a `}` outside a block, as an error; write `&#64;` and `&#125;` for the literal characters.

### Example

```html
@for (item of items; track item.id) {
  <li [class.done]="item.done" (click)="toggle(item)">{{ item.title | titlecase }}</li>
} @empty {
  <li>Nothing to do</li>
}
```

```
(document
  (for_block
    item: (identifier)
    collection: (identifier)
    (for_track value: (member_expression ...))
    body: (block
      (element
        (start_tag (tag_name)
          (property_binding name: (binding_name) value: (member_expression ...))
          (event_binding name: (binding_name) handler: (call_expression ...)))
        (interpolation expression: (pipe_expression value: (member_expression ...) name: (pipe_name)))
        (end_tag (tag_name))))
    (empty_block body: (block ...))))
```

### Queries

- `queries/highlights.scm`: tags, bindings, control-flow keywords, pipes and expressions.
- `queries/injections.scm`: JavaScript in `<script>`, CSS in `<style>` and in a static `style="..."` attribute.

The Node binding exposes them as `HIGHLIGHTS_QUERY`/`INJECTIONS_QUERY`; the Rust crate as the `HIGHLIGHTS_QUERY`/`INJECTIONS_QUERY` constants.

## How to contribute

Branch from `main`, change the grammar under `grammar/` or in `grammar.js`, regenerate the parser, and run the checks. CI regenerates the parser and rejects drift in the generated files and the node-kind snapshot, and requires a Conventional Commit pull request title. Build steps, the full validation list, and pull request rules are in [CONTRIBUTING.md](CONTRIBUTING.md); the design is in [ARCHITECTURE.md](ARCHITECTURE.md).

## License

MIT. See [LICENSE](LICENSE); [NOTICE](NOTICE) credits the `tree-sitter-html` scanner this one adapts.
