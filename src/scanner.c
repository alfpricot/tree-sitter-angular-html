// External scanner for tree-sitter-angular-html.
//
// Adapted from tree-sitter-html's scanner (see NOTICE). It keeps a stack of
// open elements to produce matching end tags, implicit end tags and raw
// text, and extends it for Angular templates:
//
// - `text` stops before markup `<`, entities, `{{`, `@` followed by a
//   letter (a block keyword) and `}` (a block end).
// - Quoted attribute text stops before `{{`, so a plain attribute value can
//   hold interpolations.
// - Block braces push and pop a marker entry on the element stack. An end
//   tag never closes an element outside the innermost block, and elements
//   whose end tag HTML lets you omit are closed implicitly at the block's
//   `}`.

#include "tree_sitter/alloc.h"
#include "tree_sitter/array.h"
#include "tree_sitter/parser.h"

#include <stdint.h>
#include <string.h>
#include <wctype.h>

enum TokenType {
    START_TAG_NAME,
    SCRIPT_START_TAG_NAME,
    STYLE_START_TAG_NAME,
    END_TAG_NAME,
    ERRONEOUS_END_TAG_NAME,
    SELF_CLOSING_TAG_DELIMITER,
    IMPLICIT_END_TAG,
    RAW_TEXT,
    COMMENT,
    TEXT,
    DOUBLE_QUOTED_TEXT,
    SINGLE_QUOTED_TEXT,
    BLOCK_START,
    BLOCK_END,
    ERROR_SENTINEL,
};

// An upper-cased tag name. The empty name is a block marker.
typedef Array(char) Tag;

typedef struct {
    // The open-element stack, serialized as the scanner's state.
    Array(Tag) tags;
    // Recycled tag buffers. The parser restores the scanner state before
    // every external-token lex attempt (ts_parser__lex calls deserialize
    // once per token), so freeing a buffer here only to re-allocate it on
    // the next token would put a malloc and a free on the hot path of every
    // element. Buffers are pooled instead: the spare list holds capacity
    // only and is never serialized.
    Array(Tag) spare;
} Scanner;

static const char *const VOID_TAGS[] = {
    "AREA",  "BASE",    "BASEFONT", "BGSOUND", "BR",     "COL",      "COMMAND", "EMBED",
    "FRAME", "HR",      "IMAGE",    "IMG",     "INPUT",  "ISINDEX",  "KEYGEN",  "LINK",
    "MENUITEM", "META", "NEXTID",   "PARAM",   "SOURCE", "TRACK",    "WBR",     NULL,
};

// Elements whose end tag HTML lets an author omit.
static const char *const OPTIONAL_END_TAGS[] = {
    "LI",      "DT",    "DD",    "P",     "RB",    "RT", "RTC", "RP", "OPTGROUP",
    "OPTION",  "COLGROUP", "CAPTION", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH", NULL,
};

static const char *const NOT_ALLOWED_IN_PARAGRAPHS[] = {
    "ADDRESS", "ARTICLE", "ASIDE",  "BLOCKQUOTE", "DETAILS", "DIV",    "DL",      "FIELDSET",
    "FIGCAPTION", "FIGURE", "FOOTER", "FORM",     "H1",      "H2",     "H3",      "H4",
    "H5",      "H6",      "HEADER", "HR",         "MAIN",    "MENU",   "NAV",     "OL",
    "P",       "PRE",     "SECTION", "TABLE",     "UL",      NULL,
};

static inline void advance(TSLexer *lexer) { lexer->advance(lexer, false); }

static inline void skip(TSLexer *lexer) { lexer->advance(lexer, true); }

static bool tag_is(const Tag *tag, const char *name) {
    // Byte-wise against the known tag length instead of memcmp(strlen(name)):
    // tag_in calls this once per name of a 23-30 entry list, and strlen is a
    // libc call for every entry. The loop stops at the name's terminator, so
    // a name shorter than the tag never reads past its end.
    for (uint32_t i = 0; i < tag->size; i++) {
        if (name[i] == '\0' || name[i] != tag->contents[i]) return false;
    }
    return name[tag->size] == '\0';
}

