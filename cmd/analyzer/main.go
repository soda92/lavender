// Command analyzer audits the compiled game data: it enumerates every command
// tag used across all scenarios, classifies it (base KAG / framework / stage /
// character / bgm / se / event / unknown), and verifies that referenced assets
// (backgrounds, music, voices, event images, sprite layers) exist in
// file_map.json / characters.json. The report drives runner implementation.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"golang.org/x/text/encoding/japanese"
	"golang.org/x/text/transform"
)

type Instruction map[string]any

type Scenario struct {
	Name         string        `json:"name"`
	Storage      string        `json:"storage"`
	Instructions []Instruction `json:"instructions"`
}

type stat struct {
	count   int
	story   int // occurrences in scenario/*.ks
	example string
	file    string
}

func main() {
	dataDir := flag.String("data", "extracted_data", "extracted data directory")
	flag.Parse()

	scenarios := loadScenarios(*dataDir)
	envinit := loadJSON[map[string]any](*dataDir, "envinit.json")
	charmeta := loadJSON[map[string]any](*dataDir, "characters.json")
	filemap := loadJSON[map[string]string](*dataDir, "file_map.json")
	lowerMap := map[string]string{}
	for stem, p := range filemap {
		lowerMap[strings.ToLower(stem)] = p
	}
	mediaExists := func(name string) bool {
		_, ok := lowerMap[strings.ToLower(name)]
		return ok
	}

	stages := keys(envinit["stages"])
	charSec := asMap(envinit["characters"])
	for _, p := range keys(envinit["positions"]) {
		positionSet[p] = true
	}
	for _, lv := range keys(envinit["levels"]) {
		levelSet[lv] = true
	}
	transitionSet := map[string]bool{}
	for _, t := range keys(envinit["transitions"]) {
		transitionSet[t] = true
	}
	actionSet := map[string]bool{}
	for _, a := range keys(envinit["actions"]) {
		actionSet[a] = true
	}
	layerFlagSet := map[string]bool{}
	for _, f := range []string{"front", "back", "show", "hide", "reset", "left", "right",
		"on", "off", "sync", "nosync", "wait", "nowait", "canskip"} {
		layerFlagSet[f] = true
	}

	tags := map[string]*stat{}
	tagClass := map[string]string{}

	// alias map: nameAlias -> registered name
	aliases := map[string]string{}
	for nm, v := range charSec {
		if m, ok := v.(map[string]any); ok {
			if a, ok := m["nameAlias"].(string); ok {
				aliases[a] = nm
			}
		}
	}

	// resource checks
	missingBGM := map[string]int{}
	missingVoice := map[string]int{}
	missingStage := map[string]int{}
	missingCharPart := map[string]int{}
	fallbackChar := map[string]int{}
	missingEv := map[string]int{}

	classCounter := map[string]int{}
	tjsHandlers := loadTJSHandlers(*dataDir)

	// global pre-pass: dynamic layers persist across scenarios
	globalLayers := map[string]bool{}
	globalChars := map[string]bool{}
	for _, sc := range scenarios {
		for _, in := range sc.Instructions {
			if s, _ := in["type"].(string); s != "command" {
				continue
			}
			name, _ := in["name"].(string)
			args, _ := in["args"].(map[string]any)
			nm, _ := args["name"].(string)
			switch strings.ToLower(name) {
			case "newlay", "newlayer", "new":
				if nm != "" {
					globalLayers[nm] = true
				}
			case "newchar":
				if nm != "" {
					globalChars[nm] = true
				}
			}
		}
	}

	for _, sc := range scenarios {
		isStory := strings.HasPrefix(sc.Storage, "scenario/")

		// dynamic layer names (union over all scenarios; layers persist)
		layers := globalLayers
		dynChars := globalChars

		for _, in := range sc.Instructions {
			if s, _ := in["type"].(string); s != "command" {
				continue
			}
			name, _ := in["name"].(string)
			st := tags[name]
			if st == nil {
				st = &stat{file: sc.Storage, example: exampleString(in)}
				tags[name] = st
			}
			st.count++
			if isStory {
				st.story++
			}

			args, _ := in["args"].(map[string]any)
			argv := toStringSlice(in["argv"])
			class := classify(name, stages, charSec, aliases, layers, dynChars)
			classCounter[class]++
			if _, ok := tagClass[name]; !ok {
				tagClass[name] = class
			}

			switch class {
			case "stage":
				if tmpl := stageTemplate(envinit, name); tmpl != "" {
					timeName := ""
					for _, a := range argv {
						if _, ok := asMap(envinit["times"])[a]; ok {
							timeName = a
							break
						}
					}
					f := strings.ReplaceAll(tmpl, "TIME", timePrefix(envinit, timeName))
					if !mediaExists(f) {
						missingStage[f+" ("+name+" "+timeName+")"]++
					}
				}
			case "character":
				if voice, ok := args["voice"].(string); ok && voice != "" {
					if !mediaExists(voice) {
						missingVoice[voice]++
					}
				}
				if len(argv) > 0 {
					if reason := checkCharPart(charmeta, envinit, aliases, name, argv,
						transitionSet, actionSet, layerFlagSet); reason != "" {
						if msg, ok := strings.CutPrefix(reason, "fallback:"); ok {
							fallbackChar[msg]++
						} else if msg, ok := strings.CutPrefix(reason, "missing:"); ok {
							missingCharPart[msg]++
						}
					}
				}
			case "bgm":
				ref := name
				if name == "bgm" {
					// generic control form: [bgm stop=...] / [bgm storage=...]
					ref, _ = firstStr(args, "storage", "file", "name")
					if ref == "" {
						break
					}
				}
				if !mediaExists(stem(ref)) {
					missingBGM[ref]++
				}
			case "se":
				ref := name
				if name == "se" {
					ref, _ = firstStr(args, "name", "storage", "file")
					if ref == "" {
						break
					}
				}
				if !mediaExists(stem(ref)) {
					missingBGM[ref]++
				}
			case "event":
				ref := name
				if name == "ev" {
					ref, _ = firstStr(args, "file", "storage", "name")
					if ref == "" {
						break
					}
				}
				if strings.HasPrefix(ref, "&") || strings.HasPrefix(ref, "$") {
					break // runtime TJS expression
				}
				if !mediaExists(stem(ref)) {
					missingEv[ref]++
				}
			}
		}
	}

	// ---- report ----
	fmt.Println("# Lavender scenario audit")
	fmt.Printf("\nscenarios: %d, distinct command tags: %d\n", len(scenarios), len(tags))
	fmt.Println("\n## tag classes (by occurrence)")
	for _, c := range sortedKV(classCounter) {
		fmt.Printf("  %-12s %d\n", c.k, c.v)
	}

	fmt.Println("\n## all tags by class")
	byClass := map[string][]string{}
	for name, c := range tagClass {
		byClass[c] = append(byClass[c], name)
	}
	for _, c := range []string{"stage", "character", "layer", "bgm", "se", "event", "base", "framework", "unknown"} {
		ns := byClass[c]
		sort.Strings(ns)
		fmt.Printf("\n### %s (%d distinct)\n", c, len(ns))
		for _, n := range ns {
			fmt.Printf("  %6d  %s\n", tags[n].count, n)
		}
	}

	// unknowns split by scope; annotated with TJS handler availability
	var storyUnk, sysUnk []string
	for n, c := range tagClass {
		if c != "unknown" {
			continue
		}
		if tags[n].story > 0 {
			storyUnk = append(storyUnk, n)
		} else {
			sysUnk = append(sysUnk, n)
		}
	}
	sort.Slice(storyUnk, func(i, j int) bool { return tags[storyUnk[i]].story > tags[storyUnk[j]].story })
	sort.Strings(sysUnk)
	fmt.Printf("\n## unknown tags used IN STORY (%d distinct)\n", len(storyUnk))
	for _, n := range storyUnk {
		h := ""
		if tjsHandlers[n] {
			h = " [tjs handler]"
		}
		fmt.Printf("  story %5d / total %5d  %s%s\n", tags[n].story, tags[n].count, n, h)
	}
	fmt.Printf("\n## unknown tags only in system screens (%d distinct)\n", len(sysUnk))
	line := ""
	for _, n := range sysUnk {
		if len(line)+len(n) > 110 {
			fmt.Println("  " + line)
			line = ""
		}
		line += n + " "
	}
	if line != "" {
		fmt.Println("  " + line)
	}

	fmt.Println("\n## resource verification")
	reportMissing("stage backgrounds", missingStage)
	reportMissing("bgm/se files", missingBGM)
	reportMissing("voice files", missingVoice)
	reportMissing("event images", missingEv)
	reportMissing("character sprite combos", missingCharPart)
	reportMissing("cross-pose face fallbacks", fallbackChar)
}

