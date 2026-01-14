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
            <div className="flex items-center gap-3 px-2 w-full text-slate-400 dark:text-dark-muted">
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-dark-bg flex items-center justify-center flex-shrink-0">
                    <WarningCircle size={20} weight="duotone" />
                </div>
                <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-600 dark:text-dark-text">Preview Unavailable</span>
                    <span className="text-xs">Browser format unsupported</span>
                </div>
            </div>
        </div>
      );
  }

  return (
    <div className={`
        ${minimal ? 'flex items-center gap-3 py-1' : 'bg-white/80 dark:bg-dark-card/80 backdrop-blur-md rounded-2xl p-4 border border-slate-200/50 dark:border-dark-border shadow-2xl shadow-primary/10 flex flex-col gap-3 transition-all hover:shadow-xl hover:shadow-primary/15'}
    `}>
      <audio ref={audioRef} src={audioUrl} className="hidden" />
      
      <div className="flex items-center gap-4 w-full">
        {/* Media Type Indicator & Play Button */}
        <div className="flex items-center gap-2 shrink-0">
          {contentType && !minimal && (
            <div className="w-8 h-8 rounded-lg bg-primary/10 dark:bg-accent/10 flex items-center justify-center">
              {contentType === 'video' ? (
                <VideoCamera size={16} weight="duotone" className="text-primary dark:text-accent" />
              ) : (
                <Microphone size={16} weight="duotone" className="text-primary dark:text-accent" />
              )}
            </div>
          )}
          
          <button
            onClick={togglePlay}
            className={`${minimal ? 'w-9 h-9' : 'w-12 h-12'} flex items-center justify-center rounded-full bg-gradient-to-br from-primary to-purple-600 text-white hover:shadow-lg hover:shadow-primary/40 transition-all shrink-0 active:scale-95`}
          >
            {isPlaying ? <Pause size={minimal ? 16 : 20} weight="fill" /> : <Play size={minimal ? 16 : 20} weight="fill" className="ml-0.5" />}
          </button>
        </div>

        {/* Main Controls */}
        <div className="flex-1 flex flex-col justify-center gap-2 min-w-0">
          <div className="relative group h-5 flex items-center">
              {/* Waveform Background (decorative) */}
              {!minimal && (
                <div className="absolute inset-0 flex items-center gap-0.5 px-1 opacity-20">
                  {waveformBars.map((height, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-accent rounded-full transition-all duration-150"
                      style={{
                        height: `${height * 100}%`,
                        opacity: isPlaying && i < (currentTime / duration) * waveformBars.length ? 1 : 0.3
                      }}
                    />
                  ))}
                </div>
              )}
              
              {/* Progress Track */}
              <div className="absolute inset-0 h-2 bg-slate-200 dark:bg-dark-border rounded-full overflow-hidden">
                  <div 
                      className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-100"
                      style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                  ></div>
                  
                  {/* Key Moments Markers */}
                  {keyMoments.map((moment, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 w-0.5 bg-yellow-500"
                      style={{ left: `${(moment.time / (duration || 1)) * 100}%` }}
                      title={moment.label}
                    />
                  ))}
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

          <div className="flex justify-between items-center text-[10px] text-slate-500 dark:text-dark-muted font-mono tracking-wide px-1">
            <span className="font-bold tabular-nums">{formatTime(currentTime)}</span>
            {!minimal && (
              <div className="flex gap-3">
                  <button onClick={() => skip(-10)} className="hover:text-primary dark:hover:text-accent transition-colors font-semibold">-10s</button>
                  <button onClick={() => skip(10)} className="hover:text-primary dark:hover:text-accent transition-colors font-semibold">+10s</button>
              </div>
            )}
            <span className="font-bold tabular-nums">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Extra Controls */}
        {!minimal && (
            <div className="flex items-center gap-2 border-l border-slate-200 dark:border-dark-border pl-3">
                {/* Volume Control */}
                <div className="flex items-center gap-2 group/volume">
                  <button 
                      onClick={toggleMute}
                      className="w-8 h-8 flex items-center justify-center text-slate-500 dark:text-dark-muted hover:text-primary dark:hover:text-accent transition-colors"
                  >
                      {isMuted || volume === 0 ? <SpeakerSlash size={18} weight="duotone" /> : <SpeakerHigh size={18} weight="duotone" />}
                  </button>
                  <div className="w-0 group-hover/volume:w-16 overflow-hidden transition-all duration-200">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="w-16 h-1 bg-slate-200 dark:bg-dark-border rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                    />
                  </div>
                </div>
                
                {/* Speed Control */}
                <button 
                    onClick={toggleSpeed}
                    className="w-11 h-8 text-xs font-bold text-slate-600 dark:text-dark-muted hover:text-primary dark:hover:text-accent hover:bg-primary/10 dark:hover:bg-accent/10 rounded-lg transition-all tabular-nums"
                    title="Playback Speed"
                >
                    {playbackRate}x
                </button>
            </div>
        )}
      </div>
    </div>
  );
};

export default PlaybackControl;