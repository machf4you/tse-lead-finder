const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

let db;
(async () => {
  db = await open({
    filename: './leads.db',
    driver: sqlite3.Database
  });
  
  // Create tables and perform migrations
  await db.exec(`
    CREATE TABLE IF NOT EXISTS searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      service TEXT,
      location TEXT,
      provider TEXT,
      leads_count INTEGER,
      raw_count INTEGER,
      unique_count INTEGER,
      qualified_count INTEGER,
      directories_removed INTEGER,
      suppliers_removed INTEGER,
      excluded_domains_removed INTEGER,
      date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'Completed',
      notes TEXT,
      metadata TEXT DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS excluded_domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT UNIQUE NOT NULL,
      date_added DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS excluded_business_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      date_added DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrate searches table if needed (adding name, status, metadata)
  try {
    const sCols = await db.all("PRAGMA table_info(searches)");
    if (sCols && sCols.length > 0) {
      const hasName = sCols.some(c => c.name === 'name');
      const hasStatus = sCols.some(c => c.name === 'status');
      const hasMetadata = sCols.some(c => c.name === 'metadata');
      if (!hasName) {
        console.log("Migrating searches table: adding name column...");
        await db.exec("ALTER TABLE searches ADD COLUMN name TEXT NOT NULL DEFAULT '';");
      }
      if (!hasStatus) {
        console.log("Migrating searches table: adding status column...");
        await db.exec("ALTER TABLE searches ADD COLUMN status TEXT DEFAULT 'Completed';");
      }
      if (!hasMetadata) {
        console.log("Migrating searches table: adding metadata column...");
        await db.exec("ALTER TABLE searches ADD COLUMN metadata TEXT DEFAULT '{}';");
      }
    }
  } catch (e) {
    console.error("Failed to migrate searches table:", e.message);
  }

  // Migrate leads table if needed (adding search_id and removing global unique website/email constraint)
  let migrateLeads = false;
  try {
    const cols = await db.all("PRAGMA table_info(leads)");
    if (cols && cols.length > 0) {
      const hasSearchId = cols.some(c => c.name === 'search_id');
      if (!hasSearchId) {
        migrateLeads = true;
      }
    } else {
      migrateLeads = true;
    }
  } catch (e) {
    migrateLeads = true;
  }

  if (migrateLeads) {
    console.log("Migrating leads table: dropping and recreating with search_id relation...");
    await db.exec("DROP TABLE IF EXISTS leads;");
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      search_id INTEGER,
      name TEXT,
      email TEXT,
      website TEXT,
      service TEXT,
      location TEXT,
      date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(search_id) REFERENCES searches(id) ON DELETE CASCADE
    );
  `);

  // Populate default excluded domains if empty
  const domCount = await db.get("SELECT COUNT(*) as count FROM excluded_domains");
  if (domCount.count === 0) {
    const defaultDomains = [
      'which.co.uk', 'threebestrated.co.uk', 'checkatrade.com', 'trustatrader.com',
      'buildersup.co.uk', 'goodcompanies.co.uk', 'yell.com', 'yelp.co.uk', 'freeindex.co.uk'
    ];
    for (const d of defaultDomains) {
      await db.run("INSERT OR IGNORE INTO excluded_domains (domain) VALUES (?)", d);
    }
  }

  // Populate default excluded business types if empty
  const typeCount = await db.get("SELECT COUNT(*) as count FROM excluded_business_types");
  if (typeCount.count === 0) {
    const defaultTypes = [
      'Plumbing Supplies', 'Builders Merchant', 'Trade Counter', 'Wholesaler',
      'Water Company', 'Manufacturer', 'Distributor'
    ];
    for (const t of defaultTypes) {
      await db.run("INSERT OR IGNORE INTO excluded_business_types (name) VALUES (?)", t);
    }
  }

  console.log("SQLite database initialized with exclusions tables.");
})();

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'TSE Lead Finder Backend is running' });
});

// Version endpoint
app.get('/api/version', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const versionPath = path.join(__dirname, '..', 'version.json');
  if (fs.existsSync(versionPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
      return res.json(data);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to read version file' });
    }
  }
  res.json({
    id: 'lead-finder',
    name: 'TSE Lead Finder',
    commit_hash: 'dev',
    branch: 'master',
    build_time: new Date().toISOString(),
    version_tag: null
  });
});

