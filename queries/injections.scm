; Embedded languages.

((script_element
  (raw_text) @injection.content)
  (#set! injection.language "javascript"))

((style_element
  (raw_text) @injection.content)
  (#set! injection.language "css"))

; A static `style="..."` attribute. Values that interpolate are skipped:
; their byte range is not CSS.
((attribute
  name: (attribute_name) @_name
  value: (quoted_attribute_value
    .
    (attribute_value) @injection.content
    .))
  (#eq? @_name "style")
  (#set! injection.language "css"))

((comment) @injection.content
  (#set! injection.language "comment"))