// known base KAG / KAGEX command set.
var baseTags = map[string]bool{
	"r": true, "p": true, "np": true, "l": true, "er": true, "cm": true, "ct": true,
	"font": true, "deffont": true, "ruby": true, "ruby2": true,
	"link": true, "endlink": true, "locklink": true, "unlocklink": true, "click": true,
	"jump": true, "call": true, "return": true, "gotostart": true, "gotolabel": true,
	"if": true, "endif": true, "else": true, "elsif": true, "eval": true, "iscript": true, "endscript": true,
	"wait": true, "waitclick": true, "waitvolume": true, "time": true,
	"select": true, "seladd": true, "selsell": true, "seltext": true, "selbtn": true,
	"layopt": true, "current": true, "hstart": true, "hend": true, "ch": true,
	"history": true, "skip": true, "clickskip": true, "nowait": true, "nowaitmode": true,
	"cancelnowaitmode": true, "autodisplay": true, "autohide": true,
	"graph": true, "image": true, "laycount": true, "layclear": true, "map": true,
	"quake": true, "stopquake": true, "quakeadd": true,
	"trans": true, "begintrans": true, "endtrans": true, "notrans": true,
	"stopvideo": true, "playvideo": true, "video": true, "movie": true,
	"volume": true, "globaltimer": true, "timer": true,
	"enabledb": true, "rbutton": true, "ignoreinput": true,
}

