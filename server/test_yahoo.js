const axios = require('axios');
const cheerio = require('cheerio');

(async () => {
  const query = 'plumber Reading UK';
  const { data } = await axios.get(`https://search.yahoo.com/search?p=${encodeURIComponent(query)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9'
        }
  });
  
  const $ = cheerio.load(data);
  const raw = [];
  $('.algo-SR').each((i, el) => {
    let aTag = $(el).find('h3 a');
    let href = aTag.attr('href');
    if (href) {
       // Yahoo often redirects via r.search.yahoo.com
       if (href.includes('RU=')) {
          const ruMatch = href.match(/RU=([^/]+)\//);
          if (ruMatch) href = decodeURIComponent(ruMatch[1]);
       }
       raw.push(href);
    }
  });
  console.log("Extracted:", raw);
  if (raw.length === 0) {
     console.log("Failed Yahoo extract. Classes:", $('div').slice(0, 5).map((i, el) => $(el).attr('class')).get());
  }
})();
