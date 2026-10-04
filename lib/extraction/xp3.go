package extraction

// XP3 archive reader supporting the CXDEC "version 2" layout used by Lavender:
// the file index lives at the END of the archive and is reached through an
// 0x80 marker near the start; entry contents are zlib segments whose inflated
// bytes are passed through the CXDEC extraction filter (keyed by each entry's
// adlr checksum). The index itself is unencrypted.

import (
	"bytes"
	"compress/zlib"
	"encoding/binary"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

type xp3Segment struct {
	isCompressed bool
	offset       uint64
	uSize        uint64
	cSize        uint64
}

type xp3Entry struct {
	path        string
	isEncrypted bool
	uSize       uint64
	cSize       uint64
	segments    []xp3Segment
	adler       uint32
}

var xp3Header = []byte("XP3\r\n \n\x1a\x8b\x67\x01")

// readXP3Index parses the archive index and returns its entries.
func readXP3Index(f *os.File) ([]xp3Entry, error) {
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return nil, err
	}
	header := make([]byte, 11)
	if _, err := io.ReadFull(f, header); err != nil {
		return nil, err
	}
	if !bytes.Equal(header, xp3Header) {
		return nil, fmt.Errorf("invalid XP3 header signature")
	}

	var indexOffset uint64
	if err := binary.Read(f, binary.LittleEndian, &indexOffset); err != nil {
		return nil, err
	}

	// CXDEC v2 layout: u32 == 0x80 marker, real index offset at marker+9.
	if _, err := f.Seek(int64(indexOffset), io.SeekStart); err != nil {
		return nil, err
	}
	var marker uint32
	if err := binary.Read(f, binary.LittleEndian, &marker); err != nil {
		return nil, err
	}
	if marker == 0x80 {
		if _, err := f.Seek(int64(indexOffset)+9, io.SeekStart); err != nil {
			return nil, err
		}
		if err := binary.Read(f, binary.LittleEndian, &indexOffset); err != nil {
			return nil, err
		}
	}

	if _, err := f.Seek(int64(indexOffset), io.SeekStart); err != nil {
		return nil, err
	}
	var compFlag byte
	if err := binary.Read(f, binary.LittleEndian, &compFlag); err != nil {
		return nil, err
	}
	var compSize, uncompSize uint64
	if err := binary.Read(f, binary.LittleEndian, &compSize); err != nil {
		return nil, err
	}
	if err := binary.Read(f, binary.LittleEndian, &uncompSize); err != nil {
		return nil, err
	}

	indexRaw := make([]byte, compSize)
	if _, err := io.ReadFull(f, indexRaw); err != nil {
		return nil, err
	}
	var indexBytes []byte
	if compFlag == 1 {
		zr, err := zlib.NewReader(bytes.NewReader(indexRaw))
		if err != nil {
			return nil, err
		}
		indexBytes, err = io.ReadAll(zr)
		zr.Close()
		if err != nil {
			return nil, err
		}
	} else {
		indexBytes = indexRaw
	}

	var entries []xp3Entry
	pos := 0
	for pos+12 <= len(indexBytes) {
		chunkName := string(indexBytes[pos : pos+4])
		chunkSize := int(binary.LittleEndian.Uint64(indexBytes[pos+4 : pos+12]))
		endPos := pos + 12 + chunkSize
		if endPos > len(indexBytes) {
			break
		}

		if chunkName == "File" {
			var entry xp3Entry
			sub := pos + 12
			for sub+12 <= endPos {
				subName := string(indexBytes[sub : sub+4])
				subSize := int(binary.LittleEndian.Uint64(indexBytes[sub+4 : sub+12]))
				subEnd := sub + 12 + subSize
				if subEnd > endPos {
					break
				}
				payload := indexBytes[sub+12 : subEnd]

				switch subName {
				case "info":
					if len(payload) >= 22 {
						flags := binary.LittleEndian.Uint32(payload[0:4])
						entry.isEncrypted = flags&0x80000000 != 0
						entry.uSize = binary.LittleEndian.Uint64(payload[4:12])
						entry.cSize = binary.LittleEndian.Uint64(payload[12:20])
						pathLen := int(binary.LittleEndian.Uint16(payload[20:22]))
						if 22+pathLen*2 <= len(payload) {
							entry.path = utf16LEToString(payload[22 : 22+pathLen*2])
						}
					}
				case "segm":
					for o := 0; o+28 <= subSize; o += 28 {
						entry.segments = append(entry.segments, xp3Segment{
							isCompressed: payload[o] != 0,
							offset:       binary.LittleEndian.Uint64(payload[o+4 : o+12]),
							uSize:        binary.LittleEndian.Uint64(payload[o+12 : o+20]),
							cSize:        binary.LittleEndian.Uint64(payload[o+20 : o+28]),
						})
					}
				case "adlr":
					if len(payload) >= 4 {
						entry.adler = binary.LittleEndian.Uint32(payload[:4])
					}
				}
				sub = subEnd
			}
			if entry.path != "" && len(entry.segments) > 0 {
				entries = append(entries, entry)
			}
		}
		pos = endPos
	}
	return entries, nil
}

