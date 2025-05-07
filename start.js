const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Check if dist folder exists, if not, build it
if (!fs.existsSync(path.join(__dirname, 'dist'))) {
  console.log('Building frontend assets...');
  require('child_process').execSync('npm run build', { stdio: 'inherit' });
}

// Start the backend server
console.log('Starting backend server...');
const server = spawn('node', [path.join(__dirname, 'backend', 'server.js')], {
  stdio: 'inherit'
});

console.log(`Server started with PID: ${server.pid}`);

// Handle server termination
process.on('SIGINT', () => {
  console.log('Stopping server...');
  server.kill('SIGINT');
  process.exit(0);
});