async function verifyAndExtractLead(url, service, location, dbExcludedTypes) {
  let targetUrl = url.trim();
  if (!targetUrl.startsWith('http')) {
    targetUrl = 'https://' + targetUrl;
  }

  const serviceLower = service.toLowerCase().trim();
  const locLower = location.toLowerCase().replace(' uk', '').trim();

  try {
    const { data } = await axios.get(targetUrl, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://www.google.com/',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    const $ = cheerio.load(data);
    const text = $('body').text().toLowerCase();
    const title = $('title').text().toLowerCase();
    const urlLower = targetUrl.toLowerCase();

    // 1. Excluded business type check
    const matchedExclusion = dbExcludedTypes.find(t => text.includes(t) || title.includes(t));
    if (matchedExclusion) {
      console.log(`Rejected:\n${targetUrl}\nStage: verification\nReason: Matched excluded business type keyword "${matchedExclusion}"\n`);
      return { isSupplier: true };
    }

    // 2. Business signals check
    const signals = ['contact', 'about', 'call', 'book', 'clinic', 'practice'];
    const hasService = serviceLower && text.includes(serviceLower);
    const hasSignal = signals.some(s => text.includes(s));
    if (!hasSignal && !hasService) {
      console.log(`Rejected:\n${targetUrl}\nStage: verification\nReason: missing business action signals\n`);
      return null;
    }

    // 3. Geo-targeting region check
    if (locLower) {
      const forbiddenRegions = ['dublin', 'ireland', 'scotland', 'wales', 'belfast', 'edinburgh', 'glasgow', 'cardiff', 'australia', 'usa', 'america', 'canada', 'new zealand'];
      const activeForbidden = forbiddenRegions.filter(f => f !== locLower);
      if (activeForbidden.some(f => urlLower.includes(f) || title.includes(f))) {
        console.log(`Rejected:\n${targetUrl}\nStage: verification\nReason: Contains forbidden region in URL or Title\n`);
        return null;
      }
    }

    // 4. Extract email
    let email = '';
    $('a[href^="mailto:"]').each((i, el) => {
      if (!email) {
        const href = $(el).attr('href');
        let potentialEmail = href.replace('mailto:', '').split('?')[0].trim();
        if (isValidEmail(potentialEmail)) email = potentialEmail;
      }
    });

    if (!email) {
      const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]{2,})/gi;
      const matches = text.match(emailRegex);
      if (matches && matches.length > 0) {
        const validMatch = matches.find(m => isValidEmail(m));
        if (validMatch) email = validMatch;
      }
    }

    // Check subpages if email not found
    if (!email) {
      const subpages = ['/contact', '/contact-us', '/about', '/about-us'];
      for (const sub of subpages) {
        try {
          const base = new URL(targetUrl).origin;
          const subUrl = base + sub;
          const subRes = await axios.get(subUrl, {
            timeout: 4000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          const $sub = cheerio.load(subRes.data);
          $sub('a[href^="mailto:"]').each((i, el) => {
            if (!email) {
              const href = $sub(el).attr('href');
              let potentialEmail = href.replace('mailto:', '').split('?')[0].trim();
              if (isValidEmail(potentialEmail)) email = potentialEmail;
            }
          });
          if (!email) {
            const subText = $sub('body').text();
            const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]{2,})/gi;
            const matches = subText.match(emailRegex);
            if (matches && matches.length > 0) {
              const validMatch = matches.find(m => isValidEmail(m));
              if (validMatch) email = validMatch;
            }
          }
        } catch (e) {}
        if (email) break;
      }
    }

    // 5. Clean business name
    let businessName = title;
    if (!businessName) businessName = $('h1').first().text().trim();
    if (businessName.includes('|')) businessName = businessName.split('|')[0].trim();
    else if (businessName.includes('-')) businessName = businessName.split('-')[0].trim();

    businessName = businessName.replace(/plumbers? in .+/gi, '').trim();
    businessName = businessName.replace(/plumbing services? .+/gi, '').trim();
    businessName = businessName.split(' ').filter((item, pos, arr) => {
        return item && (pos === 0 || item.toLowerCase() !== arr[pos - 1].toLowerCase());
    }).join(' ').trim();

    if (!businessName || businessName.toLowerCase() === 'unknown') {
      try {
        const urlObj = new URL(targetUrl);
        let hostname = urlObj.hostname.replace(/^www\./i, '');
        hostname = hostname.replace(/\.(co\.uk|com|org|net|uk|biz|info|ca)$/i, '');
        let name = hostname.replace(/-/g, ' ');
        const commonWords = ['plumbing', 'plumbers', 'plumber', 'heating', 'services', 'service', 'electrical', 'electrician', 'boiler', 'repairs', 'repair', 'ltd'];
        for (const w of commonWords) {
          name = name.replace(new RegExp(`(${w})`, 'gi'), ' $1 ');
        }
        name = name.toLowerCase().replace('inreading', ' in reading ').replace('inlondon', ' in london ').replace('inmanchester', ' in manchester ').replace(/\s+/g, ' ').trim();
        businessName = name.split(' ').filter(Boolean).join(' ').trim();
      } catch(e) {
        businessName = 'Business Lead';
      }
    }

    if (businessName && businessName !== 'Business Lead') {
      businessName = businessName.split(' ').filter(Boolean).map(w => {
         let lower = w.toLowerCase();
         if (lower === 'ltd') return 'Ltd';
         if (['in', 'and', 'the', 'of'].includes(lower)) return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
         if (w.length >= 2 && w.length <= 3 && !['sam', 'bob', 'tom', 'dan', 'jim', 'joe', 'mac', 'ray', 'roy', 'leo'].includes(lower)) return w.toUpperCase();
         return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      }).join(' ').trim();
    }

    return {
      name: businessName || 'Business Lead',
      email: email || '',
      website: targetUrl,
      service: service || '',
      location: location || ''
    };

  } catch (err) {
    console.log(`Failed to scrape ${targetUrl}, returning baseline warning:`, err.message);
    try {
      const urlObj = new URL(targetUrl);
      let name = urlObj.hostname.replace(/^www\./i, '').replace(/\..+$/, '');
      name = name.charAt(0).toUpperCase() + name.slice(1);
      return {
        name,
        email: '',
        website: targetUrl,
        service: service || '',
        location: 'warning'
      };
    } catch(e) {
      return {
        name: 'Business Lead',
        email: '',
        website: targetUrl,
        service: service || '',
        location: 'warning'
      };
    }
  }
}

