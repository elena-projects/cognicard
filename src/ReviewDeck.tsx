import React, { useEffect, useMemo, useState } from 'react';
import { X, RotateCcw, Layers, Sparkles, Trash2 } from 'lucide-react';
import { Card, Rating, loadDeck, dueCount, schedule, upsertCard, saveDeck } from './services/deck';

interface Props {
  lang: 'English' | 'Chinese';
  onClose: () => void;
}

// Spaced-repetition review session over the saved flashcard deck.
const ReviewDeck: React.FC<Props> = ({ lang, onClose }) => {
  const zh = lang === 'Chinese';
  const T = zh
    ? { title: '记忆卡复习', sub: '间隔重复，记得更牢', show: '显示答案', total: '卡片总数', due: '待复习',
        again: '忘记', hard: '困难', good: '记得', easy: '简单', doneTitle: '本轮复习完成', reviewed: '已复习',
        empty: '暂无待复习的卡片。', emptyHint: '在“提取见解”后点“加入复习”把概念存成记忆卡。',
        close: '关闭', backToDue: '没有到期的卡片了，明天再来～', clear: '清空卡组', confirmClear: '确定清空所有记忆卡？此操作不可撤销。' }
    : { title: 'Review Deck', sub: 'Spaced repetition makes it stick', show: 'Show answer', total: 'Cards', due: 'Due',
        again: 'Forgot', hard: 'Hard', good: 'Good', easy: 'Easy', doneTitle: 'Session complete', reviewed: 'Reviewed',
        empty: 'No cards to review.', emptyHint: 'After “Extract Insights”, tap “Add to review” to save concepts as cards.',
        close: 'Close', backToDue: 'Nothing due — come back tomorrow!', clear: 'Clear deck', confirmClear: 'Clear the whole deck? This cannot be undone.' };

  const [deck, setDeck] = useState<Card[]>(() => loadDeck());
  const now = useMemo(() => Date.now(), []);
  const [queue, setQueue] = useState<Card[]>(() => loadDeck().filter((c) => c.dueTs <= Date.now()));
  const [pos, setPos] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (!current) return;
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); setRevealed(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const current = queue[pos];

  const rate = (rating: Rating) => {
    if (!current) return;
    const updated = schedule(current, rating);
    upsertCard(updated);
    setDeck(loadDeck());
    setReviewed((r) => r + 1);
    setRevealed(false);
    if (rating === 'again') {
      // drop the current card and requeue it at the end; pos stays, so the next
      // card slides into this slot (or the requeued card itself if it was last).
      setQueue((q) => [...q.slice(0, pos), ...q.slice(pos + 1), updated]);
    } else {
      setPos((p) => p + 1);
    }
  };

  const totalDue = dueCount(deck, now);
  const sessionDone = queue.length === 0 || (pos >= queue.length);

  const clearDeck = () => {
    if (!window.confirm(T.confirmClear)) return;
    saveDeck([]);
    setDeck([]); setQueue([]); setPos(0);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xl bg-white dark:bg-[#0b1220] rounded-3xl shadow-2xl overflow-hidden">
        {/* header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-slate-800">
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 rounded-full">{T.title}</span>
          <span className="text-[12.5px] text-gray-400 dark:text-slate-500 hidden sm:block">{T.sub}</span>
          <button onClick={onClose} className="ml-auto p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:text-slate-500 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800"><X size={20} /></button>
        </div>

        {/* stats */}
        <div className="flex items-center gap-6 px-6 py-3 border-b border-gray-50 dark:border-slate-800/50 text-[13px]">
          <span className="flex items-center gap-1.5 text-gray-500 dark:text-slate-400"><Layers size={14} /> {T.total}: <b className="text-gray-800 dark:text-slate-200">{deck.length}</b></span>
          <span className="flex items-center gap-1.5 text-gray-500 dark:text-slate-400"><Sparkles size={14} /> {T.due}: <b className="text-indigo-600 dark:text-indigo-400">{totalDue}</b></span>
          {deck.length > 0 && <button onClick={clearDeck} className="ml-auto flex items-center gap-1 text-[11px] text-gray-400 hover:text-rose-500 transition-colors"><Trash2 size={12} /> {T.clear}</button>}
        </div>

        <div className="p-6 md:p-8">
          {/* empty deck */}
          {deck.length === 0 && (
            <div className="text-center py-14">
              <p className="text-gray-500 dark:text-slate-300 font-medium">{T.empty}</p>
              <p className="text-[13px] text-gray-400 dark:text-slate-500 mt-2 leading-relaxed">{T.emptyHint}</p>
              <button onClick={onClose} className="mt-6 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm">{T.close}</button>
            </div>
          )}

          {/* nothing due but deck exists */}
          {deck.length > 0 && queue.length === 0 && (
            <div className="text-center py-14">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-4"><Sparkles className="text-emerald-500" size={30} /></div>
              <p className="text-gray-600 dark:text-slate-300">{T.backToDue}</p>
              <button onClick={onClose} className="mt-6 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm">{T.close}</button>
            </div>
          )}

          {/* session complete */}
          {deck.length > 0 && queue.length > 0 && sessionDone && (
            <div className="text-center py-14">
              <div className="w-16 h-16 mx-auto rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center mb-4"><RotateCcw className="text-indigo-500" size={30} /></div>
              <p className="text-lg font-bold text-gray-800 dark:text-slate-100">{T.doneTitle}</p>
              <p className="text-[13px] text-gray-400 dark:text-slate-500 mt-1">{T.reviewed}: {reviewed}</p>
              <button onClick={onClose} className="mt-6 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm">{T.close}</button>
            </div>
          )}

          {/* active card */}
          {current && !sessionDone && (
            <div>
              <div className="h-1 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden mb-6">
                <div className="h-full bg-indigo-500 transition-[width] duration-300" style={{ width: `${(pos / queue.length) * 100}%` }} />
              </div>

              <div className="min-h-[200px] rounded-2xl border border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-900/40 p-8 flex flex-col items-center justify-center text-center">
                <p className="text-[11px] uppercase tracking-widest text-indigo-500 dark:text-indigo-400 font-bold mb-3">{zh ? '术语' : 'Term'}</p>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-slate-100">{current.term}</h3>
                {revealed && (
                  <>
                    <div className="w-16 h-px bg-gray-200 dark:bg-slate-700 my-5" />
                    <p className="text-[15px] text-gray-700 dark:text-slate-300 leading-relaxed font-serif">{current.definition}</p>
                  </>
                )}
              </div>

              {!revealed ? (
                <button onClick={() => setRevealed(true)} className="w-full mt-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-colors">{T.show}</button>
              ) : (
                <div className="grid grid-cols-4 gap-2 mt-6">
                  <button onClick={() => rate('again')} className="py-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 font-bold text-[13px] hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors">{T.again}</button>
                  <button onClick={() => rate('hard')} className="py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 font-bold text-[13px] hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors">{T.hard}</button>
                  <button onClick={() => rate('good')} className="py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 font-bold text-[13px] hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">{T.good}</button>
                  <button onClick={() => rate('easy')} className="py-3 rounded-xl bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 font-bold text-[13px] hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors">{T.easy}</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReviewDeck;