static bool tag_in(const Tag *tag, const char *const *names) {
    for (; *names; names++) {
        if (tag_is(tag, *names)) return true;
    }
    return false;
}

static inline bool tag_is_marker(const Tag *tag) { return tag->size == 0; }

static bool tags_equal(const Tag *a, const Tag *b) {
    return a->size == b->size && memcmp(a->contents, b->contents, a->size) == 0;
}

static bool tag_can_contain(const Tag *parent, const Tag *child) {
    if (tag_is(parent, "LI")) return !tag_is(child, "LI");
    if (tag_is(parent, "DT") || tag_is(parent, "DD")) {
        return !tag_is(child, "DT") && !tag_is(child, "DD");
    }
    if (tag_is(parent, "P")) return !tag_in(child, NOT_ALLOWED_IN_PARAGRAPHS);
    if (tag_is(parent, "COLGROUP")) return tag_is(child, "COL");
    if (tag_is(parent, "RB") || tag_is(parent, "RT") || tag_is(parent, "RP")) {
        return !tag_is(child, "RB") && !tag_is(child, "RT") && !tag_is(child, "RP");
    }
    if (tag_is(parent, "OPTGROUP")) return !tag_is(child, "OPTGROUP");
    if (tag_is(parent, "OPTION")) return !tag_is(child, "OPTION") && !tag_is(child, "OPTGROUP");
    if (tag_is(parent, "TR")) return !tag_is(child, "TR");
    if (tag_is(parent, "TD") || tag_is(parent, "TH")) {
        return !tag_is(child, "TD") && !tag_is(child, "TH") && !tag_is(child, "TR");
    }
    return true;
}

static inline Tag *top(Scanner *scanner) {
    return scanner->tags.size > 0 ? array_back(&scanner->tags) : NULL;
}

// A tag-name buffer of at least the usual tag-name length, taken from the
// spare list when one is available so that a steady-state parse never
// allocates or frees a tag buffer.
static Tag take_tag(Scanner *scanner, uint32_t length) {
    Tag tag = array_new();
    if (scanner->spare.size > 0) tag = array_pop(&scanner->spare);
    tag.size = 0;
    array_reserve(&tag, length);
    return tag;
}

// Returns a buffer to the spare list. Popping an element and discarding a
// scanned name release their buffer this way instead of freeing it, so the
// next state re-uses the capacity instead of asking the allocator again.
static void release_tag(Scanner *scanner, Tag tag) {
    if (tag.contents) array_push(&scanner->spare, tag);
}

static void pop_tag(Scanner *scanner) { release_tag(scanner, array_pop(&scanner->tags)); }

// Moves every live buffer to the spare list and empties the stack. Used by
// deserialize, which rebuilds the stack from the serialized state.
static void recycle_tags(Scanner *scanner) {
    for (uint32_t i = 0; i < scanner->tags.size; i++) {
        release_tag(scanner, scanner->tags.contents[i]);
    }
    array_clear(&scanner->tags);
}

static bool has_block_marker(Scanner *scanner) {
    for (uint32_t i = scanner->tags.size; i > 0; i--) {
        if (tag_is_marker(&scanner->tags.contents[i - 1])) return true;
    }
    return false;
}

static inline bool is_ascii_alpha(int32_t c) {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
}

// Whitespace test used on the scan hot path. ASCII is handled inline, so the
// locale-dependent iswspace lookup only runs for non-ASCII input (where the
// grammar still accepts Unicode whitespace as an extra).
static inline bool is_space(int32_t c) {
    return c == ' ' || (c >= '\t' && c <= '\r') || (c >= 128 && iswspace(c));
}

// `towupper` with the ASCII case inlined: tag names and the raw-text
// delimiters (`</SCRIPT`, `</STYLE`) are ASCII, so the locale lookup only
// runs for non-ASCII input.
static inline int32_t upper(int32_t c) {
    if (c < 128) return (c >= 'a' && c <= 'z') ? c - ('a' - 'A') : c;
    return towupper(c);
}

