// The Angular expression language, shared by interpolations, bindings,
// event handlers, block parameters and `@let`.
//
// Precedence follows Angular's own parser (lowest first): pipe, assignment,
// conditional, `||`, `&&`, `??`, equality, relational, additive,
// multiplicative, `**`, unary, then postfix and member access.
//
// Angular decodes character references in attribute values and in
// interpolations before parsing them, so `&&`, `<`, `>`, `<=`, `>=` and `&&=`
// are also accepted in their entity-encoded spellings (`&amp;&amp;`, `&lt;`,
// `&gt;`, `&lt;=`, `&gt;=`, `&amp;&amp;=`), which HTML-escaping tools produce.
// The expression rules are shared with block parameters and `@let`, where
// Angular does not decode references, so the spellings are accepted there too
// even though Angular rejects them.
//
// Angular's lexer accepts a raw line break inside a string, and formatters
// wrap long strings that way. A line break inside a string is lexed by the
// external scanner (`scan_string_line_break` in src/scanner.c), which accepts
// it only when the string closes on a later line and no later line before the
// closing quote holds `<`, `>`, `{`, `}` or the other quote character, or
// starts with `@`. A stray quote therefore still ends at its line break and
// error recovery stays on that line, instead of the string running on
// through the markup, blocks and interpolations after it. The cost is that a
// wrapped string's later lines cannot hold those characters unescaped. A
// backslash before a line break is an escape sequence, as it was before line
// breaks were accepted, and is not checked this way.

import { comma_list } from './helpers.js';

// A quoted string. `line_break` is the external token for a line break inside
// a string with this quote; it covers the break and the text after it up to
// the next quote, backslash or line break.
function quoted_string($, quote, line, line_break) {
  return seq(
    quote,
    repeat(
      choice(
        alias(token.immediate(line), $.string_fragment),
        alias(line_break, $.string_fragment),
        $.escape_sequence,
      ),
    ),
    quote,
  );
}

export const PREC = {
  pipe: 1,
  assign: 2,
  conditional: 3,
  // A pipe that ends a conditional's alternative binds inside it.
  conditional_pipe: 4,
  or: 5,
  and: 6,
  nullish: 7,
  equality: 8,
  relational: 9,
  additive: 10,
  multiplicative: 11,
  exponent: 12,
  unary: 13,
  postfix: 14,
  call: 15,
  member: 16,
};

