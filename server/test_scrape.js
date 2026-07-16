const axios = require('axios');
const cheerio = require('cheerio');

(async () => {
  const query = 'plumber in Reading UK';
  
  try {
    console.log("Testing Bing...");
    const bingRes = await axios.get(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const $b = cheerio.load(bingRes.data);
    $b('.b_algo h2 a').each((i, el) => console.log('Bing URL:', $b(el).attr('href')));

    console.log("\nTesting DDG HTML...");
    const ddgRes = await axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const $d = cheerio.load(ddgRes.data);
    $d('.result__a').each((i, el) => console.log('DDG URL:', $d(el).attr('href')));

  } catch (e) {
    console.log("Error:", e.message);
  }
})();
