import axios from 'axios';
import * as cheerio from 'cheerio';
import { ScrapedJob } from '../types';
import { getRandomUserAgent, MAX_SEARCH_PAGES, SEARCH_PAGE_DELAY_MS } from '../lib/constants';
import { getLocation } from '../lib/locations';
import { getSharedBrowser } from '../lib/browser';

const PROFESSION_BASE_URL = process.env.PROFESSION_BASE_URL || 'https://www.profession.hu';

export type { ScrapedJob };

export async function scrapeProfessionHu(keyword: string, locations?: string[]): Promise<ScrapedJob[]> {
  console.log(`Scraping Profession.hu for keyword: "${keyword}"...`);
  
  // Format the search query URLs (pages 1 to MAX_SEARCH_PAGES)
  const maxPages = MAX_SEARCH_PAGES;
  const searchUrls: string[] = [];
  if (!locations || locations.length === 0) {
    for (let page = 1; page <= maxPages; page++) {
      searchUrls.push(`${PROFESSION_BASE_URL}/allasok/${page},0,0,${encodeURIComponent(keyword)}%401%401?keywordsearch`);
    }
  } else {
    for (const locKey of locations) {
      const locInfo = getLocation(locKey);
      if (!locInfo) continue;

      for (let page = 1; page <= maxPages; page++) {
        if (locInfo.professionHomeOfficeId) {
          searchUrls.push(`${PROFESSION_BASE_URL}/allasok/${page},0,0,${encodeURIComponent(keyword)},0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,${locInfo.professionHomeOfficeId}`);
        } else {
          searchUrls.push(`${PROFESSION_BASE_URL}/allasok/${locInfo.professionSlug}/${page},0,${locInfo.professionId},${encodeURIComponent(keyword)}`);
        }
      }
    }
  }

  const jobs: ScrapedJob[] = [];
  const visitedLinks = new Set<string>();

  for (const searchUrl of searchUrls) {
    console.log(`Searching URL: ${searchUrl}`);
    let html = '';
    try {
      // Try Axios first (much faster)
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept-Language': 'hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        timeout: 10000
      });
      html = response.data;
    } catch (error: any) {
      console.warn(`Axios scraping failed or was blocked for URL: ${searchUrl}. Falling back to Playwright...`, error.message);

      // Fallback to Playwright (shared browser, own page)
      let page;
      try {
        const browser = await getSharedBrowser();
        page = await browser.newPage({
          userAgent: getRandomUserAgent(),
          extraHTTPHeaders: {
            'Accept-Language': 'hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7'
          }
        });
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        html = await page.content();
      } catch (pwError: any) {
        console.error(`Playwright scraping search page failed for URL: ${searchUrl}:`, pwError.message);
        continue;
      } finally {
        await page?.close();
      }
    }

    // Parse search results page
    const $ = cheerio.load(html);

    // Find all anchor tags that point to a job listing.
    $('a').each((_, element) => {
      const href = $(element).attr('href');
      if (!href) return;

      // Resolve relative URL if needed
      let fullUrl = href;
      if (href.startsWith('/')) {
        fullUrl = `${PROFESSION_BASE_URL}${href}`;
      }

      // Match only detail pages: should contain "/allas/" and end with a number (job id)
      const match = fullUrl.match(/\/allas\/.*-(\d+)(\?|$)/);
      if (match) {
        const jobId = `profession-${match[1]}`;
        const urlWithoutParams = fullUrl.split('?')[0];

        if (!visitedLinks.has(urlWithoutParams)) {
          visitedLinks.add(urlWithoutParams);

          // Attempt to extract basic card info from the anchor or surrounding elements
          const titleText = $(element).text().trim().replace(/\s+/g, ' ');
          
          // Find nearest job card to extract company
          const card = $(element).closest('.job-card, [class*="job-card"], [class*="item"]');
          let company = '';
          let location = '';

          if (card.length) {
            company = card.find('[class*="company"]').text().trim();
            location = card.find('[class*="location"]').text().trim();
          }

          const cleanedTitle = titleText.length > 100 ? titleText.substring(0, 100) + '...' : titleText;

          jobs.push({
            job_id: jobId,
            platform: 'profession',
            title: cleanedTitle || 'Unknown Position',
            company: company || 'Unknown Company',
            location: location || 'Hungary',
            link: urlWithoutParams,
            rawText: '' // Will be populated when we fetch the detail page
          });
        }
      }
    });

    // Polite delay between URL scrapes
    if (searchUrls.length > 1) {
      await new Promise(resolve => setTimeout(resolve, SEARCH_PAGE_DELAY_MS));
    }
  }

  console.log(`Found ${jobs.length} unique job links across all search URLs.`);
  return jobs;
}

// Fetch and clean the text of an individual job page
export async function scrapeJobDetails(url: string): Promise<string> {
  let html = '';
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept-Language': 'hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      timeout: 10000
    });
    html = response.data;
  } catch (error: any) {
    console.warn(`Axios detail scraping failed for ${url}. Falling back to Playwright...`, error.message);
    let page;
    try {
      const browser = await getSharedBrowser();
      page = await browser.newPage({
        userAgent: getRandomUserAgent()
      });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      html = await page.content();
    } catch (pwError: any) {
      console.error(`Playwright detail scraping failed for ${url}:`, pwError.message);
      return '';
    } finally {
      await page?.close();
    }
  }

  // Load HTML and clean up unnecessary tags to optimize token count
  const $ = cheerio.load(html);
  
  // Remove script, style, SVG, nav, footer, header tags
  $('script, style, svg, iframe, nav, footer, header, noscript').remove();
  
  // Extract text from the main body or job description element if found
  // Profession uses class names like '.job-description' or '#job-description' or the main container
  const mainContent = $('.job-description, [class*="job-description"], main, body');
  
  // Fallback to body text if mainContent is empty
  const text = mainContent.length ? mainContent.text() : $('body').text();

  // Clean whitespace
  return text.replace(/\s+/g, ' ').trim();
}
