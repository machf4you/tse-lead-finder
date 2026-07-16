const axios = require('axios');
const cheerio = require('cheerio');

(async () => {
  const query = 'plumber Reading UK';
  const { data } = await axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9'
        }
  });
  
  const $ = cheerio.load(data);
  const raw = [];
  $('.result').each((i, el) => {
    let aTag = $(el).find('.result__a');
    let href = aTag.attr('href');
    let title = aTag.text().toLowerCase();
    let snippet = $(el).find('.result__snippet').text().toLowerCase();
    
    if (href && href.includes('uddg=')) {
      const uMatch = href.match(/uddg=([^&]+)/);
      if (uMatch) {
         href = decodeURIComponent(uMatch[1]);
      }
    }
    if (href && href.startsWith('http')) {
       raw.push(href);
    }
  });
  console.log("Extracted:", raw.length);
  if (raw.length === 0) {
    console.log("No elements matched .result! Elements:");
    console.log($('div').slice(0, 5).map((i, el) => $(el).attr('class')).get());
  }
})();
