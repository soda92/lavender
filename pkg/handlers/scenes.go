package handlers

import (
	"bufio"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// SceneInfo describes one recollection (H-scene) entry from the engine's
// main/scenelist.csv. The shipped game plays these via sysscn/scenemode.tjs:
// play jumps to storage*startLabel and returns to the scene menu when the
// endLabel is reached; unlock tracks the sf "trail_<storage>_<end>" flag.
type SceneInfo struct {
	ID         string `json:"id"`
	Heroine    string `json:"heroine"`
	Thumb      string `json:"thumb"` // thumbnail art under /thum
	Orig       string `json:"orig"`  // representative event-CG tag (seen check)
	Storage    string `json:"storage"`
	StartLabel string `json:"startLabel"`
	EndLabel   string `json:"endLabel"`
}

// parseSceneList parses the engine's scene-recollection CSV. The file groups
// rows under "::::::::::::::::,<heroine>" section headers; each data row is
//   thumb, orig, "<storage> *<start>", "<storage> *<end>[*<skipto>]"
// (tabs/spaces around fields are cosmetic).
func parseSceneList(r io.Reader) []SceneInfo {
	var out []SceneInfo
	heroine := ""
	sc := bufio.NewScanner(r)
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
		// Section header: a run of colons followed by the heroine token.
		if strings.Trim(cols[0], ":") == "" && len(cols) >= 2 && cols[1] != "" {
			heroine = cols[1]
			continue
		}
		if len(cols) < 4 || cols[0] == "" || !strings.Contains(cols[2], "*") {
			continue
		}
		startFile, startLabel := splitSceneRef(cols[2])
		endFile, endLabel := splitSceneRef(cols[3])
		if startFile == "" || startLabel == "" {
			continue
		}
		if endFile == "" {
			endFile = startFile
		}
		if endLabel == "" {
			endLabel = startLabel
		}
		thumb := cols[0]
		if !strings.Contains(thumb, ".") {
			thumb += ".png"
		}
		out = append(out, SceneInfo{
			ID:         startFile + "_" + startLabel,
			Heroine:    heroine,
			Thumb:      "/thum/" + thumb,
			Orig:       cols[1],
			Storage:    startFile,
			StartLabel: startLabel,
			EndLabel:   endLabel,
		})
	}
	return out
}

// splitSceneRef splits "lave42_hikaru *memory_begin" into storage/label.
func splitSceneRef(s string) (storage, label string) {
	parts := strings.SplitN(s, "*", 3)
	storage = strings.TrimSpace(parts[0])
	if len(parts) >= 2 {
		label = strings.TrimSpace(parts[1])
	}
	storage = strings.TrimSuffix(storage, ".ks")
	return storage, label
}

func loadSceneList(dataDir string) []SceneInfo {
	p := filepath.Join(dataDir, "main", "scenelist.csv")
	f, err := os.Open(p)
	if err != nil {
		return nil
	}
	defer f.Close()
	return parseSceneList(f)
}
