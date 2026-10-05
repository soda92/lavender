package handlers

import (
	"strings"
	"testing"
)

func TestParseSceneList(t *testing.T) {
	sample := strings.NewReader(`# シーン回想データ
#
::::::::::::::::,hikaru
thumb2_hikaru_h_02aa,	ev_hikaru_h_02aa,	lave42_hikaru *memory_begin,	lave42_hikaru *memory_end*memory_end
thumb2_hikaru_h_03a,	ev_hikaru_h_03a,	lave41_hikaru *memory_begin,	lave41_hikaru *memory_end
#
::::::::::::::::,reika
thumb2_reika_h_03a,		ev_reika_h_03a,		lave42_reika  *memory_begin,	lave42_reika  *memory_end*memory_end
`)
	scenes := parseSceneList(sample)
	if len(scenes) != 3 {
		t.Fatalf("got %d scenes, want 3: %+v", len(scenes), scenes)
	}
	s0 := scenes[0]
	want0 := SceneInfo{
		ID:         "lave42_hikaru_memory_begin",
		Heroine:    "hikaru",
		Thumb:      "/thum/thumb2_hikaru_h_02aa.png",
		Orig:       "ev_hikaru_h_02aa",
		Storage:    "lave42_hikaru",
		StartLabel: "memory_begin",
		EndLabel:   "memory_end",
	}
	if s0 != want0 {
		t.Fatalf("scene0 mismatch:\n got %+v\nwant %+v", s0, want0)
	}
	if scenes[1].Heroine != "hikaru" || scenes[2].Heroine != "reika" {
		t.Fatalf("heroine grouping wrong: %s / %s", scenes[1].Heroine, scenes[2].Heroine)
	}
	if scenes[2].Storage != "lave42_reika" || scenes[2].StartLabel != "memory_begin" {
		t.Fatalf("whitespace-tolerant parse failed: %+v", scenes[2])
	}
}
