import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as pdfParseImport from 'pdf-parse';
import * as xlsx from 'xlsx';
import { getDB, saveDB, appendLog } from './db.js';
import { syncEmailToSheet } from './sheets.js';
import { ExtractedEmail, ScraperTask } from '../types.js';

// Workaround for ESModule importing of pdf-parse which is a legacy package
const pdfParse = (pdfParseImport as any).default || pdfParseImport;

// Initialize Google GenAI client
let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set in secrets.');
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

let activeInterval: NodeJS.Timeout | null = null;
let isLoopRunning = false;

/**
 * Normalizes email address and runs extensive verification audits to filter invalid technical tags
 */
function isValidEmail(email: string): boolean {
  if (!email || email.length > 80) return false;
  const lower = email.toLowerCase();
  
  // Specific patterns commonly misidentified as email addresses by simple regexes
  if (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.svg') ||
    lower.endsWith('.css') ||
    lower.endsWith('.js') ||
    lower.endsWith('.woff') ||
    lower.endsWith('.woff2') ||
    lower.endsWith('.eot') ||
    lower.endsWith('.ttf')
  ) {
    return false;
  }
  
  const forbiddenSubstrings = [
    'bootstrap', 'jquery', 'font-face', 'npm', 'yarn', 'github', 'git-wip-us', 'example.com',
    'domain.com', 'email.com', 'test.com', 'yourcompany', 'w3.org', 'google', 'aws',
    'pack.png', 'avatar', 'logo', 'background.jpg', 'placeholder', 'username@', 
    'slider', 'widget', 'theme', 'plugin', 'minify', 'webpack', 'react', 'author',
    'license', 'copyright', 'holder', 'recipient', 'sender', 'sentry.io', 'mailinator'
  ];
  
  for (const sub of forbiddenSubstrings) {
    if (lower.includes(sub)) return false;
  }
  
  // Valid email pattern check
  const simpleEmailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}$/;
  if (!simpleEmailPattern.test(email)) return false;

  return true;
}

/**
 * Searches and parses content of a file or page URLs
 */
async function scrapeUrl(url: string, trade: string, location: string): Promise<string[]> {
  const emails: string[] = [];
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      validateStatus: () => true
    });

    if (response.status !== 200) {
      appendLog(`Failed to fetch page content from: ${url} (Status: ${response.status})`, 'warn');
      return [];
    }

    const contentType = String(response.headers['content-type'] || '').toLowerCase();
    let extractedText = '';

    // Verify if PDF document
    if (url.endsWith('.pdf') || contentType.includes('application/pdf')) {
      const dataBuffer = Buffer.from(response.data);
      const pdfData = await pdfParse(dataBuffer);
      extractedText = pdfData.text || '';
    } 
    // Verify if Excel document
    else if (
      url.endsWith('.xlsx') || 
      url.endsWith('.xls') || 
      contentType.includes('excel') || 
      contentType.includes('spreadsheet') || 
      contentType.includes('officedocument.spreadsheetml')
    ) {
      const dataBuffer = Buffer.from(response.data);
      const workbook = xlsx.read(dataBuffer, { type: 'buffer' });
      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const jsonRows = xlsx.utils.sheet_to_json<any>(worksheet, { header: 1 });
        jsonRows.forEach(row => {
          extractedText += ' ' + row.map(cell => (cell !== null && cell !== undefined) ? String(cell) : '').join(' ');
        });
      });
    } 
    // Regular webpage content
    else {
      const html = Buffer.from(response.data).toString('utf-8');
      const $ = cheerio.load(html);
      // Strip script styles elements to acquire clean text context
      $('script, style, iframe, link, meta, noscript').remove();
      extractedText = $('body').text() || '';
    }

    // Match all potential emails
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}/g;
    const matches: string[] = extractedText.match(emailRegex) || [];
    
    matches.forEach((match: string) => {
      const cleaned = match.trim();
      if (isValidEmail(cleaned) && !emails.includes(cleaned)) {
        emails.push(cleaned);
      }
    });

  } catch (error: any) {
    appendLog(`Error scraping URL ${url}: ${error.message}`, 'error');
  }
  return emails;
}

/**
 * Core scraping runner loop
 */
