const axios = require('axios');
const cheerio = require('cheerio');

async function testUrl(url) {
  try {
    const { data } = await axios.get(url, { timeout: 4000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(data);
    const text = $('body').text().toLowerCase();
    const title = $('title').text().toLowerCase();
    const urlLower = url.toLowerCase();
    
    const serviceLower = 'dentist';
    const locLower = 'bristol';
    
    const signals = ['contact', 'about', 'call', 'book', 'clinic', 'practice'];
    const hasService = serviceLower && text.includes(serviceLower);
    const hasSignal = signals.some(s => text.includes(s));
    
    if (!hasSignal) {
      console.log(`Rejected:\n${url}\nStage: verification\nReason: missing business action signals (contact/about/etc)\n`);
      return; 
    }
    
    if (locLower) {
      const locInUrl = urlLower.includes(locLower);
      const locInTitle = title.includes(locLower);
      
      if (!locInUrl && !locInTitle) {
        console.log(`Rejected:\n${url}\nStage: verification\nReason: location missing from both URL and Title\n`);
        return;
      }

      const forbiddenRegions = [
        'dublin', 'ireland', 'scotland', 'wales', 'belfast', 
        'edinburgh', 'glasgow', 'cardiff', 'australia', 
        'usa', 'america', 'canada', 'new zealand'
      ];
      const activeForbidden = forbiddenRegions.filter(f => f !== locLower);
      
      if (activeForbidden.some(f => urlLower.includes(f) || title.includes(f))) {
        console.log(`Rejected:\n${url}\nStage: verification\nReason: Contains forbidden region in URL or Title\n`);
        return;
      }

      if (!text.includes(locLower)) {
        console.log(`Rejected:\n${url}\nStage: verification\nReason: Body text missing location (${locLower})\n`);
        return;
      }
    }
    console.log(`Passed: ${url}`);
  } catch (e) {
    console.log(`Rejected:\n${url}\nStage: homepage scraping\nReason: HTTP Request failed or timed out: ${e.message}\n`);
  }
}

async function run() {
  await testUrl('https://thebristoldentalpractice.co.uk/');
  await testUrl('https://thesmilesuite.co.uk/');
  await testUrl('https://thedentalsurgery.co.uk/'); // Actually I don't know the exact domain, let's assume it's this
  await testUrl('https://beaumondedental.co.uk/');
}

run();
