import React, { useState, useEffect, useRef } from 'react';
import { Mic, StopCircle, Copy, Check, AlertTriangle, Loader2 } from 'lucide-react';
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
    if (stopRef.current) stopRef.current();
    setIsListening(false);
    onStop(transcript + interim);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(transcript + interim);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full max-h-[80vh] w-full max-w-4xl mx-auto p-6">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="relative">
             <div className="w-4 h-4 rounded-full bg-red-500 animate-pulse"></div>
             <div className="absolute inset-0 w-4 h-4 rounded-full bg-red-500 animate-ping opacity-75"></div>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Listening Live...</h2>
        </div>
        
        <div className="flex items-center gap-2">
           <button 
             onClick={handleCopy}
             className="p-2 text-slate-400 hover:text-primary transition-all rounded-lg hover:bg-slate-100 dark:hover:bg-dark-card"
             title="Copy Text"
           >
             {copied ? <Check size={20} className="text-emerald-500"/> : <Copy size={20}/>}
           </button>
        </div>
      </div>

      {/* Main Transcript Area */}
      <div 
        ref={scrollRef}
        className="flex-1 bg-white/50 dark:bg-dark-card/30 backdrop-blur-md rounded-3xl border border-slate-200 dark:border-white/5 shadow-inner p-8 overflow-y-auto mb-8 font-serif text-lg leading-relaxed"
      >
        {error ? (
           <div className="flex flex-col items-center justify-center h-full text-red-500 opacity-80">
              <AlertTriangle size={48} className="mb-4" />
              <p className="font-bold">{error}</p>
              <button onClick={onCancel} className="mt-4 text-sm underline text-slate-500">Go Back</button>
           </div>
        ) : (
           <>
              <span className="text-slate-700 dark:text-slate-200">{transcript}</span>
              <span className="text-slate-400 dark:text-slate-500">{interim}</span>
              {isListening && (
                <span className="inline-block w-2 h-5 bg-primary/50 ml-1 animate-pulse align-middle"></span>
              )}
           </>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-6">
         <button 
           onClick={handleStop}
           className="group relative flex items-center gap-3 px-8 py-4 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold shadow-2xl hover:scale-105 active:scale-95 transition-all"
         >
           <StopCircle size={24} fill="currentColor" className="text-red-500" />
           <span>Stop & Edit</span>
         </button>
      </div>

    </div>
  );
};

export default LiveTranscriber;
