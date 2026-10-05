import React, {useMemo, useState} from 'react';
import {getMeta, mediaUrl} from '../game/metadata';
import { useT } from '../game/i18n';

export interface ArchiveSlot {
  currentScenario?: string;
  pointer?: number;
  speaker?: string;
  dialogueText?: string;
  date?: string;
  timestamp?: number;
  note?: string;
  pinned?: boolean;
  stage?: any;
}

interface Props {
  slots: Record<string, ArchiveSlot>;
  playing: boolean;
  currentScenario?: string;
  currentPointer?: number;
  currentSpeaker?: string;
  currentDialogue?: string;
  onSave: (id: number, meta?: {note?: string; pinned?: boolean}) => void;
  onLoad: (slot: ArchiveSlot) => void;
  onDelete: (id: string | number) => void;
  onUpdateMeta: (id: string | number, patch: {note?: string; pinned?: boolean}) => void;
}

type Tab = 'recent' | 'chapter' | 'pinned';

/** scenario file ("scenario/lave37") -> chapter caption from the scenario index. */
export function chapterOf(scenario?: string, other = 'その他'): string {
  if (!scenario) return other;
  const file = scenario.split('/').pop() || scenario;
  const list = getMeta()?.scenarios || [];
  const hit = list.find((s: any) => s.storage.endsWith('/' + file) || s.name === file);
  const cap = (hit?.labels || []).map((l: any) => l.caption).find(Boolean);
  return cap || file;
}

function shortFile(scenario?: string): string {
  return (scenario || '').split('/').pop() || scenario || '';
}

