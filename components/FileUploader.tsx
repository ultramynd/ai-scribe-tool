import React, { useCallback, useState, useEffect } from 'react';
import { CloudArrowUp, FileAudio, FileVideo, X, WarningCircle } from '@phosphor-icons/react';
import { AudioFile } from '../types';

interface FileUploaderProps {
  onFileSelected: (file: AudioFile) => void;
  selectedFile: AudioFile | null;
  onClear: () => void;
  isLoading: boolean;
}

const FileUploader: React.FC<FileUploaderProps> = ({ onFileSelected, selectedFile, onClear, isLoading }) => {
  const [previewError, setPreviewError] = useState(false);
  
  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    
    onFileSelected({
      file,
      previewUrl,
      base64: null, // Computed later
      mimeType: file.type
    });

  }, [onFileSelected]);

  // Reset error when file changes
  useEffect(() => {
    setPreviewError(false);
  }, [selectedFile]);

  const isVideo = selectedFile?.file?.type.startsWith('video/');

  return (
    <div className="w-full max-w-md mx-auto">
      {!selectedFile?.file ? (
        <div className="relative border-2 border-dashed border-gray-300 dark:border-dark-border rounded-[2rem] p-6 sm:p-10 transition-colors hover:border-accent hover:bg-accent/5 group bg-white dark:bg-dark-card">
          <input
            type="file"
            accept="audio/*,video/*"
            onChange={handleFileChange}
            disabled={isLoading}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-primary/10 text-primary dark:text-accent rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <CloudArrowUp size={28} weight="duotone" className="sm:w-8 sm:h-8" />
            </div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-700 dark:text-dark-text mb-1">Click to upload</h3>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-dark-muted">Audio (MP3, WAV) or Video (MP4, WebM)</p>
            <p className="text-[10px] sm:text-xs text-gray-400 dark:text-dark-muted mt-3 sm:mt-4">Max file size: 2GB (Files API)</p>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-card rounded-[2rem] p-4 sm:p-6 border border-gray-100 dark:border-dark-border shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3 sm:gap-4 overflow-hidden">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 text-primary dark:text-accent rounded-xl flex-shrink-0 flex items-center justify-center">
                {isVideo ? <FileVideo size={20} weight="duotone" className="sm:w-6 sm:h-6" /> : <FileAudio size={20} weight="duotone" className="sm:w-6 sm:h-6" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-dark-text truncate">
                  {selectedFile.file.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-dark-muted">
                  {(selectedFile.file.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
            </div>
            {!isLoading && (
              <button 
                onClick={onClear}
                className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1"
              >
                <X size={18} weight="bold" className="sm:w-5 sm:h-5" />
              </button>
            )}
          </div>

          {selectedFile.previewUrl && (
            <div className="mt-2 bg-gray-50 dark:bg-dark-bg rounded-xl p-2 overflow-hidden border border-gray-100 dark:border-dark-border">
              {!previewError ? (
                  isVideo ? (
                    <video 
                      controls 
                      src={selectedFile.previewUrl} 
                      className="w-full max-h-48 rounded bg-black" 
                      onError={() => setPreviewError(true)}
                    />
                  ) : (
                    <audio 
                      controls 
                      src={selectedFile.previewUrl} 
                      className="w-full h-8" 
                      onError={() => setPreviewError(true)}
                    />
                  )
              ) : (
                  <div className="flex flex-col items-center justify-center h-24 bg-gray-100 dark:bg-dark-card/50 text-gray-400 dark:text-dark-muted gap-2 rounded-lg">
                     <WarningCircle size={20} weight="duotone" />
                     <span className="text-xs font-medium">Preview not available for this format</span>
                     <span className="text-[10px] opacity-70">Transcription will still work</span>
                  </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FileUploader;