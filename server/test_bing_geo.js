const axios = require('axios');
const cheerio = require('cheerio');

async function testBing() {
  console.log("=== IP GEOLOCATION ===");
  try {
    const ipRes = await axios.get('https://ipapi.co/json/');
    console.log(`IP: ${ipRes.data.ip}`);
    console.log(`Location: ${ipRes.data.city}, ${ipRes.data.region}, ${ipRes.data.country_name}`);
  } catch(e) {
    console.log("Failed to get IP info", e.message);
  }

  const query = "dentist in Bristol UK website";
  const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&first=1&cc=GB&mkt=en-GB&setlang=en-GB`;

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

  console.log("\n=== OUTGOING HEADERS ===");
  console.log(headers);

  console.log("\n=== AXIOS PROXY/AGENT CONFIG ===");
  console.log("Proxy enabled in axios default:", axios.defaults.proxy || "None");

  console.log(`\n=== FETCHING: ${searchUrl} ===`);
  try {
    const { data } = await axios.get(searchUrl, { headers });
    const $ = cheerio.load(data);
    const rawUrls = [];

    $('.b_algo h2 a').each((i, el) => {
      let href = $(el).attr('href');
      let originalHref = href;
      if (href && href.includes('u=a1')) {
        const uMatch = href.match(/u=a1([^&]+)/);
        if (uMatch) {
          try {
             let b64 = uMatch[1].replace(/-/g, '+').replace(/_/g, '/');
             while (b64.length % 4) b64 += '=';
             const decoded = Buffer.from(b64, 'base64').toString('utf-8');
             if (decoded.startsWith('http')) href = decoded;
          } catch(e) { href = originalHref; }
        }
      }
      if (href && href.startsWith('http') && !href.includes('bing.com')) {
         rawUrls.push(href);
      }
    });

    console.log("\n=== RAW EXTRACTED URLS ===");
    rawUrls.forEach(u => console.log(`[${u}]`));
    
  } catch(e) {
    console.error("Error fetching Bing", e.message);
  }
}

testBing();
