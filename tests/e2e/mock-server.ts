import express from 'express';
import cors from 'cors';
import { Server } from 'http';

const app = express();
app.use(cors());
app.use(express.json());

// Store for captured Discord webhooks
let capturedWebhooks: any[] = [];

export interface MockRules {
  professionSearchHtml?: string;
  professionSearchStatus?: number;
  professionDetailHtml?: Record<string, string>;
  professionDetailStatus?: Record<string, number>;

  noFluffSearchPayload?: any;
  noFluffSearchStatus?: number;
  noFluffDetailPayloads?: Record<string, any>;
  noFluffDetailStatus?: Record<string, number>;
  noFluffSearchHtml?: string;
  noFluffSearchHtmlStatus?: number;
  noFluffDetailHtml?: Record<string, string>;
  noFluffDetailHtmlStatus?: Record<string, number>;

  geminiPayload?: any;
  geminiStatus?: number;
  geminiSummarizePayload?: any;
  geminiSummarizeStatus?: number;

  webhookStatus?: number;
}

let activeRules: MockRules = {};

// POST /api/test/set-mock-rules: set dynamic mock rules
app.post('/api/test/set-mock-rules', (req, res) => {
  activeRules = req.body || {};
  res.status(204).send();
});

// GET /api/test/mock-rules: retrieve current mock rules
app.get('/api/test/mock-rules', (req, res) => {
  res.json(activeRules);
});

// Export resetMockServer to clear rules and captured webhooks
export function resetMockServer(): void {
  activeRules = {};
  capturedWebhooks = [];
  console.log('Mock server rules and captured webhooks have been reset.');
}

function getRuleValue<T>(record: Record<string, T> | undefined, slug: string): T | undefined {
  if (!record) return undefined;
  if (record[slug] !== undefined) return record[slug];
  
  // Fallback to searching by trailing digits/ID
  const match = slug.match(/(\d+)$/);
  if (match && record[match[1]] !== undefined) {
    return record[match[1]];
  }
  
  // Fallback to searching by trailing slug part if the record key is a substring
  for (const [key, val] of Object.entries(record)) {
    if (slug.endsWith(`-${key}`) || slug.endsWith(`/${key}`)) {
      return val;
    }
  }
  return undefined;
}

