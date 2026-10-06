package extraction

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"testing"
)

func TestRewriteCurHotspot(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "cur_normal.cur")
	// Minimal CUR container: one 32x32 entry with hotspot (0,0) + 1 dummy payload byte.
	b := []byte{
		0, 0, // reserved
		2, 0, // type = cursor
		1, 0, // count
		32, 32, // width, height
		0, 0, // colors, reserved
		0, 0, 0, 0, // hotspotX, hotspotY
		1, 0, 0, 0, // size
		22, 0, 0, 0, // offset
		0xAA, // dummy payload
	}
	if err := os.WriteFile(p, b, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := rewriteCurHotspot(p, 30, 29); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	if hx := binary.LittleEndian.Uint16(got[16:18]); hx != 30 {
		t.Fatalf("hotspotX = %d, want 30", hx)
	}
	if hy := binary.LittleEndian.Uint16(got[18:20]); hy != 29 {
		t.Fatalf("hotspotY = %d, want 29", hy)
	}
	if got[22] != 0xAA {
		t.Fatalf("payload corrupted")
	}
	// Idempotent: a second run must not error and keeps the values.
	if err := rewriteCurHotspot(p, 30, 29); err != nil {
		t.Fatal(err)
	}
}

func TestRewriteCurHotspotRejectsNonCur(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "cur_normal.cur")
	if err := os.WriteFile(p, []byte{1, 2, 3, 4, 5, 6}, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := rewriteCurHotspot(p, 30, 30); err == nil {
		t.Fatal("expected error for non-CUR file")
	}
}