// readEntryData inflates and (if needed) decrypts one archive entry.
func readEntryData(f *os.File, entry xp3Entry, filter *CxdecFilter) ([]byte, error) {
	var data []byte
	for _, seg := range entry.segments {
		if _, err := f.Seek(int64(seg.offset), io.SeekStart); err != nil {
			return nil, err
		}
		segData := make([]byte, seg.cSize)
		if _, err := io.ReadFull(f, segData); err != nil {
			return nil, err
		}
		if seg.isCompressed {
			zr, err := zlib.NewReader(bytes.NewReader(segData))
			if err != nil {
				return nil, err
			}
			inflated, err := io.ReadAll(zr)
			zr.Close()
			if err != nil {
				return nil, err
			}
			data = append(data, inflated...)
		} else {
			data = append(data, segData...)
		}
	}
	if entry.isEncrypted {
		if filter == nil {
			return nil, fmt.Errorf("entry %s is encrypted but no CXDEC filter loaded", entry.path)
		}
		filter.Decrypt(data, entry.adler)
	}
	return data, nil
}

// extractXP3 unpacks one archive into outputDir. Archives other than data.xp3
// are namespaced by their archive basename, mirroring the reference pipeline.
func extractXP3(xp3Path, outputDir, prependPrefix string, filter *CxdecFilter) (int, error) {
	f, err := os.Open(xp3Path)
	if err != nil {
		return 0, err
	}
	defer f.Close()

	entries, err := readXP3Index(f)
	if err != nil {
		return 0, err
	}

	n := 0
	skipped := 0
	var failures []string
	for _, entry := range entries {
		// CXDEC-protected archives carry dummy entries whose multi-hundred-byte
		// "protected archive" warning filenames cannot exist on disk.
		if len([]byte(filepath.Base(entry.path))) > 250 {
			skipped++
			continue
		}
		data, err := readEntryData(f, entry, filter)
		if err != nil {
			failures = append(failures, fmt.Sprintf("%s: %v", entry.path, err))
			continue
		}
		if err := writeExtractedFile(entry.path, data, outputDir, prependPrefix); err != nil {
			failures = append(failures, fmt.Sprintf("%s: %v", entry.path, err))
			continue
		}
		n++
	}
	if skipped > 0 {
		fmt.Printf("  skipped %d decoy entr(y/ies)\n", skipped)
	}
	if len(failures) > 0 {
		return n, fmt.Errorf("%d file(s) failed in %s: %s", len(failures), filepath.Base(xp3Path),
			strings.Join(failures[:min(5, len(failures))], "; "))
	}
	return n, nil
}

func writeExtractedFile(path string, data []byte, outputDir, prependPrefix string) error {
	path = strings.ReplaceAll(path, "\\", "/")
	if prependPrefix != "" && !strings.HasPrefix(strings.ToLower(path), strings.ToLower(prependPrefix)) {
		path = prependPrefix + path
	}

	targetPath := filepath.Join(outputDir, path)
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		return err
	}
	return os.WriteFile(targetPath, data, 0o644)
}

func utf16LEToString(b []byte) string {
	if len(b)%2 != 0 {
		b = b[:len(b)-1]
	}
	runes := make([]rune, 0, len(b)/2)
	for i := 0; i+2 <= len(b); i += 2 {
		runes = append(runes, rune(binary.LittleEndian.Uint16(b[i:i+2])))
	}
	return string(runes)
}
