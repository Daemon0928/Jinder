import db from '../db/database';
import { extractJobLinksWithGemini } from '../matcher/gemini';
import { assertSafePublicUrl } from '../lib/urlSafety';
import { ScrapedJob } from '../types';
import { getRandomUserAgent, MAX_SEARCH_PAGES, SEARCH_ENGINE_DELAY_MS } from '../lib/constants';
import { getSharedBrowser } from '../lib/browser';

export type { ScrapedJob };

function isSearchEngineDomain(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase();
    if (host.includes('duckduckgo.com')) return true;
    if (host.includes('bing.com')) return true;
    if (host.includes('yahoo.com')) return true;
    if (host.includes('google.com') && (url.pathname.startsWith('/sorry') || url.pathname.startsWith('/search'))) return true;
    return false;
  } catch (e) {
    return true;
  }
}

function isJobBoardOrSocialMedia(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase();
    return host.includes('linkedin.com') ||
           host.includes('profession.hu') ||
           host.includes('nofluffjobs.com') ||
           host.includes('facebook.com') ||
           host.includes('instagram.com') ||
           host.includes('glassdoor.com') ||
           host.includes('indeed.com') ||
           host.includes('youtube.com') ||
           host.includes('twitter.com') ||
           host.includes('x.com');
  } catch (e) {
    return true;
  }
}

function isAdOrRedirectUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    const query = url.search.toLowerCase();

    // Check hostnames
    if (
      host.includes('doubleclick.net') ||
      host.includes('dartsearch.net') ||
      host.includes('googleadservices.com') ||
      host.includes('adservice.google') ||
      host.includes('adsystem') ||
      host.includes('yieldmanager') ||
      host.includes('taboola') ||
      host.includes('outbrain') ||
      host.includes('adserver') ||
      host.includes('sponsored') ||
      host.startsWith('ads.')
    ) {
      return true;
    }

    // Check paths & query params
    if (
      path.includes('/click') ||
      path.includes('/aclk') ||
      path.includes('/pagead/') ||
      path.includes('/searchads/') ||
      path.includes('/ad/') ||
      query.includes('gclid=') ||
      query.includes('utm_medium=cpc') ||
      query.includes('msclkid=')
    ) {
      return true;
    }

    // Yahoo-specific sponsored links format
    if (host.includes('yahoo.com') && (path.includes('/pc/') || path.includes('/p/'))) {
      return true;
    }

    return false;
  } catch (e) {
    return true;
  }
}

function isLikelyCareerPage(url: string, companyName: string): boolean {
  const lowerUrl = url.toLowerCase();
  const lowerCompany = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');

  const hasKeywords = lowerUrl.includes('career') || 
                      lowerUrl.includes('jobs') || 
                      lowerUrl.includes('karrier') || 
                      lowerUrl.includes('allas') || 
                      lowerUrl.includes('work-with-us') || 
                      lowerUrl.includes('join-us') ||
                      lowerUrl.includes('positions') ||
                      lowerUrl.includes('toborzas') ||
                      lowerUrl.includes('recruitment') ||
                      lowerUrl.includes('workday') ||
                      lowerUrl.includes('greenhouse') ||
                      lowerUrl.includes('lever.co');

  const containsCompanyCleanName = lowerCompany.length > 2 && lowerUrl.includes(lowerCompany);

  return hasKeywords || containsCompanyCleanName;
}

function getCompanyFromUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    let hostname = url.hostname.toLowerCase();
    if (hostname.startsWith('www.')) hostname = hostname.substring(4);
    const parts = hostname.split('.');
    
    // Check if it is a hosted ATS platform
    if (hostname.includes('lever.co') || hostname.includes('greenhouse.io') || hostname.includes('myworkdayjobs.com') || hostname.includes('smartrecruiters.com')) {
      const pathParts = url.pathname.split('/').filter(p => p.length > 0);
      if (pathParts.length > 0) {
        if (hostname.includes('myworkdayjobs.com')) {
          return parts[0].toUpperCase();
        }
        return pathParts[0].toUpperCase();
      }
    }
    return parts[0] ? parts[0].toUpperCase() : 'Company';
  } catch (e) {
    return 'Company';
  }
}

function generateJobId(url: string): string {
  const cleanUrl = url.toLowerCase().replace(/[^a-z0-9]/g, '');
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `career-${Math.abs(hash)}-${cleanUrl.substring(cleanUrl.length - 20)}`;
}

