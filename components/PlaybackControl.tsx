import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Download, Rewind, FastForward, Settings2, AlertCircle } from 'lucide-react';
import { formatTime } from '../utils/audioUtils';

interface PlaybackControlProps {
  audioUrl: string;
  minimal?: boolean;
  onTimeUpdate?: (currentTime: number) => void;
}

const PlaybackControl: React.FC<PlaybackControlProps> = ({ audioUrl, minimal = false, onTimeUpdate }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => {
        setCurrentTime(audio.currentTime);
        if (onTimeUpdate) onTimeUpdate(audio.currentTime);
    };
    const updateDuration = () => {
        if (Number.isFinite(audio.duration)) {
            setDuration(audio.duration);
        }
    };
    const onEnded = () => setIsPlaying(false);
    const onError = () => {
        setLoadError(true);
        setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [onTimeUpdate]);

  useEffect(() => {
    if (audioRef.current) {
        audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Reset when url changes
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setLoadError(false);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.load();
    }
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current || loadError) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(e => {
          console.error("Playback failed:", e);
          setIsPlaying(false);
      });
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (loadError) return;
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const skip = (seconds: number) => {
      if (audioRef.current && !loadError) {
          audioRef.current.currentTime += seconds;
      }
  };

  const toggleSpeed = () => {
      const speeds = [1, 1.25, 1.5, 2];
      const nextIdx = (speeds.indexOf(playbackRate) + 1) % speeds.length;
      setPlaybackRate(speeds[nextIdx]);
  };

  if (loadError) {
      return (
        <div className={`${minimal ? 'flex items-center gap-3 py-1' : 'bg-white/80 dark:bg-dark-card/80 backdrop-blur-md rounded-full p-3 border border-slate-200/50 dark:border-dark-border shadow-2xl shadow-primary/10 flex items-center gap-4'}`}>
            <div className="flex items-center gap-3 px-2 w-full text-slate-400 dark:text-dark-muted">
                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-dark-bg flex items-center justify-center flex-shrink-0">
                    <AlertCircle size={16} />
                </div>
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-600 dark:text-dark-text">Preview Unavailable</span>
                    <span className="text-[10px]">Browser format unsupported</span>
                </div>
            </div>
        </div>
      );
  }

  return (
    <div className={`
        ${minimal ? 'flex items-center gap-3 py-1' : 'bg-white/80 dark:bg-dark-card/80 backdrop-blur-md rounded-full p-3 border border-slate-200/50 dark:border-dark-border shadow-2xl shadow-primary/10 flex items-center gap-4 transition-all hover:scale-[1.01] hover:bg-white dark:hover:bg-dark-card'}
    `}>
      <audio ref={audioRef} src={audioUrl} className="hidden" />
      
      {/* Play/Pause Button */}
      <button
        onClick={togglePlay}
        className={`${minimal ? 'w-8 h-8' : 'w-12 h-12'} flex items-center justify-center rounded-full bg-primary text-white hover:bg-primary/90 transition-all shrink-0 shadow-lg shadow-primary/30 active:scale-95`}
      >
        {isPlaying ? <Pause size={minimal ? 14 : 20} fill="currentColor" /> : <Play size={minimal ? 14 : 20} fill="currentColor" className="ml-1" />}
      </button>

      {/* Main Controls */}
      <div className="flex-1 flex flex-col justify-center gap-1.5 min-w-0">
        <div className="relative group h-4 flex items-center">
            {/* Custom Range Track Background */}
            <div className="absolute inset-0 h-1.5 bg-slate-200 dark:bg-dark-border rounded-full overflow-hidden">
                <div 
                    className="h-full bg-accent rounded-full transition-all duration-100 group-hover:bg-accent/80"
                    style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                ></div>
            </div>
            
            <input
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={currentTime}
            onChange={handleSeek}
            className="relative w-full h-full opacity-0 cursor-pointer z-10"
            />
        </div>

        <div className="flex justify-between text-[10px] text-slate-400 dark:text-dark-muted font-bold font-mono tracking-wider px-1">
          <span>{formatTime(currentTime)}</span>
          <div className="flex gap-4">
              <button onClick={() => skip(-10)} className="hover:text-primary dark:hover:text-accent transition-colors">-10s</button>
              <button onClick={() => skip(10)} className="hover:text-primary dark:hover:text-accent transition-colors">+10s</button>
          </div>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Extra Controls */}
      {!minimal && (
          <div className="flex items-center gap-1 border-l border-slate-200 dark:border-dark-border pl-3 pr-2">
              <button 
                  onClick={toggleSpeed}
                  className="w-10 text-xs font-bold text-slate-500 dark:text-dark-muted hover:text-primary dark:hover:text-accent hover:bg-primary/10 px-2 py-1.5 rounded-full transition-colors tabular-nums"
                  title="Playback Speed"
              >
                  {playbackRate}x
              </button>
          </div>
      )}
    </div>
  );
};

export default PlaybackControl;