const axios = require('axios');
const cheerio = require('cheerio');

async function debugBing() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-GB,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Referer': 'https://www.bing.com/',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-User': '?1',
    'Sec-Fetch-Dest': 'document',
    'Accept-Encoding': 'gzip, deflate, br'
  };

  try {
    const res = await axios.get('https://www.bing.com/', { headers });
    const cookies = res.headers['set-cookie'] || [];
    const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');

    const query = "plumber in Bristol UK website";
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&first=1&cc=GB&mkt=en-GB&setlang=en-GB`;
    
    const { data } = await axios.get(searchUrl, {
      headers: {
        ...headers,
        'Cookie': cookieHeader
      }
    });

    const $ = cheerio.load(data);
    console.log("=== Printing all anchors with http links != bing.com ===");
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim() || $(el).attr('title') || 'No text';
      const classes = $(el).attr('class') || '';
      const parentClasses = $(el).parent().attr('class') || '';
      const grandparentClasses = $(el).parent().parent().attr('class') || '';

      if (href && href.startsWith('http') && !href.includes('bing.com') && !href.includes('microsoft.com')) {
        console.log(`- Link: "${href}" | Text: "${text}" | Class: "${classes}" | Parent: "${parentClasses}" | Grandparent: "${grandparentClasses}"`);
      } else if (href && href.includes('bing.com/ck/a?!')) {
        // Let's decode it
        const uMatch = href.match(/u=a1([^&]+)/);
        if (uMatch) {
          try {
             let b64 = uMatch[1].replace(/-/g, '+').replace(/_/g, '/');
             while (b64.length % 4) b64 += '=';
             const decoded = Buffer.from(b64, 'base64').toString('utf-8');
             console.log(`- Decoded Link: "${decoded}" | Text: "${text}" | Class: "${classes}" | Parent: "${parentClasses}" | Grandparent: "${grandparentClasses}"`);
          } catch(e) {}
        }
      }
    });
  } catch(e) {
    console.log("Error:", e.message);
  }
}

debugBing();
