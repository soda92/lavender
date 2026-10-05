package db

import "testing"

func TestSaveAndDeleteSlot(t *testing.T) {
	if err := InitDB("file::memory:?cache=shared"); err != nil {
		t.Fatalf("InitDB: %v", err)
	}
	const user = "tester"

	data := map[string]any{"currentScenario": "scenario/lave37", "pointer": 471.0}
	hist := []any{
		map[string]any{"currentScenario": "scenario/lave37", "pointer": 469.0, "textJp": "a"},
		map[string]any{"currentScenario": "scenario/lave37", "pointer": 471.0, "textJp": "b"},
	}
	if err := SaveSlotToDB(user, "0", data, hist); err != nil {
		t.Fatalf("SaveSlotToDB: %v", err)
	}

	_, slots, err := LoadStateFromDB(user)
	if err != nil {
		t.Fatalf("LoadStateFromDB: %v", err)
	}
	saved, ok := slots["0"]
	if !ok {
		t.Fatal("slot 0 missing after save")
	}
	payload, ok := saved.(map[string]any)
	if !ok || payload["currentScenario"] != "scenario/lave37" {
		t.Fatalf("unexpected payload: %v", saved)
	}
	if log, _ := payload["historyLog"].([]any); len(log) != 2 {
		t.Fatalf("historyLog not rebuilt: %v", payload["historyLog"])
	}

	if err := DeleteSlotFromDB(user, "0"); err != nil {
		t.Fatalf("DeleteSlotFromDB: %v", err)
	}
	_, slots, err = LoadStateFromDB(user)
	if err != nil {
		t.Fatalf("reload after delete: %v", err)
	}
	if _, ok := slots["0"]; ok {
		t.Fatal("slot 0 still present after delete")
	}
}