app.post('/api/search', async (req, res) => {
  console.log("Search endpoint hit");
  let { service, location } = req.body;
  if (!service || !location) return res.status(400).json({ error: 'Service and Location required' });

  location = location.trim();
  location = location.charAt(0).toUpperCase() + location.slice(1);
  
  const SEARCH_PROVIDER = process.env.SEARCH_PROVIDER || 'bing';
  const cleanLoc = location.trim();
  
  const queries = [
    `${service.trim()} in ${cleanLoc}${cleanLoc.toLowerCase().endsWith('uk') ? '' : ' UK'} website`,
    `best ${service.trim()} ${cleanLoc} website`,
    `local ${service.trim()} ${cleanLoc} website`,
    `${service.trim()} services ${cleanLoc}`,
    `find a ${service.trim()} ${cleanLoc}`
  ];
  
  const junkPatterns = [
    '.pdf', '.doc', '.docx', '.jpg', '.png', '.gif', '/oshanswers/', '/topics/', '/resources/', 'wikipedia.org',
    'yelp.', 'yell.', 'checkatrade.', 'tripadvisor.', 'facebook.', 'instagram.com', 'linkedin.com', 'yellowpages.', 
    'trustpilot.', 'houzz.', 'mybuilder.', 'gumtree.', 'craigslist.', 'angi.', 'thumbtack.', 'expertise.', 'bark.', 'ccohs.ca',
    '.gov'
  ];

  const fetchRawUrls = async (query, queryIndex) => {
    const raw = [];
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
      console.warn("Failed to capture Bing cookies:", e.message);
    }

    try {
      const uniqueDomainsThisQuery = new Set();
      const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&first=1&cc=GB&mkt=en-GB&setlang=en-GB`;
      
      const { data, headers: resHeaders } = await axios.get(searchUrl, {
        headers: {
          ...headers,
          'Cookie': cookieHeader
        }
      });
      
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
      let urlsFoundThisPage = 0;
      let newDomainsThisPage = 0;

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
           raw.push(targetUrl);
           urlsFoundThisPage++;
           
           try {
             const domain = new URL(targetUrl).hostname.replace(/^www\./, '');
             if (!uniqueDomainsThisQuery.has(domain)) {
               uniqueDomainsThisQuery.add(domain);
               newDomainsThisPage++;
             }
           } catch(e) {}
        }
      });

      console.log(`[QUERY ${queryIndex + 1}] ${query} | URLs Found: ${urlsFoundThisPage} | New Unique Domains: ${newDomainsThisPage}`);
    } catch (e) {
      console.error("Search fetch error:", e.message);
    }
    return raw;
  };

  const fetchDataForSeoRawUrls = async (serviceStr, locationStr) => {
    const raw = [];
    const login = process.env.DATAFORSEO_LOGIN;
    const password = process.env.DATAFORSEO_PASSWORD;
    if (!login || !password) {
      console.warn("DATAFORSEO_LOGIN or DATAFORSEO_PASSWORD not set in environment variables. Falling back to empty results.");
      return [];
    }

    const auth = Buffer.from(`${login}:${password}`).toString('base64');
    const keyword = `${serviceStr.trim()} in ${locationStr.trim()} UK website`;
    
    console.log(`[DataForSEO] Querying Google Organic for: "${keyword}"`);
    
    try {
      const response = await axios.post('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', [
        {
          keyword: keyword,
          location_code: 2826,
          language_code: "en",
          depth: 100
        }
      ], {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        },
        timeout: 35000
      });

      const task = response.data?.tasks?.[0];
      if (task?.status_code !== 20000) {
        console.error(`DataForSEO task failed: ${task?.status_message}`);
        return [];
      }

      const items = task?.result?.[0]?.items || [];
      console.log(`[DataForSEO] Raw items returned: ${items.length}`);
      
      const uniqueDomainsThisQuery = new Set();
      let urlsFound = 0;
      let newDomains = 0;

      for (const item of items) {
        let targetUrl = '';
        if (item.type === 'organic' && item.url) {
          targetUrl = item.url;
        } else if (item.type === 'local_pack' && Array.isArray(item.items)) {
          for (const subItem of item.items) {
            if (subItem.url) {
              raw.push(subItem.url);
              urlsFound++;
              try {
                const domain = new URL(subItem.url).hostname.replace(/^www\./, '');
                if (!uniqueDomainsThisQuery.has(domain)) {
                  uniqueDomainsThisQuery.add(domain);
                  newDomains++;
                }
              } catch(e) {}
            }
          }
        } else if (item.type === 'local_pack' && item.url) {
          targetUrl = item.url;
        }

        if (targetUrl) {
          raw.push(targetUrl);
          urlsFound++;
          try {
            const domain = new URL(targetUrl).hostname.replace(/^www\./, '');
            if (!uniqueDomainsThisQuery.has(domain)) {
              uniqueDomainsThisQuery.add(domain);
              newDomains++;
            }
          } catch(e) {}
        }
      }
      
      console.log(`[DataForSEO] Collected: ${urlsFound} URLs | Unique Domains: ${newDomains}`);
    } catch(e) {
      console.error("DataForSEO API error:", e.response?.data || e.message);
    }
    
    return raw;
  };

  const processUrls = (rawUrls, allowDeep, allowOrg, seenDomains, serviceStr, locationStr, dbExcludedDomains = [], statsObj = { directoriesRemoved: 0, excludedDomainsRemoved: 0 }) => {
    const validUrls = [];
    const blocklistDomains = [
      'youtube.com', 'facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com', 'pinterest.com',
      'wikipedia.org', 'google.com', 'google.co.uk', 'microsoft.com', 'bbc.co.uk', 'bbc.com',
      'sky.com', 'zhihu.com', 'eleconomista.com.mx', 'eleconomista.es', 'translate.google.com',
      'yell.com', 'yelp.com', 'yelp.co.uk', 'threebestrated.co.uk', 'threebestrated.com', 
      'whatclinic.com', 'dentists.com', 'mydentist.co.uk', 'alldentists.co.uk', 'directory.co.uk',
      'nhs.uk', 'booking.com', 'tripadvisor.co.uk', 'tripadvisor.com'
    ];
    const nonBusinessPaths = ['/article', '/news', '/category', '/blog', '.pdf', '/dentists/', '/directory/', '/list/'];

    for (const href of rawUrls) {
      const lowerHref = href.toLowerCase();
      
      if (junkPatterns.some(p => lowerHref.includes(p))) {
        console.log(`Rejected:\n${href}\nStage: dedupe/pre-filter\nReason: Matches junk pattern\n`);
        statsObj.directoriesRemoved++;
        continue;
      }
      if (nonBusinessPaths.some(p => lowerHref.includes(p))) {
        console.log(`Rejected:\n${href}\nStage: dedupe/pre-filter\nReason: Non-business path\n`);
        continue;
      }
      if (!allowOrg && (lowerHref.includes('.org/') || lowerHref.endsWith('.org'))) {
        console.log(`Rejected:\n${href}\nStage: dedupe/pre-filter\nReason: .org domain\n`);
        continue;
      }
      
      let urlObj;
      try { urlObj = new URL(href); } catch(e) {
        console.log(`Rejected:\n${href}\nStage: dedupe/pre-filter\nReason: Invalid URL parsing\n`);
        continue;
      }
      
      const domain = urlObj.hostname.replace(/^www\./, '');
      
      const isStaticBlocklisted = blocklistDomains.some(d => domain === d || domain.endsWith('.' + d));
      const isUserBlocklisted = dbExcludedDomains.some(d => domain === d || domain.endsWith('.' + d));
      if (isStaticBlocklisted) {
        console.log(`Rejected:\n${href}\nStage: dedupe/pre-filter\nReason: Blocklisted directory/platform domain (${domain})\n`);
        statsObj.directoriesRemoved++;
        continue;
      }
      if (isUserBlocklisted) {
        console.log(`Rejected:\n${href}\nStage: dedupe/pre-filter\nReason: Blocklisted directory/platform domain (${domain})\n`);
        statsObj.excludedDomainsRemoved++;
        continue;
      }

      const allowedTlds = ['.uk', '.com', '.net', '.org', '.biz', '.info', '.co', '.io'];
      const hasAllowedTld = allowedTlds.some(tld => domain.toLowerCase().endsWith(tld));
      if (!hasAllowedTld) {
        console.log(`Rejected:\n${href}\nStage: dedupe/pre-filter\nReason: Disallowed TLD\n`);
        continue;
      }

      const pathSegments = urlObj.pathname.split('/').filter(p => p.length > 0);
      if (!allowDeep && pathSegments.length > 2) {
        console.log(`Rejected:\n${href}\nStage: dedupe/pre-filter\nReason: Deep path\n`);
        continue;
      }

      if (!seenDomains.has(domain)) {
        seenDomains.add(domain);
        validUrls.push(href);
      } else {
        console.log(`Rejected:\n${href}\nStage: dedupe/pre-filter\nReason: Duplicate domain\n`);
      }
    }

    validUrls.sort((a, b) => {
      let scoreA = 0; let scoreB = 0;
      if (a.includes('.co.uk')) scoreA += 10;
      if (b.includes('.co.uk')) scoreB += 10;
      
      if (serviceStr) {
         const svc = serviceStr.toLowerCase().trim();
         if (svc && a.toLowerCase().includes(svc)) scoreA += 5;
         if (svc && b.toLowerCase().includes(svc)) scoreB += 5;
      }
      
      if (locationStr) {
         const loc = locationStr.toLowerCase().replace(' uk', '').trim();
         if (loc && a.toLowerCase().includes(loc)) scoreA += 5;
         if (loc && b.toLowerCase().includes(loc)) scoreB += 5;
      }
      
      try {
        const pathLenA = new URL(a).pathname.split('/').filter(p => p.length > 0).length;
        const pathLenB = new URL(b).pathname.split('/').filter(p => p.length > 0).length;
        scoreA -= pathLenA * 2;
        scoreB -= pathLenB * 2;
      } catch(e) {}
      
      return scoreB - scoreA;
    });

    return validUrls;
  };

  // Create search name and initial database record
  const searchName = `${service.trim()} - ${location.trim()}`;
  let searchId;
  try {
    const result = await db.run(`
      INSERT INTO searches (
        name, service, location, status, provider,
        leads_count, raw_count, unique_count, qualified_count,
        directories_removed, suppliers_removed, excluded_domains_removed,
        notes, metadata
      ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, '', '{}')
    `, [
      searchName, service.trim(), location.trim(), 'Searching',
      SEARCH_PROVIDER === 'dataforseo' ? 'Google (DataForSEO)' : 'Bing'
    ]);
    searchId = result.lastID;
  } catch (err) {
    console.error("Failed to insert initial search record:", err.message);
    return res.status(500).json({ error: 'Failed to initialize search record' });
  }

  // Respond immediately to start polling
  res.json({ id: searchId, name: searchName, status: 'Searching' });

  // Execute background pipeline asynchronously
  (async () => {
    try {
      const globalSeenDomains = new Set();
      const allRawUrls = [];
      const statsObj = { directoriesRemoved: 0, excludedDomainsRemoved: 0 };
      let suppliersRemoved = 0;
      
      let dbExcludedDomains = [];
      let dbExcludedTypes = [];
      if (db) {
        try {
          dbExcludedDomains = (await db.all("SELECT domain FROM excluded_domains")).map(r => r.domain.toLowerCase());
          dbExcludedTypes = (await db.all("SELECT name FROM excluded_business_types")).map(r => r.name.toLowerCase());
        } catch (dbErr) {
          console.error("Failed to fetch exclusions from database:", dbErr.message);
        }
      }

      if (SEARCH_PROVIDER === 'dataforseo') {
        const rawUrls = await fetchDataForSeoRawUrls(service, location);
        allRawUrls.push(...rawUrls);
      } else {
        for (let queryIndex = 0; queryIndex < queries.length; queryIndex++) {
           const rawUrls = await fetchRawUrls(queries[queryIndex], queryIndex);
           allRawUrls.push(...rawUrls);
        }
      }

      let processed = processUrls(allRawUrls, true, false, globalSeenDomains, service, location, dbExcludedDomains, statsObj);
      
      // Update intermediate counts in searches table
      await db.run(`
        UPDATE searches SET 
          raw_count = ?,
          unique_count = ?,
          directories_removed = ?,
          excluded_domains_removed = ?
        WHERE id = ?
      `, [allRawUrls.length, processed.length, statsObj.directoriesRemoved, statsObj.excludedDomainsRemoved, searchId]);

      // Verify business signals, scrape subpages, extract email
      const urlsToVerify = processed.slice(0, 50);
      let qualifiedCount = 0;

      for (const url of urlsToVerify) {
        const lead = await verifyAndExtractLead(url, service, location, dbExcludedTypes);
        if (lead) {
          if (lead.isSupplier) {
            suppliersRemoved++;
            await db.run("UPDATE searches SET suppliers_removed = ? WHERE id = ?", [suppliersRemoved, searchId]);
          } else {
            // Write lead to DB
            await db.run(`
              INSERT INTO leads (search_id, name, email, website, service, location)
              VALUES (?, ?, ?, ?, ?, ?)
            `, [searchId, lead.name, lead.email, lead.website, lead.service, lead.location]);

            qualifiedCount++;
            await db.run(`
              UPDATE searches SET 
                qualified_count = ?,
                leads_count = ?
              WHERE id = ?
            `, [qualifiedCount, qualifiedCount, searchId]);
          }
        }
      }

      // Mark status Completed
      await db.run("UPDATE searches SET status = 'Completed' WHERE id = ?", [searchId]);
      console.log(`[BACKGROUND SEARCH] Search ID ${searchId} Completed successfully.`);

    } catch (bgErr) {
      console.error(`Background search error for ID ${searchId}:`, bgErr.message);
      try {
        await db.run("UPDATE searches SET status = 'Completed' WHERE id = ?", [searchId]);
      } catch (dbErr) {
        console.error("Failed to set Completed status after error:", dbErr.message);
      }
    }
  })();
});

app.delete('/api/searches/:id', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not initialized' });
  const { id } = req.params;
  try {
    await db.run("DELETE FROM leads WHERE search_id = ?", id);
    await db.run("DELETE FROM searches WHERE id = ?", id);
    res.json({ success: true, message: "Search deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function isValidEmail(m) {
  const email = m.toLowerCase();
  return !email.endsWith('.png') && 
         !email.endsWith('.jpg') && 
         !email.endsWith('.jpeg') && 
         !email.endsWith('.gif') && 
         !email.endsWith('.webp') && 
         !email.endsWith('.js') && 
         !email.endsWith('.css') && 
         !email.includes('sentry') && 
         !email.includes('example.com') && 
         !email.includes('domain.com') && 
         !email.includes('@w3.org') &&
         email.length > 5;
}

async function extractEmailFromHtml(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Referer': 'https://www.google.com/',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    
    const $ = cheerio.load(data);
    let email = '';

    // 1. Look for mailto links first
    $('a[href^="mailto:"]').each((i, el) => {
      if (!email) {
        const href = $(el).attr('href');
        let potentialEmail = href.replace('mailto:', '').split('?')[0].trim();
        if (isValidEmail(potentialEmail)) email = potentialEmail;
      }
    });

    // 2. If no mailto, try regex on full visible text including header/footer/nav
    if (!email) {
      const text = $('body').text();
      const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]{2,})/gi;
      const matches = text.match(emailRegex);
      if (matches && matches.length > 0) {
        const validMatch = matches.find(m => isValidEmail(m));
        if (validMatch) email = validMatch;
      }
    }
    
    return { email, $, data };
  } catch (e) {
    return { email: null, $: null, data: null };
  }
}

app.post('/api/extract', async (req, res) => {
  const { url, queryLocation } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  let targetUrl = url.trim();
  if (!targetUrl.startsWith('http')) {
    targetUrl = 'https://' + targetUrl;
  }

  try {
    let { email, $, data } = await extractEmailFromHtml(targetUrl);
    
    let isWarning = false;
    if (!$) {
      isWarning = true;
    }

    let businessName = '';
    if ($) {
      // Process homepage metadata
      businessName = $('title').text().trim();
      if (!businessName) businessName = $('h1').first().text().trim();
      if (businessName.includes('|')) businessName = businessName.split('|')[0].trim();
      else if (businessName.includes('-')) businessName = businessName.split('-')[0].trim();

      // Clean name: remove generic phrases and duplicate consecutive words
      businessName = businessName.replace(/plumbers? in .+/gi, '').trim();
      businessName = businessName.replace(/plumbing services? .+/gi, '').trim();
      businessName = businessName.split(' ').filter((item, pos, arr) => {
          return item && (pos === 0 || item.toLowerCase() !== arr[pos - 1].toLowerCase());
      }).join(' ').trim();
    }

    if (!businessName || businessName.toLowerCase() === 'unknown') {
      try {
        const urlObj = new URL(targetUrl);
        let hostname = urlObj.hostname.replace(/^www\./i, '');
        hostname = hostname.replace(/\.(co\.uk|com|org|net|uk|biz|info|ca)$/i, '');
        let name = hostname.replace(/-/g, ' ');

        const commonWords = ['plumbing', 'plumbers', 'plumber', 'heating', 'services', 'service', 'electrical', 'electrician', 'boiler', 'repairs', 'repair', 'ltd'];
        for (const w of commonWords) {
          const regex = new RegExp(`(${w})`, 'gi');
          name = name.replace(regex, ' $1 ');
        }
        
        name = name.toLowerCase();
        name = name.replace('inreading', ' in reading ');
        name = name.replace('inlondon', ' in london ');
        name = name.replace('inmanchester', ' in manchester ');
        
        name = name.replace(/\s+/g, ' ').trim();
        
        businessName = name.split(' ').filter(Boolean).join(' ').trim();
      } catch(e) {
        businessName = 'Business Lead';
      }
    }
    
    // Final acronym and capitalisation pass
    if (businessName && businessName !== 'Business Lead') {
      businessName = businessName.split(' ').filter(Boolean).map(w => {
         let lower = w.toLowerCase();
         if (lower === 'ltd') return 'Ltd';
         if (['in', 'and', 'the', 'of'].includes(lower)) return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
         if (w.length >= 2 && w.length <= 3 && !['sam', 'bob', 'tom', 'dan', 'jim', 'joe', 'mac', 'ray', 'roy', 'leo'].includes(lower)) return w.toUpperCase();
         return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      }).join(' ').trim();
    }

    const h1s = [];
    let metaDesc = '';
    
    if ($) {
      $('h1').each((i, el) => h1s.push($(el).text().trim()));
      metaDesc = $('meta[name="description"]').attr('content') || '';
    }

    const searchStringOriginal = businessName + ' ' + h1s.join(' ') + ' ' + metaDesc;
    const searchStringLower = searchStringOriginal.toLowerCase();
    
    const commonServices = [
      'plumber', 'plumbing', 'dentist', 'dental', 'roofer', 'roofing', 'electrician', 'electrical', 
      'builder', 'building', 'accountant', 'accounting', 'lawyer', 'legal', 'cleaner', 'cleaning', 
      'painter', 'painting', 'mechanic', 'auto repair', 'hvac', 'landscaper', 'landscaping', 
      'seo', 'marketing', 'chiropractor', 'real estate', 'architect'
    ];
    
    let service = '';
    for (const s of commonServices) {
      if (searchStringLower.includes(s)) {
        service = s;
        break;
      }
    }

    let location = '';
    const locationRegex = /\b(?:in|serving|based in|across)\s+([A-Z][a-zA-Z]+)\b/;
    const locMatch = searchStringOriginal.match(locationRegex);
    if (locMatch) {
      location = locMatch[1];
    }

    // 2. Check subpages if email not found
    if (!email && $) {
       const subpages = ['/contact', '/contact-us', '/about', '/about-us'];
       let pagesChecked = 0;
       const maxPages = 4;
       
       for (const sub of subpages) {
          if (pagesChecked >= maxPages) break;
          
          let subUrl;
          try {
            const base = new URL(targetUrl).origin;
            subUrl = base + sub;
          } catch(e) {
            continue;
          }
          
          pagesChecked++;
          const result = await extractEmailFromHtml(subUrl);
          if (result.email) {
             email = result.email;
             break;
          }
       }
    }

    const lead = {
      name: businessName || 'Business Lead',
      email: email || '',
      website: targetUrl,
      service: service || '',
      location: isWarning ? 'warning' : (location || '')
    };



    res.json(lead);

  } catch (error) {
    console.error(`Error extracting ${targetUrl}:`, error.message);
    res.status(500).json({ error: 'Failed to fetch or parse URL' });
  }
});

// Exclusions API Endpoints
app.get('/api/exclusions', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not initialized' });
  try {
    const domains = await db.all("SELECT id, domain FROM excluded_domains ORDER BY domain ASC");
    const types = await db.all("SELECT id, name FROM excluded_business_types ORDER BY name ASC");
    res.json({ domains, businessTypes: types });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/exclusions/domains', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not initialized' });
  let { domain } = req.body;
  if (!domain) return res.status(400).json({ error: 'Domain is required' });
  domain = domain.trim().toLowerCase().replace(/^www\./, '');
  try {
    const result = await db.run("INSERT INTO excluded_domains (domain) VALUES (?)", domain);
    res.json({ success: true, id: result.lastID });
  } catch(e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Domain already exists in exclusions list' });
    }
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/exclusions/domains/:id', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not initialized' });
  const { id } = req.params;
  try {
    await db.run("DELETE FROM excluded_domains WHERE id = ?", id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/exclusions/types', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not initialized' });
  let { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Business type name is required' });
  name = name.trim();
  try {
    const result = await db.run("INSERT INTO excluded_business_types (name) VALUES (?)", name);
    res.json({ success: true, id: result.lastID });
  } catch(e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Business type already exists in exclusions list' });
    }
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/exclusions/types/:id', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not initialized' });
  const { id } = req.params;
  try {
    await db.run("DELETE FROM excluded_business_types WHERE id = ?", id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/searches', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not initialized' });
  const { 
    service, location, provider, leadsCount, 
    rawCount, uniqueCount, qualifiedCount, 
    directoriesRemoved, suppliersRemoved, excludedDomainsRemoved,
    leads 
  } = req.body;

  try {
    const result = await db.run(`
      INSERT INTO searches (
        service, location, provider, leads_count,
        raw_count, unique_count, qualified_count,
        directories_removed, suppliers_removed, excluded_domains_removed,
        notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      service, location, provider, leadsCount,
      rawCount, uniqueCount, qualifiedCount,
      directoriesRemoved, suppliersRemoved, excludedDomainsRemoved,
      ''
    ]);

    const searchId = result.lastID;

    if (leads && leads.length > 0) {
      for (const lead of leads) {
        await db.run(`
          INSERT INTO leads (search_id, name, email, website, service, location)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          searchId, lead.name, lead.email, lead.website, lead.service, lead.location
        ]);
      }
    }

    res.json({ id: searchId, message: "Search saved successfully" });
  } catch (err) {
    console.error("Error saving search:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/searches', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not initialized' });
  try {
    const searches = await db.all("SELECT * FROM searches ORDER BY date_created DESC");
    res.json(searches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/searches/:id', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not initialized' });
  const { id } = req.params;
  try {
    const search = await db.get("SELECT * FROM searches WHERE id = ?", id);
    if (!search) {
      return res.status(404).json({ error: "Search not found" });
    }
    const leads = await db.all("SELECT * FROM leads WHERE search_id = ?", id);
    res.json({ ...search, leads });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/leads', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not initialized' });
  try {
    const leads = await db.all(`SELECT * FROM leads ORDER BY date_added DESC`);
    res.json({ leads });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

app.listen(port, (err) => {
  if (err) {
    console.error(`Failed to start server:`, err.message || err);
    process.exit(1);
  }
  console.log(`TSE Lead Finder server listening at http://localhost:${port}`);
});
