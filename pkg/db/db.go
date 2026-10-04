package db

// Save storage for the web player. Ported from the sister project:
// system flags (global settings/unlocks) and per-slot save data live in
// SQLite (pure-Go driver); the backlog/history is a normalized child table.

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

type SystemFlag struct {
	Username string `gorm:"primaryKey"`
	SF       string `gorm:"type:text;not null"`
}

type SaveSlot struct {
	Username string         `gorm:"primaryKey"`
	SlotID   string         `gorm:"primaryKey"`
	SaveData string         `gorm:"type:text;not null"`
	Progress []SaveProgress `gorm:"foreignKey:Username,SlotID;references:Username,SlotID;constraint:OnDelete:CASCADE"`
}

type SaveProgress struct {
	Username     string `gorm:"primaryKey"`
	SlotID       string `gorm:"primaryKey"`
	EntryIndex   int    `gorm:"primaryKey"`
	ScenarioName string `gorm:"not null"`
	Pointer      int    `gorm:"not null"`
	SpeakerJP    string
	SpeakerEN    string
	TextJP       string
	TextEN       string
	Voice        string
	Snapshot     string
}

var DB *gorm.DB

func InitDB(dbPath string) error {
	var err error
	DB, err = gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		return err
	}
	return DB.AutoMigrate(&SystemFlag{}, &SaveSlot{}, &SaveProgress{})
}

func LoadStateFromDB(username string) (map[string]any, map[string]any, error) {
	sf := make(map[string]any)
	slots := make(map[string]any)

	var sysFlag SystemFlag
	err := DB.Where("username = ?", username).First(&sysFlag).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil, err
	}
	if sysFlag.SF != "" {
		if err := json.Unmarshal([]byte(sysFlag.SF), &sf); err != nil {
			return nil, nil, fmt.Errorf("failed to unmarshal system flags: %w", err)
		}
	}

	var dbSlots []SaveSlot
	if err := DB.Where("username = ?", username).Find(&dbSlots).Error; err != nil {
		return nil, nil, err
	}
	for _, s := range dbSlots {
		var slotMap map[string]any
		if err := json.Unmarshal([]byte(s.SaveData), &slotMap); err != nil {
			return nil, nil, fmt.Errorf("failed to unmarshal save slot %s: %w", s.SlotID, err)
		}
		slotMap["historyLog"] = []any{}
		slots[s.SlotID] = slotMap
	}

	var progressRecords []SaveProgress
	if err := DB.Where("username = ?", username).Order("slot_id, entry_index asc").Find(&progressRecords).Error; err == nil {
		for _, rec := range progressRecords {
			entryMap := map[string]any{
				"currentScenario": rec.ScenarioName,
				"pointer":         rec.Pointer,
				"speakerJp":       rec.SpeakerJP,
				"speakerEn":       rec.SpeakerEN,
				"textJp":          rec.TextJP,
				"textEn":          rec.TextEN,
				"voice":           nil,
				"snapshot":        nil,
			}
			if rec.Voice != "" {
				entryMap["voice"] = rec.Voice
			}
			if rec.Snapshot != "" {
				var snapMap map[string]any
				if err := json.Unmarshal([]byte(rec.Snapshot), &snapMap); err == nil {
					entryMap["snapshot"] = snapMap
				}
			}
			if slotVal, ok := slots[rec.SlotID]; ok {
				if m, ok := slotVal.(map[string]any); ok {
					if hist, ok := m["historyLog"].([]any); ok {
						m["historyLog"] = append(hist, entryMap)
					}
				}
			}
		}
	}

	return sf, slots, nil
}

