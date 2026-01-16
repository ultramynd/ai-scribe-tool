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

const UrlLoader: React.FC<UrlLoaderProps> = ({ onFileLoaded, isLoading, googleAccessToken, clientId,  onGoogleLogin,
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
      {/* Google Drive Picker Modal */}
      {googleAccessToken && (
        <GoogleFilePicker 
          isOpen={isDrivePickerOpen} 
          accessToken={googleAccessToken}
          onClose={() => setIsDrivePickerOpen(false)} 
          onSelect={(file) => {
            setIsDrivePickerOpen(false);
            fetchDriveFile(file.id, googleAccessToken, file.name, file.mimeType);
          }}
        />
      )}

      <div className="bg-white dark:bg-dark-card rounded-[2rem] p-4 sm:p-6 border border-gray-100 dark:border-dark-border shadow-sm">
        
        {/* Only show Drive picker if Client ID is configured */}
        {clientId && (
          <>
            <div className="mb-6">
               <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-3">
                 Select from Google Drive
               </label>
               {!googleAccessToken ? (
                  <div className="text-center p-4 bg-slate-50 dark:bg-dark-bg rounded-2xl border border-slate-200 dark:border-dark-border">
                     <p className="text-sm text-slate-500 dark:text-dark-muted mb-3">Sign in to access your Google Drive files</p>
                     {onGoogleLogin ? (
                       <button
                         onClick={onGoogleLogin}
                         disabled={isLoggingIn}
                         className="w-full flex items-center justify-center gap-3 bg-white dark:bg-dark-card border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text font-medium py-3 px-4 rounded-xl hover:bg-gray-50 dark:hover:bg-dark-border transition-all shadow-sm group disabled:opacity-50"
                       >
                         {isLoggingIn ? (
                           <Spinner className="animate-spin text-primary dark:text-accent" size={20} weight="bold" />
                         ) : (
                           <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                             <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                             <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                             <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                             <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                           </svg>
                         )}
                         <span>{isLoggingIn ? 'Signing in...' : 'Sign in with Google'}</span>
                       </button>
                     ) : (
                       <p className="text-xs text-slate-400 dark:text-dark-border">Please sign in using the button in the top right corner.</p>
                     )}
                  </div>
                ) : (
                  <button
                    onClick={handleDrivePicker}
                    disabled={isLoading || fetchStatus === 'loading'}
                    className={`w-full overflow-hidden relative group transition-all duration-500 rounded-xl border ${
                      fetchStatus === 'loading' 
                        ? 'bg-slate-900 dark:bg-dark-card border-transparent py-4' 
                        : 'bg-white dark:bg-white/5 border-gray-300 dark:border-white/10 py-3 hover:bg-gray-50 dark:hover:bg-white/10 shadow-sm'
                    }`}
                  >
                    {fetchStatus === 'loading' ? (
                      <div className="w-full px-6">
                        <div className="flex items-center justify-between mb-2">
                           <span className="text-[10px] font-black uppercase tracking-widest text-primary dark:text-accent animate-pulse">Importing...</span>
                           <Spinner className="animate-spin text-primary dark:text-accent" size={14} weight="bold" />
                        </div>
                        <div className="h-1.5 w-full bg-white/10 dark:bg-white/5 rounded-full overflow-hidden">
                           <div className="h-full bg-gradient-to-r from-primary to-accent animate-[loading_2s_infinite] w-full origin-left overflow-hidden relative">
                              <div className="absolute inset-0 bg-white/30 animate-[shimmer_2s_infinite]"></div>
                           </div>
                        </div>
                        <style>{`
                           @keyframes loading {
                              0% { transform: scaleX(0); }
                              50% { transform: scaleX(0.5); }
                              100% { transform: scaleX(1); }
                           }
                           @keyframes shimmer {
                              0% { transform: translateX(-100%); }
                              100% { transform: translateX(100%); }
                           }
                        `}</style>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-3">
                        <svg className="w-5 h-5 group-hover:scale-110 transition-transform" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                           <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                           <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                           <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                           <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.4-4.5 1.2z" fill="#00832d"/>
                           <path d="m59.8 53h-27.5l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.5c1.6 0 3.15-.4 4.5-1.2z" fill="#2684fc"/>
                           <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 29.75 51.5c.8-1.4 1.2-2.95 1.2-4.5v-28.5c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                        </svg>
                        <span className="text-gray-700 dark:text-dark-text font-medium">Browse Google Drive</span>
                      </div>
                    )}
                  </button>
               )}
            </div>

            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                 <div className="w-full border-t border-gray-200 dark:border-dark-border"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white dark:bg-dark-card px-3 text-xs font-medium text-gray-400 dark:text-dark-muted uppercase tracking-wider">Or paste public URL</span>
              </div>
            </div>
          </>
        )}

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
                <FileAudio size={12} weight="duotone" className="text-primary dark:text-accent"/> Supported Link Types:
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