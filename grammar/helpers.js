// One or more `rule`s separated by `separator`, no trailing separator.
export function sep1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}

// Zero or more `rule`s separated by commas, with an optional trailing comma.
export function comma_list(rule) {
  return optional(seq(sep1(rule, ','), optional(',')));
}

// One or more `rule`s separated by semicolons, with an optional trailing
// semicolon.
export function semi_list(rule) {
  return seq(sep1(rule, ';'), optional(';'));
}

// The optional `=value` tail of a plain attribute, template reference or
// template input: an unquoted or quoted HTML attribute value.
export function attribute_value_tail($) {
  return optional(seq('=', field('value', choice($.attribute_value, $.quoted_attribute_value))));
}

// A rule wrapped in either quote style. The opening and closing quote must
// match; `inner` receives the quote character so a caller can pick a
// quote-specific token for the content.
export function quoted(inner) {
  return choice(seq('"', inner('"'), '"'), seq("'", inner("'"), "'"));
}
