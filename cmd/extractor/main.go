// Command extractor unpacks the original Lavender game files (CXDEC-encrypted
// Kirikiri2 XP3 archives) into ./extracted_data.
package main

import (
	"flag"
	"fmt"

	"lavender/lib/extraction"
)

func main() {
	startDir := flag.String("gamedir", ".", "directory containing (or above) the original game files with data.xp3")
	flag.Parse()

	fmt.Println("=== Lavender extraction pipeline ===")
	extraction.RunExtraction(*startDir)
}