// Static dataset of mock jobs to cover different test scenarios (TypeScript, React, Senior, Java, C#, etc.)
export const mockJobs = [
  // 1. No Fluff Jobs (JSON API)
  {
    slug: 'nofluff-typescript-dev',
    title: 'TypeScript Developer (Score: 90)',
    company: 'TypeScript Specialists',
    location: 'Budapest',
    platform: 'nofluffjobs',
    nofluffApiSearchData: {
      url: 'nofluff-typescript-dev',
      title: 'TypeScript Developer (Score: 90)',
      name: 'TypeScript Specialists',
      location: { places: [{ city: 'Budapest' }] }
    },
    nofluffApiDetailData: {
      requirements: {
        musts: ['TypeScript', 'Node.js', 'React'],
        nices: ['Docker', 'AWS'],
        description: '<p>Excellent opportunity for a TypeScript expert.</p>'
      },
      specs: {
        dailyTasks: ['Write clean TypeScript code', 'Code reviews', 'Unit testing']
      }
    }
  },
  {
    slug: 'nofluff-react-senior-dev',
    title: 'Senior React Engineer (Score: 95)',
    company: 'React Stars',
    location: 'Budapest',
    platform: 'nofluffjobs',
    nofluffApiSearchData: {
      slug: 'nofluff-react-senior-dev',
      title: 'Senior React Engineer (Score: 95)',
      name: 'React Stars',
      location: { places: [{ city: 'Budapest' }] }
    },
    nofluffApiDetailData: {
      requirements: {
        musts: ['React', 'TypeScript', 'Redux'],
        nices: ['Next.js'],
        description: 'Looking for a Senior React Engineer.'
      },
      specs: {
        dailyTasks: ['Architect frontends', 'Lead UI team']
      }
    }
  },
  {
    slug: 'nofluff-java-junior',
    title: 'Junior Java Developer (Score: 50)',
    company: 'Enterprise Solutions',
    location: 'Debrecen',
    platform: 'nofluffjobs',
    nofluffApiSearchData: {
      slug: 'nofluff-java-junior',
      title: 'Junior Java Developer (Score: 50)',
      name: 'Enterprise Solutions',
      location: { places: [{ city: 'Debrecen' }] }
    },
    nofluffApiDetailData: {
      requirements: {
        musts: ['Java 17', 'Spring Boot'],
        nices: ['Maven'],
        description: 'Join our team as a junior Java developer.'
      },
      specs: {
        dailyTasks: ['Write backend APIs', 'Fix bugs']
      }
    }
  },
  
  // 2. No Fluff Jobs (HTML Scraping Fallback)
  {
    slug: 'nofluff-html-node-dev',
    title: 'Node.js Backend Developer (Score: 88)',
    company: 'Node House',
    location: 'Budapest',
    platform: 'nofluffjobs',
    htmlDetailText: 'Node.js Backend Developer position at Node House in Budapest. We require TypeScript, Node.js, Express, PostgreSQL.'
  },
  {
    slug: 'nofluff-html-csharp-dev',
    title: 'C# .NET Developer (Score: 40)',
    company: 'Legacy Corp',
    location: 'Szeged',
    platform: 'nofluffjobs',
    htmlDetailText: 'Looking for a C# .NET Developer in Szeged. Requirements: .NET Core, SQL Server, WCF.'
  },

  // 3. Profession.hu (HTML Scraping)
  {
    slug: 'profession-typescript-senior-111111',
    title: 'Senior TypeScript Architect (Score: 98)',
    company: 'Modern Tech Ltd',
    location: 'Budapest',
    platform: 'profession',
    htmlDetailText: 'We are seeking a Senior TypeScript Architect in Budapest. Candidates must have extensive experience in TypeScript, Node.js, and React. Architect clean, modern applications.'
  },
  {
    slug: 'profession-react-dev-222222',
    title: 'React UI Developer (Score: 82)',
    company: 'Creative Frontend Co',
    location: 'Pest',
    platform: 'profession',
    htmlDetailText: 'Creative Frontend Co is hiring a React UI Developer. You will build user interfaces with React, JavaScript, and CSS. Knowledge of TypeScript is a plus.'
  },
  {
    slug: 'profession-python-django-333333',
    title: 'Python Django Engineer (Score: 65)',
    company: 'DataSolutions',
    location: 'Miskolc',
    platform: 'profession',
    htmlDetailText: 'DataSolutions is looking for a Python Django Developer. Requirements: Python, Django, REST APIs, PostgreSQL.'
  },
  {
    slug: 'profession-angular-dev-444444',
    title: 'Angular Developer (Score: 30)',
    company: 'OldStack Inc',
    location: 'Gyor',
    platform: 'profession',
    htmlDetailText: 'Position for Angular Developer in Gyor. Required: Angular 12, RxJS, TypeScript.'
  }
];

// --- No Fluff Jobs JSON API Endpoints ---

