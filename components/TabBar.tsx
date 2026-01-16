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
    <div className="w-full bg-[#050505] dark:bg-[#050505] border-t-2 border-indigo-500 border-b border-white/[0.05] px-2 py-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar relative z-[60]">
      <AnimatePresence mode="popLayout">
        {tabs.map((tab) => (
          <motion.div
            key={tab.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={() => onTabSelect(tab.id)}
            className={`
              group relative flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer min-w-[120px] max-w-[200px] border select-none
              ${activeTabId === tab.id 
                ? 'bg-[#151515] border-white/[0.1] text-indigo-100 shadow-sm' 
                : 'bg-transparent border-transparent text-slate-500 hover:bg-white/[0.03] hover:text-slate-300'}
            `}
          >
            {/* Dot Indicator */}
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeTabId === tab.id ? 'bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.5)]' : 'bg-slate-700'}`}></div>
            
            <FileText size={12} weight={activeTabId === tab.id ? "fill" : "regular"} className="shrink-0 opacity-70" />
            
            <span className="flex-1 truncate pt-0.5">{tab.title || 'New Document'}</span>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
              className={`p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-all shrink-0 ${activeTabId === tab.id ? 'hover:bg-white/10 hover:text-white' : 'hover:bg-white/5 hover:text-red-400'}`}
            >
              <X size={10} weight="bold" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
      
      {/* New Tab Button */}
      <button 
        onClick={onNewTab}
        className="w-8 h-8 flex items-center justify-center rounded-full text-slate-500 hover:text-indigo-400 hover:bg-white/[0.05] transition-all shrink-0 ml-1"
        title="New Document"
      >
        <Plus size={16} weight="regular" />
      </button>

      <div className="flex-1" /> {/* Spacer to push content left */}
    </div>
  );
};
export default TabBar;
