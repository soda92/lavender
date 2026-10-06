package handlers

import (
	"strings"
	"testing"
)

func TestParseCgList(t *testing.T) {
	sample := strings.NewReader(`#CGモード一覧
#サムネール, 画像1, 画像2
::::::::::::::::,hikaru
thumb_hikaru_05a,	ev_hikaru_05a,ev_hikaru_05b,ev_hikaru_05c
thumb_stex_hikaru_a,	ev_stex_hikaru_a?st_ex_hikaru_a,ev_stex_hikaru_b?st_ex_hikaru_b
#
::::::::::::::::,other
thumb_other_08,		ev_other_08
thumb_other_06a,	ev_other_06a,ev_other_06b
::::::::::::::::
`)
	sections := parseCgList(sample)
	if len(sections) != 2 {
		t.Fatalf("got %d sections, want 2: %+v", len(sections), sections)
	}
	if sections[0].ID != "hikaru" || sections[1].ID != "other" {
		t.Fatalf("section ids: %q %q", sections[0].ID, sections[1].ID)
	}

	t0 := sections[0].Tiles[0]
	want0 := CgTile{
		ID:    "thumb_hikaru_05a",
		Thumb: "/thum/thumb_hikaru_05a.png",
		Variants: []CgVariant{
			{Stem: "ev_hikaru_05a"},
			{Stem: "ev_hikaru_05b"},
			{Stem: "ev_hikaru_05c"},
		},
	}
	if len(t0.Variants) != 3 {
		t.Fatalf("tile0 variants = %d", len(t0.Variants))
	}
	if t0.ID != want0.ID || t0.Thumb != want0.Thumb {
		t.Fatalf("tile0 id/thumb = %q %q, want %q %q", t0.ID, t0.Thumb, want0.ID, want0.Thumb)
	}
	for i, w := range want0.Variants {
		if t0.Variants[i] != w {
			t.Fatalf("variant %d = %+v, want %+v", i, t0.Variants[i], w)
		}
	}

	stex := sections[0].Tiles[1]
	if got := stex.Variants[0]; got != (CgVariant{Stem: "ev_stex_hikaru_a", Overlay: "st_ex_hikaru_a"}) {
		t.Fatalf("stex variant = %+v", got)
	}
	if len(stex.Variants) != 2 {
		t.Fatalf("stex variants = %d, want 2", len(stex.Variants))
	}

	// Blank variant column before the real one must be skipped.
	blank := sections[1].Tiles[0]
	if len(blank.Variants) != 1 || blank.Variants[0].Stem != "ev_other_08" {
		t.Fatalf("blank-column tile = %+v", blank.Variants)
	}

	// The trailing empty section must not appear.
	for _, s := range sections {
		if s.ID == "" {
			t.Fatalf("empty section emitted")
		}
	}
}
