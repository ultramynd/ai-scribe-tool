import React, { useState, useRef, useEffect } from 'react';
import { Microphone, Stop, ArrowsClockwise, WarningCircle, Brain, Sparkle, Spinner } from '@phosphor-icons/react';
import { formatTime } from '../utils/audioUtils';
import { AudioStreamRecorder } from '../services/audioStreamService';
import { transcribeAudioChunk } from '../services/groqService';

interface AudioRecorderProps {
  onRecordingComplete: (blob: Blob, liveText?: string) => void;
  isTranscribing: boolean;
  mode?: 'verbatim' | 'polish';
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({ onRecordingComplete, isTranscribing, mode = 'verbatim' }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  
  // Live Transcription State
  const [isLiveEnabled, setIsLiveEnabled] = useState(true); // Default to enabled with Groq
  const [liveTranscript, setLiveTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const audioStreamRecorderRef = useRef<AudioStreamRecorder | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerIntervalRef = useRef<number | null>(null);

  const startVisualizer = (stream: MediaStream) => {
    if (!canvasRef.current) return;
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = audioContextRef.current.createMediaStreamSource(stream);
    analyserRef.current = audioContextRef.current.createAnalyser();
    analyserRef.current.fftSize = 32; // Reduced from 64 for less processing
    source.connect(analyserRef.current);

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    let lastDrawTime = 0;
    const draw = (timestamp: number) => {
      if (!analyserRef.current) return;
      animationFrameRef.current = requestAnimationFrame(draw);
      
      // Cap visualizer at ~30fps to save CPU for transcription/recording
      if (timestamp - lastDrawTime < 33) return;
      lastDrawTime = timestamp;

      analyserRef.current.getByteFrequencyData(dataArray);

      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
      
      const barWidth = 4;
      const gap = 3;
      const barsCount = bufferLength;
      
      const totalWidth = barsCount * (barWidth + gap);
      let x = (canvas.width - totalWidth) / 2;

      for (let i = 0; i < barsCount; i++) {
        // Create a symmetric effect by mirroring the data
        const index = i < barsCount / 2 ? i : barsCount - 1 - i;
        const value = dataArray[index];
        const percent = value / 255;
        const height = Math.max(6, percent * canvas.height * 0.8);
        
        // Gradient for bars
        const gradient = canvasCtx.createLinearGradient(0, (canvas.height - height) / 2, 0, (canvas.height + height) / 2);
        gradient.addColorStop(0, '#710096'); // Primary
        gradient.addColorStop(1, '#5EC5D4'); // Accent
        
        canvasCtx.fillStyle = gradient;
        
        const y = (canvas.height - height) / 2;
        
        canvasCtx.beginPath();
        canvasCtx.roundRect(x, y, barWidth, height, 20);
        canvasCtx.fill();

        // Subtle glow effect
        if (isRecording) {
            canvasCtx.shadowBlur = 15;
            canvasCtx.shadowColor = '#5EC5D440';
        }

        x += barWidth + gap;
      }
    };
    requestAnimationFrame(draw);
  };

  const stopVisualizer = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const startRecording = async () => {
    setError(null);
    try {
      setLiveTranscript('');
      setInterimTranscript('');
      
      // Create AudioStreamRecorder with Groq Whisper transcription
      const recorder = new AudioStreamRecorder(
        async (chunk) => {
          // Handle each audio chunk for real-time transcription
          if (isLiveEnabled) {
            try {
              setInterimTranscript('Transcribing...');
              const chunkText = await transcribeAudioChunk(chunk, liveTranscript, mode);
              setLiveTranscript(prev => prev + ' ' + chunkText);
              setInterimTranscript('');
            } catch (err) {
              console.error('Chunk transcription error:', err);
              setInterimTranscript('');
            }
          }
        },
        (text) => {
          // Update transcript callback
          setLiveTranscript(prev => prev + ' ' + text);
        },
        5000 // 5-second chunks
      );
      
      await recorder.start();
      audioStreamRecorderRef.current = recorder;
      
      // Get stream for visualizer
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      setIsRecording(true);
      setDuration(0);
      startVisualizer(stream);
      timerIntervalRef.current = window.setInterval(() => setDuration(prev => prev + 1), 1000);
    } catch (err) {
      console.error('Recording error:', err);
      setError("Please allow microphone access or check your Groq API key.");
    }
  };

  const stopRecording = () => {
    if (audioStreamRecorderRef.current && isRecording) {
      const finalBlob = audioStreamRecorderRef.current.stop();
      const finalText = liveTranscript.trim();
      
      onRecordingComplete(finalBlob, finalText || undefined);
      stopVisualizer();
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
      
      setIsRecording(false);
      if (timerIntervalRef.current !== null) {
        window.clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
  };

  const resetRecording = () => {
    setDuration(0);
    setError(null);
  };

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current !== null) window.clearInterval(timerIntervalRef.current);
      stopVisualizer();
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
      if (audioStreamRecorderRef.current) audioStreamRecorderRef.current.stop();
    };
  }, []);

