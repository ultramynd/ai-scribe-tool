import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, RefreshCw, AlertCircle, BarChart2 } from 'lucide-react';
import { formatTime } from '../utils/audioUtils';

interface AudioRecorderProps {
  onRecordingComplete: (blob: Blob) => void;
  isTranscribing: boolean;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({ onRecordingComplete, isTranscribing }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
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
    analyserRef.current.fftSize = 64; 
    source.connect(analyserRef.current);

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const draw = () => {
      if (!analyserRef.current) return;
      animationFrameRef.current = requestAnimationFrame(draw);
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
    draw();
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        onRecordingComplete(audioBlob);
        stopVisualizer();
        if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setDuration(0);
      startVisualizer(stream);
      timerIntervalRef.current = window.setInterval(() => setDuration(prev => prev + 1), 1000);
    } catch (err) {
      setError("Please allow microphone access.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
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
          </div>
      </div>

      {error && (
        <div className="mb-6 px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-2 animate-bounce">
          <AlertCircle size={14} /> {error}
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
                <Mic size={28} />
            </div>
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="flex items-center justify-center w-20 h-20 rounded-full bg-red-500 text-white shadow-2xl shadow-red-500/40 transition-all hover:scale-105 active:scale-95 group"
          >
            <div className="w-7 h-7 rounded-lg bg-white/20 group-hover:scale-90 transition-transform flex items-center justify-center">
                <Square size={20} fill="currentColor" />
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
            <RefreshCw size={18} />
          </button>
        )}
      </div>
    </div>
  );
};

export default AudioRecorder;