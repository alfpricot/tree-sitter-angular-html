; Syntax highlighting for Angular HTML templates.
;
; Later patterns take precedence in most highlighters, so the general
; captures come first and the Angular-specific refinements follow.

(identifier) @variable

; HTML
; ----

(tag_name) @tag
(erroneous_end_tag_name) @tag.error
(doctype) @constant
(attribute_name) @attribute
(attribute_value) @string
(quoted_attribute_value) @string
(comment) @comment
(entity) @character.special
(text) @none

((tag_name) @tag.builtin
  (#any-of? @tag.builtin "ng-container" "ng-template" "ng-content"))

[
  "<"
  ">"
  "</"
  "/>"
] @tag.delimiter

"=" @operator

; Bindings
; --------

(property_binding
  name: (binding_name) @property)

(two_way_binding
  name: (binding_name) @property)

(event_binding
  name: (binding_name) @function.method)

(animation_binding
  name: (binding_name) @attribute)

(structural_directive
  name: (binding_name) @keyword.directive)

(template_reference
  name: (binding_name) @variable)

(template_input
  name: (binding_name) @variable.parameter)

(property_binding
  [
    "["
    "]"
  ] @punctuation.bracket)

(event_binding
  [
    "("
    ")"
  ] @punctuation.bracket)

(two_way_binding
  [
    "[("
    ")]"
  ] @punctuation.bracket)

(structural_directive
  "*" @punctuation.special)

[
  "#"
  "@"
  "bind-"
  "on-"
  "bindon-"
  "ref-"
  "let-"
] @punctuation.special

(binding_key) @keyword

(template_let
  name: (identifier) @variable)

(template_alias
  alias: (identifier) @variable)

(template_binding
  alias: (identifier) @variable)

; Interpolation
; -------------

(interpolation
  [
    "{{"
    "}}"
  ] @punctuation.special)

(template_substitution
  [
    "${"
    "}"
  ] @punctuation.special)

; Control flow
; ------------

[
  "@if"
  "@else"
  "@switch"
  "@case"
  "@default"
] @keyword.conditional

(else_if_block
  "if" @keyword.conditional)

[
  "@for"
  "@empty"
] @keyword.repeat

[
  "@defer"
  "@placeholder"
  "@loading"
  "@error"
] @keyword

"@let" @keyword

[
  "as"
  "of"
  "track"
  "let"
  "on"
  "when"
  "prefetch"
  "hydrate"
  "never"
  "minimum"
  "after"
] @keyword

(trigger
  name: (identifier) @function.builtin)

(duration) @number

(block
  [
    "{"
    "}"
  ] @punctuation.bracket)

(switch_body
  [
    "{"
    "}"
  ] @punctuation.bracket)

(for_block
  item: (identifier) @variable)

(context_variable
  name: (identifier) @variable)

(let_declaration
  name: (identifier) @variable)

(if_block
  alias: (identifier) @variable)

(else_if_block
  alias: (identifier) @variable)

; Expressions
; -----------

((identifier) @variable.builtin
  (#match? @variable.builtin "^\\$(event|implicit|index|first|last|even|odd|count|any)$"))

(property_identifier) @property
(shorthand_property_identifier) @property

(call_expression
  function: (identifier) @function.call)

(call_expression
  function: (member_expression
    property: (property_identifier) @function.method.call))

(pipe_name) @function

(string) @string
(template_string) @string
(escape_sequence) @string.escape
(number) @number

[
  (true)
  (false)
] @boolean

[
  (null)
  (undefined)
] @constant.builtin

(this) @variable.builtin

[
  "typeof"
  "void"
  "in"
] @keyword.operator

[
  "+"
  "-"
  "/"
  "%"
  "**"
  "=="
  "!="
  "==="
  "!=="
  "<="
  ">="
  "&&"
  "||"
  "??"
  "!"
  "?"
  "+="
  "-="
  "*="
  "/="
  "%="
  "**="
  "&&="
  "||="
  "??="
] @operator

; `*` is also the structural-directive marker, and `<`/`>` are also tag
; delimiters, so these are only operators inside a binary expression.
(binary_expression
  [
    "*"
    "<"
    ">"
  ] @operator)

(pipe_expression
  "|" @operator)

[
  "."
  "?."
] @punctuation.delimiter

[
  ","
  ";"
  ":"
] @punctuation.delimiter

(array
  [
    "["
    "]"
  ] @punctuation.bracket)

(subscript_expression
  [
    "["
    "]"
  ] @punctuation.bracket)

(object
  [
    "{"
    "}"
  ] @punctuation.bracket)

[
  "("
  ")"
] @punctuation.bracket
