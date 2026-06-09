import axios from 'axios';

async function testSuggest(paramName: string, query: string) {
  const url = `https://www.profession.hu/suggest?${paramName}=${encodeURIComponent(query)}`;
  console.log(`Testing: ${url}`);
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest'
      },
      timeout: 5000
    });
    console.log(`Success! Status: ${res.status}`);
    console.log('Response data type:', typeof res.data);
    console.log('Response data preview:', JSON.stringify(res.data).substring(0, 500));
    return true;
  } catch (e: any) {
    console.log(`Failed for ${paramName}: ${e.message}`);
    return false;
  }
}

async function run() {
  // Try different autocomplete query params
  await testSuggest('term', 'Budapest');
  await testSuggest('q', 'Budapest');
  await testSuggest('query', 'Budapest');
  await testSuggest('t', 'Budapest');
}

run();
