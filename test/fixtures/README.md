# Test fixtures

Whole-file Angular templates, one feature area per file, parsed by
`tools/fixture-check.mjs` on every change (zero `ERROR`/`MISSING` nodes and
zero zero-width nodes required). The corpus tests in `test/corpus/` assert
exact tree shapes; these files assert that realistic templates parse end to
end. All fixtures are synthetic.

| Fixture | Constructs |
|---|---|
| `product-list.component.html` | `@let`, `@if`/`@else if`/`@else`, `@for` with `track` and context variables, `@empty`, pipes with arguments, void elements, entities, signal calls |
| `checkout-form.component.html` | reactive forms bindings, `@switch`/`@case`/`@default`, optional `<option>` end tags closed at a block end, `[(ngModel)]`, object literals, conditional expressions |
| `dashboard.component.html` | `@defer` with `on`/`prefetch`/`hydrate` triggers, `@placeholder`, `@loading`, `@error`, animation bindings, CSS custom property bindings, multi-statement handlers |
| `legacy-directives.component.html` | `*ngIf ... as ...; else`, `*ngFor` with `trackBy` and locals, `*ngTemplateOutlet` context, `let-` inputs, template references, implicit table end tags, `<ng-content>` |

## Commands

```bash
node tools/fixture-check.mjs   # parse every fixture; fail on ERROR/MISSING/zero-width
```
