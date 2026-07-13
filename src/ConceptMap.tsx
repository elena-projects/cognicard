import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Loader2, Waypoints, Sparkles, ChevronLeft, ChevronRight, Lightbulb, Target, Brain, Plus, Minus, Maximize2, Download, MessageSquare, Send } from 'lucide-react';
import { Concept, ConceptMapData, analyzeConceptMap, askDocumentQuestion } from './services/geminiService';

/**
 * ConceptMap — a NotebookLM-style, zoomable hierarchical mind map of the material.
 *
 *   central theme → themes (groups) → concepts → key sub-points
 *
 * The web view is a radial tree you can pan/zoom, expand/collapse, and export as a PNG.
 * A "focus path" view is an ADHD-friendly, one-step-at-a-time linear study path.
 * An AI assistant is available as a floating window, grounded in this material.
 */

interface Props {
  concepts: Concept[];
  text: string;
  lang: 'English' | 'Chinese';
  isDark: boolean;
  onClose: () => void;
}

const GROUP_COLORS = ['#828fb0', '#a98fa0', '#8fa694', '#bfa98f'];
const GROUP_SOFT = ['#eef1f6', '#f4eef1', '#eef3ef', '#f5f1ea'];
const ROOT_COLOR = '#6b7896';
const INK = '#3b4256';

const VBW = 960, VBH = 740, CX = VBW / 2, CY = VBH / 2;
const RINGS = [0, 165, 310, 420];

function wrapLabel(s: string, maxChars: number, maxLines = 3): string[] {
  const isCJK = /[　-鿿가-힯]/.test(s);
  const lines: string[] = [];
  if (isCJK) {
    for (let i = 0; i < s.length; i += maxChars) lines.push(s.slice(i, i + maxChars));
  } else {
    let line = '';
    for (const w of s.split(/\s+/)) {
      if ((line + ' ' + w).trim().length > maxChars) { if (line) lines.push(line); line = w; }
      else line = (line + ' ' + w).trim();
    }
    if (line) lines.push(line);
  }
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].slice(0, maxChars - 1) + '…'; }
  return lines;
}

type Kind = 'root' | 'group' | 'concept' | 'aspect';
interface TNode { id: string; label: string; kind: Kind; gi: number; def?: string; children: TNode[]; angle?: number; x?: number; y?: number; }

