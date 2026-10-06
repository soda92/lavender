package extraction

import (
	"encoding/binary"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// cursorHotspots overrides the embedded click hotspot of engine UI cursors.
// The shipped cur_normal/cur_over are 32x32 lavender sprigs running from the
// top-left to the bottom-right with hotspot (0,0), so the artwork overlaps a
// control ~30px before the click point actually enters it. Moving the
// hotspot to the stem tip makes the art extend up-left of the activation
// point (like a standard arrow), so hover flips when the visible tip lands.
// Browsers ignore CSS hotspot coordinates for .cur files and use this
// embedded value, which is why the generated assets are patched rather than
// relying on the frontend.
var cursorHotspots = map[string][2]uint16{
	"cur_normal.cur": {30, 30},
	"cur_over.cur":   {30, 30},
}

// patchCursorHotspots rewrites the hotspot fields of every known .cur file
// under root in place.
func patchCursorHotspots(root string) (int, error) {
	n := 0
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		hs, ok := cursorHotspots[strings.ToLower(filepath.Base(path))]
		if !ok {
			return nil
		}
		if err := rewriteCurHotspot(path, hs[0], hs[1]); err != nil {
			return fmt.Errorf("%s: %w", path, err)
		}
		n++
		return nil
	})
	return n, err
}

// rewriteCurHotspot validates the RIFF CUR container and sets the hotspot of
// every image directory entry (absolute offsets 16 and 18).
//
//	IFF header:  reserved(2)=0 type(2)=2 count(2)
//	entry (16b): w h colors reserved hotspotX(2) hotspotY(2) size offset
func rewriteCurHotspot(path string, hx, hy uint16) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if len(b) < 22 || b[0] != 0 || b[1] != 0 || b[2] != 2 || b[3] != 0 {
		return fmt.Errorf("not a .cur file")
	}
	count := int(binary.LittleEndian.Uint16(b[4:6]))
	changed := false
	for i := 0; i < count; i++ {
		e := 6 + 16*i
		if e+16 > len(b) {
			break
		}
		if binary.LittleEndian.Uint16(b[e+10:e+12]) != hx {
			binary.LittleEndian.PutUint16(b[e+10:e+12], hx)
			changed = true
		}
		if binary.LittleEndian.Uint16(b[e+12:e+14]) != hy {
			binary.LittleEndian.PutUint16(b[e+12:e+14], hy)
			changed = true
		}
	}
	if !changed {
		return nil
	}
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, info.Mode().Perm())
}
