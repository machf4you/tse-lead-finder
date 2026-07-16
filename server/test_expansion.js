const axios = require('axios');
const cheerio = require('cheerio');

async function testExpansion() {
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

  let cookieHeader = "";
  try {
    const res = await axios.get('https://www.bing.com/', { headers });
    const cookies = res.headers['set-cookie'] || [];
    cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');
  } catch(e) {
    console.warn("Failed to capture cookies:", e.message);
  }

  const service = "plumber";
  const location = "Bristol";

  const queries = [
    `${service} in ${location} UK website`,
    `best ${service} ${location} website`,
    `local ${service} ${location} website`,
    `${service} services ${location}`,
    `find a ${service} ${location}`
  ];

  const uniqueDomains = new Set();
  const allUrls = [];

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&first=1&cc=GB&mkt=en-GB&setlang=en-GB`;
    console.log(`\n--- Fetching Query ${i + 1}: ${query} ---`);
    try {
      const { data, headers: resHeaders } = await axios.get(searchUrl, {
        headers: {
          ...headers,
          'Cookie': cookieHeader
        }
      });

      // Update cookies
      const newCookies = resHeaders['set-cookie'] || [];
      if (newCookies.length > 0) {
        const cookieMap = {};
        cookieHeader.split(';').forEach(c => {
          const parts = c.split('=');
          if (parts.length >= 2) cookieMap[parts[0].trim()] = parts.slice(1).join('=').trim();
        });
        newCookies.forEach(c => {
          const parts = c.split(';')[0].split('=');
          if (parts.length >= 2) cookieMap[parts[0].trim()] = parts.slice(1).join('=').trim();
        });
        cookieHeader = Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; ');
      }

      const $ = cheerio.load(data);
      let urlsFound = 0;
      let newDomainsFound = 0;

      $('a').each((idx, el) => {
        let href = $(el).attr('href');
        if (!href) return;
        
        let targetUrl = '';
        if (href.startsWith('http') && !href.includes('bing.com') && !href.includes('microsoft.com') && !href.includes('google.') && !href.includes('facebook.') && !href.includes('instagram.') && !href.includes('twitter.') && !href.includes('youtube.')) {
          targetUrl = href;
        } else if (href.includes('bing.com/ck/a?!')) {
          const uMatch = href.match(/u=a1([^&]+)/);
          if (uMatch) {
            try {
               let b64 = uMatch[1].replace(/-/g, '+').replace(/_/g, '/');
               while (b64.length % 4) b64 += '=';
               const decoded = Buffer.from(b64, 'base64').toString('utf-8');
               if (decoded.startsWith('http') && !decoded.includes('bing.com')) {
                 targetUrl = decoded;
               }
            } catch(e) {}
          }
        } else if (href.includes('bing.com/alink/link?url=')) {
          try {
            const urlObj = new URL(href);
            const decodedUrl = urlObj.searchParams.get('url');
            if (decodedUrl && decodedUrl.startsWith('http') && !decodedUrl.includes('bing.com')) {
              targetUrl = decodedUrl;
            }
          } catch(e) {}
        }
        
        if (targetUrl) {
          allUrls.push(targetUrl);
          urlsFound++;
          try {
            const domain = new URL(targetUrl).hostname.replace(/^www\./, '');
            if (!uniqueDomains.has(domain)) {
              uniqueDomains.add(domain);
              newDomainsFound++;
            }
          } catch(e) {}
        }
      });
      console.log(`[QUERY ${i + 1}] ${query} | URLs Found: ${urlsFound} | New Unique Domains: ${newDomainsFound}`);
    } catch(e) {
      console.log(`Failed query ${i + 1}:`, e.message);
    }
  }

  console.log(`\n=== Total Unique Domains Found: ${uniqueDomains.size} ===`);
}

testExpansion();
