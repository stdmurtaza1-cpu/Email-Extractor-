import fs from 'fs';
import path from 'path';
import { ScraperDB, ScraperLog, ScraperTask, ExtractedEmail } from '../types.js';

const DB_FILE = path.join(process.cwd(), 'scraper_db.json');

const DEFAULT_DB: ScraperDB = {
  config: {
    sheetId: '1ppISze8XUXfqC7cre5ELqSKwYJ08Zkf4o13hhvop61E',
    clientId: '',
    clientSecret: '',
    delayMs: 8000, // 8 seconds default delay between scrape requests
  },
  tasks: [],
  emails: [],
  logs: [],
  isScrapingActive: false
};

export function getDB(): ScraperDB {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(data) as ScraperDB;
    }
  } catch (error) {
    console.error('Error reading database file:', error);
  }
  
  // Create default DB if it doesn't exist
  saveDB(DEFAULT_DB);
  return DEFAULT_DB;
}

export function saveDB(db: ScraperDB): void {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing database file:', error);
  }
}

export function appendLog(message: string, level: 'info' | 'warn' | 'error' | 'success' = 'info'): void {
  const db = getDB();
  const newLog: ScraperLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  
  // Keep logs to a maximum of 200 entries to prevent memory/file bloating
  db.logs.unshift(newLog);
  if (db.logs.length > 200) {
    db.logs = db.logs.slice(0, 200);
  }
  
  saveDB(db);
  console.log(`[${newLog.level.toUpperCase()}] ${message}`);
}
