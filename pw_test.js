const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({headless: true});
    try {
        const page = await browser.newPage();
        await page.goto('https://www.profession.hu', { waitUntil: 'domcontentloaded' });
        
        // Use the adv_pattern input
        await page.fill('input[name="adv_pattern"]', 'react');
        
        // Submit the form
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            page.click('form#searchbar_form button[type="submit"], form#searchbar_form .search-btn') // adjust selector if needed
        ]).catch(e => console.log('Navigation wait error:', e));

        console.log('Result URL:', page.url());
        const title = await page.title();
        console.log('Result Title:', title);
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await browser.close();
    }
})();
