const axios = require('axios');
async function run() {
  try {
    const res = await axios.post('http://localhost:3002/api/search', {
      service: 'dentist',
      location: 'Bristol'
    });
    console.log("Found:", res.data.urls.length);
  } catch (e) {
    console.error(e.message);
  }
}
run();
