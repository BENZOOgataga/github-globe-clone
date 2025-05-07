import ThreeGlobe from "three-globe";
import countries from "../assets/globe-min.json";
import { hexToRgb } from "../systems/utils";
import { Color } from "three";
import { Raycaster, Vector2 } from 'three';
import { PerspectiveCamera } from 'three';

// Configuration constants
const ARC_REL_LEN = 0.9;
const FLIGHT_TIME = 2000;
const NUM_RINGS = 1;
const RINGS_MAX_R = 3;
const RING_PROPAGATION_SPEED = 3;
const MAX_CONNECTIONS_DISPLAYED = 100; // Prevent performance issues

class Globe {
  constructor() {
    this.instance = new ThreeGlobe({
      waitForGlobeReady: true,
      animateIn: true,
    });
    
    this.pointsData = [];
    this.arcsData = [];
    this.connectionQueue = []; // Queue for incoming connections
    this.connectionCount = 0;
    
    this._buildMaterial();
    
    this.camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.z = 5;
    this.camera.lookAt(this.instance.position);

    this.raycaster = new Raycaster();
    this.mouse = new Vector2();

    this.instance.tick = (delta) => this.tick(delta);
    window.addEventListener('click', (event) => this._onMouseClick(event), false);
    
    // Server location - replace with your actual server coordinates
    this.serverLocation = { 
      lat: 48.8566, // Paris latitude
      lng: 2.3522,  // Paris longitude
      label: "Main Server" 
    };
  }

  // Update the init method to signal when the globe is ready
  async init() {
    // Start loading countries
    this.initCountries(1000);
    
    // Show initial loading message
    this.updateLoadingText('Initializing globe...');
    
    try {
      // Initialize WebSocket connection
      this.initWebSocket();
      this.updateLoadingText('Connecting to server...');
      
      // Add server visualization
      this.visualizeServer();
      
      // Initialize visualization properties
      this.initVisualization();
      
      // Wait a bit to ensure everything is set up
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Hide loading overlay when globe is fully initialized
      this.hideLoading();
    } catch (error) {
      console.error('Error initializing globe:', error);
      this.updateLoadingText('Failed to initialize globe. Please refresh.');
    }
  }

  // Add methods to update and hide the loading overlay
  updateLoadingText(text) {
    const loadingText = document.querySelector('.loading-text');
    if (loadingText) {
      loadingText.textContent = text;
    }
  }

  hideLoading() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
      loadingOverlay.classList.add('hide-loader');
      
