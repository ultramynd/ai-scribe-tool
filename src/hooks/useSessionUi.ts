import { useCallback, useEffect, useState } from 'react';
import { AudioSource, EditorTab, TranscriptionState } from '../../types';

interface UseSessionUiOptions {
  activeTabId: string | null;
  activeTabObj: EditorTab | null;
  transcription: TranscriptionState;
  setActiveTab: (tab: AudioSource | null) => void;
  clearAll: () => void;
}

export const useSessionUi = ({
  activeTabId,
  activeTabObj,
  transcription,
  setActiveTab,
  clearAll
}: UseSessionUiOptions) => {
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [isTabsVisible, setIsTabsVisible] = useState(true);
  const [hasPeeked, setHasPeeked] = useState(false);

  const safeNavigation = useCallback(
    (action: () => void) => {
      const hasUnsavedContent = activeTabObj ? !!activeTabObj.transcription.text : !!transcription.text;
      if (hasUnsavedContent) {
        setPendingAction(() => action);
        setShowExitConfirm(true);
      } else {
        action();
      }
    },
    [activeTabObj, transcription.text]
  );

  const confirmExit = useCallback(() => {
    if (pendingAction) pendingAction();
    else clearAll();
    setShowExitConfirm(false);
    setPendingAction(null);
  }, [pendingAction, clearAll]);

  const handleNewSession = useCallback(
    (source: AudioSource) => {
      safeNavigation(() => {
        clearAll();
        setActiveTab(source);
      });
    },
    [clearAll, safeNavigation, setActiveTab]
  );

  useEffect(() => {
    if (activeTabId && !activeTabObj?.transcription.isLoading && activeTabObj?.transcription.text && !hasPeeked) {
      const sequence = async () => {
        await new Promise(r => setTimeout(r, 800));
        setIsTabsVisible(true);
        await new Promise(r => setTimeout(r, 600));
        setIsTabsVisible(false);
        await new Promise(r => setTimeout(r, 300));
        setIsTabsVisible(true);
        await new Promise(r => setTimeout(r, 600));
        setIsTabsVisible(false);
        setHasPeeked(true);
      };

      sequence();
    }
  }, [activeTabId, activeTabObj?.transcription.isLoading, activeTabObj?.transcription.text, hasPeeked]);

  return {
    showExitConfirm,
    setShowExitConfirm,
    safeNavigation,
    confirmExit,
    handleNewSession,
    isTabsVisible,
    setIsTabsVisible
  };
};
