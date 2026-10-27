// Built-in control flow (`@if`, `@for`, `@switch`), deferrable views
// (`@defer`) and `@let` declarations.
//
// Block braces are external tokens: the scanner pushes a marker on the
// open-element stack at `{` and pops it at `}`, so an element left open
// inside a block cannot swallow the block's closing brace.

import { semi_list, sep1 } from './helpers.js';

export default {
  block: ($) => seq(alias($._block_start, '{'), repeat($._node), alias($._block_end, '}')),

  _alias_parameter: ($) => seq(';', 'as', field('alias', $.identifier)),

  if_block: ($) =>
    seq(
      '@if',
      '(',
      field('condition', $._expression),
      optional($._alias_parameter),
      ')',
      field('body', $.block),
      repeat($.else_if_block),
      optional($.else_block),
    ),

  else_if_block: ($) =>
    seq(
      '@else',
      'if',
      '(',
      field('condition', $._expression),
      optional($._alias_parameter),
      ')',
      field('body', $.block),
    ),

  else_block: ($) => seq('@else', field('body', $.block)),

  for_block: ($) =>
    seq(
      '@for',
      '(',
      field('item', $.identifier),
      'of',
      field('collection', $._expression),
      repeat(seq(';', choice($.for_track, $.for_let))),
      optional(';'),
      ')',
      field('body', $.block),
      optional($.empty_block),
    ),

  for_track: ($) => seq('track', field('value', $._expression)),

  for_let: ($) => seq('let', sep1($.context_variable, ',')),

  context_variable: ($) => seq(field('name', $.identifier), '=', field('value', $.identifier)),

  empty_block: ($) => seq('@empty', field('body', $.block)),

  switch_block: ($) =>
    seq('@switch', '(', field('value', $._expression), ')', field('body', $.switch_body)),

  switch_body: ($) =>
    seq(
      alias($._block_start, '{'),
      repeat(choice($.case_block, $.default_block)),
      alias($._block_end, '}'),
    ),

  case_block: ($) => seq('@case', '(', field('value', $._expression), ')', field('body', $.block)),

  default_block: ($) => seq('@default', field('body', $.block)),

  defer_block: ($) =>
    seq(
      '@defer',
      optional(seq('(', semi_list($.defer_trigger), ')')),
      field('body', $.block),
      repeat(choice($.placeholder_block, $.loading_block, $.error_block)),
    ),

  // `on idle`, `on timer(500ms), hover(ref)`, `when ready`,
  // `prefetch on idle`, `hydrate when ready`, `hydrate never`.
  defer_trigger: ($) =>
    choice(
      seq(optional(field('modifier', choice('prefetch', 'hydrate'))), 'on', sep1($.trigger, ',')),
      seq(
        optional(field('modifier', choice('prefetch', 'hydrate'))),
        'when',
        field('condition', $._expression),
      ),
      seq(field('modifier', 'hydrate'), 'never'),
    ),

  trigger: ($) =>
    seq(
      field('name', $.identifier),
      optional(seq('(', optional(field('argument', choice($.duration, $._expression))), ')')),
    ),

  _defer_timings: ($) => seq('(', semi_list($.defer_timing), ')'),

  defer_timing: ($) => seq(field('name', choice('minimum', 'after')), field('value', $.duration)),

  placeholder_block: ($) => seq('@placeholder', optional($._defer_timings), field('body', $.block)),

  loading_block: ($) => seq('@loading', optional($._defer_timings), field('body', $.block)),

  error_block: ($) => seq('@error', field('body', $.block)),

  // A unit-less number is milliseconds.
  duration: (_) => token(prec(1, /\d+(\.\d+)?(ms|s)?/)),

  let_declaration: ($) =>
    seq('@let', field('name', $.identifier), '=', field('value', $._expression), ';'),
};
