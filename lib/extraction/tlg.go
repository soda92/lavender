package extraction

// Decoder for TLG 5.0 images, the sprite format used by Lavender
// (7821 of the 7978 fgimage entries). Ported from the public description in
// arc_unpacker (dec/kirikiri/tlg/{tlg5_decoder,lzss_decompressor}.cc).
//
// Layout after the 11-byte magic "TLG5.0\x00raw\x1a":
//
//	u8  channel_count (3 or 4)
//	u32 width, height, block_height (little-endian)
//	u32[ceil(height/block_height)]  uncompressed block sizes (ignored)
//	for each block row y, for each channel c (B,G,R,A order):
//	    u8   mark  (non-zero => data stored raw)
//	    u32   compressed/raw size
//	    data
//
// Raw channel values are delta encoded: b += g, r += g, followed by a
// two-dimensional prefix sum (left pixel and the pixel above) per channel.

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"strings"
)

var tlg5Magic = []byte("TLG5.0\x00raw\x1a")

type tlgLzss struct {
	dict   [4096]byte
	offset int
}

// decompress runs the Kirikiri TLG LZSS variant. The dictionary state is
// retained between calls (one decoder per image).
func (l *tlgLzss) decompress(input []byte, outputSize int) []byte {
	output := make([]byte, 0, outputSize)
	flags := 0
	p := 0
	for p < len(input) && len(output) < outputSize {
		flags >>= 1
		if flags&0x100 != 0x100 {
			if p >= len(input) {
				return output
			}
			flags = int(input[p]) | 0xFF00
			p++
		}
		if flags&1 == 1 {
			if p+2 > len(input) {
				return output
			}
			x0 := int(input[p])
			x1 := int(input[p+1])
			p += 2
			position := x0 | ((x1 & 0x0F) << 8)
			size := 3 + ((x1 & 0xF0) >> 4)
			if size == 18 {
				if p >= len(input) {
					return output
				}
				size += int(input[p])
				p++
			}
			for j := 0; j < size && len(output) < outputSize; j++ {
				c := l.dict[position]
				output = append(output, c)
				l.dict[l.offset] = c
				l.offset = (l.offset + 1) & 0xFFF
				position = (position + 1) & 0xFFF
			}
		} else {
			if p >= len(input) {
				return output
			}
			c := input[p]
			p++
			output = append(output, c)
			l.dict[l.offset] = c
			l.offset = (l.offset + 1) & 0xFFF
		}
	}
	return output
}

