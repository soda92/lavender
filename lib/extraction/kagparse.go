package extraction

// Tokenizer for the Akabei/KAGEX dialect of Kirikiri2 KAG scripts.
//
// Scenarios are CP932 text made of:
//
//	*label|caption          labels
//	; comment               comment lines
//	@tag attr=...           line command (rest of the physical line)
//	text with [tag]...      inline text/tags
//
// Tokens preserve ordered BARE arguments ("flags"): Akabei framework tags use
// positional Japanese words such as [アキナ 私服 ポーズＡ 基本 顔] which KAG
// passes as ordered empty-valued attributes. A line ending with "\" continues
// onto the next line.

import "strings"

type kagArg struct {
	Key  string
	Val  string
	Flag bool // bare word without '='
}

type kagToken struct {
	kind string // "text" | "tag" | "label" | "comment"
	text string // text payload / label caption
	name string // tag or label name
	args []kagArg
	line int
}

// tokenizeKAG splits a decoded .ks file into a flat token stream.
func tokenizeKAG(content string) []kagToken {
	content = strings.ReplaceAll(content, "\r\n", "\n")
	content = strings.ReplaceAll(content, "\r", "\n")
	rawLines := strings.Split(content, "\n")

	// Join backslash-continued physical lines into logical lines.
	var lines []string
	for i := 0; i < len(rawLines); i++ {
		cur := rawLines[i]
		for strings.HasSuffix(cur, "\\") && i+1 < len(rawLines) {
			cur = cur[:len(cur)-1] + " " + rawLines[i+1]
			i++
		}
		lines = append(lines, cur)
	}

	var toks []kagToken
	for ln, line := range lines {
		lineNo := ln + 1
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		switch {
		case strings.HasPrefix(trimmed, ";"):
			toks = append(toks, kagToken{kind: "comment", text: trimmed[1:], line: lineNo})
		case strings.HasPrefix(trimmed, "*"):
			name, caption, _ := strings.Cut(trimmed[1:], "|")
			toks = append(toks, kagToken{kind: "label", name: strings.TrimSpace(name), text: caption, line: lineNo})
		case strings.HasPrefix(trimmed, "@"):
			tag, ok := parseTagToken(trimmed[1:], lineNo)
			if ok {
				toks = append(toks, tag)
			}
		default:
			toks = append(toks, tokenizeInline(line, lineNo)...)
		}
	}
	return toks
}

func tokenizeInline(line string, lineNo int) []kagToken {
	var toks []kagToken
	var buf strings.Builder
	flushText := func() {
		if buf.Len() > 0 {
			toks = append(toks, kagToken{kind: "text", text: buf.String(), line: lineNo})
			buf.Reset()
		}
	}
	for i := 0; i < len(line); i++ {
		c := line[i]
		if c != '[' {
			buf.WriteByte(c)
			continue
		}
		// find closing ']' while honoring quotes
		j := i + 1
		var quote byte
		for j < len(line) {
			cj := line[j]
			if quote != 0 {
				if cj == quote {
					quote = 0
				}
			} else if cj == '"' || cj == '\'' {
				quote = cj
			} else if cj == ']' {
				break
			}
			j++
		}
		if j >= len(line) {
			// unmatched bracket: treat as text
			buf.WriteByte(c)
			continue
		}
		flushText()
		if tag, ok := parseTagToken(line[i+1:j], lineNo); ok {
			toks = append(toks, tag)
		}
		i = j
	}
	flushText()
	return toks
}

// parseTagToken parses "name attr=val flag attr='x y'".
func parseTagToken(s string, lineNo int) (kagToken, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return kagToken{}, false
	}
	parts := splitTagArgs(s)
	if len(parts) == 0 {
		return kagToken{}, false
	}
	t := kagToken{kind: "tag", name: parts[0], line: lineNo}
	for _, p := range parts[1:] {
		if k, v, found := strings.Cut(p, "="); found {
			t.args = append(t.args, kagArg{Key: normalizeAttrKey(k), Val: unquote(v)})
		} else {
			t.args = append(t.args, kagArg{Key: p, Flag: true})
		}
	}
	return t, true
}

func splitTagArgs(s string) []string {
	var out []string
	var buf strings.Builder
	var quote byte
	flush := func() {
		if buf.Len() > 0 {
			out = append(out, buf.String())
			buf.Reset()
		}
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if quote != 0 {
			buf.WriteByte(c)
			if c == quote {
				quote = 0
			}
			continue
		}
		switch c {
		case '"', '\'':
			quote = c
			buf.WriteByte(c)
		case ' ', '\t':
			flush()
		default:
			buf.WriteByte(c)
		}
	}
	flush()
	return out
}

func unquote(v string) string {
	if len(v) >= 2 {
		if (v[0] == '"' && v[len(v)-1] == '"') || (v[0] == '\'' && v[len(v)-1] == '\'') {
			return v[1 : len(v)-1]
		}
	}
	return v
}

// KAG attribute names are case-insensitive and stored lower-cased.
func normalizeAttrKey(k string) string {
	return strings.ToLower(strings.TrimSpace(k))
}

func (t kagToken) arg(name string) (string, bool) {
	name = normalizeAttrKey(name)
	for _, a := range t.args {
		if !a.Flag && a.Key == name {
			return a.Val, true
		}
	}
	return "", false
}

func (t kagToken) flags() []string {
	var out []string
	for _, a := range t.args {
		if a.Flag {
			out = append(out, a.Key)
		}
	}
	return out
}
