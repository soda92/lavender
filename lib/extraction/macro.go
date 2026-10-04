package extraction

// Compile-time expansion of KAG [macro name=...]..[endmacro] libraries
// (scenario/macro.ks in Lavender). Expansion follows the engine semantics:
// invocation attributes become a parameter dictionary; "%key|default" /
// "%key" tokens in the body are substituted, then the body tokens are spliced
// in place. Nested macro calls get nested parameter scopes. "&expr" values are
// left for the runtime.

import "strings"

type macroLib map[string][]kagToken

// loadMacros collects macro bodies from a tokenized .ks library.
func loadMacros(toks []kagToken) macroLib {
	lib := macroLib{}
	var curName string
	var cur []kagToken
	collecting := false
	for _, t := range toks {
		if t.kind == "tag" && strings.EqualFold(t.name, "macro") {
			if name, ok := t.arg("name"); ok {
				curName = normalizeAttrKey(name)
				cur = nil
				collecting = true
			}
			continue
		}
		if t.kind == "tag" && strings.EqualFold(t.name, "endmacro") {
			if collecting {
				lib[curName] = cur
				collecting = false
			}
			continue
		}
		if collecting {
			cur = append(cur, t)
		}
	}
	return lib
}

type macroFrame struct {
	toks []kagToken
	pos  int
	mp   map[string]string
}

// expandMacros splices macro bodies into the token stream.
func (lib macroLib) expand(toks []kagToken) []kagToken {
	frames := []macroFrame{{toks: toks}}
	var out []kagToken
	for len(frames) > 0 {
		top := &frames[len(frames)-1]
		if top.pos >= len(top.toks) {
			frames = frames[:len(frames)-1]
			continue
		}
		t := top.toks[top.pos]
		top.pos++

		if t.kind == "tag" {
			if body, ok := lib[normalizeAttrKey(t.name)]; ok {
				mp := map[string]string{}
				for _, a := range t.args {
					if a.Flag {
						mp[normalizeAttrKey(a.Key)] = ""
					} else {
						mp[a.Key] = a.Val
					}
				}
				frames = append(frames, macroFrame{toks: body, mp: mp})
				continue
			}
			if top.mp != nil {
				for i := range t.args {
					if !t.args[i].Flag {
						t.args[i].Val = substMacro(t.args[i].Val, top.mp)
					}
				}
			}
		} else if t.kind == "text" && top.mp != nil {
			t.text = substMacroText(t.text, top.mp)
		}
		out = append(out, t)
	}
	return out
}

// substMacro resolves a whole attribute value beginning with '%'.
func substMacro(v string, mp map[string]string) string {
	if len(v) == 0 || v[0] != '%' {
		return v
	}
	rest := v[1:]
	key, def, hasDef := strings.Cut(rest, "|")
	if val, ok := mp[normalizeAttrKey(key)]; ok {
		return val
	}
	if hasDef {
		return def
	}
	return ""
}

// substMacroText resolves inline "%key|default" occurrences in body text.
func substMacroText(s string, mp map[string]string) string {
	if !strings.Contains(s, "%") {
		return s
	}
	var b strings.Builder
	for i := 0; i < len(s); {
		if s[i] != '%' {
			b.WriteByte(s[i])
			i++
			continue
		}
		j := i + 1
		for j < len(s) && s[j] != '|' && s[j] != '%' && s[j] != ' ' && s[j] != '\t' {
			j++
		}
		key := s[i+1 : j]
		if val, ok := mp[normalizeAttrKey(key)]; ok {
			b.WriteString(val)
			i = j
			if j < len(s) && s[j] == '|' { // skip default text up to next non-name char
				k := j + 1
				for k < len(s) && s[k] != ' ' && s[k] != '\t' {
					k++
				}
				i = k
			}
			continue
		}
		b.WriteByte(s[i])
		i++
	}
	return b.String()
}
