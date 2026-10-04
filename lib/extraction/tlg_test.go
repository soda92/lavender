package extraction

import (
	"image/png"
	"os"
	"path/filepath"
	"testing"
)

func decodeToPNG(t *testing.T, src, dst string) {
	t.Helper()
	raw, err := os.ReadFile(src)
	if err != nil {
		t.Skip("sample missing:", src)
	}
	img, err := DecodeTLG5(raw)
	if err != nil {
		t.Fatalf("%s: %v", filepath.Base(src), err)
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		t.Fatal(err)
	}
	out, err := os.Create(dst)
	if err != nil {
		t.Fatal(err)
	}
	defer out.Close()
	if err := png.Encode(out, img); err != nil {
		t.Fatal(err)
	}
	t.Logf("%s -> %dx%d -> %s", filepath.Base(src), img.Bounds().Dx(), img.Bounds().Dy(), dst)
}

func TestTLG5Vectors(t *testing.T) {
	decodeToPNG(t,
		"/tmp/opencode/ref/arc_unpacker/tests/dec/kirikiri/files/tlg/14.tlg",
		"/tmp/opencode/tlgout/vec14.png")

	base := "/home/soda/src/lavender/extracted_data/fgimage"
	samples := []string{
		"はるか/haruka_a_0_10.tlg",
		"はるか/haruka_c_2_5.tlg",
		"はるか/haruka_a_0_73.tlg",
	}
	for _, s := range samples {
		decodeToPNG(t, filepath.Join(base, s),
			filepath.Join("/tmp/opencode/tlgout", filepath.Base(s)+".png"))
	}

	// one sprite from each of several character dirs
	for _, dir := range []string{"ヒカル", "アキナ", "栗林", "面付"} {
		entries, err := os.ReadDir(filepath.Join(base, dir))
		if err != nil {
			continue
		}
		for _, e := range entries {
			if filepath.Ext(e.Name()) == ".tlg" {
				decodeToPNG(t, filepath.Join(base, dir, e.Name()),
					filepath.Join("/tmp/opencode/tlgout", dir+"_"+e.Name()+".png"))
				break
			}
		}
	}
}