// Tag-name and markup-start tests, likewise: the ASCII case is by far the
// common one and needs no library call.
static inline bool is_tag_name_char(int32_t c) {
    return is_ascii_alpha(c) || (c >= '0' && c <= '9') || c == '-' || c == ':' || c == '_' ||
           c == '.' || (c >= 128 && iswalnum(c));
}

static inline bool starts_markup(int32_t c) {
    return is_ascii_alpha(c) || c == '/' || c == '!' || c == '?' || (c >= 128 && iswalpha(c));
}

// Scans an upper-cased tag name into a pooled buffer. The caller either
// pushes it onto the stack (transferring ownership) or releases it back.
static Tag scan_tag_name(Scanner *scanner, TSLexer *lexer) {
    // 16 bytes covers every tag name except long custom element names,
    // which grow the buffer once and then reuse it from the pool.
    Tag name = take_tag(scanner, 16);
    while (is_tag_name_char(lexer->lookahead)) {
        int32_t c = lexer->lookahead;
        char byte = c < 0x80 ? (char)upper(c) : (char)(0x80 | (c & 0x7f));
        array_push(&name, byte);
        advance(lexer);
    }
    return name;
}

static unsigned serialize(Scanner *scanner, char *buffer) {
    uint16_t total = scanner->tags.size > UINT16_MAX ? UINT16_MAX : (uint16_t)scanner->tags.size;
    uint16_t serialized = 0;
    unsigned size = sizeof(serialized) + sizeof(total);
    memcpy(&buffer[sizeof(serialized)], &total, sizeof(total));

    for (; serialized < total; serialized++) {
        Tag *tag = &scanner->tags.contents[serialized];
        unsigned length = tag->size > UINT8_MAX ? UINT8_MAX : tag->size;
        if (size + 1 + length >= TREE_SITTER_SERIALIZATION_BUFFER_SIZE) break;
        buffer[size++] = (char)length;
        if (length > 0) memcpy(&buffer[size], tag->contents, length);
        size += length;
    }

    memcpy(&buffer[0], &serialized, sizeof(serialized));
    return size;
}

// Restores the state saved with an external token. The parser calls this
// before every external-token lex attempt, once per token, so it must not
// allocate in the steady state: the live buffers are recycled into the
// spare list and refilled in place.
static void deserialize(Scanner *scanner, const char *buffer, unsigned length) {
    recycle_tags(scanner);
    if (length == 0) return;

    uint16_t serialized = 0;
    uint16_t total = 0;
    unsigned size = 0;
    memcpy(&serialized, &buffer[size], sizeof(serialized));
    size += sizeof(serialized);
    memcpy(&total, &buffer[size], sizeof(total));
    size += sizeof(total);

    array_reserve(&scanner->tags, total);
    for (uint16_t i = 0; i < serialized; i++) {
        unsigned tag_length = (uint8_t)buffer[size++];
        Tag tag = take_tag(scanner, tag_length);
        if (tag_length > 0) {
            memcpy(tag.contents, &buffer[size], tag_length);
            tag.size = tag_length;
            size += tag_length;
        }
        array_push(&scanner->tags, tag);
    }
    // Entries that did not fit in the buffer come back as unnamed elements.
    for (uint16_t i = serialized; i < total; i++) {
        Tag tag = take_tag(scanner, 1);
        array_push(&tag, '?');
        array_push(&scanner->tags, tag);
    }
}

static bool scan_comment(TSLexer *lexer) {
    if (lexer->lookahead != '-') return false;
    advance(lexer);
    if (lexer->lookahead != '-') return false;
    advance(lexer);

    unsigned dashes = 0;
    while (!lexer->eof(lexer)) {
        switch (lexer->lookahead) {
            case '-':
                dashes++;
                break;
            case '>':
                if (dashes >= 2) {
                    lexer->result_symbol = COMMENT;
                    advance(lexer);
                    lexer->mark_end(lexer);
                    return true;
                }
                dashes = 0;
                break;
            default:
                dashes = 0;
        }
        advance(lexer);
    }
    return false;
}

