package extraction

// Parser for the restricted TJS literal dialect used by main/envinit.tjs:
// dictionaries %[ "key" => value ], arrays [v, ...], strings, decimal/hex
// numbers, true/false/void and bare global constants (emitted as
// {"$const": "name"}). Line (//) and block comments are stripped first.

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type tjsParser struct {
	src string
	pos int
}

func stripTJSComments(src string) string {
	var b strings.Builder
	b.Grow(len(src))
	for i := 0; i < len(src); {
		c := src[i]
		if c == '"' || c == '\'' {
			q := c
			b.WriteByte(c)
			i++
			for i < len(src) {
				b.WriteByte(src[i])
				if src[i] == '\\' && i+1 < len(src) {
					b.WriteByte(src[i+1])
					i += 2
					continue
				}
				if src[i] == q {
					i++
					break
				}
				i++
			}
			continue
		}
		if c == '/' && i+1 < len(src) && src[i+1] == '/' {
			for i < len(src) && src[i] != '\n' {
				i++
			}
			continue
		}
		if c == '/' && i+1 < len(src) && src[i+1] == '*' {
			i += 2
			for i+1 < len(src) && !(src[i] == '*' && src[i+1] == '/') {
				i++
			}
			i += 2
			continue
		}
		b.WriteByte(c)
		i++
	}
	return b.String()
}

func (p *tjsParser) skipSpace() {
	for p.pos < len(p.src) {
		c := p.src[p.pos]
		if c == ' ' || c == '\t' || c == '\n' || c == '\r' {
			p.pos++
		} else {
			break
		}
	}
}

func (p *tjsParser) expect(c byte) error {
	p.skipSpace()
	if p.pos >= len(p.src) || p.src[p.pos] != c {
		return fmt.Errorf("expected %q at position %d (got %q)", c, p.pos, p.safeChar())
	}
	p.pos++
	return nil
}

func (p *tjsParser) safeChar() byte {
	if p.pos < len(p.src) {
		return p.src[p.pos]
	}
	return 0
}

func (p *tjsParser) parseValue() (any, error) {
	p.skipSpace()
	if p.pos >= len(p.src) {
		return nil, fmt.Errorf("unexpected end")
	}
	switch c := p.src[p.pos]; {
	case c == '%':
		if p.pos+1 < len(p.src) && p.src[p.pos+1] == '[' {
			p.pos += 2
			return p.parseDictBody()
		}
		return nil, fmt.Errorf("unexpected %% at %d", p.pos)
	case c == '[':
		p.pos++
		return p.parseArrayBody()
	case c == '"' || c == '\'':
		return p.parseString()
	case c == '-' || c == '+' || (c >= '0' && c <= '9'):
		return p.parseNumber()
	default:
		return p.parseIdent()
	}
}

func (p *tjsParser) parseDictBody() (map[string]any, error) {
	m := map[string]any{}
	for {
		p.skipSpace()
		if p.pos >= len(p.src) {
			return nil, fmt.Errorf("unterminated dict")
		}
		if p.src[p.pos] == ']' {
			p.pos++
			return m, nil
		}
		key, err := p.parseKey()
		if err != nil {
			return nil, err
		}
		p.skipSpace()
		// separator: '=>' or ':'
		if p.pos+1 < len(p.src) && p.src[p.pos] == '=' && p.src[p.pos+1] == '>' {
			p.pos += 2
		} else if p.pos < len(p.src) && p.src[p.pos] == ':' {
			p.pos++
		} else {
			return nil, fmt.Errorf("expected => or : after key %q at %d", key, p.pos)
		}
		val, err := p.parseValue()
		if err != nil {
			return nil, err
		}
		m[key] = val
		p.skipSpace()
		if p.pos < len(p.src) && p.src[p.pos] == ',' {
			p.pos++
			continue
		}
		if p.pos < len(p.src) && p.src[p.pos] == ']' {
			p.pos++
			return m, nil
		}
	}
}

func (p *tjsParser) parseArrayBody() ([]any, error) {
	var arr []any
	for {
		p.skipSpace()
		if p.pos >= len(p.src) {
			return nil, fmt.Errorf("unterminated array")
		}
		if p.src[p.pos] == ']' {
			p.pos++
			return arr, nil
		}
		val, err := p.parseValue()
		if err != nil {
			return nil, err
		}
		arr = append(arr, val)
		p.skipSpace()
		if p.pos < len(p.src) && p.src[p.pos] == ',' {
			p.pos++
		} else if p.pos < len(p.src) && p.src[p.pos] == ']' {
			p.pos++
			return arr, nil
		}
	}
}

func (p *tjsParser) parseKey() (string, error) {
	p.skipSpace()
	if p.pos < len(p.src) && (p.src[p.pos] == '"' || p.src[p.pos] == '\'') {
		v, err := p.parseString()
		return v, err
	}
	start := p.pos
	for p.pos < len(p.src) {
		c := p.src[p.pos]
		if c == '=' || c == ':' || c == ' ' || c == '\t' || c == '\n' || c == '\r' {
			break
		}
		p.pos++
	}
	if p.pos == start {
		return "", fmt.Errorf("expected key at %d", p.pos)
	}
	return p.src[start:p.pos], nil
}