// framework tags implemented by the Akabei KAGEnv / MainWindow layer.
var frameworkTags = map[string]bool{
	"bg": true, "stage": true, "setstage": true, "stime": true, "clearlayers": true,
	"stopbgm": true, "fadebgm": true, "fadeoutbgm": true, "playbgm": true,
	"stopse": true, "fadeoutse": true, "playse": true, "fadese": true,
	"allstop": true, "stopallsound": true, "stopallvoice": true,
	"sysmovie": true, "sysrclick": true, "sysuiload": true, "meswinload": true,
	"sysupdate": true, "sysjump": true, "init": true, "initenv": true, "resetenv": true,
	"linemode": true, "craftername": true, "erafterpage": true, "noeffect": true,
	"face": true, "noface": true, "faceset": true,
	"newchar": true, "newlay": true, "newlayer": true, "new": true,
	"deletechar": true, "dellay": true, "pos": true, "resetpos": true, "level": true,
	"disp": true, "action": true, "emotion": true, "emotionmap": true,
	"cursor": true, "defaultcursor": true,
	"swpermitskip": true, "firstlinetimer": true, "save": true, "load": true,
	"qdisp": true, "qdefine": true, "quiz": true,
	"titlebgm": true, "delayreset": true, "delay": true, "delaycancel": true,
	"envset": true, "updateenv": true, "setvar": true, "env": true, "lavebg": true,
	// layer / char visibility (KAGEnvironment envCommands + MainWindow)
	"hidebase": true, "hideevent": true, "hidecharacters": true, "hidechars": true,
	"hidelayers": true, "hidefore": true, "hideall": true,
	"allchar": true, "alllayer": true, "allse": true, "colorall": true, "resetcolor": true,
	"nostopbgm": true, "keepvoice": true,
	// camera
	"shiftx": true, "shifty": true, "camerax": true, "cameray": true, "camerazoom": true,
	"actioncamera": true, "resetcamera": true, "stopcamera": true, "camerach": true,
	// skip / auto / roll
	"beginskip": true, "endskip": true, "fastskip": true, "cancelskip": true,
	"cancelautomode": true, "autoroll": true,
	"rollinit": true, "roll": true, "rollwait": true, "rclickrollcancel": true,
	// message window / UI
	"msgoff": true, "msgon": true, "position": true, "chaptitle": true, "charbar": true,
	"intermission": true, "brows": true, "dialog": true, "button": true, "close": true,
	"historyopt": true, "clearhistory": true, "backlay": true, "bubble": true,
	"indent": true, "endindent": true, "defstyle": true,
	"clearallmacro": true, "clearvar": true, "freesnapshot": true,
	"anim": true, "chirashi": true, "negaposi": true, "touch": true, "wbl": true,
	"next": true,
}

