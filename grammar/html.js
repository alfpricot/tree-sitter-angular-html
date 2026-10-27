// The HTML layer: documents, elements, attributes, text.
//
// Node names follow tree-sitter-html so HTML queries carry over. Tag names,
// text and quoted attribute text come from the external scanner, which keeps
// the open-element stack (see src/scanner.c).

import { attribute_value_tail, quoted } from './helpers.js';

export default {
  document: ($) => repeat($._node),

  _node: ($) =>
    choice(
      $.doctype,
      $.entity,
      $.text,
      $.interpolation,
      $.element,
      $.script_element,
      $.style_element,
      $.erroneous_end_tag,
      $.if_block,
      $.for_block,
      $.switch_block,
      $.defer_block,
      $.let_declaration,
    ),

  doctype: ($) => seq('<!', alias($._doctype, 'doctype'), /[^>]+/, '>'),

  _doctype: (_) => /[Dd][Oo][Cc][Tt][Yy][Pp][Ee]/,

  element: ($) =>
    choice(
      seq($.start_tag, repeat($._node), choice($.end_tag, $._implicit_end_tag)),
      $.self_closing_tag,
    ),

  script_element: ($) =>
    seq(alias($.script_start_tag, $.start_tag), optional($.raw_text), $.end_tag),

  style_element: ($) => seq(alias($.style_start_tag, $.start_tag), optional($.raw_text), $.end_tag),

  start_tag: ($) => seq('<', alias($._start_tag_name, $.tag_name), repeat($._attribute), '>'),

  script_start_tag: ($) =>
    seq('<', alias($._script_start_tag_name, $.tag_name), repeat($._attribute), '>'),

  style_start_tag: ($) =>
    seq('<', alias($._style_start_tag_name, $.tag_name), repeat($._attribute), '>'),

  self_closing_tag: ($) =>
    seq('<', alias($._start_tag_name, $.tag_name), repeat($._attribute), '/>'),

  end_tag: ($) => seq('</', alias($._end_tag_name, $.tag_name), '>'),

  erroneous_end_tag: ($) => seq('</', $.erroneous_end_tag_name, '>'),

  _attribute: ($) =>
    choice(
      $.attribute,
      $.property_binding,
      $.event_binding,
      $.two_way_binding,
      $.animation_binding,
      $.structural_directive,
      $.template_reference,
      $.template_input,
    ),

  attribute: ($) => seq(field('name', $.attribute_name), attribute_value_tail($)),

  // A leading `[`, `(`, `*`, `#` or `@` starts an Angular binding form
  // instead (grammar/bindings.js).
  attribute_name: (_) => /[^<>"'/=\s\[\]()*#@][^<>"'/=\s]*/,

  attribute_value: (_) => /[^<>"'=\s]+/,

  quoted_attribute_value: ($) =>
    quoted((q) =>
      repeat(
        choice(
          alias(q === '"' ? $._double_quoted_text : $._single_quoted_text, $.attribute_value),
          $.interpolation,
        ),
      ),
    ),

  // Leading zeros in a numeric reference do not count toward its length.
  entity: (_) => /&(#([xX]0*[0-9a-fA-F]{1,6}|0*[0-9]{1,7})|[A-Za-z][A-Za-z0-9]{1,31});/,

  interpolation: ($) => seq('{{', field('expression', $._expression), '}}'),
};
