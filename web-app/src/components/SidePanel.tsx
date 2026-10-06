import React, { type CSSProperties } from 'react';
import HistoryTab from './HistoryModal';
import FlipperTab from './PageFlipper';
import ArchivesTab from './ArchivesModal';
import { useT, type TKey } from '../game/i18n';

export type SideTab = 'history' | 'flipper' | 'archives';

const TABS: Array<{ id: SideTab; labelKey: TKey; playingOnly?: boolean }> = [
  { id: 'history', labelKey: 'tab.history', playingOnly: true },
  { id: 'flipper', labelKey: 'tab.flipper', playingOnly: true },
  { id: 'archives', labelKey: 'tab.archives' },
];

interface Props {
  tab: SideTab;
  playing: boolean;
  dockStyle: CSSProperties;
  runner: any;
  onTab: (tab: SideTab) => void;
  onClose: () => void;
}

/**
 * The single docked side panel. Hosts the backlog, page flipper, document
 * archives and settings as tabs. Mounted outside the scaled stage frame so
 * it lives in the viewport letterbox, never over the game.
 */
const SidePanel: React.FC<Props> = ({ tab, playing, dockStyle, runner, onTab, onClose}) => {
  const t = useT();
  const tabs = TABS.filter(tb => !tb.playingOnly || playing);

  return (
    <div className="side-panel" style={dockStyle}>
      <div className="side-tabbar">
        {tabs.map(tb => (
          <button
            key={tb.id}
            className={tab === tb.id ? 'on' : ''}
            onClick={e => { e.currentTarget.blur(); onTab(tb.id); }}
          >
            {t(tb.labelKey)}
          </button>
        ))}
        <button className="side-close" title={t('common.close')} onClick={e => { e.currentTarget.blur(); onClose(); }}>×</button>
      </div>

      {tab === 'history' && (
        <HistoryTab items={runner.historyLog} onReplayVoice={runner.replayVoice} />
      )}
      {tab === 'flipper' && playing && (
        <FlipperTab
          instructions={runner.scenarioInstructions}
          pointer={runner.pointer}
          scenario={runner.currentScenario}
          onSeek={runner.seekToPointer}
        />
      )}
      {tab === 'archives' && (
        <ArchivesTab
          slots={runner.saveSlots}
          playing={playing}
          currentScenario={runner.currentScenario}
          currentPointer={runner.pointer}
          currentSpeaker={runner.speaker}
          currentDialogue={runner.dialogueText}
          onSave={async (id: string | number, meta?: {note?: string; pinned?: boolean}) => {
            // 確認セーブ: ask before overwriting an occupied slot.
            if (runner.saveSlots[String(id)]
                && runner.sf?.confirmSave !== false
                && !(await runner.requestConfirm('上書き'))) return;
            runner.saveToSlot(id, meta);
          }}
          onLoad={async (slot: any) => {
            if (runner.sf?.confirmLoad !== false
                && !(await runner.requestConfirm('ロード'))) return;
            runner.loadSaveSlot(slot);
            onClose();
          }}
          onDelete={(id: string | number) => runner.deleteSlot(id)}
          onUpdateMeta={(id: string | number, patch: {note?: string; pinned?: boolean}) => runner.updateSlotMeta(id, patch)}
        />
      )}
    </div>
  );
};

export default SidePanel;
