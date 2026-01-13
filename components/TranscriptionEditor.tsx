import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { 
  PencilSimple, Eye, ArrowArcLeft, ArrowArcRight, TextB, TextItalic, 
  TextUnderline, TextStrikethrough, CloudArrowDown, FileText, File, 
  FileCode, Export, Sparkle, BookOpen, X, Checks, Copy, Check, 
  MagnifyingGlass, Wrench, Trash, TextAlignLeft, TextT, ArrowsClockwise, 
  DotsThreeVertical, CaretDown, UserMinus, Clock, ArrowsIn, Tag, 
  Spinner, VideoCamera, TextHOne, TextHTwo, TextHThree, Palette, 
  Eraser, DotsThree, ArrowRight, Microphone, UploadSimple, Stop, 
  Play, Pause, WarningCircle, MagicWand, Timer, Warning, CaretUp,
  List, Repeat
} from '@phosphor-icons/react';
import PlaybackControl from './PlaybackControl';
import { generateTxt, generateDoc, generateDocx, generateSrt } from '../utils/exportUtils';
import { summarizeText, enhanceFormatting, analyzeVideoContent } from '../services/geminiService';
import { AudioFile } from '../types';

interface TranscriptionEditorProps {
  initialText: string;
  onTextChange: (text: string) => void;
  audioUrl: string | null;
  onSaveToDrive?: () => void;
  isSaving?: boolean;
  driveSaved?: boolean;
  contentType?: string | null;
  originalFile?: AudioFile | null;
  isEditing: boolean;
  onEditingChange: (editing: boolean) => void;
  showAiSidebar: boolean;
  onAiSidebarToggle: () => void;
  // New props for dynamic media bar
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  onUploadClick?: () => void;
  onStartUpload?: (file: AudioFile) => void;
  isRecording?: boolean;
}

type ActiveMenu = 'formatting' | 'tools' | 'export' | 'search' | 'ai-features' | 'copy-as' | null;

