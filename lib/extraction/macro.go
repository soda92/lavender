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

// expandMacros splices macro bodies into the token stream. Each
// invocation walks its OWN copy of the (shared) body tokens — macro
// bodies are stored once and must never be mutated, otherwise the first
// expansion leaks substituted values into every later invocation.
// Attributes on a nested macro call are substituted through the
// caller's parameter scope before becoming the inner scope.
func (lib macroLib) expand(toks []kagToken) []kagToken {
	var out []kagToken
	var walk func(ts []kagToken, mp map[string]string)
	walk = func(ts []kagToken, mp map[string]string) {
		for _, t := range ts {
			if t.kind == "tag" {
				if body, ok := lib[normalizeAttrKey(t.name)]; ok {
					inner := map[string]string{}
					for _, a := range t.args {
						if a.Flag {
							inner[normalizeAttrKey(a.Key)] = ""
							continue
						}
						v := a.Val
						if mp != nil {
							v = substMacro(v, mp)
						}
						inner[normalizeAttrKey(a.Key)] = v
					}
					walk(body, inner)
					continue
				}
				if mp != nil && len(t.args) > 0 {
					nt := t
					nt.args = append([]kagArg(nil), t.args...)
					for i := range nt.args {
						if !nt.args[i].Flag {
							nt.args[i].Val = substMacro(nt.args[i].Val, mp)
						}
					}
					out = append(out, nt)
					continue
				}
			} else if t.kind == "text" && mp != nil {
				nt := t
				nt.text = substMacroText(t.text, mp)
				out = append(out, nt)
				continue
			}
			out = append(out, t)
		}
	}
	walk(toks, nil)
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
