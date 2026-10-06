package extraction

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"image"
	"image/png"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// cursorHotspots overrides the embedded click hotspot of engine UI cursors.
// The shipped cur_normal/cur_over are 32x32 lavender sprigs running from the
// top-left to the bottom-right with hotspot (0,0), so the artwork overlaps a
// control ~30px before the click point actually enters it. The hotspot is
// moved to the center of the sprig (16,16), so the motif blooms around the
// activation point instead of sweeping in from the corner.
// Browsers are inconsistent about reading the hotspot embedded in .cur
// files, so the frontend uses a PNG sibling with the hotspot given
// explicitly in CSS; the .cur is patched as well for fidelity/tooling.
var cursorHotspots = map[string][2]uint16{
	"cur_normal.cur": {16, 16},
	"cur_over.cur":   {16, 16},
}

// processCursors patches the hotspot of every known .cur file under root
// and writes a decoded <stem>.png next to it (the web client uses the PNG
// with an explicit CSS hotspot).
func processCursors(root string) (int, error) {
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
		if err := emitCurPNG(path); err != nil {
			return fmt.Errorf("%s: %w", path, err)
		}
		n++
		return nil
	})
	return n, err
}

// rewriteCurHotspot validates the RIFF CUR container and sets the hotspot of
// every image directory entry.
//
//	IFF header:  reserved(2)=0 type(2)=2 count(2)
//	entry (16b): w(1) h(1) colors(1) reserved(1)
//	             hotspotX(2) hotspotY(2) size(4) offset(4)
func rewriteCurHotspot(path string, hx, hy uint16) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if !isCur(b) {
		return fmt.Errorf("not a .cur file")
	}
	count := int(binary.LittleEndian.Uint16(b[4:6]))
	changed := false
	for i := 0; i < count; i++ {
		e := 6 + 16*i
		if e+16 > len(b) {
			break
		}
		if binary.LittleEndian.Uint16(b[e+4:e+6]) != hx {
			binary.LittleEndian.PutUint16(b[e+4:e+6], hx)
			changed = true
		}
		if binary.LittleEndian.Uint16(b[e+6:e+8]) != hy {
			binary.LittleEndian.PutUint16(b[e+6:e+8], hy)
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

func isCur(b []byte) bool {
	return len(b) >= 22 && b[0] == 0 && b[1] == 0 && b[2] == 2 && b[3] == 0
}

// emitCurPNG decodes the first image of a CUR container (8bpp palette or
// 32bpp, XOR+AND masks) and writes a premultiplied-alpha PNG beside it.
func emitCurPNG(curPath string) error {
	b, err := os.ReadFile(curPath)
	if err != nil {
		return err
	}
	if !isCur(b) {
		return fmt.Errorf("not a .cur file")
	}
	count := int(binary.LittleEndian.Uint16(b[4:6]))
	if count == 0 || 6+16 > len(b) {
		return fmt.Errorf("no cursor images")
	}
	size := binary.LittleEndian.Uint32(b[6+8 : 6+12])
	off := binary.LittleEndian.Uint32(b[6+12 : 6+16])
	if uint64(off)+uint64(size) > uint64(len(b)) {
		return fmt.Errorf("image payload out of range")
	}
	img, err := decodeCurDIB(b[off : off+size])
	if err != nil {
		return err
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return err
	}
	pngPath := strings.TrimSuffix(curPath, filepath.Ext(curPath)) + ".png"
	return os.WriteFile(pngPath, buf.Bytes(), 0o644)
}

// decodeCurDIB decodes a cursor BITMAPINFOHEADER payload. Cursor DIBs are
// bottom-up and always carry a 1bpp AND transparency mask after the XOR bits.
func decodeCurDIB(p []byte) (*image.NRGBA, error) {
	if len(p) < 40 || binary.LittleEndian.Uint32(p[0:4]) != 40 {
		return nil, fmt.Errorf("unsupported DIB header")
	}
	w := int(int32(binary.LittleEndian.Uint32(p[4:8])))
	h := int(int32(binary.LittleEndian.Uint32(p[8:12]))) / 2 // height field is doubled
	bpp := int(binary.LittleEndian.Uint16(p[14:16]))
	clrUsed := int(binary.LittleEndian.Uint32(p[32:36]))
	if w <= 0 || h <= 0 {
		return nil, fmt.Errorf("invalid dimensions")
	}

	type rgba struct{ r, g, bl, a byte }
	var pal []rgba
	pixOff := uint32(40)
	if bpp <= 8 {
		n := clrUsed
		if n == 0 {
			n = 1 << bpp
		}
		if int(pixOff)+n*4 > len(p) {
			return nil, fmt.Errorf("palette out of range")
		}
		pal = make([]rgba, n)
		for i := 0; i < n; i++ {
			c := p[int(pixOff)+i*4:]
			pal[i] = rgba{r: c[2], g: c[1], bl: c[0], a: 0xFF}
		}
		pixOff += uint32(n * 4)
	}

	stride := (w*bpp + 31) / 32 * 4
	andStride := (w + 31) / 32 * 4
	xorSize := stride * h
	andOff := int(pixOff) + xorSize
	if andOff+andStride*h > len(p) {
		return nil, fmt.Errorf("pixel data out of range (bpp=%d)", bpp)
	}

	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		sy := h - 1 - y // bottom-up rows
		xorRow := p[int(pixOff)+sy*stride:]
		andRow := p[andOff+sy*andStride:]
		for x := 0; x < w; x++ {
			transparent := andRow[x/8]&(1<<(7-uint(x%8))) != 0
			var c rgba
			switch bpp {
			case 8:
				idx := int(xorRow[x])
				if idx >= len(pal) {
					return nil, fmt.Errorf("palette index %d out of range", idx)
				}
				c = pal[idx]
			case 24:
				i := sy*stride + x*3
				c = rgba{r: p[int(pixOff)+i+2], g: p[int(pixOff)+i+1], bl: p[int(pixOff)+i], a: 0xFF}
			case 32:
				i := sy*stride + x*4
				c = rgba{r: p[int(pixOff)+i+2], g: p[int(pixOff)+i+1], bl: p[int(pixOff)+i], a: 0xFF}
			default:
				return nil, fmt.Errorf("unsupported bpp %d", bpp)
			}

			o := img.PixOffset(x, y)
			if transparent {
				img.Pix[o+3] = 0
			} else {
				img.Pix[o], img.Pix[o+1], img.Pix[o+2], img.Pix[o+3] = c.r, c.g, c.bl, 0xFF
			}
		}
	}
	return img, nil
}
