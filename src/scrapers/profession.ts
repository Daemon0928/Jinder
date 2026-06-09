import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';

const PROFESSION_BASE_URL = process.env.PROFESSION_BASE_URL || 'https://www.profession.hu';

export interface ScrapedJob {
  job_id: string;
  platform: string;
  title: string;
  company: string;
  location: string;
  link: string;
  rawText: string;
}

// User agents to prevent blocking
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

interface LocationInfo {
  slug: string;
  id: string;
  homeOfficeId?: string;
}

const LOCATION_MAP: Record<string, LocationInfo> = {
  "budapest": { slug: "budapest", id: "23" },
  "pest": { slug: "pest", id: "37" },
  "debrecen": { slug: "debrecen", id: "32" },
  "szeged": { slug: "szeged", id: "29" },
  "miskolc": { slug: "miskolc", id: "28" },
  "pecs": { slug: "pecs", id: "26" },
  "gyor": { slug: "gyor", id: "31" },
  "nyiregyhaza": { slug: "nyiregyhaza", id: "39" },
  "kecskemet": { slug: "kecskemet", id: "25" },
  "szekesfehervar": { slug: "szekesfehervar", id: "30" },
  "szombathely": { slug: "szombathely", id: "41" },
  "szolnok": { slug: "jasz-nagykun-szolnok", id: "34" },
  "tatabanya": { slug: "tatabanya", id: "35" },
  "kaposvar": { slug: "kaposvar", id: "38" },
  "bekescsaba": { slug: "bekescsaba", id: "27" },
  "veszprem": { slug: "veszprem", id: "42" },
  "zalaegerszeg": { slug: "zalaegerszeg", id: "43" },
  "eger": { slug: "heves", id: "33" },
  "salgotarjan": { slug: "salgotarjan", id: "36" },
  "szekszard": { slug: "szekszard", id: "40" },
  "tavmunka": { slug: "", id: "0", homeOfficeId: "6" },
  "home_office": { slug: "", id: "0", homeOfficeId: "5" }
};

export async function scrapeProfessionHu(keyword: string, locations?: string[]): Promise<ScrapedJob[]> {
  console.log(`Scraping Profession.hu for keyword: "${keyword}"...`);
  
  // Format the search query URLs (pages 1 to 3)
  const maxPages = 3;
  const searchUrls: string[] = [];
  if (!locations || locations.length === 0) {
    for (let page = 1; page <= maxPages; page++) {
      searchUrls.push(`${PROFESSION_BASE_URL}/allasok/${page},0,0,${encodeURIComponent(keyword)}%401%401?keywordsearch`);
    }
  } else {
    for (const locKey of locations) {
      const locInfo = LOCATION_MAP[locKey];
      if (!locInfo) continue;
      
      for (let page = 1; page <= maxPages; page++) {
        if (locInfo.homeOfficeId) {
          searchUrls.push(`${PROFESSION_BASE_URL}/allasok/${page},0,0,${encodeURIComponent(keyword)},0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,${locInfo.homeOfficeId}`);
        } else {
          searchUrls.push(`${PROFESSION_BASE_URL}/allasok/${locInfo.slug}/${page},0,${locInfo.id},${encodeURIComponent(keyword)}`);
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
      
      // Fallback to Playwright
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage({
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
        await browser.close();
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
      await new Promise(resolve => setTimeout(resolve, 1000));
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
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        userAgent: getRandomUserAgent()
      });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      html = await page.content();
    } catch (pwError: any) {
      console.error(`Playwright detail scraping failed for ${url}:`, pwError.message);
      return '';
    } finally {
      await browser.close();
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
