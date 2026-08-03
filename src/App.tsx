import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, Brain, Sparkles, Send, Loader2, ChevronRight, ChevronLeft, X, AlertCircle, FileText, Target, Microscope, Users, Upload, FileUp, Image as ImageIcon, History, Clock, Trash2, Copy, Check, Download, MessageSquare, Share2, Sun, Moon, GraduationCap, HelpCircle, PlusCircle, Waypoints } from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth';
import ReactMarkdown from 'react-markdown';
import { analyzeText, analyzeOverview, analyzeConceptDeepDive, askDocumentQuestion, Concept, DocumentOverview, ImagePart, DeepDiveData } from './services/geminiService';
import { addConcepts, dueCount } from './services/deck';
import FocusReader from './FocusReader';
import Quiz from './Quiz';
import ReviewDeck from './ReviewDeck';
import ConceptMap from './ConceptMap';
import './index.css';

// Set up PDF.js worker — bundled locally (same-origin) so it loads even where the CDN is blocked/slow.
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Detect whether the source text is predominantly Chinese, so the analysis output
// (concepts, definitions, overview) comes back in the SAME language the user pasted.
const detectLang = (t: string): 'English' | 'Chinese' => {
  const cjk = (t.match(/[一-鿿㐀-䶿]/g) || []).length;
  const nonSpace = t.replace(/\s/g, '').length || 1;
  return cjk >= 8 || cjk / nonSpace > 0.15 ? 'Chinese' : 'English';
};

type AnalysisType = 'concepts' | 'overview';