async function processNextTask() {
  if (isLoopRunning) return;
  isLoopRunning = true;

  try {
    const db = getDB();
    if (!db.isScrapingActive) {
      isLoopRunning = false;
      return;
    }

    const activeTaskIndex = db.tasks.findIndex(t => t.status === 'pending');
    if (activeTaskIndex === -1) {
      appendLog('No pending scraping tasks found in queue. Automation cycle idle.', 'info');
      db.isScrapingActive = false;
      saveDB(db);
      isLoopRunning = false;
      return;
    }

    const task = db.tasks[activeTaskIndex];
    task.status = 'processing';
    task.startedAt = new Date().toISOString();
    task.processedUrlsCount = 0;
    task.emailsFoundCount = 0;
    saveDB(db);

    appendLog(`Starting automated scraping: "${task.trade}" in "${task.location}"...`, 'info');

    // 1. Fetch relevant links using Gemini Search Grounding
    let urls: string[] = [];
    try {
      const ai = getAiClient();
      appendLog(`Sending Search Grounding prompt to Gemini for "${task.trade} in ${task.location}"...`, 'info');
      
      const searchQuery = `${task.trade} in ${task.location} "@gmail.com" filetype:pdf OR filetype:xlsx OR filetype:xls OR contact list`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: `List 15 to 25 web directories, membership lists, excel files, and PDF docs with public emails for: "${task.trade} in ${task.location}". Ensure we prioritize direct pages with emails.`,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const uniques = new Set<string>();
      
      chunks.forEach((chunk: any) => {
        if (chunk.web?.uri) {
          uniques.add(chunk.web.uri);
        }
      });
      urls = Array.from(uniques);

      appendLog(`Gemini Grounding returned ${urls.length} relevant search resource URLs.`, 'info');
    } catch (err: any) {
      appendLog(`Gemini Search Grounding error: ${err.message}`, 'error');
      task.status = 'failed';
      task.error = `Gemini search failed: ${err.message}`;
      task.completedAt = new Date().toISOString();
      saveDB(db);
      isLoopRunning = false;
      return;
    }

    if (urls.length === 0) {
      appendLog('Grounding returned zero target locations. Skipping and marking completed to keep flow going.', 'warn');
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
      saveDB(db);
      isLoopRunning = false;
      return;
    }

    // 2. Extract emails from URL targets sequentially with configurable interval delay
    let processedCount = 0;
    let foundEmailsTotal = 0;

    for (const url of urls) {
      // Re-read DB config to ensure scraper wasn't stopped midway
      const freshDb = getDB();
      if (!freshDb.isScrapingActive) {
        appendLog('Scraper execution stopped by user command.', 'warn');
        task.status = 'pending'; // rollback to pending
        saveDB(freshDb);
        isLoopRunning = false;
        return;
      }

      appendLog(`Crawling [${processedCount + 1}/${urls.length}] ${url}...`, 'info');
      const foundEmails = await scrapeUrl(url, task.trade, task.location);
      
      processedCount++;
      task.processedUrlsCount = processedCount;
      saveDB(freshDb);

      if (foundEmails.length > 0) {
        appendLog(`Found ${foundEmails.length} unique verified emails from ${url}! Appending...`, 'success');
        
        for (const email of foundEmails) {
          const innerDb = getDB();
          
          // Check for general email duplication
          const isDuplicate = innerDb.emails.some(e => e.email.toLowerCase() === email.toLowerCase());
          
          const newEmail: ExtractedEmail = {
            id: `email-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            email,
            trade: task.trade,
            location: task.location,
            sourceUrl: url,
            extractedAt: new Date().toISOString(),
            syncedToSheet: false,
          };

          innerDb.emails.unshift(newEmail);
          saveDB(innerDb);
          foundEmailsTotal++;
          
          // Live sync attempt to user spreadsheet
          syncEmailToSheet(newEmail).catch(err => {
            appendLog(`Sync error during parse collection: ${err.message}`, 'warn');
          });
        }
      }

      task.emailsFoundCount = foundEmailsTotal;
      saveDB(freshDb);

      // Avoid triggering search captchas or network flags with customizable interval pauses
      const delay = freshDb.config.delayMs || 8000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Mark task completed!
    const finalDb = getDB();
    const finalTask = finalDb.tasks.find(t => t.id === task.id);
    if (finalTask) {
      finalTask.status = 'completed';
      finalTask.completedAt = new Date().toISOString();
      appendLog(`Automation task successful! Trade: "${task.trade}" in Location: "${task.location}" extracted ${foundEmailsTotal} emails!`, 'success');
      saveDB(finalDb);
    }

  } catch (error: any) {
    appendLog(`Fatal pipeline error during task processing: ${error.message}`, 'error');
  } finally {
    isLoopRunning = false;
  }
}

/**
 * Starts continuous scraper loop
 */
export function startScraperEngine() {
  const db = getDB();
  if (db.isScrapingActive) return;

  db.isScrapingActive = true;
  saveDB(db);
  appendLog('Scraper engine started. Processing active queue.', 'success');

  // Trigger immediate task check
  processNextTask();

  // Poller loop to check queue tasks every 5 seconds
  if (activeInterval) clearInterval(activeInterval);
  activeInterval = setInterval(() => {
    const state = getDB();
    if (!state.isScrapingActive) {
      stopScraperEngine();
      return;
    }
    processNextTask();
  }, 5000);
}

/**
 * Stops continuous scraper loop
 */
export function stopScraperEngine() {
  const db = getDB();
  db.isScrapingActive = false;
  saveDB(db);
  
  if (activeInterval) {
    clearInterval(activeInterval);
    activeInterval = null;
  }
  
  appendLog('Scraper engine stopped.', 'warn');
}