// POST /api/search/posting (No Fluff API search)
app.post('/api/search/posting', (req, res) => {
  if (activeRules.noFluffSearchStatus !== undefined && activeRules.noFluffSearchStatus !== 200) {
    return res.status(activeRules.noFluffSearchStatus).json(activeRules.noFluffSearchPayload || { error: 'Mock search error' });
  }
  if (activeRules.noFluffSearchPayload !== undefined) {
    return res.json(activeRules.noFluffSearchPayload);
  }

  // If the test case has explicitly mocked Profession.hu but NOT No Fluff Jobs, return empty postings
  if (activeRules.noFluffSearchStatus === undefined &&
      activeRules.noFluffSearchPayload === undefined &&
      activeRules.noFluffSearchHtml === undefined &&
      activeRules.noFluffSearchHtmlStatus === undefined) {
    const hasProfessionMock = activeRules.professionSearchStatus !== undefined ||
                              activeRules.professionSearchHtml !== undefined ||
                              activeRules.professionDetailHtml !== undefined ||
                              activeRules.professionDetailStatus !== undefined;
    if (hasProfessionMock) {
      return res.json({ postings: [] });
    }
  }

  const { rawSearch, criteriaSearch } = req.body;
  const keyword = (rawSearch || '').toLowerCase();
  
  // Filter postings based on keyword
  let results = mockJobs.filter(job => {
    if (job.platform !== 'nofluffjobs') return false;
    
    const matchesKeyword = !keyword ||
      job.title.toLowerCase().includes(keyword) ||
      job.company.toLowerCase().includes(keyword) ||
      (job.htmlDetailText && job.htmlDetailText.toLowerCase().includes(keyword)) ||
      (job.nofluffApiDetailData && JSON.stringify(job.nofluffApiDetailData).toLowerCase().includes(keyword));

    if (!matchesKeyword) return false;

    // Filter by cities if provided
    if (criteriaSearch && criteriaSearch.city && Array.isArray(criteriaSearch.city) && criteriaSearch.city.length > 0) {
      const cities = criteriaSearch.city.map((c: string) => c.toLowerCase());
      const jobCity = job.location.toLowerCase();
      return cities.some((c: string) => jobCity.includes(c) || c.includes(jobCity));
    }

    return true;
  });

  // Map to the structure expected by nofluffjobs.ts
  const postings = results
    .filter(job => job.nofluffApiSearchData !== undefined)
    .map(job => job.nofluffApiSearchData);

  res.json({ postings });
});

// GET /api/posting/:slug (No Fluff API details)
app.get('/api/posting/:slug', (req, res) => {
  const { slug } = req.params;
  
  const status = getRuleValue(activeRules.noFluffDetailStatus, slug);
  const payload = getRuleValue(activeRules.noFluffDetailPayloads, slug);
  
  if (status !== undefined && status !== 200) {
    return res.status(status).json(payload || { error: 'Mock detail error' });
  }
  if (payload !== undefined) {
    return res.json(payload);
  }

  const job = mockJobs.find(j => j.slug === slug && j.platform === 'nofluffjobs');
  
  if (job && job.nofluffApiDetailData) {
    res.json(job.nofluffApiDetailData);
  } else {
    res.status(404).json({ error: 'Posting not found or no API detail data' });
  }
});


// --- HTML Scraping Endpoints ---

// No Fluff Search HTML: /hu/jobs/:city and /hu/jobs/all
const handleJobs: express.RequestHandler = (req, res) => {
  if (activeRules.noFluffSearchHtmlStatus !== undefined && activeRules.noFluffSearchHtmlStatus !== 200) {
    return res.status(activeRules.noFluffSearchHtmlStatus).send(activeRules.noFluffSearchHtml || 'Mock search HTML error');
  }
  if (activeRules.noFluffSearchHtml !== undefined) {
    return res.send(activeRules.noFluffSearchHtml);
  }

  // If the test case has explicitly mocked Profession.hu but NOT No Fluff Jobs, return empty HTML
  if (activeRules.noFluffSearchHtmlStatus === undefined &&
      activeRules.noFluffSearchHtml === undefined &&
      activeRules.noFluffSearchStatus === undefined &&
      activeRules.noFluffSearchPayload === undefined) {
    const hasProfessionMock = activeRules.professionSearchStatus !== undefined ||
                              activeRules.professionSearchHtml !== undefined ||
                              activeRules.professionDetailHtml !== undefined ||
                              activeRules.professionDetailStatus !== undefined;
    if (hasProfessionMock) {
      return res.send('<html><body></body></html>');
    }
  }

  const keyword = (req.query.q as string || '').toLowerCase();
  const city = (req.params.city || '').toLowerCase();

  const results = mockJobs.filter(job => {
    if (job.platform !== 'nofluffjobs') return false;

    const matchesKeyword = !keyword ||
      job.title.toLowerCase().includes(keyword) ||
      job.company.toLowerCase().includes(keyword) ||
      (job.htmlDetailText && job.htmlDetailText.toLowerCase().includes(keyword));

    if (!matchesKeyword) return false;

    if (city && city !== 'all') {
      const jobCity = job.location.toLowerCase();
      return jobCity.includes(city) || city.includes(jobCity);
    }

    return true;
  });

  // Generate Cheerio-extractable HTML matching the scrapers
  let html = '<html><body>';
  results.forEach(job => {
    html += `
      <a href="/hu/job/${job.slug}">
        <h3 class="posting-title__position">${job.title}</h3>
        <span class="company-name">${job.company}</span>
        <span class="posting-info__location">${job.location}</span>
      </a>
    `;
  });
  html += '</body></html>';

  res.send(html);
};

