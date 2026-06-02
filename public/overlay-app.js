// ===== Utilities =====
const formatSeconds = (seconds) => {
  if (!seconds || seconds < 0) return '00:00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const formatETA = (seconds) => {
  if (!seconds || seconds < 0) return '--:--';
  const now = new Date();
  const eta = new Date(now.getTime() + seconds * 1000);
  const h = String(eta.getHours()).padStart(2, '0');
  const m = String(eta.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
};

const $ = (id) => document.getElementById(id);

// ===== DOM Elements =====
const duration = $('duration');
const remaining = $('remaining');
const eta = $('eta');
const extruderTemp = $('extruder-temp');
const bedTemp = $('bed-temp');
const hostTemp = $('host-temp');
const mcuTemp = $('mcu-temp');
const tempGraph = $('temp-graph');
const closeBtn = $('close-btn');
const thumbnail = $('thumbnail');
const thumbnailContainer = $('thumbnail-container');

// Progress circle elements
const progressRing = $('progress-ring');
const progressPercent = $('progress-percent');
const progressLabel = $('progress-label');
const thumbnailSmall = $('thumbnail-small');
const thumbnailInline = $('thumbnail-inline');

// ===== Data Storage =====
let printStats = {
  duration: 0,
  remaining: 0,
  progress: 0,
  totalDuration: 0,
  state: 'idle',
  filename: '',
  temps: {
    extruder: 0,
    bed: 0
  }
};

let graphData = {
  extruder: [],
  bed: []
};

// ===== WebSocket Connection =====
let ws = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

const connectWebSocket = () => {
  try {
    let protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let wsUrl = `${protocol}//${window.location.host}/ws`;

    ws = new WebSocket(wsUrl);
    
    const timeout = setTimeout(() => {
      if (ws && ws.readyState === WebSocket.CONNECTING) {
        ws.close();
        connectWebSocketFallback();
      }
    }, 3000);
    
    ws.onopen = () => {
      clearTimeout(timeout);
      reconnectAttempts = 0;
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        updateOverlay(data);
      } catch {
      }
    };
    
    ws.onerror = (error) => {
      clearTimeout(timeout);
      if (protocol === 'wss:') {
        setTimeout(() => {
          if (ws && ws.readyState !== WebSocket.OPEN) {
            ws.close();
            connectWebSocketFallback();
          }
        }, 100);
      }
    };
    
    ws.onclose = () => {
      clearTimeout(timeout);
      if (protocol === 'wss:') {
        connectWebSocketFallback();
      } else {
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          setTimeout(connectWebSocket, 2000);
        }
      }
    };
  } catch (e) {
    connectWebSocketFallback();
  }
};

// Fallback: essayer WS (non-sécurisé) sur l'IP locale
const connectWebSocketFallback = () => {
  if (window.location.protocol === 'https:') {
    startPollingFallback();
    return;
  }

  const possibleIPs = [
    '192.168.1.155:8080',
    '192.168.1.1:8080',
    'localhost:8080',
  ];

  tryNextIP(0, possibleIPs);
};

const tryNextIP = (index, ips) => {
  if (index >= ips.length) {
    startPollingFallback();
    return;
  }

  const ip = ips[index];
  const wsUrl = `ws://${ip}/ws`;

  ws = new WebSocket(wsUrl);

  const timeout = setTimeout(() => {
    if (ws.readyState === WebSocket.CONNECTING) {
      ws.close();
      tryNextIP(index + 1, ips);
    }
  }, 2000);

  ws.onopen = () => {
    clearTimeout(timeout);
    reconnectAttempts = 0;
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      updateOverlay(data);
    } catch {
    }
  };

  ws.onerror = () => {
    clearTimeout(timeout);
    tryNextIP(index + 1, ips);
  };

  ws.onclose = () => {
    clearTimeout(timeout);
  };
};

// Fallback: utiliser polling API
let pollingInterval = null;

const startPollingFallback = () => {
  if (pollingInterval) clearInterval(pollingInterval);

  pollingInterval = setInterval(async () => {
    try {
      const response = await fetch('/api/status');
      if (!response.ok) throw new Error('Status error');
      
      const apiResponse = await response.json();
      
      if (!apiResponse.success || !apiResponse.data) {
        return;
      }
      
      const status = apiResponse.data;
      
      // Convertir format API vers format WebSocket
      const data = {
        type: 'status',
        data: {
          printDuration: status.printDuration || 0,
          timeRemaining: status.timeRemaining || 0,
          extruderTemp: status.extruderTemp || 0,
          bedTemp: status.bedTemp || 0,
          filename: status.filename,
          state: status.state,
          thumbnail: status.thumbnail
        }
      };
      
      updateOverlay(data);
    } catch {
    }
  }, 1000); // Polling every 1 second
};