      // Remove from DOM after animation completes
      setTimeout(() => {
        loadingOverlay.remove();
      }, 500);
    }
  }

  // Update the initWebSocket method to handle connection states
  initWebSocket() {
    // Determine WebSocket URL based on current location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    this.socket = new WebSocket(`${protocol}//${host}`);
    
    this.socket.onopen = () => {
      console.log('WebSocket connection established');
      this.updateLoadingText('Connected! Loading data...');
    };
    
    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'init') {
          // Handle initial data batch
          if (Array.isArray(data.data)) {
            this.updateLoadingText(`Loading ${data.data.length} connections...`);
            data.data.forEach(connection => this.addNewConnection(connection));
          }
        } else {
          // Handle single connection
          this.addNewConnection(data);
        }
      } catch (err) {
        console.error('Error processing WebSocket message:', err);
      }
    };
    
    this.socket.onclose = () => {
      console.log('WebSocket connection closed');
      this.updateLoadingText('Connection lost. Reconnecting...');
      
      // Attempt to reconnect after a delay
      setTimeout(() => this.initWebSocket(), 5000);
    };
    
    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.updateLoadingText('Connection error. Please refresh.');
    };
  }
  
  addNewConnection(connection) {
    // Determine color based on request type
    let color;
    
    if (connection.statusCode >= 400) {
      color = new Color(0xFF4136); // Error - red
    } else if (connection.requestType === 'POST') {
      color = new Color(0xFFDC00); // Yellow
    } else if (connection.requestType === 'GET') {
      color = new Color(0x62DAFF); // Blue
    } else {
      color = new Color(0x01FF70); // Default - green
    }
    
    // Add to queue for processing in the tick method
    this.connectionQueue.push({
      ...connection,
      color: color.getStyle(),
      timestamp: connection.timestamp || Date.now()
    });
    
    // Update connection count and loading message
    this.connectionCount++;
    if (this.connectionCount <= 20) {
      this.updateLoadingText(`Loaded ${this.connectionCount} connections...`);
    }
    
    // Hide loading after reaching a threshold of connections
    if (this.connectionCount >= 10 && document.getElementById('loading-overlay')) {
      this.hideLoading();
    }
  }
  
  visualizeServer() {
    // Add server as a special highlighted point
    this.instance.pointsData([{
      lat: this.serverLocation.lat,
      lng: this.serverLocation.lng,
      size: 1.5,
      color: new Color(0x00ffff).getStyle(),
      label: this.serverLocation.label
    }]);
  }
  
  initVisualization() {
    // Set up basic visualization properties
    this.instance
      .arcColor((e) => e.color || '#62DAFF')
      .arcStroke((e) => e.size || 0.3)
      .arcDashLength(ARC_REL_LEN)
      .arcDashGap(15)
      .arcDashAnimateTime(FLIGHT_TIME)
      .pointColor((e) => e.color || '#62DAFF')
      .pointsMerge(true)
      .pointAltitude(0.0)
      .pointRadius(0.25)
      .ringColor((e) => (t) => e.color || `rgba(98, 218, 255, ${1-t})`)
      .ringMaxRadius(RINGS_MAX_R)
      .ringPropagationSpeed(RING_PROPAGATION_SPEED)
      .ringRepeatPeriod(FLIGHT_TIME * ARC_REL_LEN / NUM_RINGS);
  }

  _onMouseClick(event) {
    event.preventDefault();
    
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const intersects = this.raycaster.intersectObjects(this.instance.children, true);

    if (intersects.length > 0) {
      const object = intersects[0].object;
      const userData = object.__data || (object.parent && object.parent.__data);
      
      if (userData) {
        this._showConnectionInfo(userData);
      }
    }
  }

  _showConnectionInfo(data) {
    if (!data) return;
    
    // Create or update tooltip with connection information
    let tooltip = document.getElementById('connection-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'connection-tooltip';
      document.body.appendChild(tooltip);
    }
    
    tooltip.innerHTML = `
      <div class="tooltip-content">
        <h4>${data.country || 'Unknown'}</h4>
        <p>IP: ${data.ip || 'Unknown'}</p>
        <p>City: ${data.city || 'Unknown'}</p>
        <p>Request: ${data.requestType || ''} ${data.path || ''}</p>
        <p>${data.statusCode ? `Status: ${data.statusCode}` : ''}</p>
        <p>Time: ${new Date(data.timestamp).toLocaleTimeString()}</p>
      </div>
    `;
    
    // Position tooltip near the point
    const rect = event.target.getBoundingClientRect();
    tooltip.style.position = 'absolute';
    tooltip.style.left = `${event.clientX}px`;
    tooltip.style.top = `${event.clientY - tooltip.offsetHeight - 10}px`;
    tooltip.style.display = 'block';
    
    // Hide tooltip after a few seconds
    setTimeout(() => {
      tooltip.style.display = 'none';
    }, 5000);
  }

  tick(delta) {
    // Process connection queue
    while (this.connectionQueue.length > 0) {
      const connection = this.connectionQueue.shift();
      
      // Create a visual arc for this connection
      const arc = {
        startLat: connection.lat,
        startLng: connection.lng,
        endLat: this.serverLocation.lat,
        endLng: this.serverLocation.lng,
        color: connection.color,
        arcAlt: Math.random() * 0.4 + 0.1, // Random altitude for visual appeal
        order: Math.random(),
        size: connection.size || 0.3,
        animateIn: true,
        
        // Store connection data for tooltip
        ip: connection.ip,
        country: connection.country,
        city: connection.city,
        requestType: connection.requestType,
        path: connection.path,
        statusCode: connection.statusCode,
        timestamp: connection.timestamp
      };
      
      // Add to arcs data
      this.arcsData.push(arc);
      
      // Add the point for ring animations
      this.pointsData.push({
        lat: connection.lat,
        lng: connection.lng,
        size: 0.5,
        color: connection.color,
        
        // Store connection data for tooltip
        ip: connection.ip,
        country: connection.country,
        city: connection.city,
        requestType: connection.requestType,
        path: connection.path,
        statusCode: connection.statusCode,
        timestamp: connection.timestamp
      });
      
      // Limit the number of displayed connections
      if (this.arcsData.length > MAX_CONNECTIONS_DISPLAYED) {
        this.arcsData.shift();
        this.pointsData.shift();
      }
    }
    
    // Update visualization
    this.instance.arcsData(this.arcsData);
    this.instance.ringsData(this.pointsData);
  }

  _buildMaterial() {
    const globeMaterial = this.instance.globeMaterial();
    globeMaterial.color = new Color(0x101020);         // Darker blue
    globeMaterial.emissive = new Color(0x220038);      // Purple glow
    globeMaterial.emissiveIntensity = 0.1;
    globeMaterial.shininess = 0.9;
  }

  initCountries(delay) {
    setTimeout(() => {
      this.instance
        .hexPolygonsData(countries.features)
        .hexPolygonResolution(3)
        .hexPolygonMargin(0.7)
        .showAtmosphere(true)
        .atmosphereColor("#101030")  // Darker atmosphere for your theme
        .atmosphereAltitude(0.1)
        .hexPolygonColor(() => {
          return "rgba(255,255,255, 0.3)"; // More subtle country outlines
        });
    }, delay);
  }
}

export { Globe };