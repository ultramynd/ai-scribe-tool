export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  details?: any;
}

const LOG_STORAGE_KEY = 'scribe_ai_logs';
const MAX_LOGS = 100;

export const logger = {
  getLogs: (): LogEntry[] => {
    try {
      const logs = localStorage.getItem(LOG_STORAGE_KEY);
      return logs ? JSON.parse(logs) : [];
    } catch (e) {
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
    localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(newLogs));
    
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
    localStorage.removeItem(LOG_STORAGE_KEY);
  }
};