func (p *tjsParser) parseString() (string, error) {
	q := p.src[p.pos]
	p.pos++
	var b strings.Builder
	for p.pos < len(p.src) {
		c := p.src[p.pos]
		if c == q {
			p.pos++
			return b.String(), nil
		}
		if c == '\\' && p.pos+1 < len(p.src) {
			e := p.src[p.pos+1]
			switch e {
			case 'n':
				b.WriteByte('\n')
			case 't':
				b.WriteByte('\t')
			case 'r':
				b.WriteByte('\r')
			case '\\':
				b.WriteByte('\\')
			case '"':
				b.WriteByte('"')
			case '\'':
				b.WriteByte('\'')
			case 'x':
				if p.pos+3 < len(p.src) {
					if v, err := strconv.ParseUint(p.src[p.pos+2:p.pos+4], 16, 8); err == nil {
						b.WriteByte(byte(v))
						p.pos += 4
						continue
					}
				}
				b.WriteByte(e)
			default:
				b.WriteByte(e)
			}
			p.pos += 2
			continue
		}
		b.WriteByte(c)
		p.pos++
	}
	return "", fmt.Errorf("unterminated string")
}

func (p *tjsParser) parseNumber() (any, error) {
	start := p.pos
	if p.src[p.pos] == '-' || p.src[p.pos] == '+' {
		p.pos++
	}
	isHex := p.pos+1 < len(p.src) && p.src[p.pos] == '0' && (p.src[p.pos+1] == 'x' || p.src[p.pos+1] == 'X')
	if isHex {
		p.pos += 2
		hstart := p.pos
		for p.pos < len(p.src) && isHexDigit(p.src[p.pos]) {
			p.pos++
		}
		v, err := strconv.ParseUint(p.src[hstart:p.pos], 16, 64)
		if err != nil {
			return nil, err
		}
		return v, nil
	}
	dot := false
	for p.pos < len(p.src) {
		c := p.src[p.pos]
		if c >= '0' && c <= '9' {
			p.pos++
		} else if c == '.' && !dot {
			dot = true
			p.pos++
		} else {
			break
		}
	}
	tok := p.src[start:p.pos]
	if dot {
		v, err := strconv.ParseFloat(tok, 64)
		return v, err
	}
	v, err := strconv.ParseInt(tok, 10, 64)
	return v, err
}

func isHexDigit(c byte) bool {
	return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
}

func (p *tjsParser) parseIdent() (any, error) {
	start := p.pos
	for p.pos < len(p.src) {
		c := p.src[p.pos]
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
			(c >= '0' && c <= '9') || c == '_' || c == '$' || c == '.' || c >= 0x80 {
			p.pos++
		} else {
			break
		}
	}
	name := strings.TrimSuffix(p.src[start:p.pos], ".")
	if p.pos-start > len(name) {
		p.pos = start + len(name)
	}
	if name == "" {
		return nil, fmt.Errorf("unexpected char %q at %d", p.safeChar(), p.pos)
	}
	switch name {
	case "true":
		return true, nil
	case "false":
		return false, nil
	case "void", "null":
		return nil, nil
	}
	// TJS type casts: "int -200", "real 1.5", "bool true", ...
	if name == "int" || name == "real" || name == "bool" || name == "string" || name == "float" {
		saved := p.pos
		p.skipSpace()
		if p.pos < len(p.src) {
			c := p.src[p.pos]
			if c == '-' || c == '+' || (c >= '0' && c <= '9') || c == '"' || c == '\'' || c == 't' || c == 'f' {
				return p.parseValue()
			}
		}
		p.pos = saved
	}
	return map[string]any{"$const": name}, nil
}

// ParseTJSLiteral parses a TJS expression file (whose body is one %[ ... ]
// dictionary) into generic Go values.
func ParseTJSLiteral(src string) (map[string]any, error) {
	src = stripTJSComments(src)
	p := &tjsParser{src: src}
	p.skipSpace()
	v, err := p.parseValue()
	if err != nil {
		return nil, err
	}
	m, ok := v.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("envinit: top level is not a dictionary")
	}
	p.skipSpace()
	// trailing ';' is allowed
	if p.pos < len(p.src) && p.src[p.pos] == ';' {
		p.pos++
	}
	return m, nil
}

// compileEnvinit parses main/envinit.tjs and writes envinit.json.
func compileEnvinit(extractedDataDir string) error {
	raw, err := decodeScenarioFile(filepath.Join(extractedDataDir, "main", "envinit.tjs"))
	if err != nil {
		return err
	}
	env, err := ParseTJSLiteral(raw)
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(env, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(extractedDataDir, "envinit.json"), data, 0o644)
}
