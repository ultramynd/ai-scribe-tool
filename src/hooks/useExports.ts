import { useCallback, useState } from 'react';
import { TranscriptionState } from '../../types';
import { createSrtString, generateDocx, generateSrt, generateTxt, stripMarkdown } from '../../utils/exportUtils';

interface UseExportsOptions {
  transcription: TranscriptionState;
  activeTabText?: string | null;
  googleAccessToken: string | null;
  onRequireLogin: () => void;
  onTokenInvalid: () => void;
}

export const useExports = ({
  transcription,
  activeTabText,
  googleAccessToken,
  onRequireLogin,
  onTokenInvalid
}: UseExportsOptions) => {
  const [isSavingToDrive, setIsSavingToDrive] = useState(false);
  const [driveSaved, setDriveSaved] = useState(false);

  const getCurrentText = useCallback(() => activeTabText || transcription.text || '', [activeTabText, transcription.text]);

  const handleSaveToDrive = useCallback(
    async (format: 'doc' | 'txt' | 'srt' = 'doc') => {
      const currentText = getCurrentText();

      if (!googleAccessToken || !currentText) {
        if (!currentText) alert('No text to save.');
        else onRequireLogin();
        return;
      }

      setIsSavingToDrive(true);

      try {
        const timestamp = new Date().toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        const fileName = `ScribeAI Transcription - ${timestamp}`;

        let mimeType = 'application/vnd.google-apps.document';
        if (format === 'txt') mimeType = 'text/plain';
        else if (format === 'srt') mimeType = 'text/plain';

        const metadata = {
          name: fileName,
          mimeType: mimeType,
          description: `Transcription created with ScribeAI on ${timestamp}`
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));

        let content = currentText;

        if (format === 'doc') {
          content = content
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            .replace(/\*(.*?)\*/g, '<i>$1</i>')
            .replace(/__(.*?)__/g, '<u>$1</u>')
            .replace(/~~(.*?)~~/g, '<s>$1</s>')
            .replace(/\n/g, '<br>');
        } else if (format === 'txt') {
          content = stripMarkdown(content);
        } else if (format === 'srt') {
          const srtContent = createSrtString(content);
          content = srtContent || content;
        }

        form.append('file', new Blob([content], { type: format === 'doc' ? 'text/html' : 'text/plain' }));

        const response = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${googleAccessToken}` },
            body: form
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));

          if (response.status === 401) {
            onTokenInvalid();
            throw new Error('Session expired. Please sign in again.');
          }

          if (response.status === 403) {
            throw new Error('Permission denied. Check your Google Drive access.');
          }

          if (response.status === 429) {
            throw new Error('Too many requests. Please try again in a moment.');
          }

          throw new Error(errorData.error?.message || `Failed to save (${response.status})`);
        }

        const fileData = await response.json();

        setDriveSaved(true);
        setTimeout(() => setDriveSaved(false), 5000);

        if (fileData.webViewLink) {
          const shouldOpen = confirm(
            `File saved successfully!\n\nWould you like to open "${fileData.name}" in Google Drive?`
          );
          if (shouldOpen) {
            window.open(fileData.webViewLink, '_blank');
          }
        }
      } catch (err: any) {
        console.error('Save to Drive error:', err);
        const errorMessage = err.message || 'Failed to save to Google Drive';
        alert(`❌ ${errorMessage}\n\nPlease try again or check your connection.`);
      } finally {
        setIsSavingToDrive(false);
      }
    },
    [getCurrentText, googleAccessToken, onRequireLogin, onTokenInvalid]
  );

  const handleExportTxt = useCallback(() => {
    const text = getCurrentText();
    if (!text) {
      alert('No text available to export.');
      return;
    }
    generateTxt(text, `ScribeAI_Export_${new Date().toISOString().slice(0, 10)}`);
  }, [getCurrentText]);

  const handleExportDocx = useCallback(async () => {
    const text = getCurrentText();
    if (!text) return;
    try {
      await generateDocx(text, `Smart_Editor_Export_${new Date().toISOString().slice(0, 10)}`);
    } catch (err) {
      alert('Failed to generate Word document');
    }
  }, [getCurrentText]);

  const handleExportSrt = useCallback(() => {
    const text = getCurrentText();
    if (!text) {
      alert('No text available to export.');
      return;
    }
    generateSrt(text, `ScribeAI_Export_${new Date().toISOString().slice(0, 10)}`);
  }, [getCurrentText]);

  return {
    handleSaveToDrive,
    handleExportTxt,
    handleExportDocx,
    handleExportSrt,
    isSavingToDrive,
    driveSaved
  };
};
