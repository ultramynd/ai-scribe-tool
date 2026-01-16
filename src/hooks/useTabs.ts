import { useCallback, useMemo, useState } from 'react';
import { EditorTab } from '../../types';

interface UseTabsOptions {
  onCloseAll?: () => void;
}

export const useTabs = ({ onCloseAll }: UseTabsOptions = {}) => {
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const createTab = useCallback((data: Partial<EditorTab>) => {
    const id = data.id || Math.random().toString(36).substring(7);
    const newTab: EditorTab = {
      id,
      title: data.title || 'Untitled',
      transcription: data.transcription || { isLoading: false, text: null, error: null },
      contentType: data.contentType || null,
      recordedBlob: data.recordedBlob || null,
      micUrl: data.micUrl || null,
      uploadedFile: data.uploadedFile || null,
      isEditorMode: data.isEditorMode ?? false,
      showAiSidebar: data.showAiSidebar ?? false
    };

    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
    return id;
  }, []);

  const updateActiveTab = useCallback((updates: Partial<EditorTab>) => {
    setTabs(prev => prev.map(tab => (tab.id === activeTabId ? { ...tab, ...updates } : tab)));
  }, [activeTabId]);

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      const tabToClose = prev.find(tab => tab.id === id);
      if (tabToClose?.micUrl) {
        URL.revokeObjectURL(tabToClose.micUrl);
      }
      if (tabToClose?.uploadedFile?.previewUrl) {
        URL.revokeObjectURL(tabToClose.uploadedFile.previewUrl);
      }

      const nextTabs = prev.filter(tab => tab.id !== id);
      if (activeTabId === id && nextTabs.length > 0) {
        setActiveTabId(nextTabs[nextTabs.length - 1].id);
      } else if (nextTabs.length === 0) {
        setActiveTabId(null);
        onCloseAll?.();
      }

      return nextTabs;
    });
  }, [activeTabId, onCloseAll]);

  const activeTabObj = useMemo(
    () => tabs.find(tab => tab.id === activeTabId) || null,
    [tabs, activeTabId]
  );

  return {
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    activeTabObj,
    createTab,
    updateActiveTab,
    closeTab
  };
};
