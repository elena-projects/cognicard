import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { X, Volume2, Pause, Play, Square, Loader2, Type, AlignJustify, Eye, Ruler, Palette, SlidersHorizontal } from 'lucide-react';
import { synthesizeSpeech } from './services/geminiService';

/**
 * FocusReader — an ADHD-friendly reading mode for the source text.
 * Read-aloud uses Gemini neural voice (with a browser-speech fallback) and
 * highlights each word as it is spoken. Other aids: bionic reading,
 * focus spotlight, a reading ruler, comfort sliders, and soft background tints.
 * Preferences persist in localStorage so the reader always opens the way the user likes it.
 */

interface Props {
  text: string;
  lang: 'English' | 'Chinese';
  isDark: boolean;
  onClose: () => void;
}

const TINTS = [
  { bg: '#ffffff', ink: '#1f2733', name: 'White' },
  { bg: '#fbf6e9', ink: '#3a3630', name: 'Cream' },
  { bg: '#eaf3ee', ink: '#28362f', name: 'Mint' },
  { bg: '#eaf0f6', ink: '#28323f', name: 'Blue' },
  { bg: '#f5e9ee', ink: '#3a2c31', name: 'Rose' },
  { bg: '#1c2230', ink: '#dfe7ee', name: 'Dark' },
];
const FONTS = [
  { label: 'Lexend', css: "'Lexend', ui-sans-serif, system-ui, sans-serif" },
  { label: 'Rounded', css: "ui-rounded, 'SF Pro Rounded', system-ui, sans-serif" },
  { label: 'Serif', css: "Georgia, 'Times New Roman', serif" },
];

// A tiny silent WAV. Playing this synchronously inside a click "unlocks" the
// <audio> element so we can start real speech AFTER the async TTS call without
// tripping the browser's autoplay block.
const SILENT_WAV = (() => {
  const sr = 8000, samples = 320;
  const dataSize = samples * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); ws(8, 'WAVE'); ws(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  ws(36, 'data'); v.setUint32(40, dataSize, true);
  const b = new Uint8Array(buf); let bin = '';
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return 'data:audio/wav;base64,' + btoa(bin);
})();

const bionicWord = (word: string): React.ReactNode => {
  const m = word.match(/^([A-Za-z]{2,})(.*)$/);
  if (!m) return word; // leave CJK / numbers / punctuation untouched
  const lead = Math.max(1, Math.ceil(m[1].length * 0.45));
  return (<>{<b>{m[1].slice(0, lead)}</b>}{m[1].slice(lead)}{m[2]}</>);
};

const loadPrefs = (): any => {
  try { return JSON.parse(localStorage.getItem('cc_reader_prefs') || '{}'); } catch { return {}; }
};

// Split the word stream into short speakable chunks (roughly one sentence each).
// Streaming per-chunk means playback can start after the FIRST chunk is synthesized
// (fast), and each chunk's word-highlight timing is computed from its own short
// duration (accurate — errors can't accumulate across the whole passage).
function buildChunks(
  plain: string,
  words: { start: number; end: number; pi: number; weight: number }[],
): { wiStart: number; wiEnd: number; text: string }[] {
  const chunks: { wiStart: number; wiEnd: number; text: string }[] = [];
  if (!words.length) return chunks;
  const MIN = 45, MAX = 190;
  let start = 0;
  for (let i = 0; i < words.length; i++) {
    const charLen = words[i].end - words[start].start;
    const gapEnd = i + 1 < words.length ? words[i + 1].start : plain.length;
    const gap = plain.slice(words[i].end, gapEnd);
    const lastChar = plain.slice(words[i].start, words[i].end).slice(-1);
    const sentenceEnd = /[。！？!?…\n]/.test(gap) || /[。！？!?…]/.test(lastChar);
    const isLast = i === words.length - 1;
    if (isLast || (sentenceEnd && charLen >= MIN) || charLen >= MAX) {
      const charEnd = i + 1 < words.length ? words[i + 1].start : plain.length;
      const text = plain.slice(words[start].start, charEnd).trim();
      if (text) chunks.push({ wiStart: start, wiEnd: i + 1, text });
      start = i + 1;
    }
  }
  return chunks;
}

