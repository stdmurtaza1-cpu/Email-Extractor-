export interface ScraperConfig {
  sheetId: string;
  clientId: string;
  clientSecret: string;
  delayMs: number;
}

export interface ScraperTask {
  id: string;
  trade: string;
  location: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  processedUrlsCount?: number;
  emailsFoundCount?: number;
  startedAt?: string;
  completedAt?: string;
}

export interface ExtractedEmail {
  id: string;
  email: string;
  trade: string;
  location: string;
  sourceUrl: string;
  extractedAt: string;
  syncedToSheet: boolean;
  syncError?: string;
}

export interface ScraperLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

export interface ScraperStats {
  totalTasks: number;
  pendingTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalEmails: number;
  syncedEmails: number;
  unsyncedEmails: number;
  isScrapingActive: boolean;
  isConnectedToSheets: boolean;
}

export interface ScraperDB {
  config: ScraperConfig;
  tasks: ScraperTask[];
  emails: ExtractedEmail[];
  logs: ScraperLog[];
  isScrapingActive: boolean;
  googleAuth?: {
    accessToken: string;
    refreshToken?: string;
    expiryDate?: number;
    userEmail?: string;
    userName?: string;
  };
}
