const axios = require('axios');
const cheerio = require('cheerio');

(async () => {
  const query = 'plumber Reading UK';
  try {
    const { data } = await axios.get(`https://www.ecosia.org/search?q=${encodeURIComponent(query)}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          }
    });
    
    const $ = cheerio.load(data);
    const raw = [];
    $('.result-item').each((i, el) => {
      let aTag = $(el).find('a.result-title');
      if (aTag.length === 0) aTag = $(el).find('a');
      let href = aTag.attr('href');
      raw.push(href);
    });
    console.log("Ecosia Results:", raw.length, raw);
  } catch(e) {
    console.log("Ecosia failed:", e.message);
  }

  try {
    const { data } = await axios.get(`https://www.dogpile.com/serp?q=${encodeURIComponent(query)}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          }
    });
    
    const $ = cheerio.load(data);
    const raw = [];
    $('.web-bing__url').each((i, el) => {
      raw.push($(el).text());
    });
    if (raw.length === 0) {
      $('.web-bing__title').each((i, el) => {
         raw.push($(el).attr('href'));
      });
    }
    console.log("Dogpile Results:", raw.length, raw);
  } catch(e) {
    console.log("Dogpile failed:", e.message);
  }
})();
