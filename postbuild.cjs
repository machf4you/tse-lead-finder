const fs = require('fs');
const path = require('path');

const targetDist = path.join(__dirname, '..', '..', 'dist');
const srcDist = path.join(__dirname, 'dist');

const targetServerJs = path.join(__dirname, '..', '..', 'server', 'server.js');
const srcServerJs = path.join(__dirname, 'server', 'server.js');

function copyFolderSync(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from).forEach(element => {
    const fromPath = path.join(from, element);
    const toPath = path.join(to, element);
    if (fs.lstatSync(fromPath).isDirectory()) {
      copyFolderSync(fromPath, toPath);
    } else {
      fs.copyFileSync(fromPath, toPath);
    }
  });
}

try {
  const parentDir = path.basename(path.join(__dirname, '..'));
  if (parentDir === 'releases') {
    console.log("Copying dist folder to grandparent directory...");
    if (fs.existsSync(targetDist)) {
      fs.rmSync(targetDist, { recursive: true, force: true });
    }
    copyFolderSync(srcDist, targetDist);
    console.log("dist folder copied successfully!");

    console.log("Copying server/server.js to grandparent directory...");
    const targetServerDir = path.dirname(targetServerJs);
    if (!fs.existsSync(targetServerDir)) {
      fs.mkdirSync(targetServerDir, { recursive: true });
    }
    if (fs.existsSync(srcServerJs)) {
      fs.copyFileSync(srcServerJs, targetServerJs);
      console.log("server/server.js copied successfully!");
    }
  } else {
    console.log("Not in releases folder, skipping copy.");
  }
} catch (e) {
  console.error("Failed to copy built files:", e.message);
}
