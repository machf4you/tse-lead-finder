const { search, SafeSearchType } = require('duck-duck-scrape');

(async () => {
  try {
    const results = await search('plumber Reading UK', {
      safeSearch: SafeSearchType.OFF
    });
    console.log("DDG Scrape Results:", results.results.length);
    console.log(results.results.map(r => r.url));
  } catch(e) {
    console.log("Error:", e.message);
  }
})();
