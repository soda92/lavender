package handlers

import (
	"bufio"
	"io"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/text/encoding/japanese"
	"golang.org/x/text/transform"
)

// CgVariant is one full-size frame of a gallery tile. Variants map 1:1 to
// the viewer's next-click sequence. Overlay (when set) is a foreground
// character layer from fgimage/面付 composited on top of the evimage base
// (the engine's "ev_stex_x?st_ex_x" syntax).
type CgVariant struct {
	Stem    string `json:"stem"`
	Overlay string `json:"overlay,omitempty"`
}

// CgTile is one gallery thumbnail with its ordered variants, as defined by
// one row of main/cglist.csv.
type CgTile struct {
	ID       string      `json:"id"` // thumbnail stem, unique within the list
	Thumb    string      `json:"thumb"`
	Variants []CgVariant `json:"variants"`
}

// CgSection groups tiles under one character tab (the colon headers of
// cglist.csv: hikaru/haruka/reika/riko/akina/other).
type CgSection struct {
	ID    string   `json:"id"`
	Tiles []CgTile `json:"tiles"`
}

// parseCgList parses the engine's main/cglist.csv (Shift-JIS):
//
//	::::::::::::::::,<heroine>            section header
//	thumb_xxx, ev_aaa, ev_bbb?st_ex_bbb   tile row (variant columns are
//	                                      optional; blank columns are skipped)
//	::::::::::::::::                      trailing empty header (ignored)
func parseCgList(r io.Reader) []CgSection {
	var out []CgSection
	var cur *CgSection
	flush := func() {
		if cur != nil && len(cur.Tiles) > 0 {
			out = append(out, *cur)
		}
	}
	dec := japanese.ShiftJIS.NewDecoder()
	sc := bufio.NewScanner(transform.NewReader(r, dec))
	sc.Buffer(make([]byte, 0, 4096), 1<<20)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		cols := strings.Split(line, ",")
		for i := range cols {
			cols[i] = strings.TrimSpace(cols[i])
		}
		// Section header: a run of colons in column 0.
		if strings.Trim(cols[0], ":") == "" {
			flush()
			cur = nil
			if len(cols) >= 2 && cols[1] != "" {
				cur = &CgSection{ID: cols[1]}
			}
			continue
		}
		if cur == nil || cols[0] == "" {
			continue
		}
		var variants []CgVariant
		for _, v := range cols[1:] {
			if v == "" {
				continue
			}
			var stem, overlay string
			if i := strings.IndexByte(v, '?'); i >= 0 {
				stem, overlay = v[:i], v[i+1:]
			} else {
				stem = v
			}
			variants = append(variants, CgVariant{Stem: stem, Overlay: overlay})
		}
		if len(variants) == 0 {
			continue
		}
		thumb := cols[0]
		if !strings.Contains(thumb, ".") {
			thumb += ".png"
		}
		cur.Tiles = append(cur.Tiles, CgTile{
			ID:       cols[0],
			Thumb:    "/thum/" + thumb,
			Variants: variants,
		})
	}
	flush()
	return out
}

func loadCgList(dataDir string) []CgSection {
	p := filepath.Join(dataDir, "main", "cglist.csv")
	f, err := os.Open(p)
	if err != nil {
		return nil
	}
	defer f.Close()
	return parseCgList(f)
}
