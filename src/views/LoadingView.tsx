import React from 'react';
import { Sparkle, Cpu, Clock, Lightning, X } from '@phosphor-icons/react';

interface LoadingViewProps {
  progress: number;
  logLines: string[];
  transcriptionMode: 'verbatim' | 'polish';
  isDeepThinking: boolean;
  onCancel?: () => void;
}

const LoadingView: React.FC<LoadingViewProps> = ({ 
  progress, 
  logLines, 
  transcriptionMode, 
  isDeepThinking,
  onCancel
}) => {
  return (
    <div className="min-h-screen bg-dark-bg flex flex-col items-center justify-center p-6 relative overflow-hidden text-dark-text font-sans">
      
      {/* Animated Background */}
      <div className="absolute inset-0 w-full h-full overflow-hidden z-0">
        {/* Gradient Blobs */}
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/20 rounded-full mix-blend-screen filter blur-[100px] animate-blob"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-accent/20 rounded-full mix-blend-screen filter blur-[100px] animate-blob animation-delay-2000"></div>
        
        {/* Floating Particles */}
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-accent/30 rounded-full animate-float"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${5 + Math.random() * 10}s`
            }}
          />
        ))}
        
        {/* Noise Texture */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150"></div>
      </div>

      <div className="relative z-10 w-full max-w-lg">
          
          {/* Enhanced Core Reactor */}
          <div className="relative w-40 h-40 mx-auto mb-16 group cursor-pointer">
             {/* Outer rotating rings */}
             <div className="absolute inset-0 border border-primary/30 rounded-full animate-[spin_10s_linear_infinite]"></div>
             <div className="absolute inset-4 border border-accent/30 rounded-full animate-[spin_15s_linear_infinite_reverse]"></div>
             
             {/* Pulsing rings */}
             <div className="absolute inset-0 border-2 border-primary/40 rounded-full animate-ping opacity-20"></div>
             <div className="absolute inset-8 border-2 border-accent/40 rounded-full animate-ping opacity-20" style={{ animationDelay: '0.5s' }}></div>
             
             {/* Glow effect */}
             <div className="absolute inset-0 bg-gradient-to-b from-primary/20 to-accent/20 rounded-full blur-2xl animate-pulse"></div>
             
             {/* Center icon with hover effect */}
             <div className="absolute inset-0 flex items-center justify-center">
               <div className="absolute w-32 h-32 bg-primary/40 rounded-full blur-xl animate-pulse"></div>
               <div className="w-24 h-24 bg-primary rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(113,0,150,0.5)] group-hover:shadow-[0_0_50px_rgba(113,0,150,0.8)] transition-all duration-500 group-hover:scale-110 z-20">
                  <Lightning size={48} weight="fill" className="text-white animate-pulse" />
               </div>
             </div>
             
             {/* Orbiting dots */}
             <div className="absolute inset-0 animate-[spin_20s_linear_infinite]">
               <div className="absolute top-0 left-1/2 w-2 h-2 bg-primary rounded-full -translate-x-1/2 animate-pulse"></div>
             </div>
             <div className="absolute inset-0 animate-[spin_25s_linear_infinite_reverse]">
               <div className="absolute bottom-0 left-1/2 w-2 h-2 bg-accent rounded-full -translate-x-1/2 animate-pulse" style={{ animationDelay: '0.5s' }}></div>
             </div>
          </div>

          <div className="text-center mb-12 relative">
             <h2 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-white to-gray-400 mb-4 tracking-tight animate-in fade-in slide-in-from-bottom-4 duration-700">Processing Media</h2>
          </div>

          {/* Enhanced Terminal Log with distinct border and header */}
          <div className="bg-dark-card/40 backdrop-blur-xl rounded-2xl border border-white/5 mb-8 font-mono text-[11px] h-44 overflow-hidden flex flex-col shadow-2xl relative group transition-all duration-500">
            {/* Window Header (Distinct Area with "Invisible" spacer) */}
            <div className="flex-none h-11 flex items-center px-5 bg-black/40 border-b border-white/5">
              <div className="flex items-center gap-3 py-1 px-2.5 rounded-full bg-black/50 border border-white/5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F56] shadow-[0_0_8px_rgba(255,95,86,0.3)]"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E] shadow-[0_0_8px_rgba(255,189,46,0.3)]"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-[#27C93F] shadow-[0_0_8px_rgba(39,201,63,0.3)]"></div>
              </div>
              <div className="flex-1 text-right pr-4 text-[9px] text-dark-muted font-black uppercase tracking-[0.3em] opacity-30">System Shell v2.1</div>
            </div>
            
            {/* Log lines area with padding from header */}
            <div className="flex-1 flex flex-col justify-end p-5 space-y-2.5 overflow-hidden">
              {logLines.slice(-4).map((line, i) => (
                <div 
                  key={i} 
                  className="flex items-start gap-4 animate-in slide-in-from-left-2 fade-in duration-300"
                  style={{ animationDelay: `${i * 0.15}s` }}
                >
                  <span className={`transition-all duration-300 ${i === logLines.slice(-4).length - 1 ? "text-dark-text opacity-100" : "text-dark-muted opacity-50"}`}>
                     {line}
                  </span>
                </div>
              ))}
              {/* Custom glowing cursor line */}
              <div className="flex items-center gap-2 pt-1">
                 <div className="w-1.5 h-3.5 bg-accent shadow-[0_0_10px_rgba(94,197,212,0.8)] animate-pulse"></div>
                 <div className="h-0.5 w-12 bg-gradient-to-r from-accent to-transparent opacity-20"></div>
              </div>
            </div>
          </div>

          {/* Enhanced Progress Bar */}
          <div className="relative h-1.5 bg-dark-border rounded-full overflow-hidden group cursor-pointer">
             <div 
               className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary via-accent to-primary w-full transition-transform duration-300 ease-out group-hover:shadow-[0_0_20px_rgba(113,0,150,0.5)]"
               style={{ transform: `translateX(${progress - 100}%)` }}
             >
               {/* Shimmer effect */}
               <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-r from-transparent to-white blur-md animate-pulse"></div>
               
               {/* Moving highlight */}
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
             </div>
          </div>
          
          {/* Progress info with animation */}
          <div className="flex justify-between mt-3 text-[10px] font-mono text-dark-muted font-bold">
             <span className="animate-pulse">00:00</span>
             <span className="tabular-nums transition-all duration-300">{Math.round(progress)}%</span>
          </div>

          {/* Cancel Button */}
          {onCancel && (
             <button
                onClick={onCancel}
                className="mt-8 mx-auto flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 border border-white/10 text-dark-muted hover:text-white hover:bg-red-500/20 hover:border-red-500/30 transition-all duration-300 text-sm font-medium group"
             >
                <X size={16} weight="bold" className="group-hover:text-red-400 transition-colors" />
                Cancel Transcription
             </button>
          )}
      </div>
    </div>
  );
};

export default LoadingView;