export default {
  _expression: ($) => choice($._non_pipe_expression, $.pipe_expression),

  // Everything but a pipe. As in Angular's parser, operands, pipe arguments
  // and assignment values cannot start a bare pipe; a conditional's branches,
  // call arguments, array and object elements and parentheses can. A pipe
  // after a conditional's alternative (`a ? b : c | p`) belongs to the
  // alternative, as Angular's parseConditional reads it.
  _non_pipe_expression: ($) =>
    choice(
      $._primary_expression,
      $.unary_expression,
      $.binary_expression,
      $.conditional_expression,
      $.assignment_expression,
      $.augmented_assignment_expression,
    ),

  _primary_expression: ($) =>
    choice(
      $.identifier,
      $.this,
      $.number,
      $.string,
      $.template_string,
      $.true,
      $.false,
      $.null,
      $.undefined,
      $.array,
      $.object,
      $.parenthesized_expression,
      $.member_expression,
      $.subscript_expression,
      $.call_expression,
      $.non_null_expression,
    ),

  identifier: (_) => /[a-zA-Z_$][a-zA-Z0-9_$]*/,

  this: (_) => 'this',
  true: (_) => 'true',
  false: (_) => 'false',
  null: (_) => 'null',
  undefined: (_) => 'undefined',

  number: (_) => /(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/,

  string: ($) =>
    choice(
      quoted_string($, '"', /[^"\\\n]+/, $._double_string_line_break),
      quoted_string($, "'", /[^'\\\n]+/, $._single_string_line_break),
    ),

  escape_sequence: (_) =>
    token.immediate(
      seq(
        '\\',
        choice(/[^xu0-7]/, /[0-7]{1,3}/, /x[0-9a-fA-F]{2}/, /u[0-9a-fA-F]{4}/, /u\{[0-9a-fA-F]+\}/),
      ),
    ),

  template_string: ($) =>
    seq(
      '`',
      repeat(
        choice(
          alias(token.immediate(/[^`$\\]+/), $.string_fragment),
          alias(token.immediate('$'), $.string_fragment),
          $.escape_sequence,
          $.template_substitution,
        ),
      ),
      '`',
    ),

  template_substitution: ($) => seq('${', $._expression, '}'),

  array: ($) => seq('[', comma_list($._expression), ']'),

  object: ($) =>
    seq('{', comma_list(choice($.pair, alias($.identifier, $.shorthand_property_identifier))), '}'),

  pair: ($) =>
    seq(
      field('key', choice(alias($.identifier, $.property_identifier), $.string)),
      ':',
      field('value', $._expression),
    ),

  parenthesized_expression: ($) => seq('(', $._expression, ')'),

  member_expression: ($) =>
    prec(
      PREC.member,
      seq(
        field('object', $._primary_expression),
        field('operator', choice('.', '?.')),
        field('property', alias($.identifier, $.property_identifier)),
      ),
    ),

  subscript_expression: ($) =>
    prec(
      PREC.member,
      seq(
        field('object', $._primary_expression),
        optional(field('operator', '?.')),
        '[',
        field('index', $._expression),
        ']',
      ),
    ),

  call_expression: ($) =>
    prec(
      PREC.call,
      choice(
        seq(
          field('function', $._primary_expression),
          optional(field('operator', '?.')),
          field('arguments', $.arguments),
        ),
        seq(field('function', $._primary_expression), field('arguments', $.template_string)),
      ),
    ),

  arguments: ($) => seq('(', comma_list($._expression), ')'),

  non_null_expression: ($) => prec(PREC.postfix, seq($._primary_expression, '!')),

  unary_expression: ($) =>
    prec(
      PREC.unary,
      seq(
        field('operator', choice('!', '-', '+', 'typeof', 'void')),
        field('argument', $._non_pipe_expression),
      ),
    ),

  binary_expression: ($) => {
    const table = [
      ['||', PREC.or],
      [['&&', '&amp;&amp;'], PREC.and],
      ['??', PREC.nullish],
      ['==', PREC.equality],
      ['!=', PREC.equality],
      ['===', PREC.equality],
      ['!==', PREC.equality],
      [['<', '&lt;'], PREC.relational],
      [['>', '&gt;'], PREC.relational],
      [['<=', '&lt;='], PREC.relational],
      [['>=', '&gt;='], PREC.relational],
      ['in', PREC.relational],
      ['+', PREC.additive],
      ['-', PREC.additive],
      ['*', PREC.multiplicative],
      ['/', PREC.multiplicative],
      ['%', PREC.multiplicative],
    ];
    return choice(
      ...table.map(([operator, precedence]) =>
        prec.left(
          precedence,
          seq(
            field('left', $._non_pipe_expression),
            field('operator', Array.isArray(operator) ? choice(...operator) : operator),
            field('right', $._non_pipe_expression),
          ),
        ),
      ),
      prec.right(
        PREC.exponent,
        seq(
          field('left', $._non_pipe_expression),
          field('operator', '**'),
          field('right', $._non_pipe_expression),
        ),
      ),
    );
  },

  conditional_expression: ($) =>
    prec.right(
      PREC.conditional,
      seq(
        field('condition', $._non_pipe_expression),
        '?',
        field('consequence', $._expression),
        ':',
        field(
          'alternative',
          choice($._non_pipe_expression, alias($._conditional_pipe, $.pipe_expression)),
        ),
      ),
    ),

  // pipe_expression inside a conditional's alternative. Its higher
  // precedence makes `|` shift into the alternative instead of reducing the
  // conditional first.
  _conditional_pipe: ($) =>
    prec.left(
      PREC.conditional_pipe,
      seq(
        field(
          'value',
          choice($._non_pipe_expression, alias($._conditional_pipe, $.pipe_expression)),
        ),
        '|',
        field('name', alias($.identifier, $.pipe_name)),
        repeat(seq(':', field('argument', $._non_pipe_expression))),
      ),
    ),

  // `value | name:arg1:arg2`.
  pipe_expression: ($) =>
    prec.left(
      PREC.pipe,
      seq(
        field('value', $._expression),
        '|',
        field('name', alias($.identifier, $.pipe_name)),
        repeat(seq(':', field('argument', $._non_pipe_expression))),
      ),
    ),

  _assignable: ($) => choice($.identifier, $.member_expression, $.subscript_expression),

  assignment_expression: ($) =>
    prec.right(
      PREC.assign,
      seq(field('left', $._assignable), '=', field('right', $._non_pipe_expression)),
    ),

  augmented_assignment_expression: ($) =>
    prec.right(
      PREC.assign,
      seq(
        field('left', $._assignable),
        field(
          'operator',
          choice('+=', '-=', '*=', '/=', '%=', '**=', '&&=', '&amp;&amp;=', '||=', '??='),
        ),
        field('right', $._non_pipe_expression),
      ),
    ),
};