static bool scan_raw_text(Scanner *scanner, TSLexer *lexer) {
    Tag *parent = top(scanner);
    if (!parent) return false;

    lexer->mark_end(lexer);
    const char *delimiter = tag_is(parent, "SCRIPT") ? "</SCRIPT" : "</STYLE";
    size_t delimiter_length = strlen(delimiter);
    size_t matched = 0;
    bool has_content = false;
    while (!lexer->eof(lexer)) {
        if (upper(lexer->lookahead) == delimiter[matched]) {
            matched++;
            advance(lexer);
            if (matched < delimiter_length) continue;
            // Only an end tag whose name stops here closes the element, so
            // `</scripts>` stays content, as in the HTML tokenizer.
            int32_t next = lexer->lookahead;
            if (lexer->eof(lexer) || iswspace(next) || next == '/' || next == '>') break;
            matched = 0;
            lexer->mark_end(lexer);
            has_content = true;
        } else if (matched > 0) {
            // The failed prefix is content. The delimiter's only `<` is its
            // first character, so retest this one as a new start instead of
            // consuming it: `a<</script>` must still end at `</script>`.
            matched = 0;
            lexer->mark_end(lexer);
            has_content = true;
        } else {
            matched = 0;
            advance(lexer);
            lexer->mark_end(lexer);
            has_content = true;
        }
    }
    // An empty element gets no raw_text node rather than a zero-width one.
    if (!has_content) return false;
    lexer->result_symbol = RAW_TEXT;
    return true;
}

// Called with the lexer just past `<` (or at end of input). The token is
// zero-width: mark_end was set before the `<`.
static bool scan_implicit_end_tag(Scanner *scanner, TSLexer *lexer) {
    Tag *parent = top(scanner);
    bool is_closing_tag = false;
    if (lexer->lookahead == '/') {
        is_closing_tag = true;
        advance(lexer);
    }

    Tag name = scan_tag_name(scanner, lexer);
    bool at_eof = lexer->eof(lexer);
    if (name.size == 0 && !at_eof) {
        release_tag(scanner, name);
        return false;
    }

    bool close = false;
    if (parent && !tag_is_marker(parent)) {
        if (at_eof && name.size == 0) {
            close = tag_in(parent, OPTIONAL_END_TAGS) || tag_is(parent, "HTML") ||
                    tag_is(parent, "HEAD") || tag_is(parent, "BODY");
        } else if (is_closing_tag) {
            if (!tags_equal(parent, &name)) {
                // An end tag for an element further down the stack, but
                // still inside the innermost block, closes this one first.
                for (uint32_t i = scanner->tags.size; i > 0; i--) {
                    Tag *tag = &scanner->tags.contents[i - 1];
                    if (tag_is_marker(tag)) break;
                    if (tags_equal(tag, &name)) {
                        close = true;
                        break;
                    }
                }
            }
        } else {
            close = !tag_can_contain(parent, &name);
        }
    }
    release_tag(scanner, name);

    if (close) {
        pop_tag(scanner);
        lexer->result_symbol = IMPLICIT_END_TAG;
        return true;
    }
    return false;
}

static bool scan_start_tag_name(Scanner *scanner, TSLexer *lexer) {
    Tag name = scan_tag_name(scanner, lexer);
    if (name.size == 0) {
        release_tag(scanner, name);
        return false;
    }
    if (tag_is(&name, "SCRIPT")) {
        lexer->result_symbol = SCRIPT_START_TAG_NAME;
    } else if (tag_is(&name, "STYLE")) {
        lexer->result_symbol = STYLE_START_TAG_NAME;
    } else {
        lexer->result_symbol = START_TAG_NAME;
    }
    array_push(&scanner->tags, name);
    return true;
}

static bool scan_end_tag_name(Scanner *scanner, TSLexer *lexer) {
    Tag name = scan_tag_name(scanner, lexer);
    if (name.size == 0) {
        release_tag(scanner, name);
        return false;
    }
    Tag *parent = top(scanner);
    if (parent && tags_equal(parent, &name)) {
        pop_tag(scanner);
        lexer->result_symbol = END_TAG_NAME;
    } else {
        lexer->result_symbol = ERRONEOUS_END_TAG_NAME;
    }
    release_tag(scanner, name);
    return true;
}

