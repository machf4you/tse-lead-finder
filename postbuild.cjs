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
      if (fs.existsSync(toPath)) {
        fs.rmSync(toPath, { recursive: true, force: true });
      }
      copyFolderSync(fromPath, toPath);
    } else {
      fs.copyFileSync(fromPath, toPath);
    }
  });
}

try {
  const parentDir = path.basename(path.join(__dirname, '..'));
  if (parentDir === 'releases') {
    console.log("Copying dist contents to live dist directory...");
    copyFolderSync(srcDist, targetDist);
    console.log("dist contents copied successfully!");

    console.log("Copying server/server.js to grandparent directory...");
    const targetServerDir = path.dirname(targetServerJs);
    if (!fs.existsSync(targetServerDir)) {
      fs.mkdirSync(targetServerDir, { recursive: true });
    }
    if (fs.existsSync(srcServerJs)) {
      fs.copyFileSync(srcServerJs, targetServerJs);
      console.log("server/server.js copied successfully!");
    }

    console.log("Copying version.json to grandparent directory...");
    const srcVersion = path.join(__dirname, 'version.json');
    const targetVersion = path.join(__dirname, '..', '..', 'version.json');
    if (fs.existsSync(srcVersion)) {
      fs.copyFileSync(srcVersion, targetVersion);
      console.log("version.json copied successfully!");
    }
  } else {
    console.log("Not in releases folder, skipping copy.");
  }
} catch (e) {
  console.error("Failed to copy built files:", e.message);
}
