import React, { useState } from 'react';
import { Link, WarningCircle, ArrowRight, CheckCircle, Spinner, YoutubeLogo, Info, DownloadSimple, FileAudio, Lock } from '@phosphor-icons/react';
import { getDriveId } from '../utils/audioUtils';
import { AudioFile } from '../types';
import GoogleFilePicker from './GoogleFilePicker';

interface UrlLoaderProps {
  onFileLoaded: (file: AudioFile) => void;
  isLoading: boolean;
  googleAccessToken?: string | null;
  clientId: string | null;
  onGoogleLogin: () => void;
  isLoggingIn: boolean;
  onAttachDrive?: () => void;
}

const UrlLoader: React.FC<UrlLoaderProps> = ({ onFileLoaded, isLoading, googleAccessToken, clientId, onGoogleLogin,
  isLoggingIn,
  onAttachDrive
}) => {
  const [url, setUrl] = useState('');
  const [fetchStatus, setFetchStatus] = useState<'idle' | 'loading' | 'error' | 'success'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [driveId, setDriveId] = useState<string | null>(null);
  const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false);

  const handleDrivePicker = () => {
    if (!googleAccessToken) {
      setErrorMessage("Please log in with Google (top right) to access Drive.");
      setFetchStatus('error');
      return;
    }
    // Open the local picker instead of relying on the parent prop
    setIsDrivePickerOpen(true);
  };

  const fetchDriveFile = async (fileId: string, token: string, fileName?: string, mimeType?: string) => {
    setFetchStatus('loading');
    setErrorMessage(null);

    try {
      let finalFileName = fileName || 'drive_audio_file';
      let finalMimeType = mimeType;

      if (!fileName) {
        try {
          const metaData = await new Promise<any>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`);
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
              else reject(new Error(`Meta status ${xhr.status}`));
            };
            xhr.onerror = () => reject(new Error("Meta network error"));
            xhr.ontimeout = () => reject(new Error("Drive metadata request timed out."));
            xhr.timeout = 20000; // 20s for meta
            xhr.send();
          });
          finalFileName = metaData.name;
          finalMimeType = metaData.mimeType;
        } catch (e) {
          console.warn("Could not fetch metadata, proceeding with download", e);
        }
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.responseType = 'blob';

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response);
          else if (xhr.status === 403) reject(new Error("Permission denied. You may not have access to this specific file."));
          else reject(new Error(`Drive Connection Error: ${xhr.status} ${xhr.statusText}`));
        };
        xhr.onerror = () => reject(new Error("Network connection error during Drive download."));
        xhr.ontimeout = () => reject(new Error("Drive download timed out."));
        xhr.timeout = 300000; // 5 min for file download
        xhr.send();
      });

      if (blob.type.includes('text/html')) {
        throw new Error("File is too large for automatic download. Please download it manually from Drive, then use 'Upload File'.");
      }

      const file = new File([blob], finalFileName, { type: blob.type || finalMimeType || 'audio/mp3' });
      const previewUrl = URL.createObjectURL(blob);

      onFileLoaded({ file, previewUrl, base64: null, mimeType: file.type });
      setFetchStatus('success');
    } catch (error: any) {
      console.error(error);
      setErrorMessage(error.message || "Failed to download file from Google Drive.");
      setFetchStatus('error');
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setUrl(newUrl);
    setDriveId(getDriveId(newUrl));
    setFetchStatus('idle');
    setErrorMessage(null);
  };

  const isYouTubeUrl = (url: string) => {
    return url.includes('youtube.com') || url.includes('youtu.be');
  };

  const handleFetch = async () => {
    if (!url) return;
    setFetchStatus('loading');
    setErrorMessage(null);

    // --- STRATEGY 1: Handle Google Drive Links ---
    if (driveId) {
      if (googleAccessToken) {
        await fetchDriveFile(driveId, googleAccessToken);
        return;
      } else {
        setFetchStatus('error');
        if (clientId) {
          setErrorMessage("To import from Drive, please Log In (top right) first.");
        } else {
          setErrorMessage("Drive integration is not configured. Please download the file manually and use 'Upload File'.");
        }
        return;
      }
    }

    // --- STRATEGY 2: Handle Direct Links ---
    const isYT = isYouTubeUrl(url);
    if (isYT) {
      setFetchStatus('error');
      setErrorMessage("YouTube videos cannot be loaded directly. Please use a YouTube to MP3 converter, then upload the file.");
      return;
    }

    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        xhr.responseType = 'blob';
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response);
          else reject(new Error(`Server returned error: ${xhr.status} ${xhr.statusText}`));
        };
        xhr.onerror = () => reject(new Error("Network connection error."));
        xhr.ontimeout = () => reject(new Error("Direct download timed out."));
        xhr.timeout = 120000; // 2 min for general URL fetch
        xhr.send();
      });
      const mimeType = blob.type || 'audio/mp3';
      const file = new File([blob], "downloaded_media", { type: mimeType });
      const previewUrl = URL.createObjectURL(blob);

      onFileLoaded({ file, previewUrl, base64: null, mimeType });
      setFetchStatus('success');

    } catch (err: any) {
      console.error(err);
      setFetchStatus('error');

      const isCorsError = err.name === 'TypeError' || (err.message && err.message.includes('Failed to fetch'));

      if (isCorsError) {
        setErrorMessage("Access blocked by the hosting website. The owner of this file has not set it to 'Public'.");
      } else {
        setErrorMessage(`Download failed: ${err.message || 'Unknown error'}.`);
      }
    }
  };

  const isYT = isYouTubeUrl(url);

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white dark:bg-dark-card rounded-[2rem] p-4 sm:p-6 border border-gray-100 dark:border-dark-border shadow-sm">

        {/* URL Input Section */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-2">
            Paste Media URL
          </label>
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 dark:text-dark-border">
                {isYT ? <YoutubeLogo size={18} weight="duotone" /> : <Link size={18} weight="duotone" />}
              </div>
              <input
                type="url"
                value={url}
                onChange={handleUrlChange}
                disabled={isLoading || fetchStatus === 'success'}
                placeholder="https://example.com/audio.mp3"
                className={`block w-full pl-10 pr-3 py-2.5 border rounded-xl focus:ring-primary focus:border-primary text-sm transition-colors bg-white dark:bg-dark-bg dark:text-dark-text ${isYT ? 'border-red-300 bg-red-50 text-red-900 placeholder-red-300' : 'border-gray-300 dark:border-dark-border dark:placeholder-dark-muted'}`}
              />
            </div>
            <button
              onClick={handleFetch}
              disabled={!url || isLoading || fetchStatus === 'loading' || fetchStatus === 'success'}
              className={`${isYT ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary/90'} text-white px-4 py-2 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center`}
            >
              {fetchStatus === 'loading' && !driveId ? (
                <Spinner size={20} className="animate-spin" weight="bold" />
              ) : (
                <ArrowRight size={20} weight="bold" />
              )}
            </button>
          </div>

          {/* Helper Info Box */}
          <div className="bg-slate-50 dark:bg-dark-bg rounded-lg p-3 border border-slate-100 dark:border-dark-border text-xs text-slate-600 dark:text-dark-muted">
            <p className="font-semibold mb-2 text-slate-700 dark:text-dark-text flex items-center gap-1">
              <FileAudio size={12} weight="duotone" className="text-primary dark:text-accent" /> Supported Link Types:
            </p>
            <ul className="space-y-1.5 list-disc list-inside ml-1">
              <li>
                <span className="font-medium text-slate-700 dark:text-dark-text">Direct File Links:</span> Ends in .mp3, .wav, .mp4
                <span className="block text-slate-400 dark:text-dark-border pl-4 text-[10px] leading-tight mt-0.5">Website must allow public downloads</span>
              </li>
              {clientId ? (
                <li>
                  <span className="font-medium text-slate-700 dark:text-dark-text">Google Drive:</span> Standard share links
                  <span className="block text-slate-400 dark:text-dark-border pl-4 text-[10px] leading-tight mt-0.5">e.g. drive.google.com/file/d/...</span>
                </li>
              ) : (
                <li className="text-slate-400 dark:text-dark-border opacity-75">
                  <span className="line-through decoration-slate-300">Google Drive Links</span>
                  <span className="ml-1 text-[10px]">(Integration not enabled by host)</span>
                </li>
              )}
            </ul>
            <div className="mt-3 pt-2 border-t border-slate-200 dark:border-dark-border text-slate-500 dark:text-dark-muted flex items-start gap-1.5">
              <Info size={12} weight="duotone" className="shrink-0 mt-0.5 text-slate-400 dark:text-dark-border" />
              <p>Streaming sites (YouTube/Spotify) are <span className="font-semibold text-red-500 opacity-80">not supported</span>.</p>
            </div>
          </div>
        </div>

        {fetchStatus === 'success' && (
          <div className="flex items-center gap-2 text-green-600 bg-green-50 dark:bg-green-900/20 p-3 rounded-lg text-sm mb-2 border border-green-100 dark:border-green-900/30">
            <CheckCircle size={18} weight="duotone" />
            <span>File loaded successfully! Ready to transcribe.</span>
          </div>
        )}

        {fetchStatus === 'error' && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex flex-col gap-2 text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg text-sm mb-4 border border-red-100 dark:border-red-900/30">
              <div className="flex items-start gap-2">
                <Lock size={16} weight="duotone" className="shrink-0 mt-0.5" />
                <span className="font-medium">{errorMessage}</span>
              </div>
              <div className="ml-6 mt-1 flex flex-col gap-2">
                <p className="text-xs text-red-500 dark:text-red-400 opacity-90">
                  Try downloading the file to your computer first, then click "Upload File" above.
                </p>
                <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-bold underline hover:text-red-800 dark:hover:text-red-200 mt-1">
                  <DownloadSimple size={12} weight="bold" /> Attempt Manual Download
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UrlLoader;