func classify(name string, stages []string, chars map[string]any, aliases map[string]string,
	layers map[string]bool, dynChars map[string]bool) string {
	lname := strings.ToLower(name)
	if name == "*" {
		return "base"
	}
	if baseTags[lname] {
		return "base"
	}
	if frameworkTags[lname] {
		return "framework"
	}
	if _, ok := lookup(stages, name); ok {
		return "stage"
	}
	if _, ok := chars[name]; ok {
		return "character"
	}
	if _, ok := aliases[name]; ok {
		return "character"
	}
	if dynChars[name] {
		return "character"
	}
	if layers[name] {
		return "layer"
	}
	if strings.HasPrefix(lname, "bgm") {
		return "bgm"
	}
	if isSETag(lname) {
		return "se"
	}
	if strings.HasPrefix(lname, "ev") {
		return "event"
	}
	return "unknown"
}

// isSETag recognizes framework sound-effect tags such as "SE007_02" / "se_w004a".
func isSETag(lname string) bool {
	if lname == "se" {
		return true
	}
	if !strings.HasPrefix(lname, "se") || len(lname) < 3 {
		return false
	}
	// "select"/"seladd"/... are base tags (already handled) and "set*"
	// are framework tags, so only SE0.. / SE_.. names reach here.
	c := lname[2]
	return (c >= '0' && c <= '9') || c == '_'
}

// loadTJSHandlers collects "name : function(" handler keys from system/*.tjs.
func loadTJSHandlers(dataDir string) map[string]bool {
	set := map[string]bool{}
	root := filepath.Join(dataDir, "system")
	_ = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.HasSuffix(path, ".tjs") {
			return nil
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			return nil
		}
		dec := transform.NewReader(bytes.NewReader(raw), japanese.ShiftJIS.NewDecoder())
		decRaw, err := io.ReadAll(dec)
		if err != nil {
			return nil
		}
		text := string(decRaw)
		for _, line := range strings.Split(text, "\n") {
			line = strings.TrimSpace(line)
			i := strings.Index(line, ": function")
			if i <= 0 {
				continue
			}
			key := strings.TrimSpace(line[:i])
			if key != "" && !strings.ContainsAny(key, " .") {
				set[key] = true
			}
		}
		return nil
	})
	return set
}

func stageTemplate(env map[string]any, name string) string {
	st, ok := asMap(env["stages"])[name].(map[string]any)
	if !ok {
		return ""
	}
	if img, ok := st["image"].(string); ok {
		return img
	}
	return ""
}

func timePrefix(env map[string]any, timeName string) string {
	if timeName == "" {
		if dt, ok := env["defaultTime"].(string); ok {
			timeName = dt
		}
	}
	times := asMap(env["times"])
	if t, ok := times[timeName].(map[string]any); ok {
		if p, ok := t["prefix"].(string); ok {
			return p
		}
	}
	return "a"
}

// checkCharPart verifies each positional token against characters.json.
// Invocation tokens are content-classified (pose/dress/diff/face/position);
// calls without a pose token are hide/slide/position actions and skipped.
func checkCharPart(charmeta map[string]any, env map[string]any, aliases map[string]string, name string,
	argv []string, transitionSet, actionSet, layerFlagSet map[string]bool) string {
	registered := name
	if n, ok := aliases[name]; ok {
		registered = n
	}
	chars, _ := charmeta["characters"].(map[string]any)
	cent, ok := chars[registered].(map[string]any)
	if !ok {
		return "" // voice-only NPC
	}
	poseList, _ := cent["poses"].([]any)
	poseToBase := map[string]string{}
	for _, p := range poseList {
		pm, _ := p.(map[string]any)
		pose, _ := pm["pose"].(string)
		base, _ := pm["base"].(string)
		poseToBase[pose] = base
	}

	// find the pose token; absent => not a dress-up invocation
	var base string
	for _, t := range argv {
		if b, ok := poseToBase[t]; ok {
			base = b
			break
		}
	}
	if base == "" {
		return ""
	}
	poses, _ := charmeta["poses"].(map[string]any)
	meta, ok := poses[base].(map[string]any)
	if !ok {
		return "missing:" + fmt.Sprintf("%s: no layer metadata for base %s", registered, base)
	}
	dressSet := map[string]bool{}
	diffSet := map[string]bool{}
	for _, d := range anySlice(meta["dresses"]) {
		m, _ := d.(map[string]any)
		dressSet[strOr(m["dress"])] = true
		diffSet[strOr(m["diff"])] = true
	}
	faceSet := map[string]bool{}
	for _, f := range anySlice(meta["faces"]) {
		m, _ := f.(map[string]any)
		faceSet[strOr(m["expression"])] = true
	}

	for _, tok := range argv {
		if poseToBase[tok] != "" {
			continue
		}
		if dressSet[tok] || diffSet[tok] || faceSet[tok] {
			continue
		}
		if positionSet[tok] || levelSet[tok] || tok == "顔" {
			continue
		}
		if transitionSet[tok] || actionSet[tok] || layerFlagSet[tok] {
			continue
		}
		// expression missing in this pose but present in a sibling pose table
		if other := findFallbackFace(charmeta, poseToBase, base, tok); other != "" {
			return "fallback:" + fmt.Sprintf("%s/%s expression %q -> %s", registered, base, tok, other)
		}
		return "missing:" + fmt.Sprintf("%s/%s: unrecognized token %q", registered, base, tok)
	}
	return ""
}

