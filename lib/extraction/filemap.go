package extraction

// Builds file_map.json: bare media name -> web path, used by the runner to
// resolve tags whose framework tag name is the file stem (bgm*, se*, ev*...).

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

var mediaFolders = []string{
	"bgimage", "bgm", "sound", "image", "rule", "sysscn", "system",
	"uipsd", "thum", "video", "evimage", "fgimage", "voice",
}

var skipExts = map[string]bool{
	".ks": true, ".tjs": true, ".func": true, ".asd": true, ".tft": true,
	".ini": true, ".csv": true, ".txt": true, ".sli": true, ".json": true,
}

func buildFileMap(extractedDataDir string) error {
	fileMap := map[string]string{}

	for _, folder := range mediaFolders {
		folderPath := filepath.Join(extractedDataDir, folder)
		if _, err := os.Stat(folderPath); os.IsNotExist(err) {
			continue
		}
		_ = filepath.Walk(folderPath, func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return nil
			}
			ext := strings.ToLower(filepath.Ext(info.Name()))
			if skipExts[ext] || strings.HasPrefix(info.Name(), ".") {
				return nil
			}
			stem := strings.TrimSuffix(info.Name(), filepath.Ext(info.Name()))
			rel, err := filepath.Rel(extractedDataDir, path)
			if err != nil {
				return nil
			}
			webPath := "/" + filepath.ToSlash(rel)
			if _, exists := fileMap[stem]; !exists {
				fileMap[stem] = webPath
			}
			return nil
		})
	}

	data, err := json.MarshalIndent(fileMap, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(extractedDataDir, "file_map.json"), data, 0o644)
}
