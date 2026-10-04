package extraction

// Compiles sprite composition metadata for the web player:
//
//   - fgimage/charinit.csv   character -> pose -> base filename/offsets
//   - fgimage/charlevel.csv  per-pose per-stage-level offsets
//   - fgimage/<base>_a_info.txt  dress/diff table and face code table
//   - fgimage/<charDir>/<base>_<level>.txt  PSD-style layer manifests
//
// File convention (verified against the assets):
//
//	<base>_<level>_<layerId>.png
//
// level is the zoom stage (0 = smallest), layerId appears in the manifest's
// "layer_id" column (Base(<costume>) rows and per-expression face rows).

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"golang.org/x/text/encoding/japanese"
	"golang.org/x/text/transform"
)

type charPoseInfo struct {
	Pose    string `json:"pose"`
	Base    string `json:"base"`
	XOffset int    `json:"xoffset"`
	YOffset int    `json:"yoffset"`
}

type levelOffset struct {
	X int `json:"x"`
	Y int `json:"y"`
}

type dressInfo struct {
	Dress    string `json:"dress"`
	Kind     string `json:"kind"`
	Diff     string `json:"diff"`
	Layer    string `json:"layer"`
	Folder   string `json:"folder"`
}

type faceInfo struct {
	Expression string `json:"expression"`
	BaseSpec   string `json:"base_spec"`
	Layer      string `json:"layer"`
}

type spriteLayer struct {
	Name        string  `json:"name"`
	Left        float64 `json:"left"`
	Top         float64 `json:"top"`
	Width       float64 `json:"width"`
	Height      float64 `json:"height"`
	Opacity     int     `json:"opacity"`
	LayerID     int     `json:"layer_id"`
	GroupID     int     `json:"group_id"`
}

type poseMeta struct {
	Dresses []dressInfo                 `json:"dresses"`
	Faces   []faceInfo                  `json:"faces"`
	Levels  map[int][]spriteLayer       `json:"levels"`
	Canvas  map[int][2]int              `json:"canvas"`
}

func compileCharacterInfo(extractedDataDir string) error {
	fgDir := filepath.Join(extractedDataDir, "fgimage")

	characters := map[string]any{}

	// charinit.csv
	poses := map[string][]charPoseInfo{}
	if err := readCSVLines(filepath.Join(fgDir, "charinit.csv"), func(rec []string) error {
		if len(rec) < 3 || strings.HasPrefix(rec[0], "#") {
			return nil
		}
		name := strings.TrimSpace(rec[0])
		poses[name] = append(poses[name], charPoseInfo{
			Pose: strings.TrimSpace(rec[1]),
			Base: strings.TrimSpace(rec[2]),
			XOffset: atoiOr(rec[3], 0),
			YOffset: atoiOr(rec[4], 0),
		})
		return nil
	}); err != nil {
		return err
	}

	// charlevel.csv
	levels := map[string]map[string][]levelOffset{}
	if err := readCSVLines(filepath.Join(fgDir, "charlevel.csv"), func(rec []string) error {
		if len(rec) < 6 || strings.HasPrefix(rec[0], "#") {
			return nil
		}
		name := strings.TrimSpace(rec[0])
		pose := strings.TrimSpace(rec[1])
		off := make([]levelOffset, 0, 4)
		// pairs starting at column 2: level0x,level0y,level1x,...
		for i := 2; i+1 < len(rec) && i < 10; i += 2 {
			off = append(off, levelOffset{X: atoiOr(rec[i], 0), Y: atoiOr(rec[i+1], 0)})
		}
		if levels[name] == nil {
			levels[name] = map[string][]levelOffset{}
		}
		levels[name][pose] = off
		return nil
	}); err != nil {
		return err
	}

	for name, ps := range poses {
		entry := map[string]any{
			"name":  name,
			"poses": ps,
		}
		if lv, ok := levels[name]; ok {
			entry["level_offsets"] = lv
		}
		characters[name] = entry
	}

	// <base>_a_info.txt dress/face tables + per-level manifests
	infos, err := filepath.Glob(filepath.Join(fgDir, "*_info.txt"))
	if err != nil {
		return err
	}
	poseMetas := map[string]*poseMeta{}
	for _, infoPath := range infos {
		base := strings.TrimSuffix(filepath.Base(infoPath), "_info.txt")
		meta := &poseMeta{Levels: map[int][]spriteLayer{}, Canvas: map[int][2]int{}}
		if err := parseAInfo(infoPath, meta); err != nil {
			return fmt.Errorf("%s: %w", infoPath, err)
		}
		poseMetas[base] = meta
	}

	// manifests live in each character directory: <base>_<level>.txt
	lvlFiles, _ := filepath.Glob(filepath.Join(fgDir, "*", "*_*.txt"))
	for _, lf := range lvlFiles {
		fn := filepath.Base(lf)
		if !strings.HasSuffix(fn, ".txt") || strings.Contains(fn, "_a_info") {
			continue
		}
		stem := strings.TrimSuffix(fn, ".txt")
		idx := strings.LastIndexByte(stem, '_')
		if idx < 0 {
			continue
		}
		base, lvlStr := stem[:idx], stem[idx+1:]
		lvl, err := strconv.Atoi(lvlStr)
		if err != nil || lvl > 9 {
			continue
		}
		meta := poseMetas[base]
		if meta == nil {
			meta = &poseMeta{Levels: map[int][]spriteLayer{}, Canvas: map[int][2]int{}}
			poseMetas[base] = meta
		}
		canvas, layers, err := parseLayerManifest(lf)
		if err != nil {
			return fmt.Errorf("%s: %w", lf, err)
		}
		meta.Canvas[lvl] = canvas
		meta.Levels[lvl] = layers
	}

	// deterministic JSON
	metaOut := map[string]*poseMeta{}
	bases := make([]string, 0, len(poseMetas))
	for b := range poseMetas {
		bases = append(bases, b)
	}
	sort.Strings(bases)
	for _, b := range bases {
		metaOut[b] = poseMetas[b]
	}

	out := map[string]any{
		"characters": characters,
		"poses":      metaOut,
	}
	data, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(extractedDataDir, "characters.json"), data, 0o644)
}

