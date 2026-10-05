package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"lavender/pkg/db"

	"github.com/gin-gonic/gin"
)

type UserSession struct {
	ClientID string
	LastSeen time.Time
}

var (
	sessions     = make(map[string]UserSession)
	sessionsLock sync.Mutex
)

func getUsername(c *gin.Context) string {
	username := c.GetHeader("X-Username")
	if username == "" {
		username = "default"
	}
	return username
}

func verifySession(username, clientID string) bool {
	sessionsLock.Lock()
	defer sessionsLock.Unlock()
	if clientID == "" {
		return false
	}
	now := time.Now()
	current, exists := sessions[username]
	if !exists {
		return true
	}
	if now.Sub(current.LastSeen) < 8*time.Second && current.ClientID != clientID {
		return false
	}
	return true
}

// assetDirs are the extracted_data directories exposed as static mounts.
var assetDirs = []string{
	"bgimage", "bgm", "sound", "evimage", "fgimage", "voice",
	"image", "rule", "sysscn", "system", "uipsd", "thum", "video",
}

func SetupRouter(devMode bool, dataDir string) *gin.Engine {
	if devMode {
		gin.SetMode(gin.DebugMode)
	} else {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.Default()

	r.POST("/api/heartbeat", func(c *gin.Context) {
		username := getUsername(c)
		var req struct {
			ClientID string `json:"clientId"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
			return
		}
		sessionsLock.Lock()
		defer sessionsLock.Unlock()
		now := time.Now()
		current, exists := sessions[username]
		if exists && now.Sub(current.LastSeen) < 8*time.Second && current.ClientID != req.ClientID {
			c.JSON(http.StatusOK, gin.H{"status": "conflict", "message": "User session active in another window"})
			return
		}
		sessions[username] = UserSession{ClientID: req.ClientID, LastSeen: now}
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	r.GET("/api/state", func(c *gin.Context) {
		username := getUsername(c)
		sf, slots, err := db.LoadStateFromDB(username)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load state: " + err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"sf": sf, "slots": slots})
	})

	r.POST("/api/save-slot", func(c *gin.Context) {
		username := getUsername(c)
		if !verifySession(username, c.GetHeader("X-Client-ID")) {
			c.JSON(http.StatusConflict, gin.H{"error": "Session conflict: another window has ownership"})
			return
		}
		var req struct {
			Slot string         `json:"slot"`
			Data map[string]any `json:"data"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
			return
		}
		var historyLog []any
		if histVal, ok := req.Data["historyLog"]; ok {
			if histList, ok := histVal.([]any); ok {
				historyLog = histList
			}
		}
		delete(req.Data, "historyLog")
		if err := db.SaveSlotToDB(username, req.Slot, req.Data, historyLog); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save slot: " + err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true})
	})

	r.POST("/api/delete-slot", func(c *gin.Context) {
		username := getUsername(c)
		if !verifySession(username, c.GetHeader("X-Client-ID")) {
			c.JSON(http.StatusConflict, gin.H{"error": "Session conflict: another window has ownership"})
			return
		}
		var req struct {
			Slot string `json:"slot"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
			return
		}
		if req.Slot == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "slot required"})
			return
		}
		if err := db.DeleteSlotFromDB(username, req.Slot); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete slot: " + err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true})
	})

	r.POST("/api/save-sf", func(c *gin.Context) {
		username := getUsername(c)
		if !verifySession(username, c.GetHeader("X-Client-ID")) {
			c.JSON(http.StatusConflict, gin.H{"error": "Session conflict: another window has ownership"})
			return
		}
		var req struct {
			SF map[string]any `json:"sf"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
			return
		}
		if err := db.SaveSFToDB(username, req.SF); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save system flags: " + err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true})
	})

	// Compiled metadata (file map, envinit, sprite composition tables).
	for _, name := range []string{"file_map.json", "envinit.json", "characters.json"} {
		p := filepath.Join(dataDir, name)
		r.StaticFile("/meta/"+name, p)
	}

	// Chapter/scenario index (cached).
	var (
		indexOnce sync.Once
		index     []scenarioSummary
	)
	r.GET("/api/scenarios", func(c *gin.Context) {
		indexOnce.Do(func() { index = buildScenarioIndex(filepath.Join(dataDir, "scenarios")) })
		c.JSON(http.StatusOK, index)
	})

	// Scene-recollection index (engine main/scenelist.csv).
	var (
		scenesOnce  sync.Once
		scenesIndex []SceneInfo
	)
	r.GET("/api/scenes", func(c *gin.Context) {
		scenesOnce.Do(func() { scenesIndex = loadSceneList(dataDir) })
		c.JSON(http.StatusOK, scenesIndex)
	})

	// Media enumeration for the gallery / music room.
	r.GET("/api/media", func(c *gin.Context) {
		dir := c.Query("dir")
		if dir != "bgm" && dir != "evimage" && dir != "bgimage" && dir != "sound" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported dir"})
			return
		}
		root := filepath.Join(dataDir, dir)
		var files []string
		_ = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return nil
			}
			rel, err := filepath.Rel(dataDir, path)
			if err == nil {
				files = append(files, "/"+filepath.ToSlash(rel))
			}
			return nil
		})
		sort.Strings(files)
		c.JSON(http.StatusOK, files)
	})

	// Compiled scenario streams and media assets.
	r.StaticFS("/scenarios", http.Dir(filepath.Join(dataDir, "scenarios")))
	for _, dir := range assetDirs {
		p := filepath.Join(dataDir, dir)
		if _, err := os.Stat(p); err == nil {
			r.StaticFS("/"+dir, http.Dir(p))
		}
	}

	// Frontend build.
	if _, err := os.Stat("./web-app/dist/assets"); err == nil {
		r.StaticFS("/assets", http.Dir("./web-app/dist/assets"))
	}
	r.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.File("./web-app/dist/index.html")
	})

	return r
}

type scenarioLabel struct {
	Name    string `json:"name"`
	Caption string `json:"caption"`
}

type scenarioSummary struct {
	Storage string          `json:"storage"`
	Name    string          `json:"name"`
	Labels  []scenarioLabel `json:"labels"`
}

func buildScenarioIndex(root string) []scenarioSummary {
	var out []scenarioSummary
	_ = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.HasSuffix(path, ".json") {
			return nil
		}
		f, err := os.Open(path)
		if err != nil {
			return nil
		}
		defer f.Close()
		var sc struct {
			Name         string           `json:"name"`
			Storage      string           `json:"storage"`
			Instructions []map[string]any `json:"instructions"`
		}
		if json.NewDecoder(f).Decode(&sc) != nil {
			return nil
		}
		// Only expose story scenarios under scenario/.
		if !strings.HasPrefix(sc.Storage, "scenario/") {
			return nil
		}
		sum := scenarioSummary{Storage: strings.TrimSuffix(sc.Storage, ".ks"), Name: sc.Name}
		for _, in := range sc.Instructions {
			if in["type"] == "label" {
				name, _ := in["name"].(string)
				caption, _ := in["caption"].(string)
				sum.Labels = append(sum.Labels, scenarioLabel{Name: name, Caption: caption})
			}
		}
		out = append(out, sum)
		return nil
	})
	sort.Slice(out, func(i, j int) bool { return out[i].Storage < out[j].Storage })
	return out
}