const App: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<ImagePart | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [analysisType, setAnalysisType] = useState<AnalysisType>('concepts');
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [overview, setOverview] = useState<DocumentOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Deep Analysis States
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);
  const [isDeepAnalyzing, setIsDeepAnalyzing] = useState(false);
  const [conceptDeepDive, setConceptDeepDive] = useState<DeepDiveData | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Scanning logical structures...');
  const [selectionButtonPos, setSelectionButtonPos] = useState<{ x: number, y: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
  const [userQuestion, setUserQuestion] = useState('');
  const [isAnswering, setIsAnswering] = useState(false);
  const [allConceptsCopied, setAllConceptsCopied] = useState(false);
  const [outputLanguage, setOutputLanguage] = useState<'English' | 'Chinese'>(() => (typeof navigator !== 'undefined' && (navigator.language || '').toLowerCase().startsWith('zh')) ? 'Chinese' : 'English');
  const [showReader, setShowReader] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [deckDue, setDeckDue] = useState(0);
  const [addNote, setAddNote] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof localStorage !== 'undefined' && localStorage.theme === 'dark') return true;
    if (typeof localStorage !== 'undefined' && localStorage.theme === 'light') return false;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) return true;
    return false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.theme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.theme = 'light';
    }
  }, [isDarkMode]);

  const t = {
    English: {
      taglineConcepts: "Distill complex technical readings into essential logical nodes.",
      taglineOverview: "Generate high-level structural synthesis for academic research.",
      concepts: "Concepts",
      overview: "Overview",
      placeholder: isReadingFile ? "Reading..." : "Paste a complex academic paragraph, or upload a file to distill concepts...",
      upload: isReadingFile ? "Reading..." : "Upload File",
      tryExample: "Try Example",
      pasteText: "Paste Text",
      extract: "Extract Insights",
      synth: "Generate Overview",
      conceptMap: "Core Concept Map",
      exportHub: "Export Hub",
      copyMarkdown: "Copy as Markdown",
      exportAnki: "Export to Anki (CSV)",
      docSynth: "Document Synthesis",
      thesis: "Core Thesis",
      methodology: "Methodology",
      takeaways: "Key Takeaways",
      dropPrompt: "Drop a document or paste text above.",
      qaTitle: "Contextual Q&A",
      qaPlaceholder: "Ask a specific question about this document...",
      vault: "My Vault",
      historyTitle: "Research History",
      noHistory: "No recent analyses found.",
      deepDive: "Concept Deep Dive",
      copyBtn: "Copy",
      copied: "Copied!",
      error: "Analysis Error",
      footer: "COGNICARD ACADEMIC EXTRACTION ENGINE v1.0",
      term: "TERM",
      breakdown: "Structural Breakdown",
      inContext: "In This Context",
      analogy: "The Feynman Analogy",
      quizBtn: "Self-test",
      mapBtn: "Concept map",
      reviewBtn: "Review",
      addReview: "Add to review",
      added: "added to review deck",
      allInDeck: "Already in your review deck",
      scanning: [
        "Scanning logical structures...",
        "Synthesizing technical nodes...",
        "Applying academic rigor...",
        "Finalizing logical mapping..."
      ]
    },
    Chinese: {
      taglineConcepts: "将复杂的专业读物提炼为核心逻辑节点。",
      taglineOverview: "为学术研究生成高层级的结构化综述。",
      concepts: "核心概念",
      overview: "文档总览",
      placeholder: isReadingFile ? "正在读取..." : "粘贴一段复杂的学术文本，或上传文件以提炼核心概念...",
      upload: isReadingFile ? "正在读取..." : "上传文件",
      tryExample: "尝试示例",
      pasteText: "粘贴文本",
      extract: "提取见解",
      synth: "生成综述",
      conceptMap: "核心概念图谱",
      exportHub: "导出中心",
      copyMarkdown: "复制为 Markdown",
      exportAnki: "导出为 Anki (CSV)",
      docSynth: "文档语义综合",
      thesis: "核心论点",
      methodology: "研究方法",
      takeaways: "关键要点",
      dropPrompt: "请在上方放置文档或粘贴文本。",
      qaTitle: "文档交互问答",
      qaPlaceholder: "针对此文档提出具体问题...",
      vault: "我的知识库",
      historyTitle: "研究历史",
      noHistory: "暂无最近的分析记录。",
      deepDive: "深度解析",
      copyBtn: "复制",
      copied: "已复制！",
      error: "分析错误",
      footer: "COGNICARD ACADEMIC 智能提炼引擎 v1.0",
      term: "条目",
      breakdown: "结构化拆解",
      inContext: "原文背景",
      analogy: "费曼类比",
      quizBtn: "自测",
      mapBtn: "概念图谱",
      reviewBtn: "复习",
      addReview: "加入复习",
      added: "张卡片已加入复习",
      allInDeck: "这些概念已在复习卡组中",
      scanning: [
        "正在扫描逻辑结构...",
        "正在合成技术节点...",
        "正在应用学术严谨性审查...",
        "正在完成逻辑映射..."
      ]
    }
  }[outputLanguage];

  // Review deck: refresh the "due" badge when concepts change or the review modal closes.
  useEffect(() => { setDeckDue(dueCount()); }, [showReview, concepts]);

  const handleAddToReview = () => {
    const n = addConcepts(concepts);
    setDeckDue(dueCount());
    setAddNote(n > 0 ? `${n} ${t.added}` : t.allInDeck);
    setTimeout(() => setAddNote(''), 2600);
  };

  // History State
  const [history, setHistory] = useState<any[]>(() => {
    const saved = localStorage.getItem('cognicard_history');
    return saved ? JSON.parse(saved) : [];
  });

  const saveToHistory = (newEntry: any) => {
    const updatedHistory = [newEntry, ...history.slice(0, 19)];
    setHistory(updatedHistory);
    localStorage.setItem('cognicard_history', JSON.stringify(updatedHistory));
  };

  const loadFromHistory = (item: any) => {
    setAnalysisType(item.type);
    setInputText(item.text);
    if (item.type === 'concepts') {
      setConcepts(item.results);
      setOverview(null);
    } else {
      setOverview(item.results);
      setConcepts([]);
    }
    setShowHistory(false);
    
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const deleteHistoryItem = (timestamp: string) => {
    const updatedHistory = history.filter(item => item.timestamp !== timestamp);
    setHistory(updatedHistory);
    localStorage.setItem('cognicard_history', JSON.stringify(updatedHistory));
  };

  useEffect(() => {
    if (isAnalyzing) {
      const messages = t.scanning;
      let i = 0;
      const interval = setInterval(() => {
        i = (i + 1) % messages.length;
        setLoadingMessage(messages[i]);
      }, 1500);
      return () => clearInterval(interval);
    }
  }, [isAnalyzing]);

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();
      
      if (text && text.length > 2 && text.length < 50) {
        const range = selection?.getRangeAt(0);
        const rect = range?.getBoundingClientRect();
        if (rect) {
          setSelectionButtonPos({
            x: rect.left + rect.width / 2,
            y: rect.top + window.scrollY - 40
          });
          setSelectedText(text);
        }
      } else {
        // Delay to allow clicking the button before it disappears
        setTimeout(() => {
          if (!window.getSelection()?.toString().trim()) {
            setSelectionButtonPos(null);
          }
        }, 100);
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const copyAsMarkdown = async () => {
    // ... rest of the function or add new ones here
  };

  const copyAllAsMarkdown = async () => {
    if (concepts.length === 0) return;
    const markdown = concepts.map((c, i) => `## ${c.term}\n> ${c.definition}`).join('\n\n');
    try {
      await navigator.clipboard.writeText(markdown);
      setAllConceptsCopied(true);
      setTimeout(() => setAllConceptsCopied(false), 2000);
      setShowExportMenu(false);
    } catch (err) {
      console.error('Failed to copy concepts:', err);
    }
  };

  const exportToCSV = () => {
    if (concepts.length === 0) return;
    const csvContent = "Term,Definition\n" + concepts.map(c => `"${c.term.replace(/"/g, '""')}","${c.definition.replace(/"/g, '""')}"`).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "CogniCard_Anki_Deck.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportMenu(false);
  };

  const handleChatSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!userQuestion.trim() || isAnswering) return;

    const question = userQuestion;
    setUserQuestion('');
    setChatHistory(prev => [...prev, { role: 'user', content: question }]);
    setIsAnswering(true);

    try {
      const answer = await askDocumentQuestion(
        inputText,
        selectedImage,
        concepts,
        overview,
        chatHistory,
        question,
        outputLanguage
      );
      setChatHistory(prev => [...prev, { role: 'assistant', content: answer }]);
    } catch (err) {
      console.error('Chat error:', err);
      setChatHistory(prev => [...prev, { role: 'assistant', content: "I'm sorry, I encountered an error while processing your question. Please try again." }]);
    } finally {
      setIsAnswering(false);
    }
  };

  const handleDeepDive = useCallback(async (concept: Concept) => {
    setSelectedConcept(concept);
    setIsDeepAnalyzing(true);
    setConceptDeepDive(null);
    try {
      const res = await analyzeConceptDeepDive(concept.term, inputText, outputLanguage);
      setConceptDeepDive(res.deep_dive);
    } catch (err) {
      console.error('Deep analysis error:', err);
      setError('Failed deep analysis.');
    } finally {
      setIsDeepAnalyzing(false);
    }
  }, [inputText, outputLanguage]);

  const navigateConcept = useCallback((direction: 'next' | 'prev') => {
    if (!selectedConcept || concepts.length === 0) return;
    const currentIndex = concepts.findIndex(c => c.term === selectedConcept.term);
    let nextIndex = currentIndex;

    if (direction === 'next') {
      nextIndex = (currentIndex + 1) % concepts.length;
    } else {
      nextIndex = (currentIndex - 1 + concepts.length) % concepts.length;
    }

    if (nextIndex !== currentIndex) {
      handleDeepDive(concepts[nextIndex]);
    }
  }, [selectedConcept, concepts, handleDeepDive]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedConcept) return;
      if (e.key === 'ArrowRight') navigateConcept('next');
      if (e.key === 'ArrowLeft') navigateConcept('prev');
      if (e.key === 'Escape') {
        setSelectedConcept(null);
        setConceptDeepDive(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedConcept, navigateConcept]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const executeAnalysis = async (text: string, image: ImagePart | null, type: AnalysisType) => {
    if (!text.trim() && !image) return;

    setIsAnalyzing(true);
    setError(null);
    setConcepts([]);
    setOverview(null);

    // Output in the SAME language as the pasted text (not the browser/UI toggle).
    const lang = text.trim() ? detectLang(text) : outputLanguage;
    if (lang !== outputLanguage) setOutputLanguage(lang);

    try {
      if (type === 'concepts') {
        const response = await analyzeText(text, lang, image || undefined);
        setConcepts(response.concepts);
        saveToHistory({ type: 'concepts', text: text.substring(0, 100), results: response.concepts, timestamp: new Date().toISOString() });
      } else {
        const response = await analyzeOverview(text, lang, image || undefined);
        setOverview(response.overview);
        saveToHistory({ type: 'overview', text: text.substring(0, 100), results: response.overview, timestamp: new Date().toISOString() });
      }
      (window as any).gtag?.('event', 'cognicard_analyze', { analysis_type: type });

      // Scroll to results after a short delay for animation
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err: any) {
      console.error("API Error:", err);
      const errorMessage = err?.message || 'Failed to analyze. Please check your connection or try again later.';
      setError(`Analysis Error: ${errorMessage}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleManualAnalyze = () => {
    executeAnalysis(inputText, selectedImage, analysisType);
  };

  const clearInput = () => {
    setInputText('');
    setSelectedImage(null);
    setImagePreview(null);
    setConcepts([]);
    setOverview(null);
    setError(null);
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    const MAX_FILE_SIZE = 4 * 1024 * 1024; 
    if (file.size > MAX_FILE_SIZE) {
      setError('File is too large. Please upload an image or document under 4MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        const base64String = result.includes(',') ? result.split(',')[1] : result;
        
        const imgPart = {
          inlineData: {
            data: base64String,
            mimeType: file.type
          }
        };
        setSelectedImage(imgPart);
        setImagePreview(result);
        executeAnalysis(inputText, imgPart, analysisType);
      };
      reader.readAsDataURL(file);
    } 
    else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      setIsReadingFile(true);
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const typedarray = new Uint8Array(event.target?.result as ArrayBuffer);
          const loadingTask = pdfjs.getDocument({ data: typedarray });
          const pdf = await loadingTask.promise;
          let fullText = '';
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += pageText + '\n';
          }
          setInputText(fullText);
          executeAnalysis(fullText, selectedImage, analysisType);
        } catch (err) {
          console.error('PDF parsing error:', err);
          setError('Failed to parse PDF document.');
        } finally {
          setIsReadingFile(false);
        }
      };
      reader.readAsArrayBuffer(file);
    }
    else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')) {
      setIsReadingFile(true);
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          const result = await mammoth.extractRawText({ arrayBuffer });
          setInputText(result.value);
          executeAnalysis(result.value, selectedImage, analysisType);
        } catch (err) {
          setError('Failed to parse Word document.');
        } finally {
          setIsReadingFile(false);
        }
      };
      reader.readAsArrayBuffer(file);
    }
    else if (file.type.startsWith('text/') || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
      setIsReadingFile(true);
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result;
        if (typeof content === 'string') {
          setInputText(content);
          executeAnalysis(content, selectedImage, analysisType);
        }
        setIsReadingFile(false);
      };
      reader.readAsText(file);
    } else {
      setError('Unsupported file type.');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-12 md:py-20 max-w-5xl mx-auto relative">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
        accept=".txt,.md,text/plain,image/*,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      />

      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-[26%] shadow-lg shadow-indigo-300/40 dark:shadow-indigo-900/30 flex items-center justify-center bg-gradient-to-br from-[#a6b4cd] to-[#828fb0]">
              <svg width="34" height="34" viewBox="0 0 40 40" fill="none" aria-label="CogniCard">
                <rect x="7.5" y="11" width="16.5" height="20.5" rx="3.4" fill="#ffffff" fillOpacity="0.45" transform="rotate(-9 15.75 21.25)" />
                <rect x="14" y="8.5" width="16.5" height="21" rx="3.6" fill="#ffffff" />
                <rect x="17.4" y="21.4" width="9.8" height="2" rx="1" fill="#b4bfd1" />
                <rect x="17.4" y="25.2" width="6.4" height="2" rx="1" fill="#cfd7e5" />
                <path d="M22.2 10.6 l1.15 2.85 2.85 1.15 -2.85 1.15 -1.15 2.85 -1.15 -2.85 -2.85 -1.15 2.85 -1.15z" fill="#828fb0" />
              </svg>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-5xl font-extrabold tracking-tight text-[#2B3242] dark:text-[#F1F5F9] font-sans flex items-center">
              CogniCard <span className="text-[#828fb0] dark:text-indigo-300 ml-2">Academic</span>
            </h1>
          </div>
          
          <div className="relative group flex items-center gap-3">
            <div className="flex bg-gray-100 dark:bg-slate-800 p-1 rounded-xl items-center border border-gray-200 dark:border-slate-700">
              <button 
                onClick={() => setOutputLanguage('English')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${outputLanguage === 'English' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-400' : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'}`}
              >EN</button>
              <button 
                onClick={() => setOutputLanguage('Chinese')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${outputLanguage === 'Chinese' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-400' : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'}`}
              >中文</button>
            </div>

            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2.5 rounded-xl bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all active:scale-95"
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            <div className="relative flex items-center">
              <button
                onClick={() => setShowReview(true)}
                className="p-3 rounded-full text-gray-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-all active:scale-95 group/rev relative"
              >
                <GraduationCap size={26} />
                {deckDue > 0 && <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-indigo-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{deckDue}</span>}
              </button>
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2.5 py-1 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[10px] rounded-md opacity-0 group-hover/rev:opacity-100 transition-opacity pointer-events-none whitespace-nowrap font-bold uppercase tracking-widest shadow-xl z-50">
                {t.reviewBtn}
              </div>
            </div>

            <div className="relative flex items-center">
              <button
                onClick={() => setShowHistory(true)}
                className="p-3 rounded-full text-gray-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-all active:scale-95 group/vault"
              >
                <History size={26} />
              </button>
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2.5 py-1 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[10px] rounded-md opacity-0 group-hover/vault:opacity-100 transition-opacity pointer-events-none whitespace-nowrap font-bold uppercase tracking-widest shadow-xl z-50">
                {t.vault}
              </div>
            </div>
          </div>
        </div>
        <p className="text-gray-500 dark:text-slate-400 text-xl max-w-2xl font-serif italic text-balance mt-4">
          {analysisType === 'concepts' 
            ? t.taglineConcepts
            : t.taglineOverview}
        </p>
      </motion.header>

      <div className="flex bg-gray-100 dark:bg-slate-800 p-1 rounded-xl mb-8 w-full max-w-md">
        <button
          onClick={() => setAnalysisType('concepts')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            analysisType === 'concepts' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-400' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
          }`}
        >
          <Brain size={16} /> {t.concepts}
        </button>
        <button
          onClick={() => setAnalysisType('overview')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            analysisType === 'overview' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-400' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
          }`}
        >
          <FileText size={16} /> {t.overview}
        </button>
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="w-full bg-white dark:bg-[#020617] rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden"
      >
        <div className="p-1 bg-gradient-to-r from-indigo-50 dark:from-indigo-900/50 to-blue-50 dark:to-blue-900/50"></div>
        <div className="p-6 md:p-8">
          <div className="relative">
            <textarea
              id="source-text"
              className={`w-full p-4 border dark:border-slate-800 dark:bg-slate-900/50 rounded-2xl outline-none text-lg text-gray-700 dark:text-slate-200 font-serif leading-relaxed placeholder-gray-300 dark:placeholder-slate-600 resize-none focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/40 focus:border-indigo-300 dark:focus:border-indigo-700 transition-all ${imagePreview ? 'min-h-[150px]' : 'min-h-[300px]'}`}
              placeholder={t.placeholder}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isAnalyzing || isReadingFile}
            />
            
            <AnimatePresence>
              {imagePreview && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="mt-4 relative inline-block group">
                  <img src={imagePreview} alt="Selected" className="max-h-48 rounded-xl border border-gray-100 dark:border-slate-800" />
                  <button onClick={removeImage} className="absolute -top-2 -right-2 bg-white dark:bg-slate-800 rounded-full p-1 shadow-md border dark:border-slate-700"><X className="dark:text-slate-300" size={16} /></button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <div className="mt-6 flex flex-col md:flex-row items-center justify-between gap-4 border-t pt-6 border-gray-50 dark:border-slate-800/50">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    setInputText(prev => prev ? prev + '\n' + text : text);
                  } catch (err) {
                    document.getElementById('source-text')?.focus();
                  }
                }}
                disabled={isAnalyzing || isReadingFile}
                className="text-xs font-semibold text-gray-500 dark:text-slate-400 bg-transparent hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-slate-300 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <FileText size={14} /> {t.pasteText}
              </button>
              <button onClick={triggerFileUpload} disabled={isAnalyzing || isReadingFile} className="text-xs font-semibold text-gray-500 dark:text-slate-400 bg-transparent hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-slate-300 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
                {isReadingFile ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {t.upload}
              </button>
              <button onClick={() => setInputText(analysisType === 'concepts' ? (outputLanguage === 'English' ? "The 'robot apocalypse' is a deterministic belief that automation will inevitably destroy all human jobs." : "“机器人启示录”是一种决定论观点，认为自动化将不可避免地摧毁所有人类工作。") : (outputLanguage === 'English' ? "Title: The Impact of Remote Work on Urban Economics." : "题目：远程办公对城市经济的影响。"))} className="text-xs font-semibold text-gray-500 dark:text-slate-400 bg-transparent hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-slate-300 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
                <Sparkles size={14} /> {t.tryExample}
              </button>
              <button onClick={() => { setShowReader(true); (window as any).gtag?.('event', 'cognicard_focus_reader'); }} disabled={!inputText.trim()} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50/60 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
                <BookOpen size={14} /> {outputLanguage === 'Chinese' ? '专注阅读' : 'Focus Read'}
              </button>
            </div>
            <button onClick={handleManualAnalyze} disabled={isAnalyzing || (!inputText.trim() && !selectedImage)} className={`px-8 py-3 rounded-full font-medium text-white flex items-center gap-2 shadow-sm transition-all ${isAnalyzing || (!inputText.trim() && !selectedImage) ? 'bg-gray-300 dark:bg-slate-800 dark:text-slate-500' : 'bg-indigo-600 dark:bg-indigo-600 hover:bg-indigo-700 dark:hover:bg-indigo-500 hover:shadow-md'}`}>
              <AnimatePresence mode="wait">
                {isAnalyzing ? (
                  <motion.div key="1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
                    <Loader2 size={18} className="animate-spin" />
                    <span>{loadingMessage}</span>
                  </motion.div>
                ) : (
                  <motion.div key="2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
                    <Sparkles size={18} />
                    <span>{analysisType === 'concepts' ? t.extract : t.synth}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          </div>
        </div>
      </motion.div>

      {error && (
        <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border dark:border-red-900/50 rounded-xl text-red-600 dark:text-red-400 flex items-center gap-3">
          <AlertCircle size={20} /> <p className="text-sm">{error}</p>
        </div>
      )}

      <div ref={resultsRef} className="w-full mt-16 scroll-mt-20">
        <AnimatePresence mode="wait">
          {analysisType === 'concepts' && concepts.length > 0 && (
            <motion.div key="c" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
              <div className="flex items-center justify-between border-b dark:border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <Brain className="text-indigo-600 dark:text-indigo-400" size={24} /> 
                  <h2 className="text-2xl font-bold dark:text-[#F1F5F9]">{t.conceptMap}</h2>
                </div>
                
                <div className="flex items-center gap-2 relative">
                  {addNote && (
                    <span className="absolute -top-9 right-0 whitespace-nowrap px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[11px] font-bold shadow-lg">{addNote}</span>
                  )}
                  <button
                    onClick={handleAddToReview}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl text-sm font-bold text-gray-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 shadow-sm transition-all active:scale-95"
                  >
                    <PlusCircle size={16} /> <span className="hidden sm:inline">{t.addReview}</span>
                  </button>
                  <button
                    onClick={() => setShowMap(true)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl text-sm font-bold text-gray-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 shadow-sm transition-all active:scale-95"
                  >
                    <Waypoints size={16} /> <span className="hidden sm:inline">{t.mapBtn}</span>
                  </button>
                  <button
                    onClick={() => setShowQuiz(true)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl text-sm font-bold text-gray-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 shadow-sm transition-all active:scale-95"
                  >
                    <HelpCircle size={16} /> <span className="hidden sm:inline">{t.quizBtn}</span>
                  </button>
                  <div className="relative">
                  <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl text-sm font-bold text-gray-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 shadow-sm transition-all active:scale-95"
                  >
                    <Download size={16} />
                    <span>{t.exportHub}</span>
                  </button>

                  <AnimatePresence>
                    {showExportMenu && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-2xl shadow-xl z-30 p-2 overflow-hidden"
                      >
                        <button 
                          onClick={copyAllAsMarkdown}
                          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-indigo-50 dark:hover:bg-slate-700 text-left transition-colors group"
                        >
                          <div className="bg-gray-50 dark:bg-slate-900 p-2 rounded-lg group-hover:bg-white dark:group-hover:bg-slate-800 text-gray-400 dark:text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {allConceptsCopied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-700 dark:text-slate-200">{t.copyMarkdown}</p>
                            <p className="text-[10px] text-gray-400 dark:text-slate-500">{outputLanguage === 'English' ? 'Perfect for Notion & Obsidian' : '适用于 Notion 和 Obsidian'}</p>
                          </div>
                        </button>
                        <button 
                          onClick={exportToCSV}
                          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-indigo-50 dark:hover:bg-slate-700 text-left transition-colors group"
                        >
                          <div className="bg-gray-50 dark:bg-slate-900 p-2 rounded-lg group-hover:bg-white dark:group-hover:bg-slate-800 text-gray-400 dark:text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            <FileUp size={16} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-700 dark:text-slate-200">{t.exportAnki}</p>
                            <p className="text-[10px] text-gray-400 dark:text-slate-500">{outputLanguage === 'English' ? 'Generate flashcard decks' : '生成记忆卡片卡组'}</p>
                          </div>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                </div>
              </div>
              <div className="flex flex-wrap justify-center gap-6 pb-20">
                {concepts.map((concept, index) => (
                  <div key={index} onClick={() => handleDeepDive(concept)} className="w-full md:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] xl:w-[calc(25%-18px)] flex-grow-0 bg-white dark:bg-[#020617] p-6 rounded-2xl border dark:border-slate-800 shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-indigo-200 dark:hover:border-indigo-900/50 cursor-pointer relative group transition-all duration-300 flex flex-col min-h-[280px]">
                    <div className="absolute top-0 right-0 p-3 text-indigo-50 dark:text-slate-800/50 group-hover:text-indigo-500 dark:group-hover:text-indigo-500/50 transition-colors"><ChevronRight size={48} /></div>
                    <span className="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-[0.2em]">{t.term} {index + 1}</span>
                    <h3 className="text-2xl font-bold mb-3 pr-8 font-sans text-gray-900 dark:text-[#F1F5F9] group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{concept.term}</h3>
                    <p className="text-gray-800 dark:text-slate-300 font-medium font-serif text-lg leading-relaxed border-l-2 border-indigo-50 dark:border-indigo-900/50 pl-4 mb-3">{concept.definition}</p>
                    <div className="mt-auto flex justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <span className="text-[10px] uppercase font-bold text-indigo-400 dark:text-indigo-500 flex items-center gap-1">Click to explore <ChevronRight size={12} /></span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {analysisType === 'overview' && overview && (
            <motion.div key="o" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 pb-20">
              <div className="flex items-center gap-3 border-b dark:border-slate-800 pb-4"><FileText className="text-indigo-600 dark:text-indigo-400" size={24} /> <h2 className="text-2xl font-bold dark:text-[#F1F5F9]">{t.docSynth}</h2></div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                  <div className="bg-white dark:bg-[#020617] p-8 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm">
                    <div className="flex gap-3 mb-6 text-indigo-600 dark:text-indigo-400 border-b border-gray-50 dark:border-slate-800 pb-2"><Target size={20} /> <h3 className="text-sm font-bold uppercase tracking-widest">{t.thesis}</h3></div>
                    <p className="text-2xl font-serif font-medium leading-relaxed text-gray-900 dark:text-[#F1F5F9] border-l-4 border-indigo-500 dark:border-indigo-400 pl-6 py-1">{overview.core_thesis}</p>
                  </div>
                  <div className="bg-white dark:bg-[#020617] p-8 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm">
                    <div className="flex gap-3 mb-4 text-indigo-600 dark:text-indigo-400 border-b border-gray-50 dark:border-slate-800 pb-2"><Microscope size={20} /> <h3 className="text-sm font-bold uppercase tracking-widest">{t.methodology}</h3></div>
                    <p className="text-lg font-serif text-gray-700 dark:text-slate-300 leading-relaxed italic">{overview.methodology}</p>
                  </div>
                </div>
                <div className="bg-white dark:bg-[#020617] p-8 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm space-y-6">
                  <div className="flex items-center gap-3 text-indigo-600 dark:text-indigo-400 border-b border-gray-50 dark:border-slate-800 pb-4">
                    <Sparkles size={20} />
                    <h3 className="text-sm font-bold uppercase tracking-widest">{t.takeaways}</h3>
                  </div>
                  <div className="flex flex-col gap-4">
                    {overview.key_takeaways.map((t, i) => (
                      <motion.div key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} className="bg-indigo-50/40 dark:bg-indigo-900/10 p-4 rounded-2xl border border-indigo-100/50 dark:border-indigo-900/30 flex gap-4 group hover:bg-white dark:hover:bg-slate-800 hover:shadow-md transition-all">
                        <span className="text-[10px] font-black text-indigo-300 dark:text-indigo-500 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors pt-1 tracking-tighter">{String(i + 1).padStart(2, '0')}</span>
                        <p className="text-sm font-medium text-gray-700 dark:text-slate-300 leading-relaxed font-sans">{t}</p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {((analysisType === 'concepts' && !concepts.length) || (analysisType === 'overview' && !overview)) && !isAnalyzing && (
            <div className="text-center py-20 bg-gray-50/50 dark:bg-slate-900/30 rounded-3xl border-2 border-dashed border-gray-100 dark:border-slate-800 font-medium text-gray-400 dark:text-slate-600">
              {t.dropPrompt}
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Contextual Q&A Section */}
      {(concepts.length > 0 || overview) && !isAnalyzing && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full mt-12 mb-20 space-y-6"
        >
          <div className="flex items-center gap-3 border-b dark:border-slate-800 pb-4">
            <MessageSquare className="text-indigo-600 dark:text-indigo-400" size={24} />
            <h2 className="text-2xl font-bold dark:text-[#F1F5F9]">{t.qaTitle}</h2>
          </div>

          <div className="bg-white dark:bg-[#020617] rounded-3xl border border-gray-100 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col">
            <div className={`p-6 space-y-6 max-h-[400px] overflow-y-auto bg-gray-50/30 dark:bg-slate-900/30 ${chatHistory.length === 0 ? 'hidden' : 'block'}`}>
              {chatHistory.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-indigo-600 dark:bg-indigo-600 text-white rounded-tr-none' 
                      : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-50 dark:border-slate-700 rounded-tl-none font-serif'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isAnswering && (
                <div className="flex justify-start">
                  <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-gray-50 dark:border-slate-700 rounded-tl-none shadow-sm">
                    <Loader2 size={16} className="animate-spin text-indigo-500 dark:text-indigo-400" />
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleChatSubmit} className="p-4 border-t border-gray-100 dark:border-slate-800 bg-white dark:bg-[#020617] relative shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)] flex flex-col gap-3">
              <div className="flex flex-wrap gap-2 mb-1">
                {(outputLanguage === 'English' ? [
                  "Explain the 7th point in detail",
                  "Summarize the key takeaways of this image",
                  "What is the core logic of this document?"
                ] : [
                  "详细解释图片中的第 7 个要点",
                  "总结这张图片的核心内容",
                  "这张图里的主要逻辑是什么？"
                ]).map((text, index) => (
                  <button 
                    key={index}
                    type="button"
                    onClick={() => setUserQuestion(text)}
                    className="px-3 py-1 text-xs bg-indigo-50/50 dark:bg-indigo-900/20 border border-indigo-100/50 dark:border-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-all active:scale-95"
                  >
                    {text}
                  </button>
                ))}
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={userQuestion}
                  onChange={(e) => setUserQuestion(e.target.value)}
                  placeholder={t.qaPlaceholder}
                  className="w-full py-4 pl-6 pr-14 bg-gray-50 dark:bg-slate-900 rounded-2xl text-sm text-gray-900 dark:text-slate-200 border border-transparent focus:bg-white dark:focus:bg-[#020617] focus:border-indigo-100 dark:focus:border-indigo-900/50 focus:ring-4 focus:ring-indigo-50/50 dark:focus:ring-indigo-900/20 outline-none transition-all placeholder-gray-400 dark:placeholder-slate-600 font-medium"
                />
                <button 
                  type="submit"
                  disabled={!userQuestion.trim() || isAnswering}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all ${
                    !userQuestion.trim() || isAnswering 
                      ? 'text-gray-300 dark:text-slate-700' 
                      : 'text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Send size={20} />
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      )}

      <footer className="mt-auto py-10 opacity-30 text-xs uppercase tracking-[0.2em] font-bold text-gray-500 dark:text-slate-400">
        {t.footer}
      </footer>

      <AnimatePresence>
        {selectedConcept && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 dark:bg-slate-900/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white dark:bg-[#020617] w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] border border-transparent dark:border-slate-800"
            >
              <div className="flex items-center justify-between p-6 border-b dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/30">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => navigateConcept('prev')}
                      className="p-1.5 hover:bg-white dark:hover:bg-slate-800 rounded-lg text-gray-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all border border-transparent hover:border-indigo-100 dark:hover:border-slate-700"
                      title="Previous Concept (Arrow Left)"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button 
                      onClick={() => navigateConcept('next')}
                      className="p-1.5 hover:bg-white dark:hover:bg-slate-800 rounded-lg text-gray-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all border border-transparent hover:border-indigo-100 dark:hover:border-slate-700"
                      title="Next Concept (Arrow Right)"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                  <div className="w-px h-6 bg-gray-200 dark:bg-slate-700 mx-1"></div>
                  <div className="bg-indigo-100 dark:bg-indigo-900/50 p-2 rounded-lg text-indigo-600 dark:text-indigo-400"><Microscope size={24} /></div>
                  <h3 className="text-xl font-bold dark:text-[#F1F5F9]">{t.deepDive}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <AnimatePresence mode="wait">
                    {conceptDeepDive && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        onClick={copyAsMarkdown}
                        className={`p-2 rounded-full transition-all flex items-center justify-center ${
                          isCopied ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400'
                        }`}
                        title="Copy as Markdown"
                      >
                        {isCopied ? <Check size={20} /> : <Copy size={20} />}
                      </motion.button>
                    )}
                  </AnimatePresence>
                  <button onClick={() => { setSelectedConcept(null); setConceptDeepDive(null); }} className="p-2 text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors"><X size={24} /></button>
                </div>
              </div>
              <div className="p-8 overflow-y-auto">
                <h2 className="text-3xl font-bold mb-4 dark:text-[#F1F5F9]">{selectedConcept.term}</h2>
                <p className="text-xl font-serif text-indigo-600 dark:text-indigo-400 italic mb-8 pb-8 border-b dark:border-slate-800 underline decoration-indigo-200 dark:decoration-indigo-900/50 decoration-wavy">{selectedConcept.definition}</p>
                <div className="space-y-6">
                  {isDeepAnalyzing ? (<div className="py-12 text-center text-gray-400 dark:text-slate-500"><Loader2 size={32} className="animate-spin mx-auto mb-4 text-indigo-500 dark:text-indigo-400" /><p className="font-medium animate-pulse">Running analysis...</p></div>) : 
                  conceptDeepDive && (
                    <div className="space-y-8">
                       <section>
                         <h4 className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2"><span className="text-sm">🧩</span> Structural Breakdown</h4>
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                           {conceptDeepDive.breakdown.map((item, idx) => (
                             <div key={idx} className="bg-indigo-50/50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100/50 dark:border-indigo-900/30"><span className="font-bold text-indigo-700 dark:text-indigo-300 block mb-1">{item.keyword}</span><span className="text-sm text-gray-600 dark:text-slate-400 leading-snug">{item.explanation}</span></div>
                           ))}
                         </div>
                       </section>
                       <section>
                         <h4 className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2"><span className="text-sm">📖</span> Evidence from Text</h4>
                         <blockquote className="text-gray-800 dark:text-slate-200 leading-relaxed font-serif text-lg italic border-l-4 border-indigo-500 dark:border-indigo-400 pl-4 bg-gray-50 dark:bg-slate-800/30 py-3 pr-4 rounded-r-lg">
                           {conceptDeepDive.context_quote}
                         </blockquote>
                       </section>
                       <section className="bg-indigo-50 dark:bg-indigo-950/20 p-6 rounded-2xl border border-indigo-200/60 dark:border-indigo-900/50">
                         <h4 className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-widest mb-3 flex items-center gap-2"><span className="text-sm">💡</span> The Feynman Analogy</h4>
                         <p className="text-gray-800 dark:text-slate-300 leading-relaxed italic">{conceptDeepDive.analogy}</p>
                       </section>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHistory && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowHistory(false)} className="absolute inset-0 bg-gray-900/20 dark:bg-slate-900/60 backdrop-blur-[2px]" />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25 }} className="relative w-full max-w-sm bg-white dark:bg-[#020617] shadow-xl flex flex-col border-l dark:border-slate-800">
              <div className="p-6 border-b dark:border-slate-800 flex items-center justify-between bg-gray-50/50 dark:bg-slate-900/50">
                <div className="flex flex-center gap-2"><History className="text-indigo-600 dark:text-indigo-400" size={20} /><h3 className="text-lg font-bold dark:text-[#F1F5F9]">Research History</h3></div>
                <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400 rounded-full"><X size={20} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {history.length === 0 ? (<div className="text-center py-12 text-gray-400 dark:text-slate-500"><Clock size={32} className="mx-auto mb-3 opacity-20" /><p className="text-sm">No recent analyses found.</p></div>) : 
                history.map((item) => (
                  <div key={item.timestamp} className="group bg-gray-50 dark:bg-slate-900/50 hover:bg-indigo-50/30 dark:hover:bg-slate-800 p-4 rounded-xl border border-transparent dark:border-slate-800 hover:border-indigo-100 dark:hover:border-slate-700 cursor-pointer relative transition-all" onClick={() => loadFromHistory(item)}>
                    <div className="flex items-center gap-2 mb-2">
                       <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${item.type === 'concepts' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                         {item.type === 'concepts' ? `${item.results?.length || 0} Concepts` : 'Overview'}
                       </span>
                       <span className="text-[10px] text-gray-400 dark:text-slate-500">{new Date(item.timestamp).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-slate-300 font-serif line-clamp-2 italic mb-1">"{item.text}..."</p>
                    <button onClick={(e) => { e.stopPropagation(); deleteHistoryItem(item.timestamp); }} className="absolute top-4 right-4 p-1.5 text-gray-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 rounded-lg group-hover:opacity-100 opacity-0 transition-opacity"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Selection Button */}
      <AnimatePresence>
        {selectionButtonPos && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            style={{ 
              position: 'absolute',
              left: selectionButtonPos.x,
              top: selectionButtonPos.y,
              transform: 'translateX(-50%)',
              zIndex: 100
            }}
            onClick={() => {
              handleDeepDive({ term: selectedText, definition: 'User selected concept' });
              setSelectionButtonPos(null);
            }}
            className="flex items-center gap-2 bg-indigo-600 text-white px-3 py-1.5 rounded-full shadow-lg text-xs font-bold hover:bg-indigo-700 transition-all border border-indigo-500/50"
          >
            <Sparkles size={12} />
            <span>Analyze Selection</span>
          </motion.button>
        )}
      </AnimatePresence>

      {showReader && (
        <FocusReader text={inputText} lang={outputLanguage} isDark={isDarkMode} onClose={() => setShowReader(false)} />
      )}

      {showQuiz && (
        <Quiz text={inputText} concepts={concepts} lang={outputLanguage} onClose={() => setShowQuiz(false)} />
      )}

      {showMap && (
        <ConceptMap text={inputText} concepts={concepts} lang={outputLanguage} isDark={isDarkMode} onClose={() => setShowMap(false)} />
      )}

      {showReview && (
        <ReviewDeck lang={outputLanguage} onClose={() => { setShowReview(false); setDeckDue(dueCount()); }} />
      )}
    </div>
  );
};

export default App;
