/**
 * @file Tree-sitter grammar for Angular HTML templates.
 * @license MIT
 */

import html_rules from './grammar/html.js';
import binding_rules from './grammar/bindings.js';
import control_flow_rules from './grammar/control-flow.js';
import expression_rules from './grammar/expressions.js';

export default grammar({
  name: 'angular_html',

  extras: ($) => [$.comment, /\s+/],

  // Order is the scanner's TokenType enum in src/scanner.c.
  externals: ($) => [
    $._start_tag_name,
    $._script_start_tag_name,
    $._style_start_tag_name,
    $._end_tag_name,
    $.erroneous_end_tag_name,
    '/>',
    $._implicit_end_tag,
    $.raw_text,
    $.comment,
    $.text,
    $._double_quoted_text,
    $._single_quoted_text,
    $._block_start,
    $._block_end,
    // Never used by a rule: it is only valid while the parser is
    // recovering from an error, which is how the scanner detects that.
    $._error_sentinel,
  ],

  word: ($) => $.identifier,

  conflicts: (_) => [],

  rules: {
    ...html_rules,
    ...binding_rules,
    ...control_flow_rules,
    ...expression_rules,
  },
});
