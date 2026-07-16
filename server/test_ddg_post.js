const axios = require('axios');
const cheerio = require('cheerio');

(async () => {
  const query = 'plumber Reading UK';
  const formData = new URLSearchParams();
  formData.append('q', query);

  const { data } = await axios.post(`https://html.duckduckgo.com/html/`, formData, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Content-Type': 'application/x-www-form-urlencoded'
        }
  });
  
  const $ = cheerio.load(data);
  const raw = [];
  $('.result').each((i, el) => {
    let aTag = $(el).find('.result__a');
    let href = aTag.attr('href');
    let title = aTag.text().toLowerCase();
    
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
  } else {
    console.log(raw);
  }
})();
