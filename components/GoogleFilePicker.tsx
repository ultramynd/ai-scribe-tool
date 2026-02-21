import React, { useState, useEffect, useCallback } from 'react';
import {
  X, MagnifyingGlass, FileAudio, FileVideo, Folder,
  CaretRight, MagnifyingGlassPlus, Spinner, ArrowLeft,
  Clock, HardDrive, Star, Trash, CaretDown, Check
} from '@phosphor-icons/react';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  iconLink?: string;
  thumbnailLink?: string;
}

interface GoogleFilePickerProps {
  accessToken: string;
  onSelect: (file: { id: string; name: string; mimeType: string; size?: string }) => void;
  onClose: () => void;
  isOpen: boolean;
  onRelogin?: () => void;
}

const GoogleFilePicker: React.FC<GoogleFilePickerProps> = ({ accessToken, onSelect, onClose, isOpen, onRelogin }) => {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTokenExpired, setIsTokenExpired] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentFolder, setCurrentFolder] = useState<{ id: string; name: string } | null>(null);
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([]);

  const fetchFiles = useCallback(async (folderId: string = 'root', query: string = '') => {
    setLoading(true);
    setError(null);
    setIsTokenExpired(false);
    try {
      let q = `trashed = false and (mimeType contains 'audio' or mimeType contains 'video' or mimeType = 'application/vnd.google-apps.folder' or mimeType = 'application/octet-stream')`;
      if (folderId !== 'root' || folderStack.length > 0) {
        q = `'${folderId}' in parents and ${q}`;
      } else {
        q = `'root' in parents and ${q}`;
      }

      if (query) {
        q = `name contains '${query}' and trashed = false and (mimeType contains 'audio' or mimeType contains 'video' or mimeType = 'application/vnd.google-apps.folder')`;
      }

      const data = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime,size,iconLink,thumbnailLink)&pageSize=100&orderBy=folder,name&supportsAllDrives=true&includeItemsFromAllDrives=true`;
        xhr.open('GET', url);
        xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
          else reject(new Error(`Drive API Error (${xhr.status}): ${xhr.responseText}`));
        };
        xhr.onerror = () => reject(new Error('Network error listing files'));
        xhr.send();
      });
      setFiles(data.files || []);
    } catch (err: any) {
      console.error(err);
      // Check for expired/invalid token and surface a friendly re-login prompt
      if (err.message && (err.message.includes('401') || err.message.toLowerCase().includes('unauthenticated') || err.message.toLowerCase().includes('invalid authentication'))) {
        setIsTokenExpired(true);
      } else {
        setError(err.message || 'Failed to fetch Drive files');
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, folderStack.length]);

  useEffect(() => {
    if (isOpen) {
      fetchFiles(currentFolder?.id || 'root', searchQuery);
    }
  }, [isOpen, currentFolder, searchQuery, fetchFiles]);

  const handleFolderClick = (folder: { id: string; name: string }) => {
    setFolderStack(prev => [...prev, folder]);
    setCurrentFolder(folder);
    setSearchQuery('');
  };

  const handleBack = () => {
    const newStack = [...folderStack];
    newStack.pop();
    setFolderStack(newStack);
    setCurrentFolder(newStack.length > 0 ? newStack[newStack.length - 1] : null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white dark:bg-dark-card w-full max-w-4xl h-[80vh] rounded-[2.5rem] shadow-2xl border border-white/20 dark:border-white/5 flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">

        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-dark-border flex items-center justify-between bg-slate-50/50 dark:bg-dark-bg/30">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary dark:text-accent">
              <HardDrive size={24} weight="duotone" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">Google Drive</h3>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-dark-muted font-medium mt-0.5">
                <span>My Storage</span>
                {folderStack.map((f, i) => (
                  <React.Fragment key={f.id}>
                    <CaretRight size={10} />
                    <span>{f.name}</span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-border transition-all"
          >
            <X size={20} weight="bold" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="p-4 px-6 border-b border-slate-100 dark:border-dark-border flex flex-col sm:flex-row gap-4 items-center bg-white/50 dark:bg-dark-card/50">
          <button
            onClick={handleBack}
            disabled={folderStack.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-slate-600 dark:text-dark-text hover:bg-slate-100 dark:hover:bg-dark-border disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ArrowLeft size={16} weight="bold" />
            Back
          </button>

          <div className="relative flex-1 group">
            <MagnifyingGlass size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder="Search files and folders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 rounded-2xl border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-dark-bg text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-slate-700 dark:text-white"
            />
          </div>
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto p-4 px-6 custom-scrollbar">
          {isTokenExpired ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
                <svg className="w-8 h-8" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              </div>
              <div>
                <p className="font-bold text-slate-800 dark:text-white text-sm">Session Expired</p>
                <p className="text-xs text-slate-400 dark:text-dark-muted mt-1">Your Google session has expired. Reconnect to browse your files.</p>
              </div>
              {onRelogin && (
                <button
                  onClick={() => { onRelogin(); onClose(); }}
                  className="px-6 py-2.5 rounded-xl text-sm font-bold bg-primary text-white hover:opacity-90 transition-all"
                >
                  Reconnect Google Drive
                </button>
              )}
            </div>
          ) : error ? (
            <div className="h-full flex flex-col items-center justify-center p-6 bg-red-50 dark:bg-red-500/10 rounded-2xl border border-red-200 dark:border-red-500/20 max-w-lg mx-auto overflow-y-auto mt-8">
              <X size={24} className="text-red-500 mb-2" weight="bold" />
              <h4 className="font-bold text-red-600 dark:text-red-400 mb-2">Drive Error</h4>
              <pre className="text-xs text-red-500/80 whitespace-pre-wrap font-mono break-all">{error}</pre>
            </div>
          ) : loading ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4">
              <Spinner size={32} weight="bold" className="animate-spin text-primary" />
              <p className="text-sm font-medium animate-pulse">Syncing with Google Drive...</p>
            </div>
          ) : files.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
              <div className="w-20 h-20 rounded-[2.5rem] bg-slate-50 dark:bg-dark-bg flex items-center justify-center mb-6">
                <HardDrive size={32} weight="duotone" />
              </div>
              <p className="text-sm font-bold">No supported media files found</p>
              <p className="text-xs mt-1">Upload audio/video files to Drive to see them here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {files.map(file => {
                const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                const isAudio = file.mimeType.startsWith('audio/');

                return (
                  <button
                    key={file.id}
                    onClick={() => isFolder ? handleFolderClick({ id: file.id, name: file.name }) : onSelect({ id: file.id, name: file.name, mimeType: file.mimeType, size: file.size })}
                    className="flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-dark-bg border border-slate-100 dark:border-dark-border hover:border-primary/30 hover:shadow-lg dark:hover:shadow-primary/5 hover:-translate-y-0.5 transition-all text-left group"
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform ${isFolder ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/20' :
                      isAudio ? 'bg-primary/10 text-primary dark:text-accent' :
                        'bg-purple-100 text-purple-600 dark:bg-purple-900/20'
                      }`}>
                      {isFolder ? <Folder size={24} weight="duotone" /> :
                        isAudio ? <FileAudio size={24} weight="duotone" /> :
                          <FileVideo size={24} weight="duotone" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-slate-800 dark:text-white truncate group-hover:text-primary transition-colors">{file.name}</h4>
                      <p className="text-[10px] text-slate-400 dark:text-dark-muted font-medium mt-0.5">
                        {isFolder ? 'Folder' : new Date(file.modifiedTime).toLocaleDateString()}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 dark:border-dark-border bg-slate-50/50 dark:bg-dark-bg/30 flex items-center justify-between">
          <p className="text-xs text-slate-400 dark:text-dark-muted font-medium">
            Showing only supported audio and video formats.
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-dark-border transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GoogleFilePicker;
