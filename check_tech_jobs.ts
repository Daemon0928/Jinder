import { chromium } from 'playwright';

async function checkTechJobs(url: string, name: string) {
  const browser = await chromium.launch({ headless: true, args: ['--disable-http2'] });
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  try {
    console.log(`Navigating to ${name}:`, url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);
    
    console.log(`Title for ${name}:`, await page.title());
    const links = await page.$$eval('a', el => el.map(a => ({ href: a.href, text: a.textContent?.trim() || '' })));
    console.log(`Found ${links.length} links for ${name}.`);
    
    const jobLinks = links.filter(l => l.href.includes('/jobs/') || l.href.includes('/seon/') || l.href.includes('/bitrise/'));
    console.log(`Sample job links for ${name}:`);
    jobLinks.slice(0, 5).forEach((link, idx) => {
      console.log(`  ${idx + 1}. [Text: ${link.text}] -> ${link.href}`);
    });
  } catch (err: any) {
    console.error(`Failed for ${name}:`, err.message);
  } finally {
    await browser.close();
  }
}

async function run() {
  await checkTechJobs('https://jobs.lever.co/bitrise', 'Bitrise');
  await checkTechJobs('https://boards.greenhouse.io/seon', 'SEON');
}

run();
