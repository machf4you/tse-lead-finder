const { search } = require('duck-duck-scrape');

(async () => {
  try {
    const results = await search('plumber Reading UK', {
      safeSearch: 'off'
    });
    console.log("DDG Scrape Results:", results.results.length);
    console.log(results.results.map(r => r.url));
  } catch(e) {
    console.log("Error:", e.message);
  }
})();
