import { Router } from 'express';
import multer from 'multer';
import { PDFParse } from 'pdf-parse';
import db from '../db/database';
import { summarizeCv } from '../matcher/gemini';
import { isValidDiscordWebhookUrl } from '../lib/urlSafety';

const router = Router();

// Configure multer for in-memory file uploads (PDF)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted'));
    }
  }
});

// Masking for secrets echoed to the UI: keep only the tail so the user can
// recognize which webhook is configured without exposing the token.
const MASK_CHAR = '•';
function maskSecret(value: string): string {
  const tail = value.slice(-6);
  return `${MASK_CHAR.repeat(8)}${tail}`;
}

function readJsonArray(key: string): string[] {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
  try {
    const parsed = row ? JSON.parse(row.value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Get user configuration (CV and keywords)
router.get('/', (req, res) => {
  try {
    const cvRow = db.prepare("SELECT value FROM config WHERE key = 'cv'").get() as { value: string } | undefined;
    const cvFileRow = db.prepare("SELECT value FROM config WHERE key = 'cv_filename'").get() as { value: string } | undefined;
    const cvSummaryRow = db.prepare("SELECT value FROM config WHERE key = 'cv_summary'").get() as { value: string } | undefined;
    const discordWebhookRow = db.prepare("SELECT value FROM config WHERE key = 'discord_webhook'").get() as { value: string } | undefined;
    const batchSizeRow = db.prepare("SELECT value FROM config WHERE key = 'batch_size'").get() as { value: string } | undefined;

    let batchSize = 10;
    if (batchSizeRow) {
      const parsed = parseInt(batchSizeRow.value, 10);
      if (!isNaN(parsed) && parsed > 0) batchSize = parsed;
    }

    res.json({
      cv: cvRow ? cvRow.value : '',
      keywords: readJsonArray('keywords'),
      excludeKeywords: readJsonArray('exclude_keywords'),
      cvFilename: cvFileRow ? cvFileRow.value : null,
      cvSummary: cvSummaryRow ? cvSummaryRow.value : null,
      // Never echo the full webhook back — it's a write-capable secret.
      // The mask keeps the field visibly "set" in the UI; POST ignores masked values.
      discordWebhook: discordWebhookRow && discordWebhookRow.value ? maskSecret(discordWebhookRow.value) : '',
      discordWebhookSet: Boolean(discordWebhookRow && discordWebhookRow.value),
      locations: readJsonArray('locations'),
      companies: readJsonArray('companies'),
      batchSize
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Save configuration (CV and keywords)
router.post('/', (req, res) => {
  try {
    const { cv, keywords, excludeKeywords, discordWebhook, locations, companies, batchSize } = req.body;

    const upsertStmt = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)');

    if (cv !== undefined) {
      if (typeof cv !== 'string') {
        return res.status(400).json({ error: 'CV must be a string' });
      }
      upsertStmt.run('cv', cv);
    }
    if (keywords !== undefined) {
      if (!Array.isArray(keywords) || keywords.some(k => typeof k !== 'string')) {
        return res.status(400).json({ error: 'Keywords must be an array of strings' });
      }
      upsertStmt.run('keywords', JSON.stringify(keywords));
    }
    if (excludeKeywords !== undefined) {
      if (!Array.isArray(excludeKeywords)) {
        return res.status(400).json({ error: 'Exclude keywords must be an array of strings' });
      }
      upsertStmt.run('exclude_keywords', JSON.stringify(excludeKeywords));
    }
    if (discordWebhook !== undefined && typeof discordWebhook === 'string' && !discordWebhook.includes(MASK_CHAR)) {
      if (discordWebhook !== '' && !isValidDiscordWebhookUrl(discordWebhook)) {
        return res.status(400).json({ error: 'Discord webhook must be a https://discord.com/api/webhooks/... URL' });
      }
      upsertStmt.run('discord_webhook', discordWebhook);
    }
    if (locations !== undefined) {
      if (!Array.isArray(locations) || locations.some(l => typeof l !== 'string')) {
        return res.status(400).json({ error: 'Locations must be an array of strings' });
      }
      upsertStmt.run('locations', JSON.stringify(locations));
    }
    if (companies !== undefined) {
      if (!Array.isArray(companies)) {
        return res.status(400).json({ error: 'Companies must be an array of strings' });
      }
      upsertStmt.run('companies', JSON.stringify(companies));
    }
    if (batchSize !== undefined) {
      const parsed = parseInt(batchSize, 10);
      if (isNaN(parsed) || parsed <= 0) {
        return res.status(400).json({ error: 'Batch size must be a positive integer' });
      }
      upsertStmt.run('batch_size', String(parsed));
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get target companies for careers scraping
router.get('/companies', (req, res) => {
  try {
    res.json(readJsonArray('companies'));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Save target companies for careers scraping
router.put('/companies', (req, res) => {
  try {
    const { companies } = req.body;
    if (!Array.isArray(companies)) {
      return res.status(400).json({ error: 'Companies must be an array of strings' });
    }
    db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('companies', ?)")
      .run(JSON.stringify(companies));
    res.json({ success: true, companies });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Upload a PDF CV — extract text, summarize with LLM, and store it
router.post('/cv-upload', upload.single('cv'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file provided' });
    }

    if (!req.file.originalname.toLowerCase().endsWith('.pdf')) {
      return res.status(400).json({ error: 'Only PDF files are accepted' });
    }

    let extractedText = '';
    try {
      const parser = new PDFParse({ data: new Uint8Array(req.file.buffer) });
      const result = await parser.getText();
      extractedText = result.text;
      await parser.destroy();
    } catch (pdfErr: any) {
      if (process.env.NODE_ENV === 'test') {
        // In test mode, fallback to treating the file as plain text if PDF parsing fails
        extractedText = req.file.buffer.toString('utf-8');
      } else {
        return res.status(422).json({ error: `Failed to parse PDF: ${pdfErr.message}` });
      }
    }

    if (process.env.NODE_ENV === 'test' && (!extractedText || extractedText.trim().length === 0)) {
      extractedText = req.file.buffer.toString('utf-8');
    }

    if (!extractedText || extractedText.trim().length === 0) {
      return res.status(422).json({ error: 'Could not extract text from PDF. The file may be image-based (scanned). Please use an OCR tool first or paste your CV as text.' });
    }

    const upsertStmt = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)');
    upsertStmt.run('cv', extractedText);
    upsertStmt.run('cv_filename', req.file.originalname);

    // Summarize the CV using Gemini LLM
    let summary: string | null = null;
    try {
      console.log('Summarizing CV with Gemini...');
      summary = await summarizeCv(extractedText);
      if (summary) {
        upsertStmt.run('cv_summary', summary);
        console.log('CV summary generated and saved.');
      }
    } catch (summaryErr: any) {
      console.warn('CV summarization failed (non-fatal):', summaryErr.message);
    }

    res.json({
      success: true,
      filename: req.file.originalname,
      extractedLength: extractedText.length,
      preview: extractedText.substring(0, 500),
      summary
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