  return (
    <div className="flex flex-col items-center w-full max-w-sm mx-auto p-1 py-10 rounded-[3rem] bg-white/40 dark:bg-dark-card/20 backdrop-blur-3xl border border-white/60 dark:border-white/5 shadow-2xl relative overflow-hidden">
      
      {/* Visualizer & Timer Group */}
      <div className="relative w-full flex flex-col items-center justify-center mb-8">
          <div className="relative z-10 flex flex-col items-center">
              {/* Elegant Bar Visualizer */}
              <div className="w-48 h-20 mb-4">
                <canvas ref={canvasRef} width={200} height={100} className="w-full h-full" />
                {!isRecording && duration === 0 && (
                    <div className="flex justify-center gap-1.5 h-full items-center opacity-10">
                        {[1, 2, 3, 4, 5, 4, 3, 2, 1].map((h, i) => (
                            <div key={i} className="w-1 bg-slate-400 rounded-full" style={{ height: `${h * 4}px` }}></div>
                        ))}
                    </div>
                )}
              </div>

              {/* High-end Timer */}
              <div className={`text-6xl font-black tabular-nums tracking-[-0.05em] transition-all duration-500 ${isRecording ? 'text-slate-900 dark:text-white drop-shadow-[0_0_20px_rgba(113,0,150,0.2)]' : 'text-slate-300 dark:text-dark-muted'}`}>
                {formatTime(duration)}
              </div>
              <div className="text-[9px] font-black uppercase tracking-[0.25em] text-primary dark:text-accent mt-3 opacity-50">
                {isRecording ? 'Capturing Audio...' : 'Voice Interface'}
              </div>

              {/* Live Transcript Preview */}
              {isRecording && isLiveEnabled && (
                <div className="mt-6 w-full px-4 animate-in fade-in slide-in-from-top-2 duration-700">
                  <div className="bg-white/50 dark:bg-dark-card/30 backdrop-blur-md rounded-2xl p-4 border border-white/40 dark:border-white/5 min-h-[60px] max-h-[100px] overflow-y-auto">
                    <p className="text-[10px] font-sans leading-relaxed text-slate-800 dark:text-slate-200">
                      {liveTranscript}
                      <span className="text-slate-400 dark:text-dark-muted">{interimTranscript}</span>
                      <span className="inline-block w-0.5 h-3 bg-primary dark:bg-accent ml-1 animate-pulse align-middle"></span>
                    </p>
                  </div>
                </div>
              )}
          </div>
      </div>

      {error && (
        <div className="mb-6 px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-2 animate-bounce">
          <WarningCircle size={14} weight="duotone" /> {error}
        </div>
      )}

      {/* Controls Container */}
      <div className="flex items-center gap-8 relative z-10">
        {!isRecording ? (
          <button
            onClick={startRecording}
            disabled={isTranscribing}
            className="group relative flex items-center justify-center w-20 h-20 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-2xl transition-all hover:scale-105 active:scale-90 disabled:opacity-30 disabled:scale-100"
          >
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-primary to-accent opacity-0 group-hover:opacity-40 transition-opacity blur-xl"></div>
            <div className="relative z-10">
                <Microphone size={28} weight="duotone" />
            </div>
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="flex items-center justify-center w-20 h-20 rounded-full bg-red-500 text-white shadow-2xl shadow-red-500/40 transition-all hover:scale-105 active:scale-95 group"
          >
            <div className="w-7 h-7 rounded-lg bg-white/20 group-hover:scale-90 transition-transform flex items-center justify-center">
                <Stop size={20} weight="fill" />
            </div>
          </button>
        )}

        {duration > 0 && !isRecording && (
          <button
            onClick={resetRecording}
            disabled={isTranscribing}
            className="flex items-center justify-center w-12 h-12 rounded-2xl bg-white/50 dark:bg-dark-bg/50 border border-slate-200 dark:border-white/5 text-slate-400 hover:text-primary transition-all shadow-sm active:scale-95"
            title="Reset"
          >
            <ArrowsClockwise size={18} weight="duotone" />
          </button>
        )}

        {/* Live Intelligence Toggle */}
        {!isRecording && duration === 0 && (
          <button
            onClick={() => setIsLiveEnabled(!isLiveEnabled)}
            className={`flex flex-col items-center gap-2 group transition-all ${isLiveEnabled ? 'text-primary dark:text-accent' : 'text-slate-400'}`}
          >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${isLiveEnabled ? 'bg-primary/10 border-primary/20 shadow-lg shadow-primary/10' : 'bg-slate-100/50 dark:bg-white/5 border-transparent opacity-60'}`}>
              <Brain size={22} weight={isLiveEnabled ? "fill" : "duotone"} className={isLiveEnabled ? "animate-pulse" : ""} />
            </div>
            <span className="text-[8px] font-black uppercase tracking-widest leading-none">Live AI</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default AudioRecorder;