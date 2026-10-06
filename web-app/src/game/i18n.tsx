import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

/**
 * Interface localization for player chrome (menus, panels, buttons).
 * Game scenario text is NOT translated here — that follows the runner's
 * separate JP/EN game-text language setting.
 */
export type Lang = 'ja' | 'en';

const STORAGE_KEY = 'lavender_uiLang';

const dict = {
  'common.cancel': { ja: '取消', en: 'Cancel' },
  'common.close': { ja: '閉じる', en: 'Close' },
  'common.delete': { ja: '消去', en: 'Delete' },
  'common.save': { ja: '保存', en: 'Save' },

  'boot.loading': { ja: 'Now Loading…', en: 'Now Loading…' },

  'title.start': { ja: '初めから', en: 'New Game' },
  'title.continue': { ja: '続きから', en: 'Continue' },
  'title.gallery': { ja: 'CG 鑑賞', en: 'CG Gallery' },
  'title.music': { ja: '音楽鑑賞', en: 'Music Room' },

  'tab.history': { ja: '履歴', en: 'Backlog' },
  'tab.navigator': { ja: 'ページ', en: 'Navigator' },
  'tab.archives': { ja: '文書', en: 'Saves' },
  'tab.settings': { ja: '設定', en: 'Settings' },

  'control.auto': { ja: '自動', en: 'Auto' },
  'control.skip': { ja: 'スキップ', en: 'Skip' },
  'control.quickLoad': { ja: 'Q.Load', en: 'Q.Load' },
  'control.quickSave': { ja: 'Q.Save', en: 'Q.Save' },

  'settings.displayMode': { ja: '表示モード', en: 'Display' },
  'settings.normal': { ja: '通常', en: 'Normal' },
  'settings.immersive': { ja: '没入', en: 'Immersive' },
  'settings.bgmVolume': { ja: 'BGM 音量', en: 'BGM Volume' },
  'settings.seVolume': { ja: '効果音・ボイス音量', en: 'SE / Voice Volume' },
  'settings.textSpeed': { ja: '文字スピード', en: 'Text Speed' },
  'settings.autoWait': { ja: 'オート待ち時間', en: 'Auto Delay' },
  'settings.skipTarget': { ja: 'スキップ対象', en: 'Skip' },
  'settings.all': { ja: 'すべて', en: 'All' },
  'settings.readOnly': { ja: '既読のみ', en: 'Read only' },
  'settings.uiLanguage': { ja: '表示言語', en: 'Interface Language' },
  'settings.textLanguage': { ja: '言語（テキスト）', en: 'Game Text Language' },
  'settings.textLanguageEn': {
    ja: 'English（日本語フォールバック）',
    en: 'English (falls back to Japanese)',
  },
  'settings.shortcuts': {
    ja: 'ショートカット：Enter 次へ / Space ウィンドウ消去 / I 没入モード / J オート / K スキップ切替 / Ctrl 長押しスキップ / Ctrl+S クイックセーブ / Ctrl+L ロード',
    en: 'Shortcuts: Enter advance · Space hide window · I immersive · J auto · K skip toggle · hold Ctrl to skip · Ctrl+S quick save · Ctrl+L load',
  },
  'settings.returnTitle': { ja: 'タイトルに戻る', en: 'Return to Title' },
  'settings.returnTitleWarn': {
    ja: 'タイトルに戻ります。未保存の進行は失われます。',
    en: 'Return to the title screen? Unsaved progress will be lost.',
  },
  'settings.confirmReturn': { ja: '戻る', en: 'Return' },

  'history.empty': { ja: '履歴はありません', en: 'No backlog yet' },

  'navigator.jump': { ja: 'ここへ移動', en: 'Move Here' },
  'navigator.empty': { ja: 'この付近に台詞はありません', en: 'No dialogue near here' },
  'navigator.hint': {
    ja: 'Enterキー・±ボタン・台詞クリックでその位置へ移動。移動すると、シナリオ先頭からその位置までを自動再生して場面を復元します（音声・動画は省略）。',
    en: 'Press Enter, use a ± button, or click a line to jump. Seeking silently replays the scenario from the start to this point to restore the scene (voice and video are skipped).',
  },

  'archives.search': { ja: 'メモ・台詞・場面を検索…', en: 'Search notes, lines, scenes…' },
  'archives.recent': { ja: '新着順', en: 'Recent' },
  'archives.chapter': { ja: '章別', en: 'Chapters' },
  'archives.pinned': { ja: '★ マーク', en: '★ Pinned' },
  'archives.saveCurrent': { ja: '＋ 現在を保存 (#{n})', en: '＋ Save Current (#{n})' },
  'archives.empty': { ja: '保存された文書はありません', en: 'No saved documents' },
  'archives.overwrite': { ja: '上書き', en: 'Overwrite' },
  'archives.load': { ja: '読込', en: 'Load' },
  'archives.auto': { ja: 'オート', en: 'Auto' },
  'archives.mark': { ja: 'マーク', en: 'Pin' },
  'archives.notePlaceholder': { ja: 'メモを入力…', en: 'Enter a note…' },
  'archives.addNote': { ja: 'メモを追加…', en: 'Add a note…' },
  'archives.editNoteTitle': { ja: 'クリックでメモを編集', en: 'Click to edit note' },
  'archives.confirmDelete': { ja: 'この文書を消去しますか？', en: 'Delete this document?' },
  'archives.other': { ja: 'その他', en: 'Other' },

  'gallery.title': { ja: 'CG 鑑賞', en: 'CG Gallery' },
  'gallery.tabCg': { ja: 'CG', en: 'CG' },
  'gallery.tabScenes': { ja: 'シーン回想', en: 'Scene Review' },
  'gallery.replay': { ja: '回想再生', en: 'Replay Scene' },
  'gallery.replayLocked': { ja: 'ロック中（再生すると解放）', en: 'Locked — play to unlock' },
  'gallery.reveal': { ja: 'クリックで表示', en: 'Click to reveal' },
  'gallery.endScene': { ja: '回想終了', en: 'End Scene' },
  'gallery.toTitle': { ja: 'タイトルへ', en: 'To Title' },
  'gallery.catAll': { ja: 'すべて', en: 'All' },
  'gallery.catAkina': { ja: 'アキナ', en: 'Akina' },
  'gallery.catHaruka': { ja: 'はるか', en: 'Haruka' },
  'gallery.catHikaru': { ja: 'ヒカル', en: 'Hikaru' },
  'gallery.catReika': { ja: 'レイカ', en: 'Reika' },
  'gallery.catRiko': { ja: 'リコ', en: 'Riko' },
  'gallery.catOther': { ja: 'その他', en: 'Other' },
  'gallery.variantsTitle': { ja: '{n} 枚の差分（クリックで切替）', en: '{n} variants (click to switch)' },
  'gallery.prev': { ja: '前へ', en: 'Prev' },
  'gallery.next': { ja: '次へ', en: 'Next' },
  'gallery.page': { ja: 'ページ', en: 'Page' },

  'music.title': { ja: '音楽鑑賞', en: 'Music Room' },
  'music.trackCount': { ja: '{n} 曲', en: '{n} tracks' },
  'music.unlocked': { ja: '聴取済み {n} / {total}', en: 'Heard {n} / {total}' },
  'music.play': { ja: '再生', en: 'Play' },
  'music.pause': { ja: '一時停止', en: 'Pause' },
  'music.stop': { ja: '停止', en: 'Stop' },
  'music.prev': { ja: '前の曲', en: 'Previous' },
  'music.next': { ja: '次の曲', en: 'Next' },
  'music.nowPlaying': { ja: '再生中', en: 'Now Playing' },
} as const;

export type TKey = keyof typeof dict;

type Vars = Record<string, string | number>;

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TKey, vars?: Vars) => string;
}

const Ctx = createContext<I18nCtx>({
  lang: 'ja',
  setLang: () => {},
  t: (key) => dict[key].ja,
});

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'ja' || saved === 'en') return saved;
  } catch { /* ignore */ }
  return navigator.language?.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(detectLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  }, []);
  const t = useCallback((key: TKey, vars?: Vars) => {
    let s: string = dict[key][lang] ?? dict[key].ja;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  }, [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export function useI18n(): I18nCtx {
  return useContext(Ctx);
}

export function useT(): I18nCtx['t'] {
  return useContext(Ctx).t;
}
