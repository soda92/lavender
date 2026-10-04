package extraction

// Compiles .ks scenarios into the JSON instruction stream consumed by the web
// runner. Pipeline: CP932/UTF-16 decode -> tokenize -> KAG macro expansion ->
// instruction compilation. Framework tags (character names, bgm*, se*, scene
// names, begintrans, ...) are preserved as generic "command" instructions
// with both a named argument map and an ordered list of positional flags.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/text/encoding/japanese"
	"golang.org/x/text/transform"
)

type Instruction map[string]any

// compileAllScenarios compiles every .ks under the extracted tree (except
// macro libraries) into <outDir>/scenarios preserving relative paths.
func compileAllScenarios(extractedDataDir string) (int, error) {
	outDir := filepath.Join(extractedDataDir, "scenarios")

	macroSrc, err := decodeScenarioFile(filepath.Join(extractedDataDir, "scenario", "macro.ks"))
	if err != nil {
		return 0, fmt.Errorf("reading macro.ks: %w", err)
	}
	lib := loadMacros(tokenizeKAG(macroSrc))
	fmt.Printf("  loaded %d KAG macros\n", len(lib))

	n := 0
	err = filepath.Walk(extractedDataDir, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil || info.IsDir() {
			return nil
		}
		if !strings.EqualFold(filepath.Ext(path), ".ks") {
			return nil
		}
		rel, _ := filepath.Rel(extractedDataDir, path)
		base := filepath.Base(path)
		if strings.EqualFold(base, "macro.ks") {
			return nil
		}
		content, err := decodeScenarioFile(path)
		if err != nil {
			return err
		}
		toks := tokenizeKAG(content)
		toks = lib.expand(toks)
		instructions := compileTokens(toks)

		relSlash := filepath.ToSlash(rel)
		relJSON := strings.TrimSuffix(relSlash, filepath.Ext(relSlash)) + ".json"
		target := filepath.Join(outDir, relJSON)
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		data, err := json.MarshalIndent(map[string]any{
			"name":         strings.TrimSuffix(base, filepath.Ext(base)),
			"storage":      strings.TrimSuffix(relSlash, filepath.Ext(relSlash)) + ".ks",
			"instructions": instructions,
		}, "", "  ")
		if err != nil {
			return err
		}
		if err := os.WriteFile(target, data, 0o644); err != nil {
			return err
		}
		n++
		return nil
	})
	return n, err
}

func decodeScenarioFile(path string) (string, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return decodeScenarioBytes(raw)
}

func decodeScenarioBytes(b []byte) (string, error) {
	if bytes.HasPrefix(b, []byte{0xFF, 0xFE}) {
		return utf16BytesToString(b[2:], false), nil
	}
	if bytes.HasPrefix(b, []byte{0xFE, 0xFF}) {
		return utf16BytesToString(b[2:], true), nil
	}
	r := transform.NewReader(bytes.NewReader(b), japanese.ShiftJIS.NewDecoder())
	decoded, err := io.ReadAll(r)
	if err != nil {
		return "", err
	}
	return string(decoded), nil
}

func utf16BytesToString(b []byte, bigEndian bool) string {
	if len(b)%2 == 1 {
		b = b[:len(b)-1]
	}
	runes := make([]rune, len(b)/2)
	for i := range runes {
		lo, hi := b[2*i], b[2*i+1]
		if bigEndian {
			lo, hi = hi, lo
		}
		runes[i] = rune(lo) | rune(hi)<<8
	}
	return string(runes)
}

func compileTokens(toks []kagToken) []Instruction {
	var out []Instruction
	var textBuf strings.Builder
	lastTextLine := -1

	flush := func() {
		if textBuf.Len() == 0 {
			return
		}
		s := textBuf.String()
		textBuf.Reset()
		lastTextLine = -1
		if strings.TrimSpace(s) == "" {
			return
		}
		out = append(out, Instruction{"type": "text", "text_jp": s, "text_en": ""})
		out = append(out, Instruction{"type": "line_feed"})
	}

	inScript := false
	var scriptBuf strings.Builder
	scriptStartLine := 0

	for _, t := range toks {
		if inScript {
			if t.kind == "tag" && strings.EqualFold(t.name, "endscript") {
				body := strings.TrimSpace(scriptBuf.String())
				if body != "" {
					out = append(out, Instruction{"type": "eval", "exp": body})
				}
				scriptBuf.Reset()
				inScript = false
			} else {
				if t.kind == "text" {
					scriptBuf.WriteString(t.text)
				}
				scriptBuf.WriteString("\n")
			}
			continue
		}

		switch t.kind {
		case "comment":
			// dropped
		case "label":
			flush()
			out = append(out, Instruction{"type": "label", "name": t.name, "caption": strings.TrimSpace(t.text)})
		case "text":
			if lastTextLine >= 0 && t.line != lastTextLine {
				flush()
			}
			textBuf.WriteString(t.text)
			lastTextLine = t.line
		case "tag":
			if name := strings.ToLower(t.name); name == "iscript" {
				flush()
				inScript = true
				scriptStartLine = t.line
				continue
			}
			flush()
			if in := compileInlineTag(t); in != nil {
				out = append(out, in...)
			}
		}
	}
	flush()
	_ = scriptStartLine
	return out
}

// compileInlineTag maps the small set of tags the runner treats structurally;
// everything else is emitted as a generic framework command.
func compileInlineTag(t kagToken) []Instruction {
	args := argMap(t)
	argv := t.flags()
	name := strings.ToLower(t.name)

	switch name {
	case "*":
		// KAG inline click-wait marker: mid-line "tap to reveal".
		return []Instruction{{"type": "wait_click", "inline": true}}
	case "ruby2", "ruby":
		return []Instruction{{
			"type": "ruby_html",
			"html": fmt.Sprintf("<ruby>%s<rt>%s</rt></ruby>", args["ch"], args["text"]),
		}}
	case "link":
		return []Instruction{{"type": "link_start", "target": args["target"], "exp": args["exp"]}}
	case "endlink":
		return []Instruction{{"type": "link_end"}}
	case "l", "waitclick":
		return []Instruction{{"type": "wait_click"}}
	case "p", "page", "np":
		return []Instruction{{"type": "page_break"}}
	case "er":
		return []Instruction{{"type": "clear_text"}}
	case "if":
		return []Instruction{{"type": "if", "exp": args["exp"]}}
	case "endif":
		return []Instruction{{"type": "endif"}}
	case "else", "elsif":
		return []Instruction{{"type": name, "exp": args["exp"]}}
	case "eval":
		return []Instruction{{"type": "eval", "exp": args["exp"]}}
	case "macro", "endmacro", "macropush", "macropop", "define":
		return nil
	}

	cmd := Instruction{
		"type": "command",
		"name": t.name,
		"args": args,
	}
	if len(argv) > 0 {
		cmd["argv"] = argv
	}
	return []Instruction{cmd}
}

func argMap(t kagToken) map[string]any {
	m := map[string]any{}
	for _, a := range t.args {
		if a.Flag {
			continue
		}
		m[a.Key] = a.Val
	}
	return m
}
