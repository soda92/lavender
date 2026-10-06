package extraction

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// RunExtraction unpacks the original Lavender install found under startDir
// into ./extracted_data and builds the derived indices.
func RunExtraction(startDir string) {
	gameDir, err := FindGameDir(startDir)
	if err != nil {
		log.Fatalf("Error locating game directory: %v", err)
	}
	fmt.Printf("Locating game files in: %s\n", gameDir)

	tpmPath, err := findTPM(gameDir)
	if err != nil {
		log.Fatalf("%v. The CXDEC plugin (plugin/lavender.tpm) is required to read encrypted archives.", err)
	}
	filter, err := LoadCxdecControlBlock(tpmPath)
	if err != nil {
		log.Fatalf("Failed to load CXDEC control block: %v", err)
	}
	fmt.Printf("Loaded CXDEC control block from %s\n", filepath.Base(tpmPath))

	xp3Files, err := findXP3s(gameDir)
	if err != nil {
		log.Fatalf("%v", err)
	}
	fmt.Printf("Found %d XP3 archive(s) to extract:\n", len(xp3Files))
	for _, p := range xp3Files {
		fmt.Printf("  - %s\n", filepath.Base(p))
	}

	outputDir := "./extracted_data"
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		log.Fatalf("%v", err)
	}

	for _, xp3Path := range xp3Files {
		fmt.Printf("Extracting %s...\n", filepath.Base(xp3Path))
		base := strings.ToLower(strings.TrimSuffix(filepath.Base(xp3Path), filepath.Ext(xp3Path)))
		prefix := ""
		if base != "data" && !strings.HasPrefix(base, "patch") {
			prefix = base + "/"
		}
		n, err := extractXP3(xp3Path, outputDir, prefix, filter)
		fmt.Printf("  %d files\n", n)
		if err != nil {
			log.Printf("  WARNING: %v", err)
		}
	}

	// Move the design cursors' embedded hotspot to the sprig's stem tip and
	// emit PNG siblings (the web client uses those with explicit CSS hotspots).
	fmt.Println("\nProcessing design cursors (hotspot + PNG)...")
	nCur, err := processCursors(outputDir)
	if err != nil {
		log.Printf("cursor hotspot patch error: %v", err)
	} else if nCur > 0 {
		fmt.Printf("  patched %d cursor file(s)\n", nCur)
	}

	// Convert all TLG5 sprites/CGs to PNG (web-native; the scenarios reference
	// assets by bare name, so the resolver maps to .png).
	fmt.Println("\nConverting TLG5 images to PNG...")
	before := time.Now()
	converted, failed, err := ConvertTLGTree(outputDir, runtime.NumCPU())
	if err != nil {
		log.Printf("TLG conversion error: %v", err)
	}
	fmt.Printf("  converted %d image(s) in %s\n", converted, time.Since(before).Round(time.Millisecond))
	if failed > 0 {
		log.Printf("  WARNING: %d TLG file(s) failed to convert", failed)
	}

	fmt.Println("\nCompiling scenarios...")
	nScen, err := compileAllScenarios(outputDir)
	if err != nil {
		log.Printf("Scenario compilation error: %v", err)
	} else {
		fmt.Printf("  compiled %d scenario file(s)\n", nScen)
	}

	fmt.Println("Building environment metadata...")
	if err := compileEnvinit(outputDir); err != nil {
		log.Printf("  envinit compile error: %v", err)
	}
	if err := compileCharacterInfo(outputDir); err != nil {
		log.Printf("  character info compile error: %v", err)
	}
	if err := buildFileMap(outputDir); err != nil {
		log.Printf("  file map build error: %v", err)
	} else {
		fmt.Println("  envinit.json, characters.json, file_map.json written")
	}

	fmt.Println("\nExtraction completed successfully!")
}

func hasDataXp3(dir string) bool {
	for _, n := range []string{"data.xp3", "DATA.XP3"} {
		if _, err := os.Stat(filepath.Join(dir, n)); err == nil {
			return true
		}
	}
	return false
}

// FindGameDir walks up to depth 3 for a directory containing data.xp3.
func FindGameDir(startDir string) (string, error) {
	if hasDataXp3(startDir) {
		return startDir, nil
	}
	var found string
	stop := fmt.Errorf("found")
	err := filepath.Walk(startDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || !info.IsDir() {
			return nil
		}
		name := info.Name()
		if strings.HasPrefix(name, ".") || name == "web-app" || name == "node_modules" ||
			strings.HasPrefix(name, "extracted_data") {
			return filepath.SkipDir
		}
		rel, err := filepath.Rel(startDir, path)
		if err != nil {
			return nil
		}
		depth := len(strings.Split(filepath.ToSlash(rel), "/"))
		if rel == "." || rel == "" {
			depth = 0
		}
		if depth > 3 {
			return filepath.SkipDir
		}
		if hasDataXp3(path) {
			found = path
			return stop
		}
		return nil
	})
	if err == stop && found != "" {
		return found, nil
	}
	return "", fmt.Errorf("could not locate game directory containing data.xp3")
}

// findTPM locates the cxdec plugin (lavender ships it as plugin/lavender.tpm).
func findTPM(gameDir string) (string, error) {
	candidates := []string{
		filepath.Join(gameDir, "plugin", "lavender.tpm"),
		filepath.Join(gameDir, "plugin", "cxdec.tpm"),
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c, nil
		}
	}
	// Last resort: any .tpm under the game directory.
	var tpm string
	_ = filepath.Walk(gameDir, func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() && strings.EqualFold(filepath.Ext(path), ".tpm") {
			tpm = path
			return filepath.SkipAll
		}
		return nil
	})
	if tpm != "" {
		return tpm, nil
	}
	return "", fmt.Errorf("no CXDEC .tpm plugin found in %s", gameDir)
}

// findXP3s returns data.xp3 first followed by every other *.xp3 in the game
// root (and arc/ if present), sorted.
func findXP3s(gameDir string) ([]string, error) {
	var out []string
	for _, n := range []string{"data.xp3", "DATA.XP3"} {
		if p := filepath.Join(gameDir, n); fileExists(p) {
			out = append(out, p)
			break
		}
	}
	collect := func(dir string) {
		entries, err := os.ReadDir(dir)
		if err != nil {
			return
		}
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			n := e.Name()
			l := strings.ToLower(n)
			if strings.HasSuffix(l, ".xp3") && l != "data.xp3" {
				out = append(out, filepath.Join(dir, n))
			}
		}
	}
	collect(gameDir)
	collect(filepath.Join(gameDir, "arc"))
	collect(filepath.Join(gameDir, "ARC"))
	if len(out) == 0 {
		return nil, fmt.Errorf("no XP3 archives found in %s", gameDir)
	}
	return out, nil
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}