var positionSet = map[string]bool{}
var levelSet = map[string]bool{}

// findFallbackFace reports another pose base of the same character whose face
// table contains the expression, or "" when none exists.
func findFallbackFace(charmeta map[string]any, poseToBase map[string]string, curBase, expr string) string {
	poses, _ := charmeta["poses"].(map[string]any)
	for _, b := range poseToBase {
		if b == curBase {
			continue
		}
		meta, ok := poses[b].(map[string]any)
		if !ok {
			continue
		}
		for _, f := range anySlice(meta["faces"]) {
			m, _ := f.(map[string]any)
			if strOr(m["expression"]) == expr {
				return b
			}
		}
	}
	return ""
}

func firstStr(m map[string]any, keys ...string) (string, bool) {
	for _, k := range keys {
		if v, ok := m[k].(string); ok && v != "" {
			return v, true
		}
	}
	return "", false
}

func anySlice(v any) []any {
	s, _ := v.([]any)
	return s
}

func strOr(v any) string {
	s, _ := v.(string)
	return s
}

// ---- helpers ----

func loadScenarios(dataDir string) []Scenario {
	var out []Scenario
	root := filepath.Join(dataDir, "scenarios")
	_ = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.HasSuffix(path, ".json") {
			return nil
		}
		var sc Scenario
		f, err := os.Open(path)
		if err != nil {
			return nil
		}
		defer f.Close()
		if json.NewDecoder(f).Decode(&sc) == nil {
			out = append(out, sc)
		}
		return nil
	})
	return out
}

func loadJSON[T any](dataDir, name string) T {
	var zero T
	p := filepath.Join(dataDir, name)
	f, err := os.Open(p)
	if err != nil {
		return zero
	}
	defer f.Close()
	var v T
	if json.NewDecoder(f).Decode(&v) != nil {
		return zero
	}
	return v
}

func keys(v any) []string {
	m, ok := v.(map[string]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func asMap(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}

func lookup(xs []string, s string) (int, bool) {
	for i, x := range xs {
		if x == s {
			return i, true
		}
	}
	return -1, false
}

func toStringSlice(v any) []string {
	arr, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(arr))
	for _, a := range arr {
		if s, ok := a.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

func stem(path string) string {
	path = strings.ReplaceAll(path, "\\", "/")
	base := filepath.Base(path)
	if i := strings.LastIndexByte(base, '.'); i > 0 {
		return base[:i]
	}
	return base
}

func exampleString(in Instruction) string {
	b, _ := json.Marshal(in)
	s := string(b)
	if len(s) > 120 {
		s = s[:120] + "..."
	}
	return s
}

type kv struct {
	k string
	v int
}

func sortedKV(m map[string]int) []kv {
	out := make([]kv, 0, len(m))
	for k, v := range m {
		out = append(out, kv{k, v})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].v > out[j].v })
	return out
}

func reportMissing(label string, m map[string]int) {
	if len(m) == 0 {
		fmt.Printf("  %-28s OK\n", label)
		return
	}
	names := make([]string, 0, len(m))
	for k := range m {
		names = append(names, k)
	}
	sort.Strings(names)
	fmt.Printf("  %-28s %d missing:\n", label, len(m))
	for _, n := range names {
		fmt.Printf("      %4d x %s\n", m[n], n)
	}
}