// DecodeTLG5 decodes a TLG5.0 image into RGBA.
func DecodeTLG5(raw []byte) (*image.RGBA, error) {
	if !bytes.HasPrefix(raw, tlg5Magic) {
		return nil, fmt.Errorf("not a TLG5.0 image")
	}
	r := bytes.NewReader(raw[len(tlg5Magic):])
	var u8 [1]byte
	readU8 := func() (byte, error) {
		if _, err := r.Read(u8[:]); err != nil {
			return 0, err
		}
		return u8[0], nil
	}
	readU32 := func() (uint32, error) {
		var b [4]byte
		if _, err := r.Read(b[:]); err != nil {
			return 0, err
		}
		return binary.LittleEndian.Uint32(b[:]), nil
	}

	ch, err := readU8()
	if err != nil {
		return nil, err
	}
	if ch != 3 && ch != 4 {
		return nil, fmt.Errorf("unsupported TLG5 channel count: %d", ch)
	}
	width, err := readU32()
	if err != nil {
		return nil, err
	}
	height, err := readU32()
	if err != nil {
		return nil, err
	}
	blockHeight, err := readU32()
	if err != nil {
		return nil, err
	}
	if width == 0 || height == 0 || blockHeight == 0 {
		return nil, fmt.Errorf("invalid TLG5 dimensions %dx%d (block %d)", width, height, blockHeight)
	}
	blockCount := (int(height) - 1) / int(blockHeight) + 1
	if _, err := r.Seek(int64(4*blockCount), 1); err != nil { // skip size table
		return nil, err
	}

	img := image.NewRGBA(image.Rect(0, 0, int(width), int(height)))
	lz := &tlgLzss{}
	w, bh := int(width), int(blockHeight)

	for blockY := 0; blockY < int(height); blockY += bh {
		maxY := blockY + bh
		if maxY > int(height) {
			maxY = int(height)
		}
		channels := make([][]byte, ch)
		for c := range channels {
			mark, err := readU8()
			if err != nil {
				return nil, err
			}
			size, err := readU32()
			if err != nil {
				return nil, err
			}
			data := make([]byte, size)
			if _, err := readFull(r, data); err != nil {
				return nil, err
			}
			if mark == 0 {
				data = lz.decompress(data, w*bh)
			}
			channels[c] = data
		}
		bchan, gchan, rchan := channels[0], channels[1], channels[2]
		var achan []byte
		if ch == 4 {
			achan = channels[3]
		}
		for y := blockY; y < maxY; y++ {
			rowShift := (y - blockY) * w
			var prev [4]int
			for x := 0; x < w; x++ {
				i := rowShift + x
				b := int(bchan[i])
				g := int(gchan[i])
				rr := int(rchan[i])
				b = (b + g) & 0xFF
				rr = (rr + g) & 0xFF
				// arc channel order B, G, R, (A); RGBA pix offsets 2, 1, 0, 3
				px := [4]int{b, g, rr, 0xFF}
				if ch == 4 {
					px[3] = int(achan[i])
				}
				pixOff := [4]int{2, 1, 0, 3}
				o := img.PixOffset(x, y)
				for c := 0; c < int(ch); c++ {
					prev[c] = (prev[c] + px[c]) & 0xFF // horizontal carry only
					v := prev[c]
					pi := pixOff[c]
					if y > 0 {
						v += int(img.Pix[o-img.Stride+pi])
					}
					img.Pix[o+pi] = byte(v & 0xFF)
				}
				if ch == 3 {
					img.Pix[o+3] = 0xFF
				}
			}
		}
	}
	return img, nil
}

func readFull(r *bytes.Reader, b []byte) (int, error) {
	n := 0
	for n < len(b) {
		m, err := r.Read(b[n:])
		n += m
		if err != nil {
			return n, err
		}
	}
	return n, nil
}

// ConvertTLGTree replaces every .tlg under root with a decoded .png.
func ConvertTLGTree(root string, workers int) (converted, failed int, err error) {
	var paths []string
	err = filepath.Walk(root, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil || info.IsDir() {
			return nil
		}
		if strings.EqualFold(filepath.Ext(path), ".tlg") {
			paths = append(paths, path)
		}
		return nil
	})
	if err != nil {
		return 0, 0, err
	}
	if workers < 1 {
		workers = 1
	}
	type result struct{ ok bool }
	jobs := make(chan string)
	results := make(chan result, len(paths))
	for w := 0; w < workers; w++ {
		go func() {
			enc := png.Encoder{CompressionLevel: png.BestSpeed}
			for path := range jobs {
				ok := convertOneTLG(path, &enc)
				results <- result{ok}
			}
		}()
	}
	for _, p := range paths {
		jobs <- p
	}
	close(jobs)
	for range paths {
		r := <-results
		if r.ok {
			converted++
		} else {
			failed++
		}
	}
	return converted, failed, nil
}

func convertOneTLG(path string, enc *png.Encoder) bool {
	raw, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	img, err := DecodeTLG5(raw)
	if err != nil {
		return false
	}
	pngPath := strings.TrimSuffix(path, filepath.Ext(path)) + ".png"
	out, err := os.Create(pngPath)
	if err != nil {
		return false
	}
	if err := enc.Encode(out, img); err != nil {
		out.Close()
		return false
	}
	out.Close()
	_ = os.Remove(path)
	return true
}