static bool scan_self_closing_tag_delimiter(Scanner *scanner, TSLexer *lexer) {
    advance(lexer);
    if (lexer->lookahead != '>') return false;
    advance(lexer);
    Tag *parent = top(scanner);
    if (parent && !tag_is_marker(parent)) pop_tag(scanner);
    lexer->result_symbol = SELF_CLOSING_TAG_DELIMITER;
    return true;
}

// Text inside a quoted attribute value, up to the closing quote or `{{`.
static bool scan_quoted_text(TSLexer *lexer, int32_t quote, enum TokenType symbol) {
    bool has_content = false;
    while (!lexer->eof(lexer) && lexer->lookahead != quote) {
        if (lexer->lookahead == '{') {
            advance(lexer);
            if (lexer->lookahead == '{') break;
        } else {
            advance(lexer);
        }
        has_content = true;
        lexer->mark_end(lexer);
    }
    if (!has_content) return false;
    lexer->result_symbol = symbol;
    return true;
}

static inline bool is_ascii_digit(int32_t c) { return c >= '0' && c <= '9'; }

static inline bool is_ascii_hex_digit(int32_t c) {
    return is_ascii_digit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
}

// Consumes the rest of a character reference after `&` and reports whether
// it is one (`&name;`, `&#64;`, `&#x7D;`). The bounds match the grammar's
// `entity` token exactly, so text only stops where that token can match.
static bool scan_entity_tail(TSLexer *lexer) {
    if (lexer->lookahead == '#') {
        advance(lexer);
        bool hex = false;
        if (lexer->lookahead == 'x' || lexer->lookahead == 'X') {
            hex = true;
            advance(lexer);
        }
        bool zeros = false;
        while (lexer->lookahead == '0') {
            zeros = true;
            advance(lexer);
        }
        unsigned digits = 0;
        while (hex ? is_ascii_hex_digit(lexer->lookahead) : is_ascii_digit(lexer->lookahead)) {
            digits++;
            advance(lexer);
        }
        // Leading zeros are not counted, but `&#0;` still has one digit.
        if (digits == 0 && zeros) digits = 1;
        return digits > 0 && digits <= (hex ? 6 : 7) && lexer->lookahead == ';';
    }
    if (!is_ascii_alpha(lexer->lookahead)) return false;
    advance(lexer);
    unsigned length = 1;
    while (is_ascii_alpha(lexer->lookahead) || is_ascii_digit(lexer->lookahead)) {
        length++;
        advance(lexer);
    }
    return length >= 2 && length <= 32 && lexer->lookahead == ';';
}

// Element and block content. Leading and trailing whitespace is left to the
// grammar's extras, as in tree-sitter-html.
static bool scan_text(TSLexer *lexer, bool has_content) {
    while (!lexer->eof(lexer)) {
        int32_t c = lexer->lookahead;
        if (c == '}') break;
        if (c == '<') {
            advance(lexer);
            if (starts_markup(lexer->lookahead)) break;
        } else if (c == '{') {
            advance(lexer);
            if (lexer->lookahead == '{') break;
        } else if (c == '@') {
            advance(lexer);
            // Block names are ASCII, as in Angular's lexer.
            if (is_ascii_alpha(lexer->lookahead)) break;
        } else if (c == '&') {
            advance(lexer);
            if (scan_entity_tail(lexer)) break;
        } else if (is_space(c)) {
            advance(lexer);
            continue;
        } else {
            advance(lexer);
        }
        has_content = true;
        lexer->mark_end(lexer);
    }
    if (!has_content) return false;
    lexer->result_symbol = TEXT;
    return true;
}

