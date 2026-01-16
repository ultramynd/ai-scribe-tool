export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  details?: any;
}

const LOG_STORAGE_KEY = 'scribe_ai_logs';
const MAX_LOGS = 100;
const LOG_WRITE_DEBOUNCE_MS = 300;

let cachedLogs: LogEntry[] | null = null;
let pendingWrite: ReturnType<typeof setTimeout> | null = null;

const writeLogs = (logs: LogEntry[]) => {
  cachedLogs = logs;
  localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs));
};


export const logger = {
  getLogs: (): LogEntry[] => {
    if (cachedLogs) return cachedLogs;

    try {
      const logs = localStorage.getItem(LOG_STORAGE_KEY);
      cachedLogs = logs ? JSON.parse(logs) : [];
      return cachedLogs;
    } catch (e) {
      cachedLogs = [];
      return [];
    }
  },

  addLog: (level: 'INFO' | 'WARN' | 'ERROR', message: string, details?: any) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      details: details ? JSON.stringify(details) : undefined // safe stringify
    };

    const logs = logger.getLogs();
    const newLogs = [entry, ...logs].slice(0, MAX_LOGS);
    cachedLogs = newLogs;

    if (pendingWrite) {
      clearTimeout(pendingWrite);
    }

    pendingWrite = setTimeout(() => {
      writeLogs(newLogs);
      pendingWrite = null;
    }, LOG_WRITE_DEBOUNCE_MS);

    // Also log to console
    if (level === 'ERROR') console.error(`[${level}] ${message}`, details);
    else if (level === 'WARN') console.warn(`[${level}] ${message}`, details);
    else console.log(`[${level}] ${message}`, details);
  },


  info: (message: string, details?: any) => logger.addLog('INFO', message, details),
  warn: (message: string, details?: any) => logger.addLog('WARN', message, details),
  error: (message: string, details?: any) => logger.addLog('ERROR', message, details),

  downloadLogs: () => {
    const logs = logger.getLogs();
    if (pendingWrite) {
      clearTimeout(pendingWrite);
      writeLogs(logs);
      pendingWrite = null;
    }
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scribe_ai_logs_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  clearLogs: () => {
    cachedLogs = [];
    if (pendingWrite) {
      clearTimeout(pendingWrite);
      pendingWrite = null;
    }
    localStorage.removeItem(LOG_STORAGE_KEY);
  }

};
