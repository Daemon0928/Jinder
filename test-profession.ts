import axios from 'axios';
import * as cheerio from 'cheerio';

async function testSearch(keyword: string) {
  const url1 = `https://www.profession.hu/allasok?keyword=${encodeURIComponent(keyword)}`;
  // const url2 = `https://www.profession.hu/allasok/kereses?search=${encodeURIComponent(keyword)}`;
  
  try {
    const res1 = await axios.get(url1, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    const $ = cheerio.load(res1.data);
    let count = 0;
    $('a').each((_, element) => {
      const href = $(element).attr('href');
      if (href && href.match(/\/allas\/.*-(\d+)(\?|$)/)) {
        console.log($(element).text().trim().replace(/\s+/g, ' '));
        count++;
      }
    });
    console.log(`Found ${count} job links.`);
    
  } catch (e) {
    console.error(e);
  }
}

testSearch('react');
