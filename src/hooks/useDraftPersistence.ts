import { useEffect, useRef } from 'react';
import { AudioSource, EditorTab } from '../../types';

const DRAFT_STORAGE_KEY = 'scribe_tab_drafts';
const DRAFT_SAVE_DEBOUNCE_MS = 500;

interface DraftPayload {
  activeTabId: string | null;
  activeSource: AudioSource | null;
  tabs: Array<Pick<EditorTab, 'id' | 'title' | 'transcription' | 'contentType' | 'isEditorMode' | 'showAiSidebar'>>;
  updatedAt: string;
}

interface UseDraftPersistenceOptions {
  tabs: EditorTab[];
  setTabs: React.Dispatch<React.SetStateAction<EditorTab[]>>;
  activeTabId: string | null;
  setActiveTabId: (id: string | null) => void;
  activeTab: AudioSource | null;
  setActiveTab: (tab: AudioSource | null) => void;
}

export const useDraftPersistence = ({
  tabs,
  setTabs,
  activeTabId,
  setActiveTabId,
  activeTab,
  setActiveTab
}: UseDraftPersistenceOptions) => {
  const didHydrateRef = useRef(false);
  const pendingSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (didHydrateRef.current) return;
    didHydrateRef.current = true;

    try {
      const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!stored) return;
      const payload = JSON.parse(stored) as DraftPayload;
      if (!payload?.tabs?.length) return;

      const restoredTabs: EditorTab[] = payload.tabs.map(tab => ({
        id: tab.id,
        title: tab.title,
        transcription: tab.transcription,
        contentType: tab.contentType || null,
        recordedBlob: null,
        micUrl: null,
        uploadedFile: null,
        isEditorMode: tab.isEditorMode,
        showAiSidebar: tab.showAiSidebar
      }));

      setTabs(restoredTabs);
      setActiveTabId(null);
      setActiveTab(null);
    } catch (error) {
      console.warn('Failed to restore draft tabs:', error);
    }
  }, [setActiveTab, setActiveTabId, setTabs]);

  useEffect(() => {
    if (!didHydrateRef.current) return;
    if (pendingSaveRef.current) clearTimeout(pendingSaveRef.current);

    pendingSaveRef.current = setTimeout(() => {
      const payload: DraftPayload = {
        activeTabId,
        activeSource: activeTab,
        tabs: tabs.map(tab => ({
          id: tab.id,
          title: tab.title,
          transcription: tab.transcription,
          contentType: tab.contentType || null,
          isEditorMode: tab.isEditorMode,
          showAiSidebar: tab.showAiSidebar
        })),
        updatedAt: new Date().toISOString()
      };

      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
      pendingSaveRef.current = null;
    }, DRAFT_SAVE_DEBOUNCE_MS);

    return () => {
      if (pendingSaveRef.current) {
        clearTimeout(pendingSaveRef.current);
        pendingSaveRef.current = null;
      }
    };
  }, [activeTab, activeTabId, tabs]);
};
