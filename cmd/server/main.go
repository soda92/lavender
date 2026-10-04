package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
	"time"

	"lavender/lib/extraction"
	"lavender/pkg/db"
	"lavender/pkg/handlers"
)

func openBrowser(url string) {
	switch runtime.GOOS {
	case "linux":
		if err := exec.Command("xdg-open", url).Start(); err != nil {
			_ = exec.Command("google-chrome", url).Start()
			_ = exec.Command("firefox", url).Start()
		}
	case "windows":
		_ = exec.Command("cmd", "/c", "start", "", url).Start()
	case "darwin":
		_ = exec.Command("open", url).Start()
	}
}

func main() {
	port := flag.Int("port", 0, "port (default 8080 prod, 38080 dev)")
	dataDir := flag.String("data", "./extracted_data", "compiled game data directory")
	gameDir := flag.String("gamedir", ".", "original game directory (for auto extraction)")
	extractMode := flag.Bool("extract", false, "run asset extraction, then exit")
	devMode := flag.Bool("dev", false, "run with the Vite dev server (pnpm dev)")
	noBrowser := flag.Bool("no-browser", false, "do not open a browser window")
	flag.Parse()

	effectivePort := *port
	if effectivePort == 0 {
		if *devMode {
			effectivePort = 38080
		} else {
			effectivePort = 8080
		}
	}

	needsExtraction := false
	for _, marker := range []string{"file_map.json", "envinit.json", filepath.Join("scenarios", "scenario", "lave01.json")} {
		if _, err := os.Stat(filepath.Join(*dataDir, marker)); os.IsNotExist(err) {
			needsExtraction = true
			break
		}
	}

	if *extractMode || needsExtraction {
		if needsExtraction && !*extractMode {
			fmt.Println("Compiled game data not found. Running extraction pipeline...")
		}
		extraction.RunExtraction(*gameDir)
		if *extractMode {
			return
		}
		fmt.Println("Extraction finished. Launching server...")
	}

	if err := os.MkdirAll("./saves", 0o755); err != nil {
		log.Printf("saves dir: %v", err)
	}
	if err := db.InitDB(filepath.Join("saves", "saves.db")); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	var devCmd *exec.Cmd
	if *devMode {
		fmt.Printf("Starting Vite dev server with BACKEND_PORT=%d...\n", effectivePort)
		if runtime.GOOS == "windows" {
			devCmd = exec.Command("cmd", "/c", "pnpm", "dev")
		} else {
			devCmd = exec.Command("pnpm", "dev")
		}
		devCmd.Dir = "./web-app"
		devCmd.Env = append(os.Environ(), fmt.Sprintf("BACKEND_PORT=%d", effectivePort))
		devCmd.Stdout = os.Stdout
		devCmd.Stderr = os.Stderr
		if runtime.GOOS != "windows" {
			devCmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
		}
		if err := devCmd.Start(); err != nil {
			log.Printf("Warning: failed to start pnpm dev: %v", err)
		} else {
			go func() { _ = devCmd.Wait() }()
		}
	}

	router := handlers.SetupRouter(*devMode, *dataDir)

	frontendURL := fmt.Sprintf("http://localhost:%d", effectivePort)
	if *devMode {
		frontendURL = "http://localhost:38942"
	}
	fmt.Printf("Server listening on %s\n", frontendURL)

	if !*noBrowser {
		go func() {
			time.Sleep(700 * time.Millisecond)
			if *devMode {
				time.Sleep(800 * time.Millisecond)
			}
			openBrowser(frontendURL)
		}()
	}

	srv := &http.Server{Addr: fmt.Sprintf(":%d", effectivePort), Handler: router}
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-quit
		log.Println("Shutting down...")
		if devCmd != nil && devCmd.Process != nil {
			if runtime.GOOS != "windows" {
				_ = syscall.Kill(-devCmd.Process.Pid, syscall.SIGKILL)
			} else {
				_ = devCmd.Process.Kill()
			}
		}
		os.Exit(0)
	}()

	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}
}