const ConceptMap: React.FC<Props> = ({ concepts, text, lang, onClose }) => {
  const zh = lang === 'Chinese';
  const T = zh
    ? { title: '概念图谱', web: '关系图', focus: '专注路径', adhd: 'ADHD 友好', loading: '正在梳理概念之间的联系…',
        startHere: '先掌握', connections: '关联', noConn: '与其它概念暂无直接关联。', clickHint: '点主题/概念可展开或收起；点概念看它的联系。',
        legend: '主题分组', hintExpand: '（点开可看要点）', step: '第', of: '/', total: '步',
        pathIntro: '按这个顺序学，最省力：一次只看一个，弄懂了再往下。', whyNow: '为什么现在学这个', prev: '上一个', next: '下一个',
        done: '你已经走完整条学习路径 🎉', restart: '重新开始', error: '生成图谱失败，请重试。', tapConcept: '当前概念',
        exportImg: '导出图片', fit: '适应窗口', ai: 'AI 助手', aiHint: '关于这份材料，问我任何问题', aiPh: '问一个关于此材料的问题…', send: '发送', thinking: '思考中…' }
    : { title: 'Concept Map', web: 'Map', focus: 'Focus path', adhd: 'ADHD-friendly', loading: 'Mapping how the concepts connect…',
        startHere: 'Master first', connections: 'Connections', noConn: 'No direct links to other concepts yet.', clickHint: 'Click a theme/concept to expand or collapse; click a concept for its links.',
        legend: 'Themes', hintExpand: '(click to reveal key points)', step: 'Step', of: '/', total: '',
        pathIntro: 'Learn in this order — one at a time. Understand it, then move on.', whyNow: 'Why learn this now', prev: 'Back', next: 'Next',
        done: "You've walked the whole learning path 🎉", restart: 'Start over', error: 'Could not build the map. Please try again.', tapConcept: 'Current concept',
        exportImg: 'Export PNG', fit: 'Fit', ai: 'AI assistant', aiHint: 'Ask me anything about this material', aiPh: 'Ask a question about this material…', send: 'Send', thinking: 'Thinking…' };

  const [data, setData] = useState<ConceptMapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState<'web' | 'focus'>('web');
  const [active, setActive] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [animReady, setAnimReady] = useState(false); // node transitions off during the initial collapse (avoids a mass-animation jank right when the map generates)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // zoom / pan
  const [view, setView] = useState({ s: 1, tx: 0, ty: 0 });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const treeRef = useRef<SVGGElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const viewRef = useRef(view);                 // always-current view (mirrors state; ahead of it during a drag)
  const gRef = useRef<SVGGElement | null>(null); // the pan/zoom <g>; transform is set imperatively while dragging
  // Update the transform. During a drag we set it directly on the DOM (no React re-render → smooth on phones);
  // `commit` writes it back to state so the rest of the component stays in sync.
  const applyView = (v: { s: number; tx: number; ty: number }, commit: boolean) => {
    viewRef.current = v;
    gRef.current?.setAttribute('transform', `translate(${v.tx},${v.ty}) scale(${v.s})`);
    if (commit) setView(v);
  };

  // AI assistant
  const [aiOpen, setAiOpen] = useState(false);
  const [msgs, setMsgs] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiSending, setAiSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const defByTerm = useMemo(() => { const m = new Map<string, string>(); concepts.forEach((c) => m.set(c.term, c.definition)); return m; }, [concepts]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try { const d = await analyzeConceptMap(concepts, text, lang); if (alive) { setData(d); setLoading(false); (window as any).gtag?.('event', 'cognicard_concept_map'); } }
      catch (e) { console.error(e); if (alive) { setErr(String((e as any)?.message || e)); setLoading(false); } }
    })();
    return () => { alive = false; };
  }, [concepts, text, lang]);

  // Build the tree (concept aspects start collapsed to keep the first view clean).
  const root: TNode | null = useMemo(() => {
    if (!data) return null;
    const detailByTerm = new Map<string, string[]>();
    data.details?.forEach((d) => detailByTerm.set(d.term, d.points));
    const seen = new Set<string>();
    const groups = data.groups.map((g, gi) => ({
      id: 'g:' + g.label + gi, label: g.label, kind: 'group' as Kind, gi,
      children: g.terms.filter((t) => defByTerm.has(t) && !seen.has(t) && (seen.add(t), true)).map((term) => ({
        id: 'c:' + term, label: term, kind: 'concept' as Kind, gi, def: defByTerm.get(term),
        children: (detailByTerm.get(term) || []).map((p, i) => ({ id: 'a:' + term + i, label: p, kind: 'aspect' as Kind, gi, children: [] as TNode[] })),
      })),
    }));
    // concepts the model forgot to group
    concepts.forEach((c) => { if (!seen.has(c.term)) { seen.add(c.term); groups[0]?.children.push({ id: 'c:' + c.term, label: c.term, kind: 'concept', gi: 0, def: c.definition, children: (detailByTerm.get(c.term) || []).map((p, i) => ({ id: 'a:' + c.term + i, label: p, kind: 'aspect', gi: 0, children: [] })) }); } });
    return { id: 'root', label: data.central, kind: 'root', gi: -1, children: groups };
  }, [data, defByTerm, concepts]);

  // default-collapse every concept once the tree exists
  useEffect(() => {
    if (!root) return;
    const c = new Set<string>();
    root.children.forEach((g) => g.children.forEach((con) => { if (con.children.length) c.add(con.id); }));
    setAnimReady(false);        // snap the initial collapse into place (no per-node animation → smoother generation)
    setCollapsed(c);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setAnimReady(true))); // re-enable animation once settled
    return () => cancelAnimationFrame(id);
  }, [root]);

  // Radial layout — angular span per subtree ∝ its (visible) leaf count.
  const { nodes, edges, bbox } = useMemo(() => {
    const out: TNode[] = [];
    const eds: { a: TNode; b: TNode }[] = [];
    if (!root) return { nodes: out, edges: eds, bbox: { x: 0, y: 0, w: VBW, h: VBH } };
    const leaves = (n: TNode): number => (collapsed.has(n.id) || !n.children.length) ? 1 : n.children.reduce((s, c) => s + leaves(c), 0);
    const polar = (r: number, a: number) => ({ x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) });
    const place = (n: TNode, a0: number, a1: number, depth: number) => {
      const angle = (a0 + a1) / 2; n.angle = angle;
      const p = polar(RINGS[Math.min(depth, RINGS.length - 1)], angle); n.x = p.x; n.y = p.y;
      out.push(n);
      if (collapsed.has(n.id) || !n.children.length) return;
      const total = n.children.reduce((s, c) => s + leaves(c), 0) || 1;
      let a = a0;
      for (const c of n.children) { const span = (leaves(c) / total) * (a1 - a0); eds.push({ a: n, b: c }); place(c, a, a + span, depth + 1); a += span; }
    };
    place(root, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2, 0);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    out.forEach((n) => { minX = Math.min(minX, n.x!); maxX = Math.max(maxX, n.x!); minY = Math.min(minY, n.y!); maxY = Math.max(maxY, n.y!); });
    const P = 96;
    return { nodes: out, edges: eds, bbox: { x: minX - P, y: minY - P, w: (maxX - minX) + 2 * P, h: (maxY - minY) + 2 * P } };
  }, [root, collapsed]);

  const angleOf = (n: TNode) => (n.kind === 'root' ? (n.children[0]?.angle ?? 0) : n.angle!);
  const rOf = (n: TNode) => Math.hypot(n.x! - CX, n.y! - CY);
  const edgePath = (a: TNode, b: TNode) => {
    const midR = (rOf(a) + rOf(b)) / 2;
    const c1 = { x: CX + midR * Math.cos(angleOf(a)), y: CY + midR * Math.sin(angleOf(a)) };
    const c2 = { x: CX + midR * Math.cos(b.angle!), y: CY + midR * Math.sin(b.angle!) };
    return `M${a.x},${a.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`;
  };

  // fit the whole graph into the viewport
  const fit = () => {
    const s = Math.min(VBW / bbox.w, VBH / bbox.h) * 0.94;
    applyView({ s, tx: VBW / 2 - s * (bbox.x + bbox.w / 2), ty: VBH / 2 - s * (bbox.y + bbox.h / 2) }, true);
  };
  useEffect(() => { if (nodes.length) fit(); /* refit when the tree shape changes */ // eslint-disable-next-line
  }, [bbox.x, bbox.y, bbox.w, bbox.h]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, aiSending]);

  // ---- pan / zoom handlers ----
  const toVB = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * VBW, y: ((clientY - r.top) / r.height) * VBH };
  };
  const zoomAt = (vx: number, vy: number, factor: number) => {
    const v = viewRef.current;
    const s = Math.max(0.35, Math.min(2.4, v.s * factor));
    const gx = (vx - v.tx) / v.s, gy = (vy - v.ty) / v.s;
    applyView({ s, tx: vx - gx * s, ty: vy - gy * s }, true);
  };
  const onWheel = (e: React.WheelEvent) => { e.preventDefault(); const p = toVB(e.clientX, e.clientY); zoomAt(p.x, p.y, e.deltaY < 0 ? 1.12 : 0.89); };
  const onPointerDown = (e: React.PointerEvent) => { (e.target as Element).setPointerCapture?.(e.pointerId); dragRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false }; };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current; if (!d) return;
    const r = svgRef.current!.getBoundingClientRect();
    const dx = ((e.clientX - d.x) / r.width) * VBW, dy = ((e.clientY - d.y) / r.height) * VBH;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true;
    applyView({ ...viewRef.current, tx: d.tx + dx, ty: d.ty + dy }, false); // imperative: no re-render mid-drag
  };
  const onPointerUp = () => { if (dragRef.current?.moved) setView(viewRef.current); dragRef.current = null; };
  const clickNode = (n: TNode) => {
    if (dragRef.current?.moved) return;
    if (n.kind === 'group') { toggle(n.id); return; }
    if (n.kind === 'concept') { setActive(active === n.label ? null : n.label); if (n.children.length) toggle(n.id); return; }
  };
  const toggle = (id: string) => setCollapsed((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const exportPNG = () => {
    const treeEl = treeRef.current; if (!treeEl) return;
    const inner = new XMLSerializer().serializeToString(treeEl);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${bbox.w}" height="${bbox.h}" viewBox="${bbox.x} ${bbox.y} ${bbox.w} ${bbox.h}" font-family="Inter, system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif"><rect x="${bbox.x}" y="${bbox.y}" width="${bbox.w}" height="${bbox.h}" fill="#ffffff"/>${inner}</svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      const scale = 2, canvas = document.createElement('canvas');
      canvas.width = bbox.w * scale; canvas.height = bbox.h * scale;
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'concept-map.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); });
    };
    img.src = url;
  };

  const sendAI = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = aiInput.trim(); if (!q || aiSending) return;
    setAiInput(''); setMsgs((m) => [...m, { role: 'user', content: q }]); setAiSending(true);
    try { const ans = await askDocumentQuestion(text, null, concepts, null, msgs, q, lang); setMsgs((m) => [...m, { role: 'assistant', content: ans }]); }
    catch { setMsgs((m) => [...m, { role: 'assistant', content: zh ? '抱歉，出错了，请再试一次。' : 'Sorry, something went wrong. Please try again.' }]); }
    finally { setAiSending(false); }
  };

  const links = (data?.links || []).filter((l) => defByTerm.has(l.from) && defByTerm.has(l.to));
  const activeLinks = active ? links.filter((l) => l.from === active || l.to === active) : [];

  // ---------- header ----------
  const Header = (
    <div className="flex items-center gap-2.5 px-4 md:px-5 py-3 border-b border-gray-100 dark:border-slate-800 bg-white dark:bg-[#0b1220]">
      <span className="font-extrabold text-gray-900 dark:text-slate-100 shrink-0">Cogni<span className="text-indigo-600 dark:text-indigo-400">Card</span></span>
      <span className="shrink-0 hidden sm:flex text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 rounded-full items-center gap-1.5"><Waypoints size={12} /> {T.title}</span>
      <div className="ml-auto shrink-0 flex items-center bg-gray-100 dark:bg-slate-800 p-1 rounded-xl">
        <button onClick={() => setMode('web')} className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[12.5px] font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 ${mode === 'web' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm' : 'text-gray-500 dark:text-slate-400'}`}><Waypoints size={14} /> {T.web}</button>
        <button onClick={() => setMode('focus')} title={T.adhd} className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[12.5px] font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 ${mode === 'focus' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm' : 'text-gray-500 dark:text-slate-400'}`}><Brain size={14} /> {T.focus}</button>
      </div>
      <button onClick={onClose} className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:text-slate-500 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800"><X size={20} /></button>
    </div>
  );

  if (loading || err) {
    return (
      <div className="fixed inset-0 z-[60] bg-white dark:bg-[#0b1220] flex flex-col">
        {Header}
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          {err ? <p className="text-red-500 dark:text-red-400 text-sm max-w-sm">{T.error}<br /><span className="text-gray-400 text-[11px]">{err.slice(0, 90)}</span></p>
               : <><Loader2 size={30} className="animate-spin text-indigo-500 mb-4" /><p className="text-gray-500 dark:text-slate-400 text-sm animate-pulse">{T.loading}</p></>}
        </div>
      </div>
    );
  }
  const d = data!;

  // ---------- learning analysis ----------
  const Analysis = (
    <div className="rounded-2xl border border-indigo-100 dark:border-slate-800 bg-indigo-50/50 dark:bg-slate-800/40 p-4">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5"><Target size={13} /> {T.startHere}</span>
        {d.learning.hubs.map((h) => (
          <button key={h} onClick={() => { setActive(h); const id = 'c:' + h; setCollapsed((c) => { const n = new Set(c); n.delete(id); return n; }); }} className="text-[12.5px] font-bold text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-700 border border-indigo-200 dark:border-slate-600 px-2.5 py-1 rounded-lg hover:bg-indigo-100 dark:hover:bg-slate-600 transition-colors">{h}</button>
        ))}
      </div>
      <p className="text-[13.5px] leading-relaxed text-gray-700 dark:text-slate-300 flex gap-2"><Lightbulb size={15} className="shrink-0 mt-0.5 text-indigo-400" />{d.learning.insight}</p>
    </div>
  );

  // ---------- floating AI assistant ----------
  const AIWidget = (
    <>
      {!aiOpen && (
        <button onClick={() => setAiOpen(true)} className="absolute bottom-5 right-5 z-20 flex items-center gap-2 pl-4 pr-5 py-3 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-lg shadow-indigo-500/30 transition-colors">
          <MessageSquare size={17} /> {T.ai}
        </button>
      )}
      {aiOpen && (
        <div className="absolute bottom-5 right-5 z-20 w-[min(92vw,380px)] h-[min(70vh,520px)] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-700 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-slate-800 bg-indigo-50/60 dark:bg-slate-800/50">
            <MessageSquare size={16} className="text-indigo-600 dark:text-indigo-400" />
            <span className="font-bold text-sm text-gray-800 dark:text-slate-100">{T.ai}</span>
            <button onClick={() => setAiOpen(false)} className="ml-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800"><X size={16} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/40 dark:bg-slate-900/40">
            {msgs.length === 0 && <p className="text-[13px] text-gray-400 dark:text-slate-500 text-center mt-6 px-4 leading-relaxed">{T.aiHint}</p>}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-2xl text-[13.5px] leading-relaxed ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border border-gray-100 dark:border-slate-700 rounded-tl-sm font-serif'}`}>{m.content}</div>
              </div>
            ))}
            {aiSending && <div className="flex justify-start"><div className="bg-white dark:bg-slate-800 p-3 rounded-2xl border border-gray-100 dark:border-slate-700"><Loader2 size={15} className="animate-spin text-indigo-500" /></div></div>}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={sendAI} className="p-3 border-t border-gray-100 dark:border-slate-800 flex gap-2">
            <input value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder={T.aiPh} className="flex-1 px-3 py-2 rounded-xl bg-gray-100 dark:bg-slate-800 text-[13.5px] text-gray-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-900" />
            <button type="submit" disabled={!aiInput.trim() || aiSending} className="p-2.5 rounded-xl bg-indigo-600 text-white disabled:opacity-40 hover:bg-indigo-700 transition-colors"><Send size={16} /></button>
          </form>
        </div>
      )}
    </>
  );

  // ================= WEB (mind-map) VIEW =================
  if (mode === 'web') {
    const nodeFill = (n: TNode) => n.kind === 'root' ? ROOT_COLOR : n.kind === 'group' ? GROUP_COLORS[n.gi % 4] : n.kind === 'concept' ? (active === n.label ? GROUP_COLORS[n.gi % 4] : GROUP_SOFT[n.gi % 4]) : 'transparent';
    return (
      <div className="fixed inset-0 z-[60] bg-white dark:bg-[#0b1220] flex flex-col">
        {Header}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* map canvas */}
          <div className="relative flex-1 min-h-0 bg-gradient-to-b from-white to-indigo-50/40 dark:from-[#0b1220] dark:to-slate-900/30">
            <svg ref={svgRef} viewBox={`0 0 ${VBW} ${VBH}`} className="w-full h-full touch-none" style={{ cursor: dragRef.current ? 'grabbing' : 'grab' }}
              onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
              onClick={() => { if (!dragRef.current?.moved) setActive(null); }}>
              <g ref={gRef} transform={`translate(${view.tx},${view.ty}) scale(${view.s})`}>
                <g ref={treeRef}>
                  {/* edges */}
                  {edges.map((e, i) => {
                    const dim = active && !(e.b.kind === 'concept' && e.b.label === active) && !(e.a.kind === 'concept' && e.a.label === active) && e.a.kind !== 'root';
                    return <path key={'e' + i} d={edgePath(e.a, e.b)} fill="none" stroke={GROUP_COLORS[e.b.gi % 4]}
                      strokeWidth={e.b.kind === 'group' ? 2.4 : e.b.kind === 'concept' ? 1.7 : 1} strokeOpacity={dim ? 0.18 : e.b.kind === 'aspect' ? 0.5 : 0.7} strokeLinecap="round" />;
                  })}
                  {/* cross-concept relationship (only for the active concept) */}
                  {active && activeLinks.map((l, i) => {
                    const A = nodes.find((n) => n.kind === 'concept' && n.label === l.from), B = nodes.find((n) => n.kind === 'concept' && n.label === l.to);
                    if (!A || !B) return null;
                    const mx = (A.x! + B.x!) / 2, my = (A.y! + B.y!) / 2;
                    return (
                      <g key={'rl' + i}>
                        <path d={`M${A.x},${A.y} Q${mx + (my - CY) * 0.1},${my - (mx - CX) * 0.1} ${B.x},${B.y}`} fill="none" stroke="#6b7896" strokeWidth={1.6} strokeDasharray="5 4" opacity={0.85} />
                        <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle" fill="#525c74" style={{ fontSize: 11, fontWeight: 600, paintOrder: 'stroke', stroke: '#fff', strokeWidth: 4 }}>{l.relation}</text>
                      </g>
                    );
                  })}
                  {/* nodes */}
                  {nodes.map((n) => {
                    if (n.kind === 'aspect') {
                      const lines = wrapLabel(n.label, 12, 2);
                      return (
                        <g key={n.id} transform={`translate(${n.x},${n.y})`} style={{ transition: animReady ? 'transform .4s ease' : 'none' }}>
                          <circle cx={-2} cy={0} r={3} fill={GROUP_COLORS[n.gi % 4]} />
                          {lines.map((ln, i) => <text key={i} x={8} y={(i - (lines.length - 1) / 2) * 13} dominantBaseline="middle" fill="#6b7896" style={{ fontSize: 11 }}>{ln}</text>)}
                        </g>
                      );
                    }
                    const isRoot = n.kind === 'root', isGroup = n.kind === 'group';
                    const maxCh = isRoot ? 9 : 8;
                    const lines = wrapLabel(n.label, maxCh);
                    const w = isRoot ? 150 : isGroup ? 128 : 128;
                    const h = 20 + lines.length * (isRoot ? 17 : 15);
                    const on = n.kind === 'concept' && active === n.label;
                    const dim = active != null && n.kind === 'concept' && !on && !activeLinks.some((l) => l.from === n.label || l.to === n.label);
                    const collapsedHasKids = (isGroup || n.kind === 'concept') && n.children.length > 0;
                    return (
                      <g key={n.id} transform={`translate(${n.x},${n.y})`} style={{ transition: animReady ? 'transform .4s ease' : 'none', cursor: isRoot ? 'default' : 'pointer' }} opacity={dim ? 0.3 : 1}
                        onClick={(ev) => { ev.stopPropagation(); clickNode(n); }}>
                        {isRoot
                          ? <ellipse cx={0} cy={0} rx={w / 2} ry={h / 2 + 6} fill={ROOT_COLOR} />
                          : <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={isGroup ? 11 : 13} fill={nodeFill(n)} stroke={GROUP_COLORS[n.gi % 4]} strokeWidth={on || isGroup ? 2.2 : 1.4} />}
                        {lines.map((ln, i) => (
                          <text key={i} x={0} y={(i - (lines.length - 1) / 2) * (isRoot ? 17 : 15)} textAnchor="middle" dominantBaseline="middle"
                            style={{ fontSize: isRoot ? 14 : 12.5, fontWeight: isRoot || isGroup ? 800 : 700 }} fill={isRoot || isGroup || on ? '#fff' : INK}>{ln}</text>
                        ))}
                        {collapsedHasKids && collapsed.has(n.id) && (
                          <circle cx={w / 2 - 2} cy={0} r={7} fill="#fff" stroke={GROUP_COLORS[n.gi % 4]} strokeWidth={1.4} />
                        )}
                        {collapsedHasKids && collapsed.has(n.id) && (
                          <text x={w / 2 - 2} y={0.5} textAnchor="middle" dominantBaseline="middle" fill={GROUP_COLORS[n.gi % 4]} style={{ fontSize: 11, fontWeight: 900 }}>+</text>
                        )}
                      </g>
                    );
                  })}
                </g>
              </g>
            </svg>

            {/* zoom / export controls */}
            <div className="absolute top-3 right-3 flex flex-col gap-1.5">
              <button onClick={() => zoomAt(VBW / 2, VBH / 2, 1.2)} title="Zoom in" className="w-9 h-9 rounded-lg bg-white/90 dark:bg-slate-800/90 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 shadow-sm flex items-center justify-center hover:text-indigo-600"><Plus size={16} /></button>
              <button onClick={() => zoomAt(VBW / 2, VBH / 2, 0.83)} title="Zoom out" className="w-9 h-9 rounded-lg bg-white/90 dark:bg-slate-800/90 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 shadow-sm flex items-center justify-center hover:text-indigo-600"><Minus size={16} /></button>
              <button onClick={fit} title={T.fit} className="w-9 h-9 rounded-lg bg-white/90 dark:bg-slate-800/90 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 shadow-sm flex items-center justify-center hover:text-indigo-600"><Maximize2 size={15} /></button>
            </div>
            <button onClick={exportPNG} className="absolute top-3 left-3 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/90 dark:bg-slate-800/90 border border-gray-200 dark:border-slate-700 text-[12.5px] font-bold text-gray-600 dark:text-slate-300 shadow-sm hover:text-indigo-600 transition-colors"><Download size={14} /> {T.exportImg}</button>
            <p className="absolute bottom-3 left-3 text-[11px] text-gray-400 dark:text-slate-600 max-w-[60%] leading-snug pointer-events-none">{T.clickHint}</p>

            {AIWidget}
          </div>

          {/* side rail: analysis + active concept */}
          <div className="w-full md:w-[320px] shrink-0 border-t md:border-t-0 md:border-l border-gray-100 dark:border-slate-800 overflow-y-auto p-4 space-y-4 bg-white dark:bg-[#0b1220] max-h-[42vh] md:max-h-none">
            {Analysis}
            {active ? (
              <div className="rounded-2xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-4 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{T.tapConcept}</span>
                <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 mt-1 mb-2">{active}</h3>
                <p className="text-[13.5px] font-serif text-gray-700 dark:text-slate-300 leading-relaxed border-l-2 border-indigo-200 dark:border-indigo-800 pl-3 mb-3">{defByTerm.get(active)}</p>
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{T.connections}</span>
                <ul className="mt-2 space-y-2">
                  {activeLinks.length === 0 && <li className="text-[13px] text-gray-400">{T.noConn}</li>}
                  {activeLinks.map((l, i) => {
                    const other = l.from === active ? l.to : l.from;
                    return <li key={i} className="text-[13px] text-gray-600 dark:text-slate-300"><span className="text-indigo-500 dark:text-indigo-400 italic">{l.from === active ? `→ ${l.relation} →` : `← ${l.relation} ←`}</span>{' '}<button onClick={() => setActive(other)} className="font-bold underline decoration-indigo-200 hover:text-indigo-600">{other}</button></li>;
                  })}
                </ul>
              </div>
            ) : (
              <div className="rounded-2xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-4 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{T.legend}</span>
                <ul className="mt-2 space-y-2">
                  {d.groups.map((g, gi) => <li key={gi} className="flex items-center gap-2 text-[13px] text-gray-700 dark:text-slate-300"><span className="w-3 h-3 rounded-full shrink-0" style={{ background: GROUP_COLORS[gi % 4] }} /><span className="font-semibold">{g.label}</span></li>)}
                </ul>
                <p className="text-[12px] text-gray-400 mt-3 leading-relaxed">{T.hintExpand}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ================= FOCUS / ADHD VIEW =================
  const path = d.learning.path.filter((s) => defByTerm.has(s.term));
  const total = path.length;
  const done = step >= total;
  const cur = !done ? path[step] : null;
  return (
    <div className="fixed inset-0 z-[60] bg-[#fbfcfe] dark:bg-[#0b1220] flex flex-col">
      {Header}
      <div className="flex-1 overflow-y-auto relative">
        <div className="max-w-xl mx-auto px-5 py-6 md:py-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-2 rounded-full bg-indigo-100 dark:bg-slate-800 overflow-hidden"><div className="h-full bg-indigo-400 transition-[width] duration-300" style={{ width: `${(Math.min(step, total) / total) * 100}%` }} /></div>
            <span className="text-[12px] font-bold text-gray-400 whitespace-nowrap">{zh ? `${T.step} ${Math.min(step + 1, total)} ${T.of} ${total} ${T.total}` : `${T.step} ${Math.min(step + 1, total)} ${T.of} ${total}`}</span>
          </div>
          {!done && <p className="text-[13px] text-gray-400 dark:text-slate-500 mb-4 leading-relaxed">{T.pathIntro}</p>}
          {cur ? (
            <div className="rounded-3xl border-2 border-indigo-200 dark:border-indigo-900/50 bg-white dark:bg-slate-900/60 p-7 md:p-9 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-8 h-8 rounded-full bg-indigo-500 text-white text-sm font-black flex items-center justify-center shrink-0">{step + 1}</span>
                <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-500">{d.learning.hubs.includes(cur.term) ? '★ ' : ''}{d.groups.find((g) => g.terms.includes(cur.term))?.label || ''}</span>
              </div>
              <h2 className="text-3xl font-black text-gray-900 dark:text-slate-100 mb-4 leading-tight">{cur.term}</h2>
              <p className="text-lg font-serif text-gray-800 dark:text-slate-200 leading-relaxed mb-6">{defByTerm.get(cur.term)}</p>
              <div className="rounded-2xl bg-indigo-50 dark:bg-slate-800/60 p-4 border border-indigo-100 dark:border-slate-700">
                <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 mb-1.5"><Sparkles size={13} /> {T.whyNow}</span>
                <p className="text-[14.5px] text-gray-700 dark:text-slate-300 leading-relaxed">{cur.why}</p>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border-2 border-indigo-200 dark:border-indigo-900/50 bg-white dark:bg-slate-900/60 p-10 text-center shadow-sm">
              <p className="text-2xl font-black text-gray-900 dark:text-slate-100 mb-6">{T.done}</p>
              <button onClick={() => setStep(0)} className="px-6 py-3 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-colors">{T.restart}</button>
            </div>
          )}
          {!done && (
            <div className="flex items-center gap-3 mt-6">
              <button disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))} className="flex items-center gap-1.5 px-5 py-3 rounded-full border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"><ChevronLeft size={17} /> {T.prev}</button>
              <button onClick={() => setStep((s) => s + 1)} className="flex-1 flex items-center justify-center gap-1.5 px-5 py-3 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-colors">{T.next} <ChevronRight size={17} /></button>
            </div>
          )}
        </div>
        {AIWidget}
      </div>
    </div>
  );
};

export default ConceptMap;
