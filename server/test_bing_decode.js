const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
  const url = 'https://www.bing.com/search?q=plumber+in+london';
  try {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const $ = cheerio.load(data);
    const urls = [];
    $('.b_algo h2 a').each((i, el) => {
      let href = $(el).attr('href');
      if (href && href.includes('u=a1')) {
        const uMatch = href.match(/u=a1([^&]+)/);
        if (uMatch) {
           href = Buffer.from(uMatch[1], 'base64').toString('utf-8');
        }
      }
      if (href && href.startsWith('http')) {
        urls.push(href);
      }
    });
    console.log(urls);
  } catch (e) {
    console.log("Error:", e.message);
  }
}
test();
