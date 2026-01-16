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
  const [isLiveEnabled, setIsLiveEnabled] = useState(false); // Default to disabled as requested
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

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    let phase = 0;
    const dataArray = new Uint8Array(16); // Small buffer for simple wave scaling

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);
      
      let normalizedAmp = 0;
      if (analyserRef.current) {
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for(let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        normalizedAmp = sum / (dataArray.length * 255);
      }

      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;
      
      const waves = [
        { color: '#710096', opacity: 0.1, amplitude: 0.4, speed: 0.04, frequency: 0.03 },
        { color: '#5EC5D4', opacity: 0.2, amplitude: 0.6, speed: 0.06, frequency: 0.02 },
        { color: '#710096', opacity: 0.3, amplitude: 0.8, speed: 0.03, frequency: 0.025 },
        { color: '#5EC5D4', opacity: 0.5, amplitude: 1.0, speed: 0.05, frequency: 0.015 }
      ];

      phase += 0.02; // Slower basic phase movement

      waves.forEach((wave) => {
        canvasCtx.beginPath();
        canvasCtx.lineWidth = 1.5;
        canvasCtx.strokeStyle = wave.color;
        canvasCtx.globalAlpha = wave.opacity;

        // Base amplitude: if recording use mic, else use a subtle "breathing" effect
        const baseAmp = isRecording 
          ? (normalizedAmp * 40 + 5) 
          : (Math.sin(phase * 0.5) * 2 + 3);
          
        const amp = baseAmp * wave.amplitude;

        for (let x = 0; x <= width; x += 2) {
          // Sine wave calculation with phase shift and frequency
          // The Math.sin(x / width * Math.PI) creates the "pinch" at both ends
          const y = centerY + Math.sin(x * wave.frequency + phase * wave.speed * 20) * amp * Math.sin(x / width * Math.PI);
          if (x === 0) canvasCtx.moveTo(x, y);
          else canvasCtx.lineTo(x, y);
        }
        
        canvasCtx.stroke();
      });
    };

    draw();
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isRecording]);

  const startVisualizer = (stream: MediaStream) => {
    try {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 32;
      source.connect(analyserRef.current);
    } catch (e) {
      console.warn("Visualizer init failed", e);
    }
  };

  const stopVisualizer = () => {
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
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
              {/* Elegant Wave Visualizer */}
              <div className="w-48 h-20 mb-4 relative">
                <canvas ref={canvasRef} width={200} height={100} className="w-full h-full relative z-10" />
                
                {/* Visualizer Glow Background */}
                <div className={`absolute inset-0 bg-gradient-to-r from-primary/10 to-accent/10 blur-2xl rounded-full transition-opacity duration-1000 ${isRecording ? 'opacity-100' : 'opacity-20'}`}></div>
              </div>

              {/* High-end Timer */}
              <div className={`text-6xl font-black tabular-nums tracking-[-0.05em] transition-all duration-500 ${isRecording ? 'text-slate-900 dark:text-white drop-shadow-[0_0_20px_rgba(113,0,150,0.2)]' : 'text-slate-300 dark:text-slate-600'}`}>
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
                      <span className="text-slate-400 dark:text-slate-400">{interimTranscript}</span>
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