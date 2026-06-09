import { chromium } from 'playwright';

async function checkPreziJobs() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-http2']
  });
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  try {
    const url = 'https://boards.greenhouse.io/prezi';
    console.log('Navigating to:', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const title = await page.title();
    console.log('Title:', title);

    const links = await page.$$eval('a', el => el.map(a => ({
      href: a.href,
      text: a.textContent?.trim() || ''
    })));

    console.log(`Found ${links.length} total links.`);
    
    // Filter job links (Greenhouse job URLs usually contain /prezi/jobs/ or /jobs/)
    const jobLinks = links.filter(l => l.href.includes('/jobs/') || l.href.includes('/prezi/'));
    console.log('Prezi job links:');
    jobLinks.forEach((link, idx) => {
      console.log(`${idx + 1}. [Text: ${link.text}] -> ${link.href}`);
    });

  } catch (err: any) {
    console.error('Failed:', err.message);
  } finally {
    await browser.close();
  }
}

checkPreziJobs();