func parseAInfo(path string, meta *poseMeta) error {
	return readTSVLines(path, func(rec []string) error {
		if len(rec) < 2 || strings.HasPrefix(rec[0], "#") {
			return nil
		}
		switch strings.TrimSpace(rec[0]) {
		case "dress":
			if len(rec) >= 6 {
				meta.Dresses = append(meta.Dresses, dressInfo{
					Dress:  rec[1],
					Kind:   rec[2],
					Diff:   rec[3],
					Layer:  rec[4],
					Folder: rec[5],
				})
			}
		case "face":
			if len(rec) >= 4 {
				meta.Faces = append(meta.Faces, faceInfo{
					Expression: rec[1],
					BaseSpec:   rec[2],
					Layer:      rec[3],
				})
			}
		}
		return nil
	})
}

// parseLayerManifest reads the tab separated "<base>_<level>.txt" layer table.
// The second logical line holds the canvas width/height in the name/left cells.
func parseLayerManifest(path string) ([2]int, []spriteLayer, error) {
	var canvas [2]int
	var layers []spriteLayer
	lineNo := 0
	err := readTSVLines(path, func(rec []string) error {
		lineNo++
		trim := func(i int) string {
			if i < len(rec) {
				return strings.TrimSpace(rec[i])
			}
			return ""
		}
		if lineNo == 2 {
			// logical line 2 keeps layer_type/name/left/top empty and puts
			// canvas width/height in the width/height columns (4 and 5).
			canvas = [2]int{atoiOr(trim(4), 0), atoiOr(trim(5), 0)}
			return nil
		}
		if len(rec) < 10 || strings.HasPrefix(trim(0), "#") {
			return nil
		}
		if trim(1) == "" {
			return nil
		}
		layers = append(layers, spriteLayer{
			Name:    trim(1),
			Left:    atofOr(trim(2)),
			Top:     atofOr(trim(3)),
			Width:   atofOr(trim(4)),
			Height:  atofOr(trim(5)),
			Opacity: atoiOr(trim(7), 255),
			LayerID: atoiOr(trim(9), -1),
			GroupID: atoiOr(trim(10), -1),
		})
		return nil
	})
	return canvas, layers, err
}

func decodeReader(f io.Reader) io.Reader {
	return transform.NewReader(f, japanese.ShiftJIS.NewDecoder())
}

func readCSVLines(path string, fn func([]string) error) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	r := csv.NewReader(decodeReader(f))
	r.FieldsPerRecord = -1
	r.LazyQuotes = true
	recs, err := r.ReadAll()
	if err != nil {
		return err
	}
	for _, rec := range recs {
		if err := fn(rec); err != nil {
			return err
		}
	}
	return nil
}

func readTSVLines(path string, fn func([]string) error) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	text, err := decodeScenarioBytes(raw)
	if err != nil {
		return err
	}
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimRight(line, "\r")
		if strings.TrimSpace(line) == "" {
			_ = fn([]string{""})
			continue
		}
		if err := fn(strings.Split(line, "\t")); err != nil {
			return err
		}
	}
	return nil
}

func atoiOr(s string, def int) int {
	s = strings.TrimSpace(s)
	if s == "" {
		return def
	}
	v, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return v
}

func atofOr(s string) float64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	v, _ := strconv.ParseFloat(s, 64)
	return v
}
