import { useEffect, useState } from 'react';
import { ArchiveItem } from '../../types';

const ARCHIVE_STORAGE_KEY = 'archive_items';

export const useArchive = () => {
  const [archiveItems, setArchiveItems] = useState<ArchiveItem[]>(() => {
    try {
      const saved = localStorage.getItem(ARCHIVE_STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Failed to parse archive items:', error);
      return [];
    }
  });

  useEffect(() => {
    const timeout = setTimeout(() => {
      localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(archiveItems));
    }, 300);

    return () => clearTimeout(timeout);
  }, [archiveItems]);

  return { archiveItems, setArchiveItems };
};