static bool scan(Scanner *scanner, TSLexer *lexer, const bool *valid_symbols) {
    bool in_error_recovery = valid_symbols[ERROR_SENTINEL];

    if (valid_symbols[RAW_TEXT] && !valid_symbols[START_TAG_NAME] &&
        !valid_symbols[END_TAG_NAME]) {
        return scan_raw_text(scanner, lexer);
    }

    // A void element has no content: close it as soon as its start tag ends.
    Tag *parent = top(scanner);
    if (valid_symbols[IMPLICIT_END_TAG] && parent && tag_in(parent, VOID_TAGS)) {
        pop_tag(scanner);
        lexer->result_symbol = IMPLICIT_END_TAG;
        return true;
    }

    if (!in_error_recovery) {
        if (valid_symbols[DOUBLE_QUOTED_TEXT]) {
            return scan_quoted_text(lexer, '"', DOUBLE_QUOTED_TEXT);
        }
        if (valid_symbols[SINGLE_QUOTED_TEXT]) {
            return scan_quoted_text(lexer, '\'', SINGLE_QUOTED_TEXT);
        }
    }

    while (is_space(lexer->lookahead)) skip(lexer);

    switch (lexer->lookahead) {
        case '<':
            lexer->mark_end(lexer);
            advance(lexer);
            if (lexer->lookahead == '!') {
                advance(lexer);
                return valid_symbols[COMMENT] && scan_comment(lexer);
            }
            if (starts_markup(lexer->lookahead)) {
                return valid_symbols[IMPLICIT_END_TAG] && scan_implicit_end_tag(scanner, lexer);
            }
            // A `<` that starts no markup is text.
            if (valid_symbols[TEXT]) {
                lexer->mark_end(lexer);
                return scan_text(lexer, true);
            }
            return false;

        case '}':
            if (in_error_recovery) return false;
            if (!parent) return false;
            if (!tag_is_marker(parent)) {
                if (valid_symbols[IMPLICIT_END_TAG] && tag_in(parent, OPTIONAL_END_TAGS) &&
                    has_block_marker(scanner)) {
                    pop_tag(scanner);
                    lexer->result_symbol = IMPLICIT_END_TAG;
                    return true;
                }
                return false;
            }
            if (!valid_symbols[BLOCK_END]) return false;
            advance(lexer);
            pop_tag(scanner);
            lexer->result_symbol = BLOCK_END;
            return true;

        case '{':
            if (valid_symbols[BLOCK_START] && !in_error_recovery) {
                advance(lexer);
                Tag marker = array_new();
                array_push(&scanner->tags, marker);
                lexer->result_symbol = BLOCK_START;
                return true;
            }
            break;

        case '/':
            if (valid_symbols[SELF_CLOSING_TAG_DELIMITER]) {
                return scan_self_closing_tag_delimiter(scanner, lexer);
            }
            break;

        default:
            if (lexer->eof(lexer)) {
                return valid_symbols[IMPLICIT_END_TAG] && scan_implicit_end_tag(scanner, lexer);
            }
            if ((valid_symbols[START_TAG_NAME] || valid_symbols[END_TAG_NAME]) &&
                !valid_symbols[RAW_TEXT]) {
                return valid_symbols[START_TAG_NAME] ? scan_start_tag_name(scanner, lexer)
                                                     : scan_end_tag_name(scanner, lexer);
            }
    }

    if (valid_symbols[TEXT]) return scan_text(lexer, false);
    return false;
}

void *tree_sitter_angular_html_external_scanner_create(void) {
    Scanner *scanner = (Scanner *)ts_calloc(1, sizeof(Scanner));
    array_init(&scanner->tags);
    array_init(&scanner->spare);
    return scanner;
}

bool tree_sitter_angular_html_external_scanner_scan(void *payload, TSLexer *lexer,
                                                    const bool *valid_symbols) {
    return scan((Scanner *)payload, lexer, valid_symbols);
}

unsigned tree_sitter_angular_html_external_scanner_serialize(void *payload, char *buffer) {
    return serialize((Scanner *)payload, buffer);
}

void tree_sitter_angular_html_external_scanner_deserialize(void *payload, const char *buffer,
                                                           unsigned length) {
    deserialize((Scanner *)payload, buffer, length);
}

void tree_sitter_angular_html_external_scanner_destroy(void *payload) {
    Scanner *scanner = (Scanner *)payload;
    // Pool the live buffers, then free every pooled buffer once.
    recycle_tags(scanner);
    for (uint32_t i = 0; i < scanner->spare.size; i++) {
        array_delete(&scanner->spare.contents[i]);
    }
    array_delete(&scanner->spare);
    array_delete(&scanner->tags);
    ts_free(scanner);
}
