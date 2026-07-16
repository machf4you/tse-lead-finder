const googleIt = require('google-it');

(async () => {
  try {
    const results = await googleIt({ query: 'plumber in Reading UK', limit: 20 });
    console.log("Results:");
    results.forEach(r => console.log(r.title, r.link, r.snippet));
  } catch(e) {
    console.log("Error:", e);
  }
})();
