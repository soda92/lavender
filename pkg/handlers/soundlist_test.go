package handlers

import (
	"bytes"
	"strings"
	"testing"

	"golang.org/x/text/encoding/japanese"
)

func TestParseSoundList(t *testing.T) {
	utf8 := "#ファイル名,タイトル\n" +
		"bgm01a,\tラベンダーの少女\r\n" +
		"bgm19,\t愛の営み\r\n" +
		"# comment row should be skipped\r\n" +
		"bgm28,\t永遠の向こう Short ver\r\n"
	sjis, err := japanese.ShiftJIS.NewEncoder().Bytes([]byte(utf8))
	if err != nil {
		t.Fatalf("encode: %v", err)
	}

	got := parseSoundList(bytes.NewReader(sjis))

	want := map[string]string{
		"bgm01a": "ラベンダーの少女",
		"bgm19":  "愛の営み",
		"bgm28":  "永遠の向こう Short ver",
	}
	if len(got) != len(want) {
		t.Fatalf("got %d entries (%v), want %d", len(got), got, len(want))
	}
	for stem, title := range want {
		if got[stem] != title {
			t.Errorf("stem %q = %q, want %q", stem, got[stem], title)
		}
	}
	if strings.Contains(strings.Join(mapKeys(got), ","), "#") {
		t.Errorf("comment/header rows must be skipped: %v", got)
	}
}

func mapKeys(m map[string]string) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