function detectLocation(url: string, text: string): string {
  const combined = (url + ' ' + text).toLowerCase();
  if (combined.includes('budapest')) return 'Budapest';
  if (combined.includes('szeged')) return 'Szeged';
  if (combined.includes('debrecen')) return 'Debrecen';
  if (combined.includes('pecs') || combined.includes('pécs')) return 'Pécs';
  if (combined.includes('gyor') || combined.includes('győr')) return 'Győr';
  if (combined.includes('remote') || combined.includes('tavmunka') || combined.includes('home office') || combined.includes('homeoffice')) return 'Remote';
  return 'Hungary';
}

/**
 * Searches for a company's career page URL using search engines.
 * First checks the local database cache to prevent redundant searches.
 */
export async function findCareerPageUrl(companyName: string): Promise<string | null> {
  if (!companyName || companyName.trim().length === 0) {
    return null;
  }

  let cleanCompanyName = companyName.trim();
  let manualUrl: string | null = null;

  // Check if manually provided URL with pipe format (e.g. "OTP Bank|https://...")
  if (cleanCompanyName.includes('|')) {
    const parts = cleanCompanyName.split('|');
    cleanCompanyName = parts[0].trim();
    manualUrl = parts[1].trim();
  } else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(cleanCompanyName)) {
    manualUrl = cleanCompanyName;
    cleanCompanyName = getCompanyFromUrl(manualUrl);
  }

  if (manualUrl) {
    // User-supplied URLs are navigated by a headless browser — reject
    // non-http protocols and private/internal targets (SSRF).
    try {
      await assertSafePublicUrl(manualUrl);
    } catch (err: any) {
      console.warn(`[Manual URL] Rejected unsafe URL for "${cleanCompanyName}": ${err.message}`);
      return null;
    }
    console.log(`[Manual URL] Using manually provided URL for "${cleanCompanyName}": ${manualUrl}`);
    try {
      db.prepare("INSERT OR REPLACE INTO career_page_cache (company_name, career_url) VALUES (?, ?)")
        .run(cleanCompanyName, manualUrl);
    } catch (cacheErr: any) {
      console.warn('Failed to write manual URL to career_page_cache:', cacheErr.message);
    }
    return manualUrl;
  }

  // 1. Check local cache
  try {
    const cached = db.prepare("SELECT career_url FROM career_page_cache WHERE company_name = ?")
      .get(cleanCompanyName) as { career_url: string } | undefined;
    
    if (cached) {
      console.log(`[Cache Hit] Found career URL for "${cleanCompanyName}": ${cached.career_url}`);
      return cached.career_url;
    }
  } catch (err: any) {
    console.warn('Failed to read from career_page_cache:', err.message);
  }

  // 2. Perform search
  console.log(`[Search] Discovering career URL for "${cleanCompanyName}"...`);
  
  // Rate limiting delay before query to avoid blocking
  await new Promise(resolve => setTimeout(resolve, SEARCH_ENGINE_DELAY_MS));

  const browser = await getSharedBrowser();
  let page;
  try {
    page = await browser.newPage({
      userAgent: getRandomUserAgent(),
      extraHTTPHeaders: {
        'Accept-Language': 'hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    const query = `"${cleanCompanyName}" careers`;
    let links: { href: string; text: string }[] = [];

    // Try DuckDuckGo first
    try {
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      console.log(`[Search] Querying DuckDuckGo: ${ddgUrl}`);
      await page.goto(ddgUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      
      const bodyText = await page.innerText('body');
      const ddgBlocked = bodyText.includes('Unexpected error') || bodyText.includes('Forbidden') || bodyText.includes('robot');
      
      if (!ddgBlocked) {
        links = await page.$$eval('a', el => el.map(a => ({ href: a.href, text: a.textContent || '' })));
      } else {
        console.warn(`[Search] DuckDuckGo blocked the request.`);
      }
    } catch (ddgErr: any) {
      console.warn(`[Search] DuckDuckGo search failed:`, ddgErr.message);
    }

    // Fallback to Yahoo Search if DuckDuckGo failed or returned no organic links
    let validResults = links.filter(l => l.href && l.href.startsWith('http') && !isSearchEngineDomain(l.href) && !isAdOrRedirectUrl(l.href));
    if (validResults.length === 0) {
      console.log(`[Search] Falling back to Yahoo Search for "${cleanCompanyName}"...`);
      try {
        const yahooUrl = `https://search.yahoo.com/search?q=${encodeURIComponent(query)}`;
        await page.goto(yahooUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        
        // Handle cookie consent if visible
        const buttons = await page.$$('button');
        for (const btn of buttons) {
          const txt = await btn.textContent();
          if (txt && (
            txt.includes('Accept') || 
            txt.includes('Agree') || 
            txt.includes('elfogad') || 
            txt.includes('Elfogad') || 
            txt.includes('Agree to all') || 
            txt.includes('Accept all')
          )) {
            console.log(`[Search] Clicking Yahoo consent button: "${txt.trim()}"`);
            await btn.click();
            await page.waitForTimeout(3000);
            break;
          }
        }
        
        const bodyText = await page.innerText('body');
        const yahooBlocked = bodyText.includes('robot') || bodyText.includes('CAPTCHA') || bodyText.includes('blocked');
        if (!yahooBlocked) {
          links = await page.$$eval('a', el => el.map(a => ({ href: a.href, text: a.textContent || '' })));
          validResults = links.filter(l => l.href && l.href.startsWith('http') && !isSearchEngineDomain(l.href) && !isAdOrRedirectUrl(l.href));
        } else {
          console.warn(`[Search] Yahoo blocked the request.`);
        }
      } catch (yahooErr: any) {
        console.error(`[Search] Yahoo search fallback failed:`, yahooErr.message);
      }
    }

    // Fallback to Bing Search if Yahoo failed or returned no organic links
    if (validResults.length === 0) {
      console.log(`[Search] Falling back to Bing Search for "${cleanCompanyName}"...`);
      try {
        const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
        await page.goto(bingUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        
        // Handle cookie consent if visible
        const buttons = await page.$$('button, a');
        for (const btn of buttons) {
          try {
            const txt = await btn.textContent();
            if (txt && (
              txt.includes('Accept') || 
              txt.includes('Agree') || 
              txt.includes('Elfogad') || 
              txt.includes('elfogadom') || 
              txt.includes('Accept all')
            )) {
              console.log(`[Search] Clicking Bing consent button: "${txt.trim()}"`);
              await btn.click();
              await page.waitForTimeout(3000);
              break;
            }
          } catch (e) {}
        }

        const bodyText = await page.innerText('body');
        const bingBlocked = bodyText.includes('unusual traffic') || bodyText.includes('CAPTCHA') || bodyText.includes('blocked');
        if (!bingBlocked) {
          links = await page.$$eval('a', el => el.map(a => ({ href: a.href, text: a.textContent || '' })));
          validResults = links.filter(l => l.href && l.href.startsWith('http') && !isSearchEngineDomain(l.href) && !isAdOrRedirectUrl(l.href));
        } else {
          console.warn(`[Search] Bing blocked the request.`);
        }
      } catch (bingErr: any) {
        console.error(`[Search] Bing search fallback failed:`, bingErr.message);
      }
    }

    // Filter organic links
    const organic = validResults.filter(l => {
      const h = l.href;
      return h && h.startsWith('http') && !isSearchEngineDomain(h) && !isJobBoardOrSocialMedia(h) && !isAdOrRedirectUrl(h);
    });

    console.log(`[Search] Identified ${organic.length} organic links.`);

    let matchedUrl: string | null = null;

    // Search for first link matching heuristics
    for (const link of organic) {
      if (isLikelyCareerPage(link.href, cleanCompanyName)) {
        matchedUrl = link.href;
        break;
      }
    }

    // Fallback to first organic link if heuristics yielded nothing
    if (!matchedUrl && organic.length > 0) {
      matchedUrl = organic[0].href;
    }

    if (matchedUrl) {
      console.log(`[Search] Discovered URL for "${cleanCompanyName}": ${matchedUrl}`);
      // Save to cache
      try {
        db.prepare("INSERT OR REPLACE INTO career_page_cache (company_name, career_url) VALUES (?, ?)")
          .run(cleanCompanyName, matchedUrl);
      } catch (cacheErr: any) {
        console.warn('Failed to write to career_page_cache:', cacheErr.message);
      }
      return matchedUrl;
    }

    console.warn(`[Search] No career URL discovered for "${cleanCompanyName}"`);
    return null;
  } catch (err: any) {
    console.error(`[Search] Discovery process failed for "${cleanCompanyName}":`, err.message);
    return null;
  } finally {
    await page?.close();
  }
}

/**
 * Scrapes job listings from a company's career page URL.
 * Filters listings matching the keyword.
 */
async function findNextPageButton(page: any): Promise<any | null> {
  const nextKeywords = ['next', 'következő', '>', 'next page', 'forward', 'tovább'];
  try {
    // Check for standard next relations or aria-labels
    const relNext = await page.$('a[rel="next"], [aria-label*="next" i], [class*="next" i]:not([class*="prev" i]) a');
    if (relNext && await relNext.isVisible()) {
      return relNext;
    }

    const elements = await page.$$('button, a, span, div[role="button"]');
    for (const el of elements) {
      try {
        const text = (await el.textContent())?.toLowerCase().trim() || '';
        if (text.length > 0 && text.length < 15 && nextKeywords.some(kw => text === kw || text.includes(kw))) {
          const isVisible = await el.isVisible();
          const isEnabled = await el.isEnabled().catch(() => true);
          if (isVisible && isEnabled) {
            if (!text.includes('prev') && !text.includes('vissza') && !text.includes('back')) {
              return el;
            }
          }
        }
      } catch (e) {}
    }
  } catch (err) {}
  return null;
}

function isJobUrlHeuristic(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return (
    lowerUrl.includes('/job/') || 
    lowerUrl.includes('/jobs/') ||
    lowerUrl.includes('/job-') ||
    lowerUrl.includes('-job-') ||
    lowerUrl.includes('test-job-') ||
    lowerUrl.includes('/position/') || 
    lowerUrl.includes('/positions/') ||
    lowerUrl.includes('/career/') || 
    lowerUrl.includes('/careers/') ||
    lowerUrl.includes('/allas/') || 
    lowerUrl.includes('/opening/') || 
    lowerUrl.includes('/vacancy/') || 
    lowerUrl.includes('/view.php?') ||
    lowerUrl.includes('lever.co/') ||
    lowerUrl.includes('greenhouse.io/') ||
    lowerUrl.includes('smartrecruiters.com/') ||
    lowerUrl.includes('myworkdayjobs.com/')
  );
}

/**
 * Scrapes job listings from a company's career page URL.
 * Filters listings matching the keyword.
 */
export async function scrapeCareerPage(
  careerUrl: string,
  keyword: string,
  companyName?: string
): Promise<ScrapedJob[]> {
  console.log(`[Scrape] Loading career page: ${careerUrl} for keyword "${keyword}"...`);
  const resolvedCompany = companyName || getCompanyFromUrl(careerUrl);
  
  const browser = await getSharedBrowser();
  const jobs: ScrapedJob[] = [];
  const visitedLinks = new Set<string>();

  let page: import('playwright').Page | undefined;
  try {
    page = await browser.newPage({
      userAgent: getRandomUserAgent(),
      extraHTTPHeaders: {
        'Accept-Language': 'hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    const response = await page.goto(careerUrl, { waitUntil: 'commit', timeout: 30000 });
    
    // Check for HTTP errors (behind login wall / forbidden)
    if (response) {
      const status = response.status();
      if (status === 401 || status === 403) {
        console.warn(`[Scrape] Career page for ${resolvedCompany} is behind a login wall (HTTP ${status}). Skipping.`);
        return [];
      }
    }

    await page.waitForTimeout(4000);

    // Check URL or login elements
    const finalUrl = page.url().toLowerCase();
    const isLoginRedirect = 
      finalUrl.includes('/login') || 
      finalUrl.includes('/signin') || 
      finalUrl.includes('/auth') || 
      finalUrl.includes('/authorize') || 
      finalUrl.includes('/signup') || 
      finalUrl.includes('/register') || 
      finalUrl.includes('/accounts/login');

    const hasPasswordInput = await page.$('input[type="password"]');

    if (isLoginRedirect || hasPasswordInput) {
      console.warn(`[Scrape] Career page for ${resolvedCompany} is behind a login wall (${page.url()}). Skipping.`);
      return [];
    }

    const lowerKeyword = keyword.toLowerCase();
    const discoveredLinks: { href: string; title: string }[] = [];

    let currentPage = 1;
    const maxPages = MAX_SEARCH_PAGES;
    let newJobsFoundInLastIteration = true;

    while (currentPage <= maxPages && newJobsFoundInLastIteration) {
      newJobsFoundInLastIteration = false;
      console.log(`[Scrape] Processing page ${currentPage} of ${careerUrl}...`);

      // Scroll down to trigger infinite scroll/lazy loading
      for (let i = 0; i < 2; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);
      }

      // Extract candidate links
      const links = await page.$$eval('a', (anchors) => {
        return anchors.map(a => ({
          href: a.getAttribute('href') || '',
          text: a.innerText || a.textContent || ''
        }));
      });

      const candidateLinks: { href: string; text: string }[] = [];
      for (const link of links) {
        if (!link.href || link.href.startsWith('#') || link.href.startsWith('javascript:')) continue;
        if (link.href.startsWith('mailto:') || link.href.startsWith('tel:')) continue;

        let fullUrl = '';
        try {
          fullUrl = new URL(link.href, page.url()).href;
        } catch (e) {
          continue;
        }

        if (isSearchEngineDomain(fullUrl) || isJobBoardOrSocialMedia(fullUrl) || isAdOrRedirectUrl(fullUrl)) continue;

        candidateLinks.push({ href: fullUrl, text: link.text.trim().replace(/\s+/g, ' ') });
      }

      const lowerCareerUrl = careerUrl.toLowerCase();
      const isStandardAts = 
        lowerCareerUrl.includes('lever.co') || 
        lowerCareerUrl.includes('greenhouse.io') || 
        lowerCareerUrl.includes('smartrecruiters.com') || 
        lowerCareerUrl.includes('myworkdayjobs.com');

      if (isStandardAts) {
        // Use heuristics directly
        console.log(`[Scrape] Standard ATS detected. Using heuristics for link extraction.`);
        for (const link of candidateLinks) {
          if (visitedLinks.has(link.href)) continue;
          
          const title = link.text;
          if (title.length === 0) continue;
          if (!title.toLowerCase().includes(lowerKeyword)) continue;
          
          if (isJobUrlHeuristic(link.href)) {
            visitedLinks.add(link.href);
            discoveredLinks.push({ href: link.href, title });
            newJobsFoundInLastIteration = true;
          }
        }
      } else {
        // Use LLM to extract links
        console.log(`[Scrape] Custom corporate page. Using Gemini LLM for link extraction.`);
        let extractedUrls: string[] | null = null;
        try {
          extractedUrls = await extractJobLinksWithGemini(page.url(), candidateLinks);
        } catch (e: any) {
          console.warn(`[Scrape] Gemini link extraction failed:`, e.message);
        }

        if (extractedUrls && Array.isArray(extractedUrls)) {
          console.log(`[Scrape] Gemini identified ${extractedUrls.length} job links.`);
          for (const url of extractedUrls) {
            if (visitedLinks.has(url)) continue;
            
            // Find the corresponding text from candidateLinks
            const candidate = candidateLinks.find(c => c.href === url);
            const title = candidate ? candidate.text : 'Position';
            
            // Filter by keyword in title/URL
            if (!title.toLowerCase().includes(lowerKeyword) && !url.toLowerCase().includes(lowerKeyword)) continue;

            visitedLinks.add(url);
            discoveredLinks.push({ href: url, title });
            newJobsFoundInLastIteration = true;
          }
        } else {
          // Fallback to heuristics
          console.warn(`[Scrape] Falling back to heuristics for link extraction.`);
          for (const link of candidateLinks) {
            if (visitedLinks.has(link.href)) continue;
            
            const title = link.text;
            if (title.length === 0) continue;
            if (!title.toLowerCase().includes(lowerKeyword)) continue;
            
            if (isJobUrlHeuristic(link.href)) {
              visitedLinks.add(link.href);
              discoveredLinks.push({ href: link.href, title });
              newJobsFoundInLastIteration = true;
            }
          }
        }
      }


      // Heuristic 2: Extract from JSON-LD structured data
      try {
        const jsonLds = await page.$$eval('script[type="application/ld+json"]', (scripts) => {
          return scripts.map(s => s.textContent || '');
        });

        for (const rawJson of jsonLds) {
          try {
            const data = JSON.parse(rawJson);
            const processJob = (job: any) => {
              if (job && job['@type'] === 'JobPosting') {
                const title = job.title;
                const url = job.url || job.urlStr;
                if (title && url) {
                  let fullUrl = '';
                  try {
                    fullUrl = new URL(url, page!.url()).href;
                  } catch (e) {
                    return;
                  }
                  if (!visitedLinks.has(fullUrl) && title.toLowerCase().includes(lowerKeyword)) {
                    visitedLinks.add(fullUrl);
                    discoveredLinks.push({ href: fullUrl, title });
                    newJobsFoundInLastIteration = true;
                  }
                }
              }
            };

            if (Array.isArray(data)) {
              data.forEach(processJob);
            } else if (data['@graph'] && Array.isArray(data['@graph'])) {
              data['@graph'].forEach(processJob);
            } else {
              processJob(data);
            }
          } catch (e) {
            // ignore parsing issues
          }
        }
      } catch (ldErr: any) {
        console.warn('[Scrape] Error reading JSON-LD:', ldErr.message);
      }

      if (!newJobsFoundInLastIteration) {
        console.log(`[Scrape] No new job links found on page ${currentPage}. Stopping pagination.`);
        break;
      }

      if (currentPage < maxPages) {
        // Try clicking "Load More" first (infinite scroll style)
        let clicked = false;
        const loadMoreKeywords = ['load more', 'show more', 'more jobs', 'mutass többet', 'további', 'load-more', 'show-more'];
        const buttons = await page.$$('button, a, div[role="button"]');
        for (const btn of buttons) {
          try {
            const text = (await btn.textContent())?.toLowerCase().trim() || '';
            if (loadMoreKeywords.some(kw => text.includes(kw))) {
              if (await btn.isVisible() && await btn.isEnabled()) {
                console.log(`[Scrape] Clicking load more button: "${text}"`);
                await btn.click();
                await page.waitForTimeout(3000);
                clicked = true;
                break;
              }
            }
          } catch (e) {}
        }

        if (!clicked) {
          // Try clicking "Next" button (paginated style)
          const nextBtn = await findNextPageButton(page);
          if (nextBtn) {
            console.log(`[Scrape] Clicking next page button...`);
            await nextBtn.click();
            await page.waitForTimeout(3000);
            clicked = true;
          }
        }

        if (!clicked) {
          console.log(`[Scrape] No pagination or load-more controls found on page ${currentPage}.`);
          break;
        }
      }
      currentPage++;
    }

    console.log(`[Scrape] Discovered ${discoveredLinks.length} matching jobs for "${keyword}" at ${resolvedCompany}`);

    for (const link of discoveredLinks) {
      jobs.push({
        job_id: generateJobId(link.href),
        platform: 'career',
        title: link.title,
        company: resolvedCompany,
        location: detectLocation(link.href, link.title),
        link: link.href,
        rawText: '' // Will be fetched in details phase
      });
    }

  } catch (err: any) {
    console.error(`[Scrape] Failed to scrape career page ${careerUrl}:`, err.message);
  } finally {
    await page?.close();
  }

  return jobs;
}

/**
 * Scrapes and cleans details from a specific company job opening URL.
 */
export async function scrapeCareerPageDetails(url: string): Promise<string> {
  console.log(`[Details] Scraping career detail page: ${url}`);
  const browser = await getSharedBrowser();
  let page;
  try {
    page = await browser.newPage({
      userAgent: getRandomUserAgent()
    });
    await page.goto(url, { waitUntil: 'commit', timeout: 30000 });
    // Wait for client-side JS to render
    await page.waitForTimeout(3000);

    const bodyText = await page.innerText('body');
    const cleaned = bodyText.trim().replace(/\s+/g, ' ');
    return cleaned;
  } catch (err: any) {
    console.error(`[Details] Failed to scrape career details for ${url}:`, err.message);
    return '';
  } finally {
    await page?.close();
  }
}

/**
 * Scrapes career pages for a list of companies.
 * For each company, resolves its career page URL (using cache or search),
 * then scrapes the page for jobs matching the keyword.
 */
export async function scrapeCareerPages(
  keyword: string,
  companies: string[],
  errors?: string[]
): Promise<ScrapedJob[]> {
  const allJobs: ScrapedJob[] = [];
  console.log(`[Scrape] Starting career pages scrape for ${companies.length} companies with keyword "${keyword}"...`);
  
  for (const company of companies) {
    try {
      const url = await findCareerPageUrl(company);
      if (!url) {
        const errMsg = `Skipping company "${company}" (no career page URL found)`;
        console.warn(`[Scrape] ${errMsg}`);
        errors?.push(errMsg);
        continue;
      }
      const companyJobs = await scrapeCareerPage(url, keyword, company);
      allJobs.push(...companyJobs);
    } catch (err: any) {
      const errMsg = `Error scraping career page for "${company}": ${err.message}`;
      console.error(`[Scrape] ${errMsg}`);
      errors?.push(errMsg);
    }
  }
  
  return allJobs;
}

