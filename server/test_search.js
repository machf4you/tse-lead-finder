const axios = require('axios');
(async () => {
  try {
    const res = await axios.post('http://localhost:3002/api/search', {
      service: 'plumber',
      location: 'reading'
    });
    console.log("Success!", res.data.urls.length);
  } catch (e) {
    console.log("Failed", e.response ? e.response.data : e.message);
  }
})();
