import React, { useEffect, useState } from 'react';
import { X, Loader2, Check, RotateCcw, Trophy, ChevronRight } from 'lucide-react';
import { generateQuiz, QuizQuestion, Concept } from './services/geminiService';

interface Props {
  text: string;
  concepts: Concept[];
  lang: 'English' | 'Chinese';
  onClose: () => void;
}

// Active-recall self-test generated from the current material.
const Quiz: React.FC<Props> = ({ text, concepts, lang, onClose }) => {
  const zh = lang === 'Chinese';
  const T = zh
    ? { title: '自测小测验', sub: '主动回忆，检验理解', loading: '正在出题…', err: '出题失败，请重试',
        retry: '重试', q: '第', of: '题 / 共', submit: '提交答案', next: '下一题', see: '查看结果',
        correct: '答对了', wrong: '答错了', why: '解析', score: '得分', again: '再来一次', done: '完成',
        empty: '没有可用于出题的内容。' }
    : { title: 'Self-Test Quiz', sub: 'Active recall checks understanding', loading: 'Writing questions…', err: 'Failed to build the quiz. Please retry.',
        retry: 'Retry', q: 'Question', of: 'of', submit: 'Submit', next: 'Next', see: 'See results',
        correct: 'Correct', wrong: 'Not quite', why: 'Why', score: 'Score', again: 'Try again', done: 'Done',
        empty: 'Nothing to build a quiz from yet.' };

  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]); // picked index per question
  const [finished, setFinished] = useState(false);

  const load = async () => {
    setLoading(true); setError(false); setQuestions(null);
    setIdx(0); setPicked(null); setAnswers([]); setFinished(false);
    try {
      const n = Math.max(3, Math.min(6, concepts.length || 5));
      const res = await generateQuiz(text, concepts, lang, n);
      setQuestions(res.questions);
    } catch (e) {
      console.error(e); setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const q = questions?.[idx];
  const answered = picked !== null;
  const score = questions ? answers.filter((a, i) => a === questions[i].answerIndex).length : 0;

  const submit = () => {
    if (picked === null) return;
    setAnswers((prev) => { const c = [...prev]; c[idx] = picked; return c; });
  };
  const next = () => {
    if (idx + 1 < (questions?.length || 0)) { setIdx(idx + 1); setPicked(null); }
    else setFinished(true);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-[#0b1220] rounded-3xl shadow-2xl">
        {/* header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-[#0b1220] z-10">
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 rounded-full">{T.title}</span>
          <span className="text-[12.5px] text-gray-400 dark:text-slate-500 hidden sm:block">{T.sub}</span>
          <button onClick={onClose} className="ml-auto p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:text-slate-500 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800"><X size={20} /></button>
        </div>

        <div className="p-6 md:p-8">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500 dark:text-slate-400">
              <Loader2 className="animate-spin mb-4 text-indigo-500" size={32} />
              <p className="text-sm">{T.loading}</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <p className="text-sm text-gray-500 dark:text-slate-400">{T.err}</p>
              <button onClick={load} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm"><RotateCcw size={16} /> {T.retry}</button>
            </div>
          )}

          {/* results */}
          {finished && questions && (
            <div className="flex flex-col items-center text-center py-6">
              <div className="w-20 h-20 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center mb-5"><Trophy className="text-indigo-500" size={38} /></div>
              <p className="text-[13px] uppercase tracking-widest text-gray-400 dark:text-slate-500 font-bold">{T.score}</p>
              <p className="text-5xl font-extrabold text-gray-900 dark:text-slate-100 my-2">{score}<span className="text-2xl text-gray-400 dark:text-slate-500"> / {questions.length}</span></p>
              <div className="w-full mt-6 space-y-3 text-left">
                {questions.map((qq, i) => {
                  const ok = answers[i] === qq.answerIndex;
                  return (
                    <div key={i} className={`p-4 rounded-xl border ${ok ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-900/10' : 'border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-900/10'}`}>
                      <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 mb-1">{i + 1}. {qq.question}</p>
                      <p className="text-[13px] text-gray-600 dark:text-slate-400"><b className="text-emerald-600 dark:text-emerald-400">{qq.options[qq.answerIndex]}</b> — {qq.explanation}</p>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-3 mt-7">
                <button onClick={load} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 font-bold text-sm"><RotateCcw size={16} /> {T.again}</button>
                <button onClick={onClose} className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm">{T.done}</button>
              </div>
            </div>
          )}

          {/* question */}
          {!loading && !error && !finished && q && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">{T.q} {idx + 1} {T.of} {questions!.length}</span>
              </div>
              <div className="h-1 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden mb-5">
                <div className="h-full bg-indigo-500 transition-[width] duration-300" style={{ width: `${((idx + (answered ? 1 : 0)) / questions!.length) * 100}%` }} />
              </div>

              <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100 mb-5 leading-snug">{q.question}</h3>

              <div className="space-y-3">
                {q.options.map((opt, i) => {
                  const isPicked = picked === i;
                  const isAnswer = i === q.answerIndex;
                  let cls = 'border-gray-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700';
                  if (answered) {
                    if (isAnswer) cls = 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20';
                    else if (isPicked) cls = 'border-rose-400 bg-rose-50 dark:bg-rose-900/20';
                    else cls = 'border-gray-200 dark:border-slate-800 opacity-60';
                  } else if (isPicked) {
                    cls = 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20';
                  }
                  return (
                    <button key={i} disabled={answered} onClick={() => setPicked(i)}
                      className={`w-full text-left flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${cls}`}>
                      <span className={`w-6 h-6 flex-shrink-0 rounded-full border-2 flex items-center justify-center text-[11px] font-bold ${answered && isAnswer ? 'border-emerald-500 bg-emerald-500 text-white' : isPicked ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-gray-300 dark:border-slate-600 text-gray-400'}`}>
                        {answered && isAnswer ? <Check size={13} /> : String.fromCharCode(65 + i)}
                      </span>
                      <span className="text-[15px] text-gray-800 dark:text-slate-200">{opt}</span>
                    </button>
                  );
                })}
              </div>

              {answered && (
                <div className={`mt-5 p-4 rounded-xl text-sm ${picked === q.answerIndex ? 'bg-emerald-50 dark:bg-emerald-900/15 text-emerald-800 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-900/15 text-rose-800 dark:text-rose-300'}`}>
                  <p className="font-bold mb-1">{picked === q.answerIndex ? `✓ ${T.correct}` : `✗ ${T.wrong}`}</p>
                  <p className="opacity-90"><b>{T.why}:</b> {q.explanation}</p>
                </div>
              )}

              <div className="flex justify-end mt-6">
                {!answered ? (
                  <button onClick={submit} disabled={picked === null} className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-slate-700 text-white font-bold text-sm transition-colors">{T.submit}</button>
                ) : (
                  <button onClick={next} className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm">
                    {idx + 1 < questions!.length ? T.next : T.see} <ChevronRight size={16} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Quiz;