// ===== Update Overlay ===== 
const updateOverlay = (data) => {
  if (!data || !data.data) {
    return;
  }

  const status = data.data;

  // Update print stats (structure from moonraker service)
  printStats.duration = status.printDuration || status.print_duration || 0;
  printStats.remaining = status.timeRemaining || status.time_remaining || 0;
  printStats.state = status.state || 'idle';
  printStats.filename = status.filename || '';
  
  // Calculate progress percentage
  printStats.totalDuration = (printStats.duration + printStats.remaining) || 0;
  if (printStats.totalDuration > 0) {
    printStats.progress = Math.round((printStats.duration / printStats.totalDuration) * 100);
  } else {
    printStats.progress = 0;
  }

  // Update temperatures
  printStats.temps.extruder = status.extruderTemp || status.extruder_temp || status.extruder?.temperature || 0;
  printStats.temps.bed = status.bedTemp || status.bed_temp || status.heater_bed?.temperature || 0;

  // Update photo if available
  if (status.thumbnail) {
    if (thumbnailSmall) {
      thumbnailSmall.src = status.thumbnail;
    }

    if (thumbnailInline) {
      thumbnailInline.style.display = 'block';
      // Attach click handler to open the full-size thumbnail modal
      thumbnailInline.onclick = () => {
        if (thumbnail) {
          thumbnail.src = status.thumbnail;
        }
        if (thumbnailContainer) {
          thumbnailContainer.style.display = 'flex';
        }
      };
    }

    if (thumbnail) {
      thumbnail.src = status.thumbnail;
    }
    
    // Do NOT auto-show the full-size container; keep it hidden until user clicks.
    if (thumbnailContainer) {
      thumbnailContainer.style.display = 'none';
      // Clicking the full-size container will hide it again
      thumbnailContainer.onclick = () => {
        thumbnailContainer.style.display = 'none';
      };
    }
  }

  // Update UI
  updateUI();

  // Update graph every 5 seconds (random sample)
  if (Math.random() < 0.2) {
    updateGraph();
  }
};

// ===== Update UI Elements =====
const updateUI = () => {
  // Update times
  duration.textContent = formatSeconds(printStats.duration);
  remaining.textContent = formatSeconds(printStats.remaining);
  eta.textContent = formatETA(printStats.remaining);
  
  // Update progress circle
  progressPercent.textContent = printStats.progress + '%';
  
  // Update stroke-dashoffset for progress ring
  // Circumference = 2 * π * r = 2 * π * 70 ≈ 439.8
  const circumference = 439.8;
  const offset = circumference * (1 - printStats.progress / 100);
  progressRing.style.strokeDashoffset = offset;
  
  // Update progress label based on state
  if (printStats.state === 'printing') {
    progressLabel.textContent = `En cours`;
  } else if (printStats.state === 'paused') {
    progressLabel.textContent = `En pause`;
  } else {
    progressLabel.textContent = `${printStats.state || 'idle'}`;
  }
  
  // Update temperatures
  extruderTemp.textContent = printStats.temps.extruder.toFixed(1);
  bedTemp.textContent = printStats.temps.bed.toFixed(1);
  
  // Hide host and mcu if elements exist
  if (hostTemp) hostTemp.textContent = '--';
  if (mcuTemp) mcuTemp.textContent = '--';
};

// ===== Update Graph =====
const updateGraph = () => {
  graphData.extruder.push(printStats.temps.extruder);
  graphData.bed.push(printStats.temps.bed);
  
  // Keep last 30 data points
  if (graphData.extruder.length > 30) {
    graphData.extruder.shift();
    graphData.bed.shift();
  }
  
  redrawGraph();
};

const redrawGraph = () => {
  if (!tempGraph || graphData.extruder.length < 2) return;
  
  const svgNS = 'http://www.w3.org/2000/svg';
  const maxTemp = Math.max(...graphData.extruder, ...graphData.bed, 50);
  const minTemp = 0;
  const range = Math.max(maxTemp - minTemp, 10);
  
  // Update extruder line
  const extruderLine = tempGraph.querySelector('polyline.extruder');
  if (extruderLine) {
    const points = graphData.extruder
      .map((temp, i) => {
        const x = (i / (graphData.extruder.length - 1 || 1)) * 600;
        const y = 120 - ((temp - minTemp) / range) * 120;
        return `${x},${y}`;
      })
      .join(' ');
    extruderLine.setAttribute('points', points);
  }
  
  // Update bed line
  const bedLine = tempGraph.querySelector('polyline.bed');
  if (bedLine) {
    const points = graphData.bed
      .map((temp, i) => {
        const x = (i / (graphData.bed.length - 1 || 1)) * 600;
        const y = 120 - ((temp - minTemp) / range) * 120;
        return `${x},${y}`;
      })
      .join(' ');
    bedLine.setAttribute('points', points);
  }
};

// ===== Event Listeners =====
closeBtn?.addEventListener('click', () => {
  window.close();
});

thumbnailContainer?.addEventListener('click', () => {
  const modal = document.createElement('div');
  modal.className = 'fullscreen-modal';
  modal.innerHTML = `
    <div class="fullscreen-overlay" onclick="this.parentElement.remove()"></div>
    <img src="${thumbnail.src}" class="fullscreen-image" onclick="event.stopPropagation()">
  `;
  document.body.appendChild(modal);
});

// ===== Initialize =====
window.addEventListener('load', () => {
  connectWebSocket();

  // Force initial update
  updateUI();
  
  // Update UI every second (for time display)
  setInterval(() => {
    if (printStats.duration > 0 || printStats.remaining > 0) {
      printStats.duration += 1;
      updateUI();
    }
  }, 1000);
});