app.get('/hu/jobs/all', handleJobs);
app.get('/hu/jobs/:city', handleJobs);

// No Fluff Detail HTML: /hu/job/:slug
app.get('/hu/job/:slug', (req, res) => {
  const { slug } = req.params;

  const status = getRuleValue(activeRules.noFluffDetailHtmlStatus, slug);
  const html = getRuleValue(activeRules.noFluffDetailHtml, slug);

  if (status !== undefined && status !== 200) {
    return res.status(status).send(html || 'Mock detail HTML error');
  }
  if (html !== undefined) {
    return res.send(html);
  }

  const job = mockJobs.find(j => j.slug === slug && j.platform === 'nofluffjobs');

  if (job) {
    const text = job.htmlDetailText || (job.nofluffApiDetailData 
      ? `${job.title} ${job.company} ${job.nofluffApiDetailData.requirements.musts.join(', ')}`
      : 'Default job detail text');
    res.send(`<html><body><main>${text}</main></body></html>`);
  } else {
    res.status(404).send('Job not found');
  }
});

// Profession Search HTML: /allasok/...
app.get('/allasok/*splat', (req, res) => {
  if (activeRules.professionSearchStatus !== undefined && activeRules.professionSearchStatus !== 200) {
    return res.status(activeRules.professionSearchStatus).send(activeRules.professionSearchHtml || 'Mock profession search error');
  }
  if (activeRules.professionSearchHtml !== undefined) {
    return res.send(activeRules.professionSearchHtml);
  }

  // If the test case has explicitly mocked No Fluff Jobs but NOT Profession.hu, return empty page
  if (activeRules.professionSearchStatus === undefined &&
      activeRules.professionSearchHtml === undefined &&
      activeRules.professionDetailHtml === undefined &&
      activeRules.professionDetailStatus === undefined) {
    const hasNoFluffMock = activeRules.noFluffSearchStatus !== undefined ||
                           activeRules.noFluffSearchPayload !== undefined ||
                           activeRules.noFluffSearchHtml !== undefined ||
                           activeRules.noFluffSearchHtmlStatus !== undefined ||
                           activeRules.noFluffDetailStatus !== undefined ||
                           activeRules.noFluffDetailPayloads !== undefined;
    if (hasNoFluffMock) {
      return res.send('<html><body></body></html>');
    }
  }

  const fullPath = decodeURIComponent(req.originalUrl);
  
  // Try to find if there is a keyword at the end or in parameters
  let keyword = '';
  // profession.ts forms url as: /allasok/1,0,0,keyword%401%401?keywordsearch or /allasok/slug/1,0,id,keyword
  const parts = fullPath.split(',');
  if (parts.length > 3) {
    const rawKeyword = parts[3].split('?')[0].split('@')[0];
    keyword = rawKeyword.toLowerCase();
  } else {
    // try to match path segment
    const searchMatch = fullPath.match(/\/allasok\/[^/]+\/1,0,\d+,([^/?]+)/);
    if (searchMatch) {
      keyword = searchMatch[1].toLowerCase();
    }
  }

  // Fallback check: if there is no comma, check query or path
  if (!keyword) {
    const qIndex = fullPath.indexOf('?');
    const pathPart = qIndex !== -1 ? fullPath.substring(0, qIndex) : fullPath;
    const segments = pathPart.split('/');
    const lastSeg = segments[segments.length - 1];
    if (lastSeg && lastSeg !== 'allasok') {
      keyword = lastSeg.toLowerCase();
    }
  }

  // Extract location slug from the path if present (e.g. /allasok/budapest/...)
  let locationSlug = '';
  const matchLoc = fullPath.match(/\/allasok\/([^/]+)\/1,0,/);
  if (matchLoc) {
    locationSlug = matchLoc[1].toLowerCase();
  }

  const results = mockJobs.filter(job => {
    if (job.platform !== 'profession') return false;

    const matchesKeyword = !keyword ||
      job.title.toLowerCase().includes(keyword) ||
      job.company.toLowerCase().includes(keyword) ||
      (job.htmlDetailText && job.htmlDetailText.toLowerCase().includes(keyword));

    if (!matchesKeyword) return false;

    if (locationSlug) {
      const jobLoc = job.location.toLowerCase();
      // "pest" is mapped to "pest", "budapest" to "budapest"
      return jobLoc.includes(locationSlug) || locationSlug.includes(jobLoc);
    }

    return true;
  });

  // Generate Cheerio-extractable Profession HTML
  let html = '<html><body>';
  results.forEach(job => {
    // profession.ts matches links like: /allas/some-slug-123456
    html += `
      <div class="job-card">
        <a href="/allas/${job.slug}">${job.title}</a>
        <div class="company">${job.company}</div>
        <div class="location">${job.location}</div>
      </div>
    `;
  });
  html += '</body></html>';

  res.send(html);
});

