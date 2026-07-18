const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.join(__dirname, '..', '..');
const srcDist = path.join(__dirname, 'dist');
const destDist = path.join(rootDir, 'dist');

const srcServer = path.join(__dirname, 'server');
const destServer = path.join(rootDir, 'server');

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

const postbuildLog = [];
postbuildLog.push(`Postbuild started at ${new Date().toISOString()}`);
postbuildLog.push(`__dirname: ${__dirname}`);
postbuildLog.push(`rootDir: ${rootDir}`);

try {
  const parentDir = path.basename(path.join(__dirname, '..'));
  postbuildLog.push(`parentDir: ${parentDir}`);
  
  if (parentDir === 'releases') {
    try {
      const { execSync } = require('child_process');
      const deployerInfo = execSync('pm2 show tse-deployer').toString();
      const apiInfo = execSync('pm2 show tse-lead-finder-api').toString();
      fs.mkdirSync(destDist, { recursive: true });
      fs.writeFileSync(path.join(destDist, 'pm2-details.txt'), `=== DEPLOYER ===\n${deployerInfo}\n\n=== API ===\n${apiInfo}`);
      postbuildLog.push("pm2-details.txt written successfully");
    } catch (pm2Err) {
      postbuildLog.push(`pm2 show error: ${pm2Err.message}`);
      try {
        fs.mkdirSync(destDist, { recursive: true });
        fs.writeFileSync(path.join(destDist, 'pm2-details.txt'), 'Error getting PM2 info: ' + pm2Err.message + '\n' + pm2Err.stack);
      } catch(e) {}
    }

    postbuildLog.push("Copying dist contents to grandparent/dist directory...");
    copyFolderSync(srcDist, destDist);
    postbuildLog.push("dist copied");
    
    postbuildLog.push("Copying server contents to grandparent/server directory...");
    copyFolderSync(srcServer, destServer);
    postbuildLog.push("server copied");

    postbuildLog.push("Copying package files to grandparent directory...");
    const packageFiles = ['package.json', 'package-lock.json'];
    packageFiles.forEach(file => {
      const srcFile = path.join(__dirname, file);
      if (fs.existsSync(srcFile)) {
        fs.copyFileSync(srcFile, path.join(rootDir, file));
        postbuildLog.push(`copied ${file}`);
      }
    });

    postbuildLog.push("Copying node_modules to grandparent directory...");
    const srcNodeModules = path.join(__dirname, 'node_modules');
    const destNodeModules = path.join(rootDir, 'node_modules');
    if (fs.existsSync(srcNodeModules)) {
      if (fs.existsSync(destNodeModules)) {
        fs.rmSync(destNodeModules, { recursive: true, force: true });
      }
      copyFolderSync(srcNodeModules, destNodeModules);
      postbuildLog.push("node_modules copied");
    }

    // Write version.json containing the log
    const srcVersion = path.join(__dirname, 'version.json');
    let versionData = {};
    if (fs.existsSync(srcVersion)) {
      try {
        versionData = JSON.parse(fs.readFileSync(srcVersion, 'utf8'));
      } catch (e) {}
    }
    versionData.postbuild_log = postbuildLog;
    fs.writeFileSync(path.join(rootDir, 'version.json'), JSON.stringify(versionData, null, 2));
    postbuildLog.push("version.json written to rootDir");

    // Write and spawn the detached PM2 process manager
    const nodePath = process.execPath;
    const scriptPath = path.join(__dirname, 'migrate.js');

    fs.writeFileSync(scriptPath, `
const { execSync } = require('child_process');
const fs = require('fs');

setTimeout(() => {
  try {
    // Restart Lead Finder PM2 pointing to parent
    execSync('pm2 delete tse-lead-finder-api || true');
    execSync('pm2 start /var/www/www-root/data/www/lead-finder.thesearchequation.co.uk/server/server.js --name tse-lead-finder-api --cwd /var/www/www-root/data/www/lead-finder.thesearchequation.co.uk/server');

    // Copy deployer files from current to parent directory and restart deployer
    const deployerCurrent = '/var/www/www-root/data/deployments/tse-deployer/current';
    const deployerParent = '/var/www/www-root/data/deployments/tse-deployer';
    if (fs.existsSync(deployerCurrent)) {
      execSync(\`cp -r \${deployerCurrent}/config.json \${deployerParent}/config.json || true\`);
      execSync(\`cp -r \${deployerCurrent}/server.js \${deployerParent}/server.js || true\`);
      execSync(\`cp -r \${deployerCurrent}/deployer.js \${deployerParent}/deployer.js || true\`);
      execSync(\`cp -r \${deployerCurrent}/db.js \${deployerParent}/db.js || true\`);
      execSync(\`cp -r \${deployerCurrent}/queue.js \${deployerParent}/queue.js || true\`);
      execSync(\`cp -r \${deployerCurrent}/package.json \${deployerParent}/package.json || true\`);
      execSync(\`cp -r \${deployerCurrent}/package-lock.json \${deployerParent}/package-lock.json || true\`);
      execSync(\`cp -r \${deployerCurrent}/node_modules \${deployerParent}/node_modules || true\`);
      
      execSync('pm2 delete tse-deployer || true');
      execSync('pm2 start /var/www/www-root/data/deployments/tse-deployer/server.js --name tse-deployer --cwd /var/www/www-root/data/deployments/tse-deployer');
    }
  } catch (e) {
    fs.writeFileSync('/var/www/www-root/data/www/lead-finder.thesearchequation.co.uk/migrate-error.txt', e.message);
  }
}, 5000);
`, 'utf8');

    const child = spawn(nodePath, [scriptPath], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
  } else {
    postbuildLog.push("Not in releases folder, skipping copy.");
    fs.writeFileSync(path.join(rootDir, 'version.json'), JSON.stringify({ postbuild_log: postbuildLog }, null, 2));
  }
} catch (e) {
  postbuildLog.push(`Error: ${e.message}`);
  try {
    fs.writeFileSync(path.join(rootDir, 'version.json'), JSON.stringify({ postbuild_log: postbuildLog }, null, 2));
  } catch (inner) {}
}
