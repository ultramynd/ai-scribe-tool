import React, { useState, useEffect, useRef } from 'react';
import { Microphone, StopCircle, Copy, Check, WarningCircle, Spinner } from '@phosphor-icons/react';
import { startLiveTranscription } from '../services/webSpeechService';

interface LiveTranscriberProps {
  onStop: (finalText: string) => void;
  onCancel: () => void;
}

const LiveTranscriber: React.FC<LiveTranscriberProps> = ({ onStop, onCancel }) => {
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [isListening, setIsListening] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  const stopRef = useRef<(() => string) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to bottom on updates
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript, interim]);

  useEffect(() => {
    // Start listening on mount
    try {
      const { stop } = startLiveTranscription(
        { language: 'en-US' },
        (result) => {
          if (result.isFinal) {
            setTranscript(result.text); 
            setInterim('');
          } else {
            setInterim(result.text.substring(transcript.length));
          }
        },
        (err) => {
          console.error("Live transcription error:", err);
          if (err.message.includes('not-allowed')) {
            setError("Microphone access denied. Please check your permissions.");
          } else {
             setError("Connection lost or error. Trying to resume...");
          }
        }
      );
      stopRef.current = stop;
    } catch (err: any) {
      setError(err.message || "Failed to start microphone.");
      setIsListening(false);
    }

    return () => {
      // Cleanup on unmount
      if (stopRef.current) stopRef.current();
    };
  }, []);

  const handleStop = () => {
    if (stopRef.current) {
      const final = stopRef.current();
      setIsListening(false);
      onStop(final);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(transcript + interim);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full max-h-[70vh] w-full max-w-4xl mx-auto">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="relative">
             <div className="w-4 h-4 rounded-full bg-red-500 animate-pulse"></div>
             <div className="absolute inset-0 w-4 h-4 rounded-full bg-red-500 animate-ping opacity-75"></div>
          </div>
          <div className="flex flex-col">
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-none">Intelligence Live</h2>
            <span className="text-[10px] text-primary dark:text-accent font-black uppercase tracking-[0.3em] mt-1.5 animate-pulse">Capturing Audio Node</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
           <button 
             onClick={handleCopy}
             className="p-3 text-slate-400 hover:text-primary dark:hover:text-accent transition-all rounded-2xl hover:bg-white dark:hover:bg-dark-card shadow-sm border border-transparent hover:border-slate-100 dark:hover:border-white/5"
             title="Copy Text"
           >
             {copied ? <Check size={20} weight="bold" className="text-emerald-500"/> : <Copy size={20} weight="bold"/>}
           </button>
        </div>
      </div>

      {/* Main Transcript Area */}
      <div 
        ref={scrollRef}
        className="flex-1 bg-white/40 dark:bg-dark-card/30 backdrop-blur-xl rounded-[2.5rem] border border-slate-200/50 dark:border-white/5 shadow-2xl p-10 overflow-y-auto mb-10 font-serif text-xl leading-relaxed relative group"
      >
        {/* Decorative corner */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl -z-10 group-hover:bg-primary/10 transition-colors"></div>

        {error ? (
           <div className="flex flex-col items-center justify-center h-full text-red-500">
              <WarningCircle size={64} weight="duotone" className="mb-4 opacity-80" />
              <p className="font-bold text-center max-w-xs">{error}</p>
              <button 
                onClick={onCancel} 
                className="mt-6 px-6 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-xs font-black uppercase tracking-widest hover:bg-red-100 transition-colors"
              >
                Terminate Session
              </button>
           </div>
        ) : (
           <div className="relative">
              {!transcript && !interim && isListening && (
                <div className="absolute inset-0 flex items-center justify-center opacity-30 select-none">
                  <div className="flex flex-col items-center gap-4">
                    <Spinner size={32} weight="bold" className="animate-spin text-primary" />
                    <p className="font-sans text-xs font-black uppercase tracking-[0.2em]">Awaiting Speech Input</p>
                  </div>
                </div>
              )}
              <span className="text-slate-800 dark:text-slate-200 transition-colors duration-500">{transcript}</span>
              <span className="text-slate-400 dark:text-dark-muted transition-colors duration-500">{interim}</span>
              {isListening && (
                <span className="inline-block w-[3px] h-6 bg-primary dark:bg-accent ml-1 animate-pulse align-middle shadow-[0_0_10px_rgba(113,0,150,0.5)]"></span>
              )}
           </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center">
         <button 
           onClick={handleStop}
           className="group relative flex items-center gap-4 px-10 py-5 rounded-[2rem] bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black uppercase tracking-widest text-xs shadow-2xl hover:scale-105 active:scale-95 transition-all overflow-hidden"
         >
           <div className="absolute inset-0 bg-gradient-to-r from-red-600 to-red-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
           <StopCircle size={22} weight="fill" className="relative z-10 text-white dark:group-hover:text-white" />
           <span className="relative z-10">End Transcription</span>
         </button>
      </div>

    </div>
  );
};

export default LiveTranscriber;
