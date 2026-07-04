import { chromium, Browser } from 'playwright';
import logger from './logger';

/**
 * One shared Chromium instance per scrape run instead of a fresh launch per
 * page (launching is by far the most expensive scraper operation).
 * Scrapers call getSharedBrowser() and close only their pages/contexts;
 * scraperManager calls closeSharedBrowser() in its finally block.
 */
let browser: Browser | null = null;

export async function getSharedBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) {
    return browser;
  }
  browser = await chromium.launch({ headless: true, args: ['--disable-http2'] });
  logger.debug('Launched shared Chromium instance');
  return browser;
}

export async function closeSharedBrowser(): Promise<void> {
  if (browser) {
    const b = browser;
    browser = null;
    try {
      await b.close();
      logger.debug('Closed shared Chromium instance');
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Failed to close shared browser');
    }
  }
}