func SaveSlotToDB(username, slotID string, saveData map[string]any, historyLog []any) error {
	dataJSON, err := json.Marshal(saveData)
	if err != nil {
		return fmt.Errorf("failed to encode slot metadata: %w", err)
	}

	return DB.Transaction(func(tx *gorm.DB) error {
		saveSlot := SaveSlot{Username: username, SlotID: slotID, SaveData: string(dataJSON)}
		if err := tx.Save(&saveSlot).Error; err != nil {
			return err
		}
		if err := tx.Where("username = ? AND slot_id = ?", username, slotID).Delete(&SaveProgress{}).Error; err != nil {
			return err
		}
		for idx, item := range historyLog {
			itemMap, ok := item.(map[string]any)
			if !ok {
				continue
			}
			scenName, _ := itemMap["currentScenario"].(string)
			ptrVal := 0
			switch p := itemMap["pointer"].(type) {
			case float64:
				ptrVal = int(p)
			case int:
				ptrVal = p
			}
			spJp, _ := itemMap["speakerJp"].(string)
			spEn, _ := itemMap["speakerEn"].(string)
			txtJp, _ := itemMap["textJp"].(string)
			txtEn, _ := itemMap["textEn"].(string)
			var voiceStr string
			if v, ok := itemMap["voice"]; ok && v != nil {
				voiceStr, _ = v.(string)
			}
			var snapStr string
			if snap, ok := itemMap["snapshot"]; ok && snap != nil {
				if b, err := json.Marshal(snap); err == nil {
					snapStr = string(b)
				}
			}
			rec := SaveProgress{
				Username: username, SlotID: slotID, EntryIndex: idx,
				ScenarioName: scenName, Pointer: ptrVal,
				SpeakerJP: spJp, SpeakerEN: spEn, TextJP: txtJp, TextEN: txtEn,
				Voice: voiceStr, Snapshot: snapStr,
			}
			if err := tx.Create(&rec).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func SaveSFToDB(username string, sf map[string]any) error {
	sfJSON, err := json.Marshal(sf)
	if err != nil {
		return fmt.Errorf("failed to encode system flags: %w", err)
	}
	return DB.Save(&SystemFlag{Username: username, SF: string(sfJSON)}).Error
}

// MigrateFromJSON imports a legacy single-file saves.json, backing it up.
func MigrateFromJSON(savesJSONPath, backupPath string) error {
	data, err := os.ReadFile(savesJSONPath)
	if err != nil {
		return fmt.Errorf("failed to read json file: %w", err)
	}
	type LegacySaveState struct {
		SF    map[string]any     `json:"sf"`
		Slots map[string]any     `json:"slots"`
	}
	var state LegacySaveState
	if err := json.Unmarshal(data, &state); err != nil {
		return fmt.Errorf("failed to parse json file: %w", err)
	}

	err = DB.Transaction(func(tx *gorm.DB) error {
		if state.SF != nil {
			b, err := json.Marshal(state.SF)
			if err != nil {
				return err
			}
			if err := tx.Save(&SystemFlag{Username: "default", SF: string(b)}).Error; err != nil {
				return err
			}
		}
		for slotID, slotData := range state.Slots {
			slotMap, ok := slotData.(map[string]any)
			if !ok {
				continue
			}
			var historyLog []any
			if histList, ok := slotMap["historyLog"].([]any); ok {
				historyLog = histList
			}
			metadataMap := map[string]any{}
			for k, v := range slotMap {
				if k != "historyLog" {
					metadataMap[k] = v
				}
			}
			b, err := json.Marshal(metadataMap)
			if err != nil {
				return err
			}
			if err := tx.Save(&SaveSlot{Username: "default", SlotID: slotID, SaveData: string(b)}).Error; err != nil {
				return err
			}
			if err := tx.Where("username = ? AND slot_id = ?", "default", slotID).Delete(&SaveProgress{}).Error; err != nil {
				return err
			}
			for idx, item := range historyLog {
				itemMap, ok := item.(map[string]any)
				if !ok {
					continue
				}
				scenName, _ := itemMap["currentScenario"].(string)
				ptrVal := 0
				switch p := itemMap["pointer"].(type) {
				case float64:
					ptrVal = int(p)
				case int:
					ptrVal = p
				}
				spJp, _ := itemMap["speakerJp"].(string)
				spEn, _ := itemMap["speakerEn"].(string)
				txtJp, _ := itemMap["textJp"].(string)
				txtEn, _ := itemMap["textEn"].(string)
				var voiceStr string
				if v, ok := itemMap["voice"]; ok && v != nil {
					voiceStr, _ = v.(string)
				}
				var snapStr string
				if snap, ok := itemMap["snapshot"]; ok && snap != nil {
					if b, err := json.Marshal(snap); err == nil {
						snapStr = string(b)
					}
				}
				rec := SaveProgress{
					Username: "default", SlotID: slotID, EntryIndex: idx,
					ScenarioName: scenName, Pointer: ptrVal,
					SpeakerJP: spJp, SpeakerEN: spEn, TextJP: txtJp, TextEN: txtEn,
					Voice: voiceStr, Snapshot: snapStr,
				}
				if err := tx.Create(&rec).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	return os.Rename(savesJSONPath, backupPath)
}
