import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, X, Send } from 'lucide-react';

/**
 * FEEDBACK WIDGET
 * A always-available launcher (bottom-right) opening a small panel where any reader can
 * say what worked, what broke, or what they wish CogniCard did.
 *
 * The copy explains WHY the feedback is wanted: this is built by one student who actually
 * ships changes based on what people report.
 *
 * Posts to the shared endpoint on the portfolio origin (this subdomain is CORS-allowlisted);
 * notes land in a private inbox and are never shown publicly.
 */

const ENDPOINT = 'https://elenaprojects.cc/api/feedback';

interface FeedbackWidgetProps {
  /** Matches the app's own language values. */
  lang: 'English' | 'Chinese';
}

const FeedbackWidget: React.FC<FeedbackWidgetProps> = ({ lang }) => {
  const zh = lang === 'Chinese';

  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Esc closes; focus the textarea when the panel opens.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    const id = window.setTimeout(() => areaRef.current?.focus(), 80);
    return () => { window.removeEventListener('keydown', onKey); window.clearTimeout(id); };
  }, [open]);

  const close = () => {
    setOpen(false);
    window.setTimeout(() => { if (sent) { setSent(false); setText(''); setName(''); } setError(''); }, 300);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (body.length < 2) { setError(zh ? '写一点点再发哦~' : 'A few more words first :)'); return; }

    setError('');
    setSending(true);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: body, name: name.trim(), tool: 'cognicard' }),
      });
      if (res.ok) {
        setSent(true);
        try { (window as any).gtag?.('event', 'feedback_sent', { app: 'cognicard' }); } catch { /* GA optional */ }
        window.setTimeout(() => close(), 2400);
      } else {
        let data: any = {};
        try { data = await res.json(); } catch { /* non-JSON error */ }
        setError(
          data.error === 'blocked'
            ? (zh ? '看起来像广告 / 联系方式，没发出去 🙈 换个说法说说想法?' : "That looked like a link or contact info, so it wasn't sent. Try rewording?")
            : (zh ? '发送失败了，稍后再试一次。' : 'Could not send — please try again.')
        );
      }
    } catch {
      setError(zh ? '网络不太好，稍后再试~' : 'Network hiccup — try again in a bit.');
    }
    setSending(false);
  };

  return (
    <>
      {/* ---------- launcher ---------- */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label={zh ? '打开反馈窗' : 'Open feedback'}
          className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-full px-4 py-3
                     bg-white dark:bg-[#020617] border border-gray-200 dark:border-slate-700
                     text-indigo-700 dark:text-indigo-300 text-sm font-medium
                     academic-shadow hover:border-indigo-400 dark:hover:border-indigo-500
                     hover:-translate-y-0.5 transition-all"
        >
          <MessageSquare size={16} />
          <span className="hidden sm:inline">{zh ? '想法' : 'Feedback'}</span>
        </button>
      )}

      {/* ---------- panel ---------- */}
      {open && (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center sm:justify-end p-3 sm:p-6">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={close} />

          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full sm:w-[400px] max-h-[88vh] overflow-y-auto rounded-2xl p-6 sm:p-7
                       bg-white dark:bg-[#020617] border border-gray-100 dark:border-slate-800 shadow-2xl"
          >
            <button
              onClick={close}
              aria-label={zh ? '关闭' : 'Close'}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors"
            >
              <X size={18} />
            </button>

            {sent ? (
              /* ---- thanks state ---- */
              <div className="py-10 text-center">
                <div className="text-3xl mb-3">💛</div>
                <p className="text-lg font-semibold text-[#2B3242] dark:text-slate-100">{zh ? '谢谢你的反馈' : 'Thank you'}</p>
                <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{zh ? '我会认真看的。' : 'I read every one.'}</p>
              </div>
            ) : (
              <form onSubmit={submit}>
                <h2 className="font-serif text-xl text-[#2B3242] dark:text-slate-100">
                  {zh ? '说说你的想法' : 'Tell me what you think'}
                </h2>

                {/* the ask — why their words matter */}
                <p className="mt-2 mb-5 text-[13.5px] leading-relaxed text-gray-500 dark:text-slate-400">
                  {zh
                    ? '这个小工具是我一个人做的，还在一直改。哪里不好用、哪里卡住了、想要什么功能——你的一句话我都会认真看，而且真的会照着改。'
                    : "I'm a student, and I built this on my own — it's still changing. If something felt confusing, broke, or you wish it did something else, tell me. I read every message, and I really do change things because of them."}
                </p>

                <textarea
                  ref={areaRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={600}
                  rows={4}
                  placeholder={zh ? '好用的地方、难用的地方、卡住的地方、想要的功能…' : "What worked, what didn't, what you wish it did…"}
                  className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-transparent px-4 py-3
                             text-sm leading-relaxed text-[#22272F] dark:text-slate-100
                             placeholder:text-gray-400 dark:placeholder:text-slate-500
                             focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                />

                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                  placeholder={zh ? '名字 / 昵称（可留空）' : 'Name or nickname (optional)'}
                  className="mt-2.5 w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-transparent px-4 py-2.5
                             text-sm text-[#22272F] dark:text-slate-100
                             placeholder:text-gray-400 dark:placeholder:text-slate-500
                             focus:outline-none focus:border-indigo-500 transition-colors"
                />

                <button
                  type="submit"
                  disabled={sending}
                  className="mt-4 w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50
                             py-3 text-sm font-semibold text-white flex items-center justify-center gap-2 transition-colors"
                >
                  <Send size={15} />
                  {sending ? (zh ? '发送中…' : 'Sending…') : (zh ? '发送' : 'Send')}
                </button>

                <p className="mt-3 text-center text-xs text-gray-400 dark:text-slate-500">
                  {zh ? '匿名也可以' : 'Anonymous is fine'}
                </p>

                {error && <p className="mt-2 text-center text-[13px] text-indigo-700 dark:text-indigo-300">{error}</p>}
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default FeedbackWidget;
