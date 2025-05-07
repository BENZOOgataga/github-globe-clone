// backend/server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const geoip = require('geoip-lite');
const requestIp = require('request-ip');
const path = require('path');
const fs = require('fs');
const { Tail } = require('tail');

// Create Express app
const app = express();

// Serve static files from the parent directory's dist folder
app.use(express.static(path.join(__dirname, '../dist')));

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store recent connections
const recentConnections = [];
const MAX_STORED_CONNECTIONS = 100;

// Your server location (change to your actual server coordinates)
const SERVER_LOCATION = { 
  lat: 48.8566, // Paris
  lng: 2.3522   // Paris
};

// WebSocket connections handler
wss.on('connection', (ws) => {
  console.log('Client connected');
  
  // Send initial data
  ws.send(JSON.stringify({
    type: 'init',
    data: recentConnections
  }));
  
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Broadcast to all clients
function broadcast(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Middleware to log and track incoming requests
app.use((req, res, next) => {
  // Skip for WebSocket connections and static files
  if (req.path.includes('/socket.io') || req.path.includes('.[js|css|png|jpg|gif|svg|ico]$')) {
    return next();
  }
  
  const clientIp = requestIp.getClientIp(req);
  const geo = geoip.lookup(clientIp);
  
  if (geo) {
    const connectionData = {
      ip: clientIp,
      lat: geo.ll[0],
      lng: geo.ll[1],
      country: geo.country,
      city: geo.city,
      requestType: req.method,
      path: req.path,
      timestamp: Date.now()
    };
    
    // Add to recent connections
    recentConnections.unshift(connectionData);
    
    // Keep only recent connections
    if (recentConnections.length > MAX_STORED_CONNECTIONS) {
      recentConnections.pop();
    }
    
    // Broadcast new connection
    broadcast(connectionData);
    console.log(`New connection from ${clientIp} (${geo.country})`);
  }
  
  next();
});

// Setup log monitoring for Nginx/Apache if available
try {
  // Try common log file locations
  const logPaths = [
    '/var/log/nginx/access.log',
    '/var/log/apache2/access.log',
    '/var/log/httpd/access_log'
  ];
  
  for (const logPath of logPaths) {
    if (fs.existsSync(logPath)) {
      console.log(`Found log file at ${logPath}, setting up monitor`);
      
      const tail = new Tail(logPath);
      
      // This regex pattern may need adjustment based on your actual log format
      const pattern = /^(\S+) .+ \[([^\]]+)\] "(\S+) (\S+) HTTP\/[\d.]+" (\d+) (\d+)/;
      
      tail.on("line", (line) => {
        const match = line.match(pattern);
        
        if (match) {
          const ip = match[1];
          // Skip localhost
          if (ip === '127.0.0.1' || ip === '::1') return;
          
          const geo = geoip.lookup(ip);
          if (!geo) return; // Skip if we can't geolocate
          
          const connectionData = {
            ip: ip,
            lat: geo.ll[0],
            lng: geo.ll[1],
            country: geo.country,
            city: geo.city,
            requestType: match[3],
            path: match[4],
            statusCode: parseInt(match[5]),
            responseSize: parseInt(match[6]),
            timestamp: Date.now()
          };
          
          // Add to recent connections
          recentConnections.unshift(connectionData);
          
          // Keep only recent connections
          if (recentConnections.length > MAX_STORED_CONNECTIONS) {
            recentConnections.pop();
          }
          
          // Broadcast new connection
          broadcast(connectionData);
          console.log(`Log entry: ${ip} (${geo.country}) - ${match[3]} ${match[4]}`);
        }
      });
      
      tail.on("error", (error) => {
        console.error(`Error tailing log file: ${error}`);
      });
      
      break;
    }
  }
} catch (err) {
  console.error(`Error setting up log monitoring: ${err}`);
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});