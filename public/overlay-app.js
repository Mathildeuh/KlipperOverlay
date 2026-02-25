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
    // Essayer d'abord WSS/WS sur le domaine actuel
    let protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let wsUrl = `${protocol}//${window.location.host}/ws`;
    
    console.log(`📡 Tentative 1 - Connexion WebSocket: ${wsUrl}`);
    ws = new WebSocket(wsUrl);
    
    const timeout = setTimeout(() => {
      if (ws && ws.readyState === WebSocket.CONNECTING) {
        console.warn(`⏱️ Timeout connexion ${wsUrl}, essai fallback...`);
        ws.close();
        connectWebSocketFallback();
      }
    }, 3000);
    
    ws.onopen = () => {
      clearTimeout(timeout);
      console.log('✅ WebSocket connecté avec succès!');
      reconnectAttempts = 0;
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📨 Message reçu:', data.type);
        updateOverlay(data);
      } catch (e) {
        console.error('Parse error:', e);
      }
    };
    
    ws.onerror = (error) => {
      clearTimeout(timeout);
      console.error('❌ WebSocket error:', error);
      console.error('URL tentée:', wsUrl);
      console.error('Protocol:', protocol);
      // Si WSS échoue, aller directement au fallback
      if (protocol === 'wss:') {
        console.warn('⚠️ WSS échoué, passage immédiat au fallback...');
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
      // Si WSS/WebSocket local échoue, passer au fallback
      if (protocol === 'wss:') {
        console.warn('⚠️ WebSocket WSS fermé, passage au fallback...');
        connectWebSocketFallback();
      } else {
        console.log(`⚠️ WebSocket fermé (tentative ${reconnectAttempts + 1}/${maxReconnectAttempts})`);
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          console.log(`🔄 Reconnexion dans 2 secondes...`);
          setTimeout(connectWebSocket, 2000);
        }
      }
    };
  } catch (e) {
    console.error('Connection error:', e);
    connectWebSocketFallback();
  }
};

// Fallback: essayer WS (non-sécurisé) sur l'IP locale
const connectWebSocketFallback = () => {
  // Si on est en HTTPS, on ne peut PAS utiliser WS non-sécurisé (navigateur le refuse)
  // → Aller directement au polling API
  if (window.location.protocol === 'https:') {
    console.warn('⚠️ HTTPS détecté - WS non-sécurisé bloqué par navigateur');
    console.log('📊 Passage direct au polling API');
    startPollingFallback();
    return;
  }
  
  // Si on est en HTTP local, essayer les IP locales en WS
  const possibleIPs = [
    '192.168.1.155:8080',  // IP locale du serveur
    '192.168.1.1:8080',
    'localhost:8080',
  ];
  
  tryNextIP(0, possibleIPs);
};

const tryNextIP = (index, ips) => {
  if (index >= ips.length) {
    console.warn('❌ Impossible de se connecter au WebSocket, passage au polling');
    startPollingFallback();
    return;
  }
  
  const ip = ips[index];
  const wsUrl = `ws://${ip}/ws`;
  
  console.log(`📡 Essai fallback ${index + 1}/${ips.length}: ${wsUrl}`);
  
  ws = new WebSocket(wsUrl);
  
  const timeout = setTimeout(() => {
    if (ws.readyState === WebSocket.CONNECTING) {
      console.warn(`⏱️ Timeout ${wsUrl}`);
      ws.close();
      tryNextIP(index + 1, ips);
    }
  }, 2000);
  
  ws.onopen = () => {
    clearTimeout(timeout);
    console.log(`✅ WebSocket connecté via fallback: ${wsUrl}`);
    reconnectAttempts = 0;
  };
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('📨 Message reçu (fallback):', data.type);
      updateOverlay(data);
    } catch (e) {
      console.error('Parse error:', e);
    }
  };
  
  ws.onerror = () => {
    clearTimeout(timeout);
    console.warn(`❌ Erreur fallback ${ip}`);
    tryNextIP(index + 1, ips);
  };
  
  ws.onclose = () => {
    clearTimeout(timeout);
    console.log(`⚠️ Fallback fermé`);
  };
};

// Fallback: utiliser polling API
let pollingInterval = null;

const startPollingFallback = () => {
  console.log('📊 Passage au polling API');
  
  if (pollingInterval) clearInterval(pollingInterval);
  
  pollingInterval = setInterval(async () => {
    try {
      const response = await fetch('/api/status');
      if (!response.ok) throw new Error('Status error');
      
      const apiResponse = await response.json();
      
      if (!apiResponse.success || !apiResponse.data) {
        console.error('❌ Réponse API invalide:', apiResponse);
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
    } catch (err) {
      console.error('❌ Polling error:', err);
    }
  }, 1000); // Polling every 1 second
};

// ===== Update Overlay ===== 
const updateOverlay = (data) => {
  console.log('📥 Data reçue:', data);
  
  if (!data || !data.data) {
    console.warn('⚠️ Pas de data.data', data);
    return;
  }
  
  const status = data.data;
  console.log('📊 Status:', status);
  
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
  
  console.log('⏱️ Duration:', printStats.duration, 'Remaining:', printStats.remaining);
  console.log('📈 Progress:', printStats.progress, '% | Total:', printStats.totalDuration);
  
  // Update temperatures
  printStats.temps.extruder = status.extruderTemp || status.extruder_temp || status.extruder?.temperature || 0;
  printStats.temps.bed = status.bedTemp || status.bed_temp || status.heater_bed?.temperature || 0;
  
  console.log('🌡️ Extruder:', printStats.temps.extruder, 'Bed:', printStats.temps.bed);
  
  // Update photo if available
  if (status.thumbnail) {
    console.log('📸 Thumbnail data found:', status.thumbnail);
    
    if (thumbnailSmall) {
      thumbnailSmall.src = status.thumbnail;
      console.log('📸 Set thumbnail-small src');
    } else {
      console.warn('❌ thumbnailSmall element not found!');
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
      console.log('📸 Set thumbnail-inline display: block and click handler attached');
    } else {
      console.warn('❌ thumbnailInline element not found!');
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
  } else {
    console.warn('⚠️ No thumbnail in status data');
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
  console.log('🚀 Overlay initialized');
  console.log('📍 Version: 1.0');
  
  // Verify thumbnail elements exist
  console.log('🎯 DOM Check:');
  console.log('  - thumbnailSmall:', thumbnailSmall ? '✅' : '❌');
  console.log('  - thumbnailInline:', thumbnailInline ? '✅' : '❌');
  
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
