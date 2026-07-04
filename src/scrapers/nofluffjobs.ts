import axios from 'axios';
import * as cheerio from 'cheerio';

import { ScrapedJob } from '../types';
import { getRandomUserAgent, SEARCH_PAGE_DELAY_MS } from '../lib/constants';
import { getLocation } from '../lib/locations';
import { getSharedBrowser } from '../lib/browser';
import { withRetry } from '../lib/retry';

const NOFLUFF_BASE_URL = process.env.NOFLUFF_BASE_URL || 'https://nofluffjobs.com';

export type { ScrapedJob };

/**
 * Scrapes job listings from No Fluff Jobs.
 * First tries the JSON POST search endpoint, and if empty or blocked, falls back to Playwright crawl.
 */
export async function scrapeNoFluffJobs(keyword: string, locations?: string[]): Promise<ScrapedJob[]> {
  console.log(`Scraping No Fluff Jobs for keyword: "${keyword}"...`);
  
  // 1. Map locations to API city names
  const mappedLocations = Array.from(new Set(
    (locations || [])
      .map(loc => getLocation(loc)?.nofluffCity)
      .filter((loc): loc is string => !!loc)
  ));

  let postings: any[] = [];
  let apiSucceeded = false;

  // 2. Try POST API Search Endpoint
  try {
    const payload: any = {
      rawSearch: keyword,
      page: 1,
      pageSize: 100
    };
    if (mappedLocations.length > 0) {
      payload.criteriaSearch = { city: mappedLocations };
    }

    console.log(`Querying search API with payload:`, JSON.stringify(payload));
    const response = await withRetry(() => axios.post(
      `${NOFLUFF_BASE_URL}/api/search/posting?salaryCurrency=HUF&salaryPeriod=month`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': getRandomUserAgent(),
          'Accept-Language': 'hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        timeout: 15000
      }
    ));

    if (response.data && Array.isArray(response.data.postings)) {
      postings = response.data.postings;
      apiSucceeded = true;
      console.log(`Search API returned ${postings.length} postings.`);
    }
  } catch (error: any) {
    console.warn(`No Fluff Jobs search API failed: ${error.message}. Falling back to Playwright...`);
  }

  // 3. Process API postings if API search was successful and returned results
  if (apiSucceeded && postings.length > 0) {
    const jobs: ScrapedJob[] = [];
    for (const posting of postings) {
      const slug = posting.url || posting.slug;
      if (!slug) continue;

      let locStr = 'Hungary';
      if (posting.location && posting.location.places && posting.location.places.length > 0) {
        locStr = posting.location.places.map((p: any) => p.city).filter((c: any) => !!c).join(', ');
      } else if (posting.fullyRemote) {
        locStr = 'Remote';
      }

      jobs.push({
        job_id: `nofluffjobs-${slug}`,
        platform: 'nofluffjobs',
        title: posting.title || 'Unknown Position',
        company: posting.name || 'Unknown Company',
        location: locStr,
        link: `${NOFLUFF_BASE_URL}/hu/job/${slug}`,
        rawText: ''
      });
    }
    return jobs;
  }

  // 4. Fallback: Playwright crawling search pages
  console.log('API search failed or returned 0 results. Running Playwright fallback search crawl...');
  
  const fallbackCities = Array.from(new Set(
    (locations || [])
      .map(loc => getLocation(loc)?.nofluffSlug)
      .filter((loc): loc is string => !!loc)
  ));

  const searchUrls: string[] = [];
  if (fallbackCities.length === 0) {
    searchUrls.push(`${NOFLUFF_BASE_URL}/hu/jobs/all?q=${encodeURIComponent(keyword)}`);
  } else {
    for (const city of fallbackCities) {
      searchUrls.push(`${NOFLUFF_BASE_URL}/hu/jobs/${city}?q=${encodeURIComponent(keyword)}`);
    }
  }

  const jobs: ScrapedJob[] = [];
  const visitedLinks = new Set<string>();
  const browser = await getSharedBrowser();

  for (const searchUrl of searchUrls) {
      console.log(`Playwright navigating to: ${searchUrl}`);
      let html = '';
      let page;
      try {
        page = await browser.newPage({
          userAgent: getRandomUserAgent(),
          extraHTTPHeaders: {
            'Accept-Language': 'hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7'
          }
        });
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        html = await page.content();
      } catch (pwError: any) {
        console.error(`Playwright search page load failed for ${searchUrl}: ${pwError.message}`);
        continue;
      } finally {
        await page?.close();
      }

      const $ = cheerio.load(html);
      
      $('a').each((_, element) => {
        const href = $(element).attr('href');
        if (!href || !href.includes('/job/')) return;

        let fullUrl = href;
        if (href.startsWith('/')) {
          fullUrl = `${NOFLUFF_BASE_URL}${href}`;
        }

        const urlWithoutParams = fullUrl.split('?')[0];
        const slugMatch = urlWithoutParams.match(/\/job\/([^/?#]+)/);
        if (!slugMatch) return;
        const slug = slugMatch[1];

        if (!visitedLinks.has(urlWithoutParams)) {
          visitedLinks.add(urlWithoutParams);

          // Extract title
          const titleElem = $(element).find('.posting-title__position, h3');
          const titleClone = titleElem.clone();
          titleClone.find('span, .title-badge, [class*="badge"]').remove();
          const title = titleClone.text().trim().replace(/\s+/g, ' ') || 'Unknown Position';

          // Extract company
          const company = $(element).find('.company-name, h4').text().trim().replace(/\s+/g, ' ') || 'Unknown Company';

          // Extract location
          const location = $(element).find('nfj-posting-item-city, .posting-info__location').text().trim().replace(/\s+/g, ' ') || 'Hungary';

          jobs.push({
            job_id: `nofluffjobs-${slug}`,
            platform: 'nofluffjobs',
            title,
            company,
            location,
            link: urlWithoutParams,
            rawText: ''
          });
        }
      });

      if (searchUrls.length > 1) {
        await new Promise(resolve => setTimeout(resolve, SEARCH_PAGE_DELAY_MS));
      }
  }

  return jobs;
}

/**
 * Scrapes job details for a given No Fluff Jobs posting.
 * First tries the details JSON API endpoint, and falls back to Cheerio HTML extraction.
 */
export async function scrapeJobDetails(link: string): Promise<string> {
  const match = link.match(/\/job\/([^/?#]+)/);
  const slug = match ? match[1] : link.split('/').pop() || '';

  if (!slug) {
    console.warn(`Could not extract slug from link: ${link}`);
    return '';
  }

  let apiSucceeded = false;
  let detailText = '';

  // 1. Try JSON Detail API Endpoint
  try {
    const url = `${NOFLUFF_BASE_URL}/api/posting/${slug}`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept-Language': 'hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      timeout: 10000
    });

    if (response.status === 200 && response.data) {
      const data = response.data;
      const parts: string[] = [];

      if (data.requirements) {
        if (data.requirements.musts && data.requirements.musts.length > 0) {
          const musts = data.requirements.musts.map((m: any) => typeof m === 'object' ? m.value : m).filter((v: any) => !!v);
          if (musts.length > 0) {
            parts.push(`Requirements (Must have): ${musts.join(', ')}`);
          }
        }
        if (data.requirements.nices && data.requirements.nices.length > 0) {
          const nices = data.requirements.nices.map((n: any) => typeof n === 'object' ? n.value : n).filter((v: any) => !!v);
          if (nices.length > 0) {
            parts.push(`Requirements (Nice to have): ${nices.join(', ')}`);
          }
        }
      }

      if (data.specs && data.specs.dailyTasks && data.specs.dailyTasks.length > 0) {
        parts.push(`Daily Tasks:\n${data.specs.dailyTasks.map((t: any) => `- ${t}`).join('\n')}`);
      }

      if (data.requirements && data.requirements.description) {
        const cleanDesc = cheerio.load(data.requirements.description).text().trim();
        if (cleanDesc) {
          parts.push(`Description:\n${cleanDesc}`);
        }
      }

      detailText = parts.join('\n\n').trim();
      if (detailText) {
        apiSucceeded = true;
      }
    }
  } catch (error: any) {
    console.warn(`No Fluff Jobs detail API failed for slug: ${slug}. Falling back to HTML crawl...`, error.message);
  }

  // 2. Fallback: HTML extraction
  if (!apiSucceeded) {
    const jobUrl = link.startsWith('http') ? link : `${NOFLUFF_BASE_URL}/hu/job/${slug}`;
    let html = '';
    try {
      const response = await axios.get(jobUrl, {
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept-Language': 'hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        timeout: 10000
      });
      html = response.data;
    } catch (error: any) {
      console.warn(`Axios detail page fetch failed for ${jobUrl}. Falling back to Playwright...`, error.message);
      let page;
      try {
        const browser = await getSharedBrowser();
        page = await browser.newPage({
          userAgent: getRandomUserAgent()
        });
        await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        html = await page.content();
      } catch (pwError: any) {
        console.error(`Playwright detail fallback failed for ${jobUrl}:`, pwError.message);
        return '';
      } finally {
        await page?.close();
      }
    }

    if (html) {
      const $ = cheerio.load(html);
      // Remove scripts, styles, SVGs, etc. to reduce noise and size
      $('script, style, svg, iframe, nav, footer, header, noscript').remove();
      const mainContent = $('main, [class*="job-description"], body');
      const text = mainContent.length ? mainContent.text() : $('body').text();
      detailText = text.replace(/\s+/g, ' ').trim();
    }
  }

  return detailText;
}