const FocusReader: React.FC<Props> = ({ text, lang, isDark, onClose }) => {
  const zh = lang === 'Chinese';
  const T = zh
    ? { title: '专注阅读', sub: '为容易分心的阅读者优化', read: '朗读', pause: '暂停', resume: '继续', stopBtn: '停止', preparing: '准备语音…', speed: '语速',
        voice: '声音', female: '女声', male: '男声',
        aids: '专注辅助', focus: '专注模式', bionic: '仿生阅读', ruler: '阅读标尺',
        comfort: '舒适度', size: '字号', line: '行距', letter: '字距', width: '栏宽',
        font: '字体', tint: '护眼底色', tipRead: '用 Gemini 神经语音朗读，逐词高亮；点任意词可从那里开始读。',
        tipFocus: '专注模式下用 ↑ ↓ 或点击段落移动聚光。', empty: '还没有文本。先在上面粘贴或上传一篇文章，再打开专注阅读。' }
    : { title: 'Focus Reader', sub: 'A calmer way to read for ADHD', read: 'Read to me', pause: 'Pause', resume: 'Resume', stopBtn: 'Stop', preparing: 'Preparing…', speed: 'Speed',
        voice: 'Voice', female: 'Female', male: 'Male',
        aids: 'Focus aids', focus: 'Focus mode', bionic: 'Bionic reading', ruler: 'Reading ruler',
        comfort: 'Comfort', size: 'Text size', line: 'Line spacing', letter: 'Letter spacing', width: 'Column width',
        font: 'Font', tint: 'Background tint', tipRead: 'Gemini neural voice reads aloud with word highlighting — click any word to start there.',
        tipFocus: 'In focus mode use ↑ ↓ or click a paragraph to move the spotlight.', empty: 'No text yet — paste or upload an article above, then open Focus Reader.' };

  const VOICES = [{ id: 'Sulafat', label: T.female }, { id: 'Iapetus', label: T.male }];
  // A short style directive — Gemini reads only the text after it, not the directive itself,
  // which makes the delivery warmer/steadier (verified: the instruction is not spoken aloud).
  const STYLE = zh ? '请用温暖、亲切、自然的语气，清晰平稳地朗读下面这段：\n\n'
                   : 'Read the following aloud in a warm, natural, gentle and clear voice:\n\n';

  // ---- controls (persisted) ----
  const saved = useMemo(loadPrefs, []);
  const [bionic, setBionic] = useState<boolean>(saved.bionic ?? false);
  const [focus, setFocus] = useState(false);
  const [ruler, setRuler] = useState(false);
  const [fs, setFs] = useState<number>(saved.fs ?? 19);
  const [lh, setLh] = useState<number>(saved.lh ?? 1.9);
  const [ls, setLs] = useState<number>(saved.ls ?? 0.2);
  const [lw, setLw] = useState<number>(saved.lw ?? 640);
  const [font, setFont] = useState<string>(saved.font ?? FONTS[0].css);
  const [tint, setTint] = useState(TINTS.find((t) => t.name === saved.tint) ?? TINTS[0]);
  const [rate, setRate] = useState<number>(saved.rate ?? 1);
  const [voice, setVoice] = useState<string>(['Sulafat', 'Iapetus'].includes(saved.voice) ? saved.voice : 'Sulafat');
  const [rulerY, setRulerY] = useState(-100);
  const [showPanel, setShowPanel] = useState(false); // mobile drawer for the control panel

  // ---- reading state ----
  const [spokenWi, setSpokenWi] = useState(-1);
  const [activePara, setActivePara] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [engine, setEngine] = useState<'gemini' | 'browser' | null>(null);
  const [ttsErr, setTtsErr] = useState('');
  const readerRef = useRef<HTMLDivElement>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlCacheRef = useRef<Map<string, string>>(new Map()); // key `${voice}#${chunkIndex}`
  const chunkTimesRef = useRef<{ wi: number; start: number; end: number }[]>([]); // times for the CURRENT chunk
  const chunkRef = useRef(-1);   // index of the chunk currently playing
  const stoppedRef = useRef(false);
  const modeRef = useRef<'gemini' | 'browser'>('gemini');
  const primedRef = useRef(false);
  const lastWiRef = useRef(-1);

  // Unlock audio playback within a user gesture (call synchronously from onClick).
  const prime = useCallback(() => {
    if (!audioRef.current) { audioRef.current = new Audio(); audioRef.current.preload = 'auto'; }
    if (!primedRef.current) {
      primedRef.current = true;
      const a = audioRef.current;
      a.src = SILENT_WAV;
      a.play().then(() => a.pause()).catch(() => {});
    }
  }, []);
  const focusRef = useRef(focus);
  useEffect(() => { focusRef.current = focus; }, [focus]);

  // ---- parse text into paragraphs / word tokens (Intl.Segmenter so Chinese also gets word-level highlight) ----
  const { paras, plain, words } = useMemo(() => {
    const paras: { wi: number; w: string; word: boolean }[][] = [];
    const words: { start: number; end: number; pi: number; weight: number }[] = [];
    let plain = '';
    let wi = 0;
    const blocks = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    const Seg = (Intl as any).Segmenter;
    const seg = Seg ? new Seg(zh ? 'zh' : 'en', { granularity: 'word' }) : null;
    blocks.forEach((block, pi) => {
      const para: { wi: number; w: string; word: boolean }[] = [];
      if (seg) {
        for (const s of seg.segment(block) as any) {
          const tok: string = s.segment;
          if (tok === '') continue;
          if (s.isWordLike) {
            const start = plain.length; plain += tok;
            words.push({ start, end: plain.length, pi, weight: Math.max(1, tok.length) });
            para.push({ wi, w: tok, word: true }); wi++;
          } else {
            plain += tok; para.push({ wi: -1, w: tok, word: false });
          }
        }
      } else {
        block.split(/(\s+)/).forEach((tok) => {
          if (tok === '') return;
          if (/^\s+$/.test(tok)) { plain += ' '; para.push({ wi: -1, w: ' ', word: false }); return; }
          const start = plain.length; plain += tok;
          words.push({ start, end: plain.length, pi, weight: Math.max(1, tok.length) });
          para.push({ wi, w: tok, word: true }); wi++;
        });
      }
      paras.push(para);
      plain += '\n';
    });
    return { paras, plain, words };
  }, [text, zh]);

  const chunks = useMemo(() => buildChunks(plain, words), [plain, words]);

  const wordAt = (charIndex: number) => {
    for (let i = 0; i < words.length; i++) if (charIndex >= words[i].start && charIndex < words[i].end) return i;
    return -1;
  };

  // Spread the CURRENT chunk's short duration across its words (length-weighted).
  const computeChunkTimes = (ci: number, duration: number) => {
    const { wiStart, wiEnd } = chunks[ci];
    let total = 0;
    for (let i = wiStart; i < wiEnd; i++) total += words[i].weight;
    total = total || 1;
    let acc = 0;
    const arr: { wi: number; start: number; end: number }[] = [];
    for (let i = wiStart; i < wiEnd; i++) {
      const start = (acc / total) * duration;
      acc += words[i].weight;
      arr.push({ wi: i, start, end: (acc / total) * duration });
    }
    chunkTimesRef.current = arr;
  };

  // Driven by the audio element's 'timeupdate' event (fires ~4x/sec, works in background tabs too).
  const updateFromTime = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    const t = a.currentTime;
    const times = chunkTimesRef.current;
    if (!times.length) return;
    let wi = times[times.length - 1].wi;
    for (let i = 0; i < times.length; i++) { if (t < times[i].end) { wi = times[i].wi; break; } }
    if (wi !== lastWiRef.current) {
      lastWiRef.current = wi;
      setSpokenWi(wi);
      const pi = words[wi]?.pi;
      if (focusRef.current && pi != null) setActivePara(pi);
      const el = readerRef.current?.querySelector(`[data-wi="${wi}"]`) as HTMLElement | null;
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    setProgress(words.length ? Math.min(1, (wi + 1) / words.length) : 0);
  }, [words, chunks]);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    chunkRef.current = -1;
    if (modeRef.current === 'browser') { try { window.speechSynthesis.cancel(); } catch {} }
    else { const a = audioRef.current; if (a) { a.onended = null; a.pause(); try { a.currentTime = 0; } catch {} } }
    setSpeaking(false); setPaused(false); setSpokenWi(-1); setProgress(0);
    lastWiRef.current = -1;
  }, []);

  // --- browser speech fallback (used only if Gemini TTS fails) ---
  const browserRead = useCallback(() => {
    if (!('speechSynthesis' in window) || !plain.trim()) return;
    modeRef.current = 'browser';
    const u = new SpeechSynthesisUtterance(plain);
    u.rate = rate;
    u.lang = zh ? 'zh-CN' : 'en-US';
    u.onboundary = (ev: SpeechSynthesisEvent) => {
      if ((ev as any).name && (ev as any).name !== 'word') return;
      const wi = wordAt(ev.charIndex);
      if (wi < 0) return;
      setSpokenWi(wi);
      if (focusRef.current) setActivePara(words[wi].pi);
      const el = readerRef.current?.querySelector(`[data-wi="${wi}"]`) as HTMLElement | null;
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    u.onend = () => stop();
    u.onerror = () => stop();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setSpeaking(true); setPaused(false);
    setEngine('browser');
  }, [plain, rate, zh, words, stop]);

  // Synthesize one chunk (cached per voice+chunk); returns its audio object URL.
  const synthChunk = useCallback(async (ci: number): Promise<string> => {
    const key = voice + '#' + ci;
    let url = urlCacheRef.current.get(key);
    if (!url) { url = await synthesizeSpeech(STYLE + chunks[ci].text, voice); urlCacheRef.current.set(key, url); }
    return url;
  }, [voice, chunks]);

  // Load chunk `ci` into the single unlocked <audio> element and play it. When it
  // ends, the next chunk plays automatically; the following chunk is prefetched.
  const playChunk = useCallback(async (ci: number, fromWi: number | null = null): Promise<void> => {
    if (ci < 0 || ci >= chunks.length) { setSpeaking(false); setPaused(false); setProgress(1); lastWiRef.current = -1; return; }
    chunkRef.current = ci;
    modeRef.current = 'gemini';
    const url = await synthChunk(ci);
    if (chunkRef.current !== ci || stoppedRef.current) return; // superseded by stop / voice change
    if (!audioRef.current) { audioRef.current = new Audio(); audioRef.current.preload = 'auto'; }
    const a = audioRef.current;
    a.src = url;
    a.load();
    await new Promise<void>((res) => { if (a.readyState >= 1) res(); else a.onloadedmetadata = () => res(); });
    if (chunkRef.current !== ci || stoppedRef.current) return;
    computeChunkTimes(ci, a.duration);
    a.playbackRate = rate;
    let fromTime = 0;
    if (fromWi != null) { const e = chunkTimesRef.current.find((x) => x.wi === fromWi); if (e) fromTime = e.start; }
    try { a.currentTime = fromTime; } catch {}
    a.ontimeupdate = () => updateFromTime();
    a.onended = () => { if (!stoppedRef.current) playChunk(chunkRef.current + 1); };
    await a.play();
    setSpeaking(true); setPaused(false); setEngine('gemini'); setTtsErr('');
    if (ci + 1 < chunks.length) synthChunk(ci + 1).catch(() => {}); // prefetch next
  }, [chunks, synthChunk, rate, updateFromTime]);

  const play = useCallback(async () => {
    if (!chunks.length) return;
    stoppedRef.current = false;
    lastWiRef.current = -1;
    setPreparing(true);
    try {
      await playChunk(0);
      setPreparing(false);
    } catch (e) {
      setPreparing(false);
      const msg = String((e as any)?.message || e);
      console.warn('Gemini TTS unavailable, using browser voice:', e);
      setTtsErr(msg);
      browserRead();
    }
  }, [chunks, playChunk, browserRead]);

  const seekToWord = useCallback(async (wi: number) => {
    const ci = chunks.findIndex((c) => wi >= c.wiStart && wi < c.wiEnd);
    if (ci < 0) return;
    stoppedRef.current = false;
    lastWiRef.current = -1;
    setPreparing(true);
    try {
      await playChunk(ci, wi);
      setPreparing(false);
    } catch { setPreparing(false); browserRead(); }
  }, [chunks, playChunk, browserRead]);

  const onPlayButton = () => {
    prime();
    if (preparing) return;
    if (speaking && !paused) {
      if (modeRef.current === 'browser') { try { window.speechSynthesis.pause(); } catch {} }
      else audioRef.current?.pause();
      setPaused(true);
      return;
    }
    if (paused) {
      if (modeRef.current === 'browser') { try { window.speechSynthesis.resume(); } catch {} }
      else audioRef.current?.play();
      setPaused(false);
      return;
    }
    setShowPanel(false); // let the reader see word highlighting on mobile
    play();
  };

  // live speed control for the Gemini audio element
  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = rate; }, [rate]);

  // switching voice invalidates the current playback (next play synthesizes the new voice)
  const firstVoice = useRef(true);
  useEffect(() => {
    if (firstVoice.current) { firstVoice.current = false; return; }
    stop();
  }, [voice, stop]);

  // persist comfort + voice preferences
  useEffect(() => {
    try {
      localStorage.setItem('cc_reader_prefs', JSON.stringify({ fs, lh, ls, lw, font, tint: tint.name, voice, rate, bionic }));
    } catch {}
  }, [fs, lh, ls, lw, font, tint, voice, rate, bionic]);

  // keyboard nav in focus mode, space = play/pause, Esc = close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === ' ' && !(e.target as HTMLElement)?.closest('input,textarea,button')) { e.preventDefault(); onPlayButton(); return; }
      if (!focus) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setActivePara((p) => Math.min(paras.length - 1, p + 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActivePara((p) => Math.max(0, p - 1)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // cleanup on unmount
  useEffect(() => () => {
    try { window.speechSynthesis.cancel(); } catch {}
    audioRef.current?.pause();
    urlCacheRef.current.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const Toggle = ({ on, set, label, icon }: { on: boolean; set: (v: boolean) => void; label: string; icon: React.ReactNode }) => (
    <button onClick={() => set(!on)} className="w-full flex items-center justify-between py-2 text-[13.5px] text-gray-700 dark:text-slate-200">
      <span className="flex items-center gap-2">{icon}{label}</span>
      <span className={`w-[42px] h-6 rounded-full relative transition-colors ${on ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-slate-600'}`}>
        <span className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow transition-all ${on ? 'left-[21px]' : 'left-[3px]'}`} />
      </span>
    </button>
  );
  const Slider = ({ label, val, set, min, max, step }: any) => (
    <div className="flex items-center justify-between gap-3 my-2 text-[13px] text-gray-700 dark:text-slate-200">
      <span className="whitespace-nowrap">{label}</span>
      <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => set(parseFloat(e.target.value))} className="w-[130px] accent-indigo-600" />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] bg-white dark:bg-[#0b1220] flex flex-col" onMouseMove={(e) => ruler && setRulerY(e.clientY - 22)}>
      {/* top bar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 dark:border-slate-800 bg-white dark:bg-[#0b1220]">
        <span className="font-extrabold text-gray-900 dark:text-slate-100">Cogni<span className="text-indigo-600 dark:text-indigo-400">Card</span></span>
        <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 rounded-full whitespace-nowrap">{T.title} · ADHD</span>
        <span className="ml-auto text-[12.5px] text-gray-400 dark:text-slate-500 hidden sm:block">{T.sub}</span>
        <button onClick={() => setShowPanel(true)} className="md:hidden ml-auto shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 whitespace-nowrap"><SlidersHorizontal size={15} /> {zh ? '设置' : 'Controls'}</button>
        <button onClick={onClose} className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:text-slate-500 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800"><X size={20} /></button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* dim backdrop behind the mobile drawer */}
        {showPanel && <div className="md:hidden fixed inset-0 z-[65] bg-black/40" onClick={() => setShowPanel(false)} />}

        {/* control panel — static sidebar on desktop, slide-over drawer on mobile */}
        <aside className={`w-[288px] max-w-[86vw] flex-shrink-0 border-r border-gray-100 dark:border-slate-800 p-5 overflow-y-auto bg-white dark:bg-[#0b1220] transition-transform duration-300 fixed inset-y-0 left-0 z-[70] md:static md:z-auto md:translate-x-0 ${showPanel ? 'translate-x-0' : '-translate-x-full'}`}>
          {/* mobile-only drawer header */}
          <div className="md:hidden flex items-center justify-between mb-4">
            <span className="text-[13px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500">{zh ? '设置' : 'Controls'}</span>
            <button onClick={() => setShowPanel(false)} className="p-2 -mr-2 rounded-lg text-gray-400 hover:text-gray-700 dark:text-slate-500 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800"><X size={18} /></button>
          </div>
          <div className="mb-6">
            <h4 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-3">{T.read}</h4>
            <div className="flex gap-2">
              <button onClick={onPlayButton} disabled={!plain.trim() || preparing} className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-slate-700 text-white font-bold text-sm py-3 rounded-xl transition-colors">
                {preparing ? <><Loader2 size={16} className="animate-spin" /> {T.preparing}</>
                  : speaking && !paused ? <><Pause size={16} /> {T.pause}</>
                  : paused ? <><Play size={16} /> {T.resume}</>
                  : <><Volume2 size={16} /> {T.read}</>}
              </button>
              {(speaking || paused) && (
                <button onClick={stop} title={T.stopBtn} className="px-3 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"><Square size={15} /></button>
              )}
            </div>

            {/* progress bar */}
            <div className="h-1 mt-3 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
              <div className="h-full bg-indigo-500 transition-[width] duration-150" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>

            {/* which voice engine is actually playing (diagnostic + reassurance) */}
            {engine === 'gemini' && (speaking || paused) && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1.5">{zh ? '🎙 正在使用 Gemini 神经语音' : '🎙 Gemini neural voice'}</p>
            )}
            {engine === 'browser' && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5 leading-snug">{zh ? '⚠️ 已回退到系统语音（这次没连上 Gemini 语音）' : '⚠️ Fell back to system voice (Gemini voice failed)'}{ttsErr ? ` · ${ttsErr.slice(0, 60)}` : ''}</p>
            )}

            {/* voice picker */}
            <div className="flex items-center justify-between gap-2 mt-3">
              <span className="text-[13px] text-gray-700 dark:text-slate-200">{T.voice}</span>
              <div className="flex gap-1.5">
                {VOICES.map((v) => (
                  <button key={v.id} onClick={() => setVoice(v.id)} className={`px-3 py-1 rounded-lg text-[12.5px] font-semibold border transition-colors ${voice === v.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300' : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300'}`}>{v.label}</button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 mt-3 text-[13px] text-gray-700 dark:text-slate-200"><span>{T.speed}</span><input type="range" min={0.6} max={1.4} step={0.05} value={rate} onChange={(e) => setRate(parseFloat(e.target.value))} className="w-[120px] accent-indigo-600" /></div>
            <p className="text-[11.5px] text-gray-400 dark:text-slate-500 leading-snug mt-2">{T.tipRead}</p>
          </div>

          <div className="mb-6">
            <h4 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-1">{T.aids}</h4>
            <Toggle on={focus} set={setFocus} label={T.focus} icon={<Eye size={15} />} />
            <Toggle on={bionic} set={setBionic} label={T.bionic} icon={<Type size={15} />} />
            <Toggle on={ruler} set={setRuler} label={T.ruler} icon={<Ruler size={15} />} />
            <p className="text-[11.5px] text-gray-400 dark:text-slate-500 leading-snug mt-2">{T.tipFocus}</p>
          </div>

          <div className="mb-6">
            <h4 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2 flex items-center gap-1.5"><AlignJustify size={12} /> {T.comfort}</h4>
            <Slider label={T.size} val={fs} set={setFs} min={16} max={26} step={1} />
            <Slider label={T.line} val={lh} set={setLh} min={1.5} max={2.4} step={0.05} />
            <Slider label={T.letter} val={ls} set={setLs} min={0} max={1.5} step={0.1} />
            <Slider label={T.width} val={lw} set={setLw} min={460} max={780} step={20} />
          </div>

          <div className="mb-6">
            <h4 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2">{T.font}</h4>
            <div className="flex gap-1.5 flex-wrap">
              {FONTS.map((f) => (
                <button key={f.label} onClick={() => setFont(f.css)} className={`px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border transition-colors ${font === f.css ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300' : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300'}`}>{f.label}</button>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2 flex items-center gap-1.5"><Palette size={12} /> {T.tint}</h4>
            <div className="flex gap-2 flex-wrap">
              {TINTS.map((tn) => (
                <button key={tn.name} title={tn.name} onClick={() => setTint(tn)} style={{ background: tn.bg }} className={`w-7 h-7 rounded-lg border-2 ${tint.bg === tn.bg ? 'border-indigo-500' : 'border-black/10'}`} />
              ))}
            </div>
          </div>
        </aside>

        {/* reader */}
        <div className="flex-1 overflow-y-auto flex justify-center px-6 py-8">
          {plain.trim() ? (
            <article
              ref={readerRef}
              style={{ maxWidth: lw, fontFamily: font, fontSize: fs, lineHeight: lh, letterSpacing: ls + 'px', background: tint.bg, color: tint.ink }}
              className="w-full rounded-2xl px-5 sm:px-8 md:px-12 py-8 md:py-10 shadow-sm transition-colors"
            >
              {paras.map((para, pi) => (
                <p
                  key={pi}
                  onClick={() => focus && setActivePara(pi)}
                  style={{ opacity: focus && pi !== activePara ? 0.26 : 1, borderLeft: focus && pi === activePara ? '4px solid #828fb0' : '4px solid transparent', paddingLeft: 12, marginLeft: -16 }}
                  className={`mb-5 transition-opacity ${focus ? 'cursor-pointer rounded' : ''}`}
                >
                  {para.map((tok, ti) => tok.word ? (
                    <span
                      key={ti}
                      data-wi={tok.wi}
                      onClick={(e) => { e.stopPropagation(); prime(); seekToWord(tok.wi); }}
                      style={spokenWi === tok.wi ? { background: '#b4bfd1', color: '#2b3242', borderRadius: 4 } : undefined}
                      className="px-[0.5px] cursor-pointer hover:bg-indigo-100/60"
                    >{bionic ? bionicWord(tok.w) : tok.w}</span>
                  ) : (
                    <span key={ti}>{tok.w}</span>
                  ))}
                </p>
              ))}
            </article>
          ) : (
            <div className="max-w-md text-center text-gray-400 dark:text-slate-500 mt-24 text-[15px] leading-relaxed">{T.empty}</div>
          )}
        </div>
      </div>

      {ruler && <div style={{ top: rulerY }} className="fixed left-0 right-0 h-11 bg-indigo-400/10 border-y border-indigo-400/30 pointer-events-none z-[5]" />}
    </div>
  );
};

export default FocusReader;
