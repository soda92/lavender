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

// parseSoundList parses the engine's main/soundlist.csv. The shipped file
// is Shift-JIS encoded with rows "fileStem,title" (a "#"-prefixed header
// names the columns). It feeds the music room and the BGM debug overlay.
func parseSoundList(r io.Reader) map[string]string {
	out := map[string]string{}
	dec := japanese.ShiftJIS.NewDecoder()
	sc := bufio.NewScanner(transform.NewReader(r, dec))
	sc.Buffer(make([]byte, 0, 4096), 1<<20)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		cols := strings.SplitN(line, ",", 2)
		if len(cols) < 2 {
			continue
		}
		stem := strings.TrimSpace(cols[0])
		title := strings.TrimSpace(cols[1])
		if stem == "" || title == "" {
			continue
		}
		out[stem] = title
	}
	return out
}

func loadSoundList(dataDir string) map[string]string {
	p := filepath.Join(dataDir, "main", "soundlist.csv")
	f, err := os.Open(p)
	if err != nil {
		return nil
	}
	defer f.Close()
	return parseSoundList(f)
}
