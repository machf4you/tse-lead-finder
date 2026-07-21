const fs = require('fs');

const checkEnv = (p) => {
  try {
    if (!fs.existsSync(p)) {
      console.log(p + ' does not exist');
      return;
    }
    const content = fs.readFileSync(p, 'utf8');
    const lines = content.split('\n');
    console.log(p + ' keys:', lines.map(l => l.split('=')[0].trim()).filter(Boolean));
    const pLine = lines.find(l => l.trim().startsWith('SEARCH_PROVIDER='));
    if (pLine) {
      console.log(p + ' SEARCH_PROVIDER:', pLine.split('=')[1].trim());
    } else {
      console.log(p + ' SEARCH_PROVIDER: NOT SET (defaults to bing)');
    }
  } catch(e) {
    console.log(p + ' error:', e.message);
  }
};

checkEnv('../../.env');
checkEnv('../../current/server/.env');
checkEnv('server/.env');
