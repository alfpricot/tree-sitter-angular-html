// Angular attribute forms: bindings, template references and
// structural-directive microsyntax.
//
// Each form has a bracket spelling (`[x]`, `(x)`, `[(x)]`, `#x`, `@x`) and,
// where Angular accepts one, a canonical prefix spelling (`bind-x`, `on-x`,
// `bindon-x`, `ref-x`, `let-x`). Both spellings produce the same node kind.
// The prefix tokens carry lexical precedence so they win over the longer
// `attribute_name` match.

import { attribute_value_tail, quoted, semi_list } from './helpers.js';

const prefix = (text) => token(prec(2, text));

export default {
  // `attr.aria-label`, `class.active`, `style.width.px`, `keydown.enter`,
  // `window:resize`, `@fade.done`. Kept as one token: the dotted parts are
  // Angular's own sub-syntax, not separate expressions.
  binding_name: (_) => token.immediate(/[^\s"'<>\/=\[\]()]+/),

  // An empty value (`(click)=""`) is one token, so its closing quote can
  // never be read as the start of a string literal.
  _empty_value: (_) => choice('""', "''"),

  // Angular also accepts an unquoted value (`[disabled]=busy`). It is kept
  // as a plain attribute_value: without quotes, HTML whitespace ends the
  // value, which the expression grammar cannot see.
  _expression_value: ($) =>
    choice(
      $._empty_value,
      quoted(() => field('value', $._expression)),
      field('value', $.attribute_value),
    ),

  _statement_value: ($) =>
    choice(
      $._empty_value,
      quoted(() => semi_list(field('handler', $._expression))),
      field('handler', $.attribute_value),
    ),

  property_binding: ($) =>
    seq(
      choice(
        seq('[', field('name', $.binding_name), token.immediate(']')),
        seq(prefix('bind-'), field('name', $.binding_name)),
      ),
      optional(seq('=', $._expression_value)),
    ),

  event_binding: ($) =>
    seq(
      choice(
        seq('(', field('name', $.binding_name), token.immediate(')')),
        seq(prefix('on-'), field('name', $.binding_name)),
      ),
      optional(seq('=', $._statement_value)),
    ),

  two_way_binding: ($) =>
    seq(
      choice(
        seq('[(', field('name', $.binding_name), token.immediate(')]')),
        seq(prefix('bindon-'), field('name', $.binding_name)),
      ),
      optional(seq('=', $._expression_value)),
    ),

  // `<div @fade>` or `<div @fade="state">`; `[@fade]` is a property_binding.
  animation_binding: ($) =>
    seq('@', field('name', $.binding_name), optional(seq('=', $._expression_value))),

  template_reference: ($) =>
    seq(choice('#', prefix('ref-')), field('name', $.binding_name), attribute_value_tail($)),

  // `let-item="$implicit"` on an `<ng-template>`.
  template_input: ($) =>
    seq(prefix('let-'), field('name', $.binding_name), attribute_value_tail($)),

  structural_directive: ($) =>
    seq(
      '*',
      field('name', $.binding_name),
      optional(
        seq(
          '=',
          choice(
            $._empty_value,
            quoted(() => $._microsyntax),
            field('value', $.attribute_value),
          ),
        ),
      ),
    ),

  // Angular's microsyntax: the first item is a `let` or a bare expression
  // (bound to the directive's own input); every later item is a `let`, a
  // keyed binding (`of items`, `trackBy: fn`, `else tpl`) or an alias
  // (`index as i`), each optionally separated by `;` or `,`.
  _microsyntax: ($) =>
    seq(
      choice($.template_let, alias($._template_expression, $.template_binding)),
      repeat(
        seq(
          optional(choice(';', ',')),
          choice($.template_let, $.template_binding, $.template_alias),
        ),
      ),
      optional(choice(';', ',')),
    ),

  _template_expression: ($) =>
    seq(field('value', $._expression), optional(seq('as', field('alias', $.identifier)))),

  template_binding: ($) =>
    seq(
      field('key', alias($.identifier, $.binding_key)),
      optional(':'),
      field('value', $._expression),
      optional(seq('as', field('alias', $.identifier))),
    ),

  template_let: ($) =>
    seq('let', field('name', $.identifier), optional(seq('=', field('value', $.identifier)))),

  template_alias: ($) => seq(field('value', $.identifier), 'as', field('alias', $.identifier)),
};
