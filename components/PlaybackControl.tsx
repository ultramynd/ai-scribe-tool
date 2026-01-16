import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, WarningCircle, SpeakerHigh, SpeakerSlash, Microphone, VideoCamera } from '@phosphor-icons/react';
import { formatTime } from '../utils/audioUtils';

interface PlaybackControlProps {
  audioUrl: string;
  contentType?: 'audio' | 'video' | null;
  minimal?: boolean;
  onTimeUpdate?: (currentTime: number) => void;
  seekToTime?: number;
  keyMoments?: Array<{ time: number; label: string }>;
}

const PlaybackControl: React.FC<PlaybackControlProps> = ({ 
  audioUrl, 
  contentType = null,
  minimal = false, 
  onTimeUpdate,
  seekToTime,
  keyMoments = []
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [waveformBars] = useState(Array.from({ length: 40 }, () => Math.random()));

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => {
        setCurrentTime(audio.currentTime);
        if (onTimeUpdate) onTimeUpdate(audio.currentTime);
        
        // Retry getting duration if it was missing or infinite
        if (!duration || duration === Infinity || duration === 0) {
           if (Number.isFinite(audio.duration) && audio.duration > 0) {
               setDuration(audio.duration);
           }
        }
    };
    const updateDuration = () => {
        // Handle explicit duration change or metadata load
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
    audio.addEventListener('durationchange', updateDuration); // Add durationchange listener
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('durationchange', updateDuration);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [onTimeUpdate, duration]); // Add duration dependency to ensure we stop checking once found

  useEffect(() => {
    if (audioRef.current) {
        audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    if (audioRef.current) {
        audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Handle external seek requests
  useEffect(() => {
    if (seekToTime !== undefined && audioRef.current && !loadError) {
      audioRef.current.currentTime = seekToTime;
      setCurrentTime(seekToTime);
    }
  }, [seekToTime, loadError]);

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

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (newVolume > 0) setIsMuted(false);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
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
        <div className={`${minimal ? 'flex items-center gap-3 py-1' : 'bg-white/80 dark:bg-dark-card/80 backdrop-blur-md rounded-2xl p-4 border border-slate-200/50 dark:border-dark-border shadow-2xl shadow-primary/10 flex items-center gap-4'}`}>
            < WarningCircle size={20} className="text-slate-400" />
            <span className="text-sm">Playback Error</span>
        </div>
      );
  }

  return (
    <div className={`
        ${minimal 
            ? 'flex items-center gap-3 py-1' 
            : 'bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/50 dark:border-white/[0.05] rounded-full p-2 pr-6 shadow-xl shadow-slate-200/50 dark:shadow-black/40 flex items-center gap-4 w-full max-w-2xl mx-auto transition-all duration-300 hover:scale-[1.005] hover:shadow-2xl hover:shadow-slate-300/50 dark:hover:shadow-black/50'
        }
    `}>
      <audio ref={audioRef} src={audioUrl} className="hidden" />
      
      {/* 1. Play Button (Left Capsule) */}
      <button
        onClick={togglePlay}
        className="w-12 h-12 rounded-full bg-primary hover:bg-primary-600 text-white flex items-center justify-center shadow-lg shadow-primary/20 transition-all active:scale-95 shrink-0"
      >
        {isPlaying ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" className="ml-0.5" />}
      </button>

      {/* 2. Waveform & Progress (Center) */}
      <div className="flex-1 flex flex-col gap-1 min-w-0 relative h-9 justify-center">
          {/* Waveform Visualization */}
          {!minimal && (
            <div className="absolute inset-0 flex items-center justify-between gap-[2px] opacity-20 pointer-events-none h-5 top-2">
              {waveformBars.map((height, i) => (
                <div
                  key={i}
                  className="w-1 bg-slate-900 dark:bg-white rounded-full transition-all duration-300"
                  style={{
                    height: `${20 + (height * 60)}%`, // Random height between 20% - 80%
                    opacity: i < (currentTime / duration) * waveformBars.length ? 0.8 : 0.2
                  }}
                />
              ))}
            </div>
          )}
          
          {/* Progress Bar (Overlay) */}
          <div className="relative h-1 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden mt-0.5">
               <div 
                  className="h-full bg-primary rounded-full transition-all duration-100 ease-linear"
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
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
          />

          {/* Time Labels */}
          <div className="flex justify-between text-[9px] font-bold text-slate-400 dark:text-slate-500 px-0.5 mt-0.5 pointer-events-none tracking-tight">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
          </div>
      </div>

      {/* 3. Volume & Speed (Right) */}
      <div className="flex items-center gap-3 border-l border-slate-200 dark:border-white/10 pl-4 h-6">
          <button 
              onClick={toggleMute}
              className="text-slate-400 dark:text-slate-400 hover:text-primary dark:hover:text-white transition-colors"
          >
              {isMuted || volume === 0 ? <SpeakerSlash size={16} /> : <SpeakerHigh size={16} />}
          </button>
          
          <button 
              onClick={toggleSpeed}
              className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-white/10 text-[10px] font-black text-slate-500 dark:text-slate-300 hover:bg-primary/10 hover:text-primary dark:hover:text-white transition-all"
          >
              {playbackRate}x
          </button>
      </div>
    </div>
  );
};

export default PlaybackControl;