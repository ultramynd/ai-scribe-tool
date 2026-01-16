import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, FileText, CaretUp, CaretDown } from '@phosphor-icons/react';
import { EditorTab } from '../types';


interface TabBarProps {
  tabs: EditorTab[];
  activeTabId: string | null;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onNewTab: () => void;
}

const TabBar: React.FC<TabBarProps> = ({ tabs, activeTabId, onTabSelect, onTabClose, onNewTab }) => {
  if (tabs.length === 0) return null;

  return (
    <div className="w-full bg-white/40 dark:bg-dark-bg/40 backdrop-blur-3xl border-b border-slate-200 dark:border-white/[0.05] px-4 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar relative z-[60]">
      <AnimatePresence mode="popLayout">
        {tabs.map((tab) => (
          <motion.div
            key={tab.id}
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            whileHover={{ y: -1 }}
            onClick={() => onTabSelect(tab.id)}
            className={`
              group relative flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer min-w-[140px] max-w-[220px] border
              ${activeTabId === tab.id 
                ? 'bg-white dark:bg-dark-card border-slate-200 dark:border-white/[0.04] shadow-lg shadow-slate-900/[0.04] text-primary dark:text-white ring-1 ring-black/5 dark:ring-white/[0.02]' 
                : 'bg-transparent border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-white/5 hover:text-slate-700 dark:hover:text-slate-200'}
            `}
          >
            <div className={`w-2 h-2 rounded-full ${tab.transcription.isLoading ? 'bg-amber-500 animate-pulse' : (activeTabId === tab.id ? 'bg-primary dark:bg-accent' : 'bg-slate-300 dark:bg-slate-600')}`}></div>
            <FileText size={14} weight={activeTabId === tab.id ? "duotone" : "bold"} className="shrink-0" />
            <span className="flex-1 truncate">{tab.title || 'New Transcription'}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
              className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 transition-all shrink-0"
            >
              <X size={10} weight="bold" />
            </button>
            {activeTabId === tab.id && (
              <motion.div 
                layoutId="activeTabGlow"
                className="absolute inset-0 rounded-2xl ring-2 ring-primary/20 dark:ring-accent/20 pointer-events-none"
              />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
      
      {/* New Tab Button */}
      <button 
        onClick={onNewTab}
        className="w-10 h-10 flex items-center justify-center rounded-2xl text-slate-400 dark:text-slate-200 hover:bg-white dark:hover:bg-dark-card hover:text-primary dark:hover:text-accent hover:shadow-xl hover:shadow-slate-900/[0.05] transition-all shrink-0 border border-transparent hover:border-slate-100 dark:hover:border-white/5"
        title="New Document"
      >
        <Plus size={18} weight="bold" />
      </button>

      {/* Separator - Removed */}
      {/* Zen Mode Toggle - Removed (Moved to Editor Header) */}
    </div>
  );
};
export default TabBar;