const TranscriptionEditor: React.FC<TranscriptionEditorProps> = ({ 
  initialText, 
  onTextChange, 
  audioUrl,
  contentType,
  originalFile,
  isEditing,
  onEditingChange,
  showAiSidebar,
  onAiSidebarToggle,
  onStartRecording,
  onStopRecording,
  onUploadClick,
  onStartUpload,
  isRecording = false
}) => {
  // --- State ---
  const [history, setHistory] = useState<string[]>([initialText]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [text, setText] = useState(initialText);
  
  // Menus & Features
  const [activeMenu, setActiveMenu] = useState<ActiveMenu>(null);
  const [showSummarySidebar, setShowSummarySidebar] = useState(false);
  
  // AI State
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryTitle, setSummaryTitle] = useState("Smart Summary");
  const [isEnhancing, setIsEnhancing] = useState(false);

  // Real-time Transcription State
  const [isRecordingLive, setIsRecordingLive] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const recognitionRef = useRef<any>(null);

  // Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');

  // Playback State
  const [playbackTime, setPlaybackTime] = useState(0);

  // Draggable Toolbar State
  const [toolbarPosition, setToolbarPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);

  // Toast Notification State
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'warning' | 'info' } | null>(null);

  // Refs
  const contentEditableRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const textRef = useRef(text);

  // Keep textRef updated
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  // Clear contentEditable innerHTML when switching to Read mode to prevent duplication
  useEffect(() => {
    if (!isEditing && contentEditableRef.current) {
      contentEditableRef.current.innerHTML = '';
    }
  }, [isEditing]);

  // Handle draggable toolbar mouse events
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && dragStartRef.current) {
        const deltaX = e.clientX - dragStartRef.current.x;
        const deltaY = e.clientY - dragStartRef.current.y;
        setToolbarPosition({
          x: dragStartRef.current.posX + deltaX,
          y: dragStartRef.current.posY + deltaY
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // --- Real-time Transcription Setup ---

  useEffect(() => {
    // Check for SpeechRecognition support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition && !recognitionRef.current) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let finalTranscript = "";
        let interimText = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimText += event.results[i][0].transcript;
          }
        }

        if (finalTranscript) {
          // Use textRef to get latest context without re-binding dependency
          const currentText = textRef.current === "Ready to assist..." || textRef.current === "Start typing here..." ? "" : textRef.current;
          const separator = currentText.endsWith('\n') || currentText === "" ? "" : " ";
          const newText = currentText + separator + finalTranscript;
          updateText(newText);
        }
        
        setInterimTranscript(interimText);
      };

      recognition.onerror = (event: any) => {
        console.error("Speech Recognition Error:", event.error);
        setIsRecordingLive(false);
      };

      recognition.onend = () => {
        if (isRecordingLive) {
          try { recognition.start(); } catch(e) {} // Auto-restart if we're still recording
        }
      };

      recognitionRef.current = recognition;
    }
  }, [isRecordingLive]); // Re-start logic handles transitions

  const handleToggleLiveRecording = () => {
    if (!recognitionRef.current) {
      setToast({ message: "Speech recognition is not supported in this browser. Try Chrome, Edge, or Safari.", type: 'warning' });
      setTimeout(() => setToast(null), 5000);
      return;
    }

    if (isRecordingLive) {
      recognitionRef.current.stop();
      setIsRecordingLive(false);
      setInterimTranscript("");
    } else {
      setIsRecordingLive(true);
      recognitionRef.current.start();
      // No longer switching global tabs, we handle it inline
    }
  };

  // --- HTML/Markdown Conversion Helpers ---

  const markdownToHtml = (md: string) => {
    let html = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    html = html.replace(/\*(.*?)\*/g, '<i>$1</i>');
    html = html.replace(/__(.*?)__/g, '<u>$1</u>');
    // Enhanced: Render strikeouts with a class for interactivity
    html = html.replace(/~~(.*?)~~/g, '<s class="interactive-strike" title="Click to remove">$1</s>');
    
    html = html.replace(
        /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g, 
        '<span class="timestamp-chip" contenteditable="false" data-time="$1">$1</span>'
    );
    html = html.replace(/\n/g, '<br>');
    return html;
  };

  const htmlToMarkdown = (html: string) => {
      const temp = document.createElement('div');
      temp.innerHTML = html;
      temp.querySelectorAll('.timestamp-chip').forEach(chip => {
          const time = chip.getAttribute('data-time');
          if (time) chip.replaceWith(`[${time}]`);
      });
      let md = temp.innerHTML;
      
      md = md.replace(/<h1>(.*?)<\/h1>/gi, '# $1\n');
      md = md.replace(/<h2>(.*?)<\/h2>/gi, '## $1\n');
      md = md.replace(/<h3>(.*?)<\/h3>/gi, '### $1\n');
      md = md.replace(/<b>(.*?)<\/b>/gi, '**$1**');
      md = md.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
      md = md.replace(/<i>(.*?)<\/i>/gi, '*$1*');
      md = md.replace(/<em>(.*?)<\/em>/gi, '*$1*');
      md = md.replace(/<u>(.*?)<\/u>/gi, '__$1__');
      
      // Handle interactive strike back to markdown
      md = md.replace(/<s[^>]*>(.*?)<\/s>/gi, '~~$1~~');
      md = md.replace(/<strike[^>]*>(.*?)<\/strike>/gi, '~~$1~~');
      
      md = md.replace(/<br\s*\/?>/gi, '\n');
      md = md.replace(/<div>/gi, '\n');
      md = md.replace(/<\/div>/gi, '');
      md = md.replace(/&nbsp;/g, ' ');
      md = md.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      md = md.replace(/\n\s*\n/g, '\n\n'); 
      return md.trim();
  };

  // --- Effects ---

  useEffect(() => {
    if (initialText !== history[0]) {
        setText(initialText);
        setHistory([initialText]);
        setHistoryIndex(0);
        if (contentEditableRef.current) {
            contentEditableRef.current.innerHTML = markdownToHtml(initialText);
        }
    }
  }, [initialText]);

  useEffect(() => {
      if (isEditing && contentEditableRef.current) {
          contentEditableRef.current.innerHTML = markdownToHtml(text);
      }
  }, [isEditing]);

  // Handle click on Strike-through elements to delete them
  useEffect(() => {
     const handleEditorClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'S' || target.closest('s')) {
           const sTag = target.tagName === 'S' ? target : target.closest('s');
           if (sTag) {
              sTag.remove(); // Remove element from DOM
              // Update state
              if (contentEditableRef.current) {
                 const newMd = htmlToMarkdown(contentEditableRef.current.innerHTML);
                 setText(newMd);
                 onTextChange(newMd);
              }
           }
        }
     };
     
     const editor = contentEditableRef.current;
     if (editor && isEditing) {
        editor.addEventListener('click', handleEditorClick);
     }
     return () => {
        if (editor) editor.removeEventListener('click', handleEditorClick);
     }
  }, [isEditing, text]);

  useEffect(() => {
    // Click outside to close menus
    const handleClickOutside = (event: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- Actions ---

  const updateText = (newText: string) => {
      setText(newText);
      onTextChange(newText);
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newText);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      if (contentEditableRef.current && isEditing) {
          contentEditableRef.current.innerHTML = markdownToHtml(newText);
      }
  };

  const toggleMenu = (menu: ActiveMenu) => {
    setActiveMenu(prev => prev === menu ? null : menu);
  };

  const handleUndo = () => {
      if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          const newText = history[newIndex];
          setText(newText);
          setHistoryIndex(newIndex);
          onTextChange(newText);
          if (contentEditableRef.current) contentEditableRef.current.innerHTML = markdownToHtml(newText);
      }
  };

  const handleRedo = () => {
      if (historyIndex < history.length - 1) {
          const newIndex = historyIndex + 1;
          const newText = history[newIndex];
          setText(newText);
          setHistoryIndex(newIndex);
          onTextChange(newText);
          if (contentEditableRef.current) contentEditableRef.current.innerHTML = markdownToHtml(newText);
      }
  };

  const handleContentInput = (e: React.FormEvent<HTMLDivElement>) => {
    const html = e.currentTarget.innerHTML;
    const newMd = htmlToMarkdown(html);
    setText(newMd);
  };

  const execCmd = (command: string, value: string | undefined = undefined) => {
      document.execCommand(command, false, value);
      if (contentEditableRef.current) {
          const html = contentEditableRef.current.innerHTML;
          const newMd = htmlToMarkdown(html);
          setText(newMd);
      }
  };

  const applyHeading = (tag: string) => {
      document.execCommand('formatBlock', false, tag);
      if (contentEditableRef.current) {
        const html = contentEditableRef.current.innerHTML;
        const newMd = htmlToMarkdown(html);
        setText(newMd);
      }
  };

  // --- Bulk Tools ---
  const handleRemoveTimestamps = () => {
      const newText = text.replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]/g, '').replace(/  +/g, ' ');
      updateText(newText);
      setActiveMenu(null);
  };

  const handleRemoveSpeakers = () => {
      const newText = text.replace(/(^|\n)(\*\*|__)?(?:Speaker \d+|[A-Z][a-z]+(?: [A-Z][a-z]+)?):(\*\*|__)?/g, '$1').replace(/  +/g, ' ');
      updateText(newText);
      setActiveMenu(null);
  };

  const handleCompactText = () => {
     const newText = text.replace(/\n\s*\n/g, '\n');
     updateText(newText);
     setActiveMenu(null);
  };

  const handleSearchReplace = () => {
      if(!searchTerm) return;
      const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const newText = text.replace(regex, replaceTerm);
      updateText(newText);
  };

  // --- AI Features ---

  const handleSummarize = async () => {
      setSummaryTitle("AI Summary");
      setShowSummarySidebar(true);
      setIsSummarizing(true);
      try {
          const result = await summarizeText(text);
          setSummary(result);
      } catch (e) {
          setSummary("Failed to generate summary.");
      } finally {
          setIsSummarizing(false);
      }
  };

  const handleAnalyzeVideo = async () => {
    if (!originalFile || !originalFile.file) return;
    setSummaryTitle("Visual Analysis");
    setShowSummarySidebar(true);
    setIsSummarizing(true);
    setSummary(null);
    try {
      const result = await analyzeVideoContent(originalFile.file);
      setSummary(result);
    } catch (e) {
      setSummary("Failed to analyze video.");
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleEnhance = async () => {
      setSummaryTitle("Smart Suggestions");
      setShowSummarySidebar(true);
      setIsSummarizing(true);
      setIsEnhancing(true);
      try {
          const result = await enhanceFormatting(text, contentType || "General");
          setSummary(result);
      } catch (e) {
          setSummary("Failed to enhance text.");
      } finally {
          setIsSummarizing(false);
          setIsEnhancing(false);
      }
  };
  
  const handleCopySummary = () => {
    if (summary) {
      navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleApplyEnhancement = () => {
      if (summary && summaryTitle === "Smart Suggestions") {
          updateText(summary);
          onEditingChange?.(true);
          setShowSummarySidebar(false);
      }
  };

  // --- Export ---

  const handleExport = async (format: 'txt' | 'doc' | 'docx' | 'srt') => {
    const filename = `transcription_${new Date().toISOString().slice(0, 10)}`;
    if (format === 'txt') generateTxt(text, filename);
    if (format === 'doc') generateDoc(text, filename);
    if (format === 'docx') await generateDocx(text, filename);
    if (format === 'srt') generateSrt(text, filename);
    setActiveMenu(null);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- Rendering ---
  
  const segments = React.useMemo(() => {
      const segs: { time: number; index: number }[] = [];
      const regex = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
          const hours = match[3] ? parseInt(match[1]) : 0;
          const minutes = match[3] ? parseInt(match[2]) : parseInt(match[1]);
          const seconds = match[3] ? parseInt(match[3]) : parseInt(match[2]);
          const timeInSeconds = hours * 3600 + minutes * 60 + seconds;
          segs.push({ time: timeInSeconds, index: match.index });
      }
      return segs;
  }, [text]);

  const renderHighlightedText = () => {
      if (!text) return null;
      let currentSegmentIndex = -1;
      for (let i = 0; i < segments.length; i++) {
          if (playbackTime >= segments[i].time) currentSegmentIndex = i;
          else break;
      }
      if (segments.length === 0) return <div className="prose prose-lg prose-slate dark:prose-invert max-w-none text-slate-900 dark:text-white"><ReactMarkdown>{text}</ReactMarkdown></div>;
      
      const nodes: React.ReactNode[] = [];
      for (let i = 0; i < segments.length; i++) {
          const seg = segments[i];
          const nextSeg = segments[i+1];
          const endIdx = nextSeg ? nextSeg.index : text.length;
          
          if (i === 0 && seg.index > 0) {
               nodes.push(
                  <div key="pre" className="opacity-50 mb-4 text-slate-900 dark:text-white">
                    <ReactMarkdown className="prose prose-lg prose-slate dark:prose-invert">{text.substring(0, seg.index)}</ReactMarkdown>
                  </div>
                );
          }
          
          let segmentText = text.substring(seg.index, endIdx);
          const isActive = i === currentSegmentIndex;
          
          nodes.push(
              <div 
                key={i} 
                id={`seg-${i}`}
                className={`transition-all duration-300 rounded-xl p-4 my-1 border-l-4 ${
                  isActive 
                  ? 'bg-primary/5 border-primary shadow-sm' 
                  : 'bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
              >
                  <ReactMarkdown 
                    className="prose prose-lg prose-slate dark:prose-invert max-w-none"
                    components={{
                        p: ({node, ...props}: any) => <p className={`mb-0 leading-relaxed ${isActive ? 'text-slate-900 dark:text-white font-medium' : 'text-slate-700 dark:text-slate-300'}`} {...props} />,
                        strong: ({node, ...props}: any) => <span className="font-bold text-primary dark:text-accent" {...props} />
                    }}
                  >
                      {segmentText}
                  </ReactMarkdown>
              </div>
          );
      }
      return <div>{nodes}</div>;
  };

  // Auto-scroll logic
  useEffect(() => {
     if (!isEditing) {
         let currentSegmentIndex = -1;
         for (let i = 0; i < segments.length; i++) {
             if (playbackTime >= segments[i].time) currentSegmentIndex = i;
             else break;
         }
         if (currentSegmentIndex >= 0) {
             const element = document.getElementById(`seg-${currentSegmentIndex}`);
             if (element) {
                 element.scrollIntoView({ behavior: 'smooth', block: 'center' });
             }
         }
     }
  }, [playbackTime, isEditing, segments]);

  const isVideoFile = originalFile?.file?.type.startsWith('video/');

  return (
    <div className="flex h-full relative overflow-hidden">
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* Floating Editor Toolbar (Only shown in Edit Mode) - DRAGGABLE */}
        {isEditing && (
          <div 
            className="absolute z-50 animate-in fade-in slide-in-from-top-4 duration-300"
            style={toolbarPosition ? {
              left: toolbarPosition.x,
              top: toolbarPosition.y,
              transform: 'none'
            } : {
              left: '50%',
              top: '1rem',
              transform: 'translateX(-50%)'
            }}
          >
            <div 
              ref={toolbarRef} 
              className={`flex items-center gap-1 bg-white/95 dark:bg-dark-card/95 backdrop-blur-xl rounded-2xl px-2 py-1.5 border border-slate-200/80 dark:border-white/10 shadow-xl shadow-slate-900/[0.08] ${isDragging ? 'cursor-grabbing' : ''}`}
            >
                {/* Drag Handle */}
                <div 
                  className="w-6 h-8 flex items-center justify-center cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                    const rect = (e.target as HTMLElement).closest('.absolute')?.getBoundingClientRect();
                    if (rect) {
                      dragStartRef.current = {
                        x: e.clientX,
                        y: e.clientY,
                        posX: rect.left,
                        posY: rect.top
                      };
                    }
                  }}
                >
                  <svg width="6" height="14" viewBox="0 0 6 14" fill="currentColor">
                    <circle cx="1.5" cy="1.5" r="1.5"/>
                    <circle cx="4.5" cy="1.5" r="1.5"/>
                    <circle cx="1.5" cy="7" r="1.5"/>
                    <circle cx="4.5" cy="7" r="1.5"/>
                    <circle cx="1.5" cy="12.5" r="1.5"/>
                    <circle cx="4.5" cy="12.5" r="1.5"/>
                  </svg>
                </div>

                <div className="w-px h-5 bg-slate-200 dark:bg-dark-border"></div>
                
                {/* Undo/Redo */}
                <button onClick={handleUndo} disabled={historyIndex === 0} className="w-8 h-8 rounded-2xl flex items-center justify-center text-slate-400 hover:text-primary hover:bg-slate-100 dark:hover:bg-dark-bg disabled:opacity-30 disabled:hover:text-slate-400 disabled:hover:bg-transparent transition-all" title="Undo"><ArrowArcLeft size={16} weight="bold"/></button>
                <button onClick={handleRedo} disabled={historyIndex === history.length - 1} className="w-8 h-8 rounded-2xl flex items-center justify-center text-slate-400 hover:text-primary hover:bg-slate-100 dark:hover:bg-dark-bg disabled:opacity-30 disabled:hover:text-slate-400 disabled:hover:bg-transparent transition-all" title="Redo"><ArrowArcRight size={16} weight="bold"/></button>

                <div className="w-px h-5 bg-slate-200 dark:bg-dark-border mx-1"></div>

                {/* Format Group */}
                <button onClick={() => execCmd('bold')} className="w-8 h-8 rounded-2xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-bg hover:text-primary transition-all font-bold text-sm" title="Bold">B</button>
                <button onClick={() => execCmd('italic')} className="w-8 h-8 rounded-2xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-bg hover:text-primary transition-all italic text-sm" title="Italic">I</button>
                <button onClick={() => execCmd('underline')} className="w-8 h-8 rounded-2xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-bg hover:text-primary transition-all underline text-sm" title="Underline">U</button>
                <button onClick={() => execCmd('strikeThrough')} className="w-8 h-8 rounded-2xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-bg hover:text-primary transition-all line-through text-sm" title="Strikethrough">S</button>

                <div className="w-px h-5 bg-slate-200 dark:bg-dark-border mx-1"></div>

                {/* Heading Dropdown */}
                <div className="relative">
                    <button onClick={() => toggleMenu('formatting')} className={`flex items-center gap-1 px-3 py-1.5 rounded-2xl text-xs font-semibold transition-all ${activeMenu === 'formatting' ? 'bg-primary/10 text-primary' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-dark-bg'}`}>
                       <TextT size={16} weight="bold" />
                       <CaretDown size={12} weight="bold" className={`transition-transform ${activeMenu === 'formatting' ? 'rotate-180' : ''}`}/>
                    </button>
                    {activeMenu === 'formatting' && (
                        <div className="absolute top-full left-0 mt-2 bg-white dark:bg-dark-card rounded-2xl shadow-xl border border-slate-100 dark:border-dark-border z-50 p-1.5 min-w-[140px] animate-in fade-in slide-in-from-top-2">
                           {['H1', 'H2', 'H3', 'P'].map((tag) => (
                             <button 
                               key={tag}
                               onClick={() => { applyHeading(tag); setActiveMenu(null); }} 
                               className="w-full flex items-center gap-2 px-2.5 py-2 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-bg rounded-lg transition-colors"
                             >
                               <span className="w-6 h-6 rounded-md bg-slate-100 dark:bg-dark-border flex items-center justify-center text-[10px] font-bold">{tag}</span>
                               {tag === 'P' ? 'Body' : `Heading ${tag.slice(1)}`}
                             </button>
                           ))}
                        </div>
                    )}
                </div>

                {/* Tools Dropdown */}
                <div className="relative">
                    <button onClick={() => toggleMenu('tools')} className={`flex items-center gap-1 px-3 py-1.5 rounded-2xl text-xs font-semibold transition-all ${activeMenu === 'tools' ? 'bg-primary/10 text-primary' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-dark-bg'}`}>
                       <MagicWand size={16} weight="duotone" />
                       <CaretDown size={12} weight="bold" className={`transition-transform ${activeMenu === 'tools' ? 'rotate-180' : ''}`}/>
                    </button>
                    {activeMenu === 'tools' && (
                        <div className="absolute top-full left-0 mt-2 bg-white dark:bg-dark-card rounded-2xl shadow-xl border border-slate-100 dark:border-dark-border z-50 p-2 min-w-[180px] animate-in fade-in slide-in-from-top-2">
                            <p className="px-2.5 py-1.5 text-[10px] font-bold text-slate-400 dark:text-dark-muted uppercase tracking-wider">Clean Up Tools</p>
                            <button onClick={() => { handleRemoveTimestamps(); setActiveMenu(null); }} className="w-full flex items-center gap-3 px-2.5 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-red-50 dark:hover:bg-red-900/10 hover:text-red-600 rounded-xl transition-colors group">
                              <div className="w-7 h-7 rounded-lg bg-red-100 dark:bg-red-900/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Timer size={16} weight="duotone" className="text-red-500"/>
                              </div>
                              <div>
                                <span className="block">Clear Timestamps</span>
                                <span className="text-[10px] text-slate-400 font-normal">Remove [00:00]</span>
                              </div>
                            </button>
                            <button onClick={() => { handleRemoveSpeakers(); setActiveMenu(null); }} className="w-full flex items-center gap-3 px-2.5 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-orange-50 dark:hover:bg-orange-900/10 hover:text-orange-600 rounded-xl transition-colors group">
                              <div className="w-7 h-7 rounded-lg bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <UserMinus size={16} weight="duotone" className="text-orange-500"/>
                              </div>
                              <div>
                                <span className="block">Strip Speakers</span>
                                <span className="text-[10px] text-slate-400 font-normal">Remove labels</span>
                              </div>
                            </button>
                            <button onClick={() => { handleCompactText(); setActiveMenu(null); }} className="w-full flex items-center gap-3 px-2.5 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-900/10 hover:text-blue-600 rounded-xl transition-colors group">
                              <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <TextAlignLeft size={16} weight="duotone" className="text-blue-500"/>
                              </div>
                              <div>
                                <span className="block">Compact Flow</span>
                                <span className="text-[10px] text-slate-400 font-normal">Remove blanks</span>
                              </div>
                            </button>
                        </div>
                    )}
                </div>

                <div className="w-px h-5 bg-slate-200 dark:bg-dark-border mx-1"></div>

                {/* Search */}
                <div className="relative">
                    <button onClick={() => toggleMenu('search')} className={`w-8 h-8 rounded-2xl flex items-center justify-center transition-all ${activeMenu === 'search' ? 'bg-primary/10 text-primary' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-dark-bg'}`} title="Find & Replace">
                       <MagnifyingGlass size={16} weight="bold" />
                    </button>
                    {activeMenu === 'search' && (
                        <div className="absolute top-full right-0 mt-2 bg-white dark:bg-dark-card rounded-2xl shadow-xl border border-slate-100 dark:border-dark-border z-50 p-3 w-64 animate-in fade-in slide-in-from-top-2">
                            <div className="relative mb-2">
                                <MagnifyingGlass size={13} weight="bold" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
                                <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Find..." className="w-full text-xs pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-dark-bg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-medium"/>
                            </div>
                            <div className="relative mb-3">
                                <Repeat size={13} weight="bold" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
                                <input value={replaceTerm} onChange={e => setReplaceTerm(e.target.value)} placeholder="Replace..." className="w-full text-xs pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-dark-bg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-medium"/>
                            </div>
                            <button onClick={() => { handleSearchReplace(); setActiveMenu(null); }} className="w-full bg-primary hover:bg-primary/90 text-white text-xs font-semibold py-2 rounded-lg transition-all">Replace All</button>
                        </div>
                    )}
                </div>
            </div>
          </div>
        )}


        {/* Google Docs Style Page Area */}
        <div className="flex-1 overflow-y-auto bg-slate-100 dark:bg-[#202124] custom-scrollbar">
          <div className="py-8 px-4">
            {/* The "Page" */}
            <div className="max-w-[816px] mx-auto bg-white dark:bg-dark-card rounded-xl shadow-sm border border-slate-200 dark:border-dark-border min-h-[1056px] p-12 sm:p-16">
               
               {/* Content Type Badge */}
               {contentType && (
                 <div className="mb-6 flex justify-start">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/5 border border-primary/10 text-[10px] font-bold uppercase tracking-wider text-primary dark:text-accent">
                       <Tag size={10} weight="bold" />
                       {contentType}
                    </div>
                 </div>
               )}

               {/* Editor Content */}
               <div className="outline-none min-h-[800px]">
                  {isEditing ? (
                     <div
                         key="editor-mode"
                         ref={contentEditableRef}
                         contentEditable
                         suppressContentEditableWarning
                         onInput={handleContentInput}
                         className="w-full focus:outline-none text-slate-900 dark:text-white leading-8 text-base bg-transparent whitespace-pre-wrap"
                         style={{ fontFamily: "'Inter', sans-serif" }}
                     />
                  ) : (
                      <div key="read-mode" className="read-mode-content prose prose-lg prose-slate dark:prose-invert max-w-none">
                         <ReactMarkdown
                           components={{
                             p: ({node, ...props}: any) => <p className="mb-4 leading-relaxed text-slate-900 dark:text-white" {...props} />,
                             h1: ({node, ...props}: any) => <h1 className="text-3xl font-bold mb-4 text-slate-900 dark:text-white" {...props} />,
                             h2: ({node, ...props}: any) => <h2 className="text-2xl font-bold mb-3 text-slate-900 dark:text-white" {...props} />,
                             h3: ({node, ...props}: any) => <h3 className="text-xl font-bold mb-2 text-slate-900 dark:text-white" {...props} />,
                             strong: ({node, ...props}: any) => <strong className="font-bold text-primary dark:text-accent" {...props} />,
                           }}
                         >
                           {text}
                         </ReactMarkdown>
                      </div>
                  )}
               </div>
            </div>
          </div>
        </div>

        {/* Dynamic Media Bar - Only visible in Edit mode when no audio */}
        {isEditing && (
          <div className={`flex-none border-t border-slate-200/50 dark:border-dark-border/50 bg-white/80 dark:bg-dark-card/80 backdrop-blur-sm transition-all duration-300 ${audioUrl && !isRecordingLive ? 'p-3' : 'p-4'}`}>
            <div className="max-w-[816px] mx-auto">
              {audioUrl && !isRecordingLive ? (
                /* Has Audio - Show Playback */
                <div className="flex items-center gap-4">
                  <PlaybackControl audioUrl={audioUrl} onTimeUpdate={setPlaybackTime} />
                </div>
              ) : (
                /* No Audio or Recording Live - Show Record/Upload Options */
                <div className="flex flex-col gap-3">
                  
                  {/* Interim Transcript Display */}
                  {isRecordingLive && interimTranscript && (
                    <div className="px-4 py-2.5 rounded-xl bg-primary/5 border border-primary/10 text-slate-600 dark:text-dark-muted text-sm italic animate-in fade-in slide-in-from-bottom-2">
                      <span className="text-primary dark:text-accent font-bold mr-2">Listening:</span>
                      {interimTranscript}...
                    </div>
                  )}

                  <div className="flex items-center justify-center gap-3">
                    {/* Record Button - More subtle */}
                    <button 
                      onClick={handleToggleLiveRecording}
                      className={`group flex items-center gap-2.5 px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-[0.98] ${
                        isRecordingLive 
                          ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' 
                          : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                      }`}
                    >
                      {isRecordingLive ? (
                        <>
                          <div className="flex items-center gap-1 mr-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                            <span className="w-1.5 h-3 rounded-full bg-white/60 animate-bounce [animation-delay:-0.2s]"></span>
                            <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse [animation-delay:0.4s]"></span>
                          </div>
                          <Stop size={14} weight="fill" className="fill-current"/>
                          <span>Stop</span>
                        </>
                      ) : (
                        <>
                          <Microphone size={16} weight="duotone" />
                          <span>Record Voice Note</span>
                        </>
                      )}
                    </button>
                    
                    {!isRecordingLive && (
                      <>
                        <span className="text-slate-300 dark:text-dark-border text-[10px] font-bold uppercase tracking-widest">or</span>
                        
                        {/* Upload Button - More subtle */}
                        <button 
                          onClick={onUploadClick}
                          className="group flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-dark-bg text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-200 dark:hover:bg-dark-border transition-all border border-slate-200/50 dark:border-white/5"
                        >
                          <UploadSimple size={16} weight="bold" className="text-primary dark:text-accent"/>
                          <span>Upload File</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* AI Sidebar */}
      {showAiSidebar && (
          <div className="w-[340px] flex-none bg-white dark:bg-dark-card border-l border-slate-200 dark:border-dark-border flex flex-col overflow-hidden animate-in slide-in-from-right-10 duration-200 shadow-2xl">
              <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-dark-border bg-slate-50/50 dark:bg-dark-bg/50">
                  <div className="flex items-center gap-2.5">
                      <div className="bg-primary/10 dark:bg-accent/10 p-2 rounded-xl">
                          <Sparkle size={18} weight="duotone" className="text-primary dark:text-accent" />
                      </div>
                      <div>
                          <div className="flex items-center gap-1.5">
                              <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-none">Smart Editor</h3>
                              <span className="px-1 py-0.5 rounded-md bg-primary/10 text-[7px] font-black tracking-tighter text-primary border border-primary/20 leading-none">BETA</span>
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-dark-muted mt-1 uppercase tracking-wider font-bold">Assistant</p>
                      </div>
                  </div>
                  <button onClick={onAiSidebarToggle} className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-dark-border text-slate-400 dark:hover:text-white transition-colors">
                      <X size={18} weight="bold" />
                  </button>
              </div>
              
              {/* AI Actions Grid */}
              <div className="p-4 grid grid-cols-2 gap-2 border-b border-slate-100 dark:border-dark-border bg-white dark:bg-dark-card">
                <button 
                  onClick={handleEnhance} 
                  disabled={isSummarizing} 
                  className={`flex flex-col items-center justify-center gap-2 p-3 rounded-2xl border transition-all ${
                    summaryTitle === "Smart Suggestions" 
                      ? "bg-primary text-white border-primary shadow-lg shadow-primary/20" 
                      : "bg-slate-50 dark:bg-dark-bg border-slate-100 dark:border-dark-border text-slate-600 dark:text-dark-muted hover:border-primary/30 dark:hover:border-accent/40 hover:bg-white dark:hover:bg-dark-card"
                  }`}
                >
                  <Sparkle size={20} weight="duotone" />
                  <span className="text-[11px] font-bold">Enhance</span>
                </button>
                <button 
                  onClick={handleSummarize} 
                  disabled={isSummarizing} 
                  className={`flex flex-col items-center justify-center gap-2 p-3 rounded-2xl border transition-all ${
                    summaryTitle === "Smart Summary" 
                      ? "bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20" 
                      : "bg-slate-50 dark:bg-dark-bg border-slate-100 dark:border-dark-border text-slate-600 dark:text-dark-muted hover:border-emerald-500/30 hover:bg-white dark:hover:bg-dark-card"
                  }`}
                >
                  <BookOpen size={20} weight="duotone" />
                  <span className="text-[11px] font-bold">Summary</span>
                </button>
                {isVideoFile && (
                  <button 
                    onClick={handleAnalyzeVideo} 
                    disabled={isSummarizing} 
                    className="col-span-2 flex items-center justify-center gap-2 p-2.5 rounded-2xl bg-slate-50 dark:bg-dark-bg border border-slate-100 dark:border-dark-border text-slate-600 dark:text-dark-muted hover:border-accent/30 hover:bg-white dark:hover:bg-dark-card transition-all"
                  >
                    <VideoCamera size={16} weight="duotone" />
                    <span className="text-[11px] font-bold">Analyze Video Content</span>
                  </button>
                )}
              </div>
              
              {/* AI Content Area */}
              <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-white dark:bg-dark-card">
                  {isSummarizing ? (
                      <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
                          <div className="relative">
                              <Spinner size={40} weight="bold" className="animate-spin text-primary" />
                              <Sparkle size={16} weight="duotone" className="absolute -top-1 -right-1 text-accent animate-pulse" />
                          </div>
                          <div className="text-center">
                              <p className="text-xs font-bold text-slate-700 dark:text-dark-text capitalize">AI is thinking...</p>
                              <p className="text-[10px] text-slate-400 dark:text-dark-muted mt-1 uppercase tracking-tighter">Analyzing document structure</p>
                          </div>
                      </div>
                  ) : summary ? (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-dark-muted">{summaryTitle}</span>
                            <div className="flex gap-1.5">
                                <button 
                                    onClick={handleCopySummary}
                                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-border text-slate-400 hover:text-primary transition-all"
                                    title="Copy to clipboard"
                                >
                                    {copied ? <Check size={14} weight="bold" className="text-emerald-500" /> : <Copy size={14} weight="duotone" />}
                                </button>
                            </div>
                        </div>
                        
                        <div className="prose prose-sm prose-slate dark:prose-invert max-w-none text-sm leading-relaxed font-medium animate-in fade-in slide-in-from-bottom-2 duration-500 pb-10">
                            <ReactMarkdown>{summary}</ReactMarkdown>
                        </div>
                        
                        {summaryTitle === "Smart Suggestions" && (
                            <div className="sticky bottom-0 bg-gradient-to-t from-white via-white/95 to-transparent dark:from-dark-card dark:via-dark-card/95 pt-10 pb-2">
                                <button 
                                    onClick={handleApplyEnhancement}
                                    className="w-full bg-gradient-to-tr from-primary to-purple-600 hover:brightness-110 text-white font-bold py-3.5 rounded-2xl text-[13px] flex items-center justify-center gap-2 shadow-xl shadow-primary/20 transition-all active:scale-[0.98]"
                                >
                                    <Checks size={18} weight="bold" /> Apply Changes to Document
                                </button>
                            </div>
                        )}
                      </div>
                  ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center px-4">
                          <div className="w-20 h-20 bg-slate-50 dark:bg-dark-bg rounded-[2.5rem] flex items-center justify-center mb-6 border border-slate-100 dark:border-dark-border shadow-inner group">
                              <Sparkle size={32} weight="duotone" className="text-primary/30 dark:text-accent/30 group-hover:scale-110 transition-transform duration-500" />
                          </div>
                          <h4 className="text-sm font-bold text-slate-800 dark:text-white mb-2">Ready to Assist</h4>
                          <p className="text-xs text-slate-400 dark:text-dark-muted leading-relaxed max-w-[180px]">
                              Select an AI action above to summarize or enhance your transcription.
                          </p>
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* Legacy sidebar for when AI sidebar is not open but we have a summary */}
      {showSummarySidebar && !showAiSidebar && (
          <div className="absolute right-4 top-16 bottom-24 w-80 bg-white/95 dark:bg-dark-card/95 backdrop-blur-xl shadow-2xl border border-slate-200 dark:border-dark-border rounded-2xl p-5 flex flex-col animate-in slide-in-from-right-10 duration-300 z-50">
              <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-dark-text flex items-center gap-2">
                      {summaryTitle === "Visual Analysis" ? <VideoCamera className="text-primary dark:text-accent" size={16} weight="duotone" /> : 
                       summaryTitle === "Smart Suggestions" ? <MagicWand className="text-primary dark:text-accent" size={16} weight="duotone" /> :
                       <BookOpen className="text-primary dark:text-accent" size={16} weight="duotone" />}
                      {summaryTitle}
                  </h3>
                  <button onClick={() => setShowSummarySidebar(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-border text-slate-400">
                      <X size={16} weight="bold" />
                  </button>
              </div>
              
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {isSummarizing ? (
                      <div className="flex flex-col items-center justify-center h-40 gap-3 text-slate-400">
                          <Spinner size={28} weight="bold" className="animate-spin text-primary" />
                          <span className="text-xs">AI Processing...</span>
                      </div>
                  ) : summary ? (
                      <>
                        <div className="prose prose-sm prose-slate dark:prose-invert text-sm">
                            <ReactMarkdown>{summary}</ReactMarkdown>
                        </div>
                        {summaryTitle === "Smart Suggestions" && (
                            <button 
                                onClick={handleApplyEnhancement}
                                className="w-full mt-4 bg-primary hover:bg-primary/90 text-white font-bold py-2.5 rounded-lg text-xs"
                            >
                                <Checks size={14} weight="bold" /> Apply Suggestions
                            </button>
                        )}
                      </>
                  ) : null}
              </div>
          </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-4 duration-300">
          <div className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl backdrop-blur-xl border ${
            toast.type === 'error' 
              ? 'bg-red-500/90 text-white border-red-400/20' 
              : toast.type === 'warning'
              ? 'bg-amber-500/90 text-white border-amber-400/20'
              : 'bg-slate-800/90 text-white border-white/10'
          }`}>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              toast.type === 'error' ? 'bg-red-600' : toast.type === 'warning' ? 'bg-amber-600' : 'bg-slate-700'
            }`}>
              <WarningCircle size={16} weight="duotone" />
            </div>
            <p className="text-sm font-semibold max-w-xs">{toast.message}</p>
            <button 
              onClick={() => setToast(null)}
              className="ml-2 p-1.5 rounded-lg hover:bg-white/20 transition-colors"
            >
              <X size={14} weight="bold" />
            </button>
          </div>
        </div>
      )}

      {/* Inline Recording Status Bar */}
      {isRecordingLive && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] animate-in slide-in-from-bottom-4 duration-500">
          <div className="bg-slate-900/90 dark:bg-white/90 backdrop-blur-xl px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-4 border border-white/10 dark:border-black/5">
             <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]"></div>
             <span className="text-xs font-black uppercase tracking-[0.2em] text-white dark:text-slate-900">Live Scribing...</span>
             <div className="w-px h-4 bg-white/20 dark:bg-black/10"></div>
             <button 
               onClick={handleToggleLiveRecording}
               className="p-1 px-3 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-widest transition-colors"
             >
               Stop
             </button>
          </div>
        </div>
      )}

      <style>{`
        .toolbar-btn { @apply p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-800 dark:hover:text-white transition-colors; }
        .toolbar-dropdown { @apply flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-all; }
        .toolbar-dropdown.active { @apply bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white; }
        
        .dropdown-item { @apply w-full px-3 py-2 text-xs font-medium text-left flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors; }
        
        .ai-action-btn { @apply flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-primary dark:text-accent bg-primary/5 dark:bg-accent/5 hover:bg-primary/10 dark:hover:bg-accent/10 border border-primary/10 dark:border-accent/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed; }
        
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 20px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #333; }

        /* Interactive Strikethrough */
        .interactive-strike { 
            text-decoration: line-through; 
            text-decoration-color: #ef4444; 
            text-decoration-thickness: 2px;
            color: #ef4444; 
            opacity: 0.7;
            cursor: pointer; 
            transition: all 0.2s;
        }
        .interactive-strike:hover {
            opacity: 1;
            background-color: rgba(239, 68, 68, 0.1);
        }
        
        /* Heading Styles */
        h1 { font-size: 1.75em; font-weight: 700; margin-top: 0.8em; margin-bottom: 0.4em; color: #0f172a; line-height: 1.3; }
        h2 { font-size: 1.4em; font-weight: 600; margin-top: 1em; margin-bottom: 0.4em; color: #1e293b; line-height: 1.35; }
        h3 { font-size: 1.2em; font-weight: 600; margin-top: 1em; margin-bottom: 0.4em; color: #334155; }
        
        .dark h1, .dark h2, .dark h3 { color: #f1f5f9; }
        
        /* Prose Styles */
        .prose { color: #1e293b; }
        .dark .prose { color: #e2e8f0; }
        .prose strong { color: #710096; font-weight: 600; }
        .dark .prose strong { color: #5EC5D4; }

        .timestamp-chip {
           background: #f1f5f9; color: #64748b; font-family: monospace; font-size: 0.75em; padding: 2px 6px; border-radius: 4px; margin-right: 6px; vertical-align: middle; user-select: none;
        }
        .dark .timestamp-chip { background: #1e293b; color: #94a3b8; }
        
        /* Active segment highlighting */
        .segment-active {
          background: rgba(113, 0, 150, 0.05);
          border-left: 3px solid #710096;
          padding-left: 1rem;
          margin-left: -1rem;
        }
        .dark .segment-active {
          background: rgba(94, 197, 212, 0.05);
          border-left-color: #5EC5D4;
        }
      `}</style>
    </div>
  );
};

export default TranscriptionEditor;