const ArchivesTab: React.FC<Props> = ({
  slots, playing, currentScenario, currentPointer, currentSpeaker, currentDialogue,
  onSave, onLoad, onDelete, onUpdateMeta,
}) => {
  const t = useT();
  const [tab, setTab] = useState<Tab>('recent');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const entries = useMemo(() => {
    const list = Object.entries(slots)
      .filter(([id, s]) => id !== 'q' && s && (s.currentScenario || s.pointer != null))
      .map(([id, s]) => ({id, slot: s}));
    const q = query.trim().toLowerCase();
    const filtered = q
      ? list.filter(({id, slot}) => {
          const hay = [
            slot.note, slot.dialogueText, slot.speaker, shortFile(slot.currentScenario),
            slot.date, chapterOf(slot.currentScenario, t('archives.other')), id,
          ].filter(Boolean).join(' ').toLowerCase();
          return hay.includes(q);
        })
      : list;
    const pinnedFirst = filtered.sort((a, b) => {
      if (a.id === 'autosave') return -1;
      if (b.id === 'autosave') return 1;
      if (!!a.slot.pinned !== !!b.slot.pinned) return a.slot.pinned ? -1 : 1;
      return (b.slot.timestamp || 0) - (a.slot.timestamp || 0);
    });
    if (tab === 'pinned') return pinnedFirst.filter(e => e.slot.pinned);
    return pinnedFirst;
  }, [slots, query, tab, t]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof entries>();
    const other = t('archives.other');
    for (const e of entries) {
      const ch = chapterOf(e.slot.currentScenario, other);
      const arr = map.get(ch) || [];
      arr.push(e);
      map.set(ch, arr);
    }
    return Array.from(map.entries());
  }, [entries, t]);

  const nextId = useMemo(() => {
    let i = 0;
    while (slots[String(i)]) i++;
    return i;
  }, [slots]);

  const thumb = (s: ArchiveSlot) => {
    const stem = s.stage?.bgHidden ? null : s.stage?.bg?.stem;
    return stem ? mediaUrl(stem) : '';
  };

  const renderCard = (id: string, s: ArchiveSlot) => {
    const isAuto = id === 'autosave';
    return (
      <div key={id} className={`archive-card ${s.pinned ? 'pinned' : ''} ${isAuto ? 'autosave' : ''}`}>
        <div className="archive-thumb">
          {thumb(s)
            ? <img src={thumb(s)!} alt="" onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
            : <span className="archive-thumb-blank">—</span>}
          <span className="archive-thumb-tag">
            {isAuto ? t('archives.auto') : `#${id}`} · {shortFile(s.currentScenario)}:{s.pointer}
          </span>
        </div>
        <div className="archive-body">
          <div className="archive-meta">
            <span className="archive-chapter">{chapterOf(s.currentScenario, t('archives.other'))}</span>
            <span className="archive-date">{s.date}</span>
            {!isAuto && (
              <button
                className={`archive-pin ${s.pinned ? 'on' : ''}`}
                title={t('archives.mark')}
                onClick={() => onUpdateMeta(id, {pinned: !s.pinned})}
              >
                {s.pinned ? '★' : '☆'}
              </button>
            )}
          </div>
          {editing === id ? (
            <div className="archive-note-edit">
              <input
                autoFocus
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder={t('archives.notePlaceholder')}
                onKeyDown={e => {
                  if (e.key === 'Enter') { onUpdateMeta(id, {note: draft.trim()}); setEditing(null); }
                  if (e.key === 'Escape') setEditing(null);
                }}
              />
              <button onClick={() => { onUpdateMeta(id, {note: draft.trim()}); setEditing(null); }}>{t('common.save')}</button>
              <button onClick={() => setEditing(null)}>{t('common.cancel')}</button>
            </div>
          ) : (!isAuto || s.note) ? (
            <div
              className={`archive-note ${s.note ? 'has' : ''}`}
              onClick={() => { if (!isAuto) { setEditing(id); setDraft(s.note || ''); } }}
              title={isAuto ? undefined : t('archives.editNoteTitle')}
            >
              {s.note ? `📝 ${s.note}` : t('archives.addNote')}
            </div>
          ) : null}
          <div className="archive-line">
            {s.speaker && <b>{s.speaker}　</b>}
            <span>{(s.dialogueText || '…').replace(/\s+/g, ' ').slice(0, 60)}</span>
          </div>
          <div className="archive-actions">
            {playing && !isAuto && (
              <button className="archive-btn" onClick={() => onSave(isAuto ? 0 : Number(id), {note: s.note, pinned: s.pinned})}>
                {t('archives.overwrite')}
              </button>
            )}
            {!isAuto && (
              <button className="archive-btn danger" onClick={() => setConfirmDel(id)}>{t('common.delete')}</button>
            )}
            <button className="archive-btn primary" onClick={() => onLoad(s)}>{t('archives.load')}</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="side-body archives-body">
      <input
        className="archives-search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={t('archives.search')}
      />

        <div className="archives-tabs">
          <button className={tab === 'recent' ? 'on' : ''} onClick={() => setTab('recent')}>{t('archives.recent')}</button>
          <button className={tab === 'chapter' ? 'on' : ''} onClick={() => setTab('chapter')}>{t('archives.chapter')}</button>
          <button className={tab === 'pinned' ? 'on' : ''} onClick={() => setTab('pinned')}>{t('archives.pinned')}</button>
          {playing && (
            <button
              className="archives-new"
              onClick={() => onSave(nextId, {note: `[${shortFile(currentScenario)}:${currentPointer}] ${(currentSpeaker ? currentSpeaker + ' ' : '')}${(currentDialogue || '').slice(0, 20)}`})}
            >
              {t('archives.saveCurrent', { n: nextId + 1 })}
            </button>
          )}
        </div>

        <div className="archives-list">
          {entries.length === 0 && <div className="archives-empty">{t('archives.empty')}</div>}
          {tab === 'chapter'
            ? groups.map(([ch, list]) => (
                <div key={ch} className="archive-group">
                  <div className="archive-group-head">{ch}</div>
                  {list.map(e => renderCard(e.id, e.slot))}
                </div>
              ))
            : entries.map(e => renderCard(e.id, e.slot))}
        </div>

      {confirmDel && (
        <div className="side-sub" onClick={() => setConfirmDel(null)}>
          <div className="confirm-box" onClick={e => e.stopPropagation()}>
            <p>{t('archives.confirmDelete')}</p>
            <div>
              <button onClick={() => setConfirmDel(null)}>{t('common.cancel')}</button>
              <button className="danger" onClick={() => { onDelete(confirmDel); setConfirmDel(null); }}>{t('common.delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArchivesTab;