// Profession Detail HTML: /allas/:slug
app.get('/allas/:slug', (req, res) => {
  const { slug } = req.params;

  const status = getRuleValue(activeRules.professionDetailStatus, slug);
  const html = getRuleValue(activeRules.professionDetailHtml, slug);

  if (status !== undefined && status !== 200) {
    return res.status(status).send(html || 'Mock profession detail error');
  }
  if (html !== undefined) {
    return res.send(html);
  }

  const job = mockJobs.find(j => j.slug === slug && j.platform === 'profession');

  if (job) {
    res.send(`<html><body><div class="job-description">${job.htmlDetailText}</div></body></html>`);
  } else {
    res.status(404).send('Job not found');
  }
});


// --- Discord Webhook Capture ---

// POST /webhook & /webhook*splat: capture payloads (covers /webhook, /webhook/discord, /webhook-new, etc.)
const handleWebhook = (req: express.Request, res: express.Response) => {
  capturedWebhooks.push({
    timestamp: new Date().toISOString(),
    body: req.body
  });
  if (activeRules.webhookStatus !== undefined) {
    return res.status(activeRules.webhookStatus).send();
  }
  res.status(204).send();
};

app.post('/webhook', handleWebhook);
app.post('/webhook*splat', handleWebhook);

// GET /api/test/received-webhooks: retrieve captured webhooks
app.get('/api/test/received-webhooks', (req, res) => {
  res.json(capturedWebhooks);
});

// POST /api/test/clear-webhooks: clear captured webhooks
app.post('/api/test/clear-webhooks', (req, res) => {
  capturedWebhooks = [];
  res.status(204).send();
});


// --- Server management ---

let serverInstance: Server | null = null;

export function startMockServer(port = 5001): Promise<void> {
  return new Promise((resolve) => {
    serverInstance = app.listen(port, () => {
      console.log(`Mock E2E HTTP server running on port ${port}`);
      resolve();
    });
  });
}

export function stopMockServer(): Promise<void> {
  return new Promise((resolve) => {
    if (serverInstance) {
      serverInstance.close(() => {
        console.log('Mock E2E HTTP server stopped');
        resolve();
      });
    } else {
      resolve();
    }
  });
}

// Support executing directly
if (require.main === module) {
  startMockServer();
}
