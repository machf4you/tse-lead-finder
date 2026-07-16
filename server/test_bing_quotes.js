const axios = require('axios');
const cheerio = require('cheerio');

(async () => {
  const query = '"plumber" "Reading" UK';
  const { data } = await axios.get(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept-Language': 'en-GB,en;q=0.9',
        }
  });
  
  const $ = cheerio.load(data);
  const raw = [];
  $('.b_algo').each((i, el) => {
    let aTag = $(el).find('h2 a');
    let title = aTag.text();
    let snippet = $(el).find('p').text();
    let href = aTag.attr('href');
    if (href && href.includes('u=a1')) {
      const uMatch = href.match(/u=a1([^&]+)/);
      if (uMatch) {
         try { href = Buffer.from(uMatch[1], 'base64').toString('utf-8'); } catch(e){}
      }
    }
    raw.push({ title, snippet, href });
  });
  console.log("Bing Results for Quotes:", raw);
})();
