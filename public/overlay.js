// ===== Print History Manager =====
class PrintHistory {
  constructor() {
    this.key = 'klipper_history';
    this.max = 50;
    this.items = this.load();
  }

  load() {
    try {
      return JSON.parse(localStorage.getItem(this.key) || '[]');
    } catch {
      return [];
    }
  }

  save() {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.items));
    } catch (e) {
      console.error('Save error:', e);
    }
  }

  add(filename, duration, state) {
    this.items.unshift({
      id: Date.now(),
      filename,
      duration,
      state,
      timestamp: new Date().toLocaleString('fr-FR')
    });
    
    if (this.items.length > this.max) {
      this.items.length = this.max;
    }
    
    this.save();
  }

  getStats() {
    const completed = this.items.filter(i => i.state === 'completed').length;
    const total = this.items.length;
    const time = this.items.reduce((sum, i) => sum + (i.duration || 0), 0);
    
    return {
      total,
      completed,
      success: total > 0 ? Math.round((completed / total) * 100) : 0,
      time
    };
  }
}

// ===== Utilities =====
const formatTime = (sec) => {
  if (!sec || sec < 0) return '--:--';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const formatDuration = (ms) => {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h` : `${m}m`;
};

const now = () => new Date().toLocaleTimeString('fr-FR', { 
  hour: '2-digit', 
  minute: '2-digit', 
  second: '2-digit' 
});

// ===== DOM Elements =====
const $ = (id) => document.getElementById(id);

const connectionStatus = $('connection-status');
const statusLabel = $('status-label');
const stateBadge = $('state-badge');
const stateText = $('state-text');
const stateIcon = $('state-icon');
const thumbnail = $('thumbnail');
const filename = $('filename');
const progressValue = $('progress-value');
const progressFill = $('progress-fill');
const duration = $('duration');
const remaining = $('remaining');
const extruderTemp = $('extruder-temp');
const extruderTarget = $('extruder-target');
const bedTemp = $('bed-temp');
const bedTarget = $('bed-target');
const nozzleRing = $('nozzle-ring');
const bedRing = $('bed-ring');
const lastUpdate = $('last-update');

// Buttons
const statsBtn = $('stats-btn');
const statsModal = $('stats-modal');
const statsBackdrop = $('stats-backdrop');
const statsClose = $('stats-close');
const viewHistoryBtn = $('view-history');

const historyModal = $('history-modal');
const historyBackdrop = $('history-backdrop');
const historyClose = $('history-close');
const historyList = $('history-list');

// Thumbnail modal
const thumbnailModal = $('thumbnail-modal');
const thumbnailBackdrop = $('thumbnail-backdrop');
const thumbnailFullscreen = $('thumbnail-fullscreen');

// Stats elements
const statTotal = $('stat-total');
const statSuccess = $('stat-success');
const statCompleted = $('stat-completed');
const statTime = $('stat-time');

// ===== State =====
const history = new PrintHistory();
let lastState = null;
let lastFilename = null;

const stateConfig = {
  idle: {
    icon: '<rect x="3" y="3" width="18" height="18" rx="2"/>',
    text: 'Inactif',
    attr: 'idle'
  },
  printing: {
    icon: '<circle cx="12" cy="12" r="10"/><polyline points="10 8 16 12 10 16 10 8"/>',
    text: 'Impression',
    attr: 'printing'
  },
  paused: {
    icon: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
    text: 'Pause',
    attr: 'paused'
  },
  error: {
    icon: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
    text: 'Erreur',
    attr: 'error'
  },
  disconnected: {
    icon: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    text: 'Déconnecté',
    attr: 'disconnected'
  }
};

// ===== Connection Status =====
const setConnected = (connected) => {
  if (connected) {
    connectionStatus.classList.add('connected');
    connectionStatus.classList.remove('disconnected');
    statusLabel.textContent = 'Connecté';
  } else {
    connectionStatus.classList.remove('connected');
    connectionStatus.classList.add('disconnected');
    statusLabel.textContent = 'Déconnecté';
  }
};

// ===== Update Temperature Ring =====
const updateRing = (ring, current, target) => {
  if (!ring || target === 0) {
    ring.style.strokeDashoffset = '150.8';
    return;
  }
  
  const percent = Math.min(100, (current / target) * 100);
  const circumference = 150.8;
  const offset = circumference - (percent / 100) * circumference;
  
  ring.style.strokeDashoffset = offset;
};

// ===== Update UI =====
const updateUI = (data) => {
  console.log('📥 Données reçues:', data);
  
  if (!data?.success) {
    setDisconnected();
    return;
  }

  const status = data.data;
  console.log('📊 État du status:', status.state, status);

  if (status.state === 'disconnected') {
    setDisconnected();
    return;
  }

  setConnected(true);

  // State change detection
  if (lastState !== status.state) {
    console.log(`State: ${lastState} → ${status.state}`);

    if ((lastState === 'printing' || lastState === 'paused') && status.state === 'idle') {
      const dur = status.printDuration ? status.printDuration * 1000 : 0;
      const file = lastFilename || status.filename || 'Unknown';
      history.add(file, dur, 'completed');
      console.log('✓ Print saved:', file);
      
      filename.textContent = 'Aucune impression';
      progressValue.textContent = '0%';
      progressFill.style.width = '0%';
      duration.textContent = '00:00';
      
      lastFilename = null;
    }

    lastState = status.state;
  }

  // Update state badge
  const config = stateConfig[status.state] || stateConfig.idle;
  stateIcon.innerHTML = config.icon;
  stateText.textContent = config.text;
  stateBadge.setAttribute('data-state', config.attr);

  // Filename
  let file = status.filename || 'Aucune impression';
  lastFilename = status.filename;
  
  if (file !== 'Aucune impression' && status.state !== 'idle') {
    file = file.replace(/\.gcode$/i, ''); // Enlever .gcode
    file = file.replace(/_(?:PLA|ABS|PETG|TPU|Nylon).*$/i, ''); // Enlever matériau et profil
    file = file.replace(/_/g, ' '); // Remplacer _ par espaces
  } else if (status.state === 'idle') {
    file = 'Aucune impression';
  }
  
  filename.textContent = file;

  // Thumbnail
  if (status.thumbnail && status.state !== 'idle') {
    thumbnail.src = status.thumbnail;
    thumbnail.style.display = 'block';
  } else {
    thumbnail.style.display = 'none';
  }

  // Progress
  const prog = status.state === 'idle' ? 0 : Math.round(status.progress || 0);
  progressValue.textContent = `${prog}%`;
  progressFill.style.width = `${prog}%`;

  // Times
  duration.textContent = formatTime(status.printDuration);
  remaining.textContent = formatTime(status.timeRemaining);

  // Temperatures
  extruderTemp.textContent = Math.round(status.extruderTemp || 0);
  extruderTarget.textContent = Math.round(status.extruderTarget || 0);
  bedTemp.textContent = Math.round(status.bedTemp || 0);
  bedTarget.textContent = Math.round(status.bedTarget || 0);

  updateRing(nozzleRing, status.extruderTemp, status.extruderTarget);
  updateRing(bedRing, status.bedTemp, status.bedTarget);
  
  lastUpdate.textContent = now();
};

const setDisconnected = () => {
  setConnected(false);
  const config = stateConfig.disconnected;
  stateIcon.innerHTML = config.icon;
  stateText.textContent = config.text;
  stateBadge.setAttribute('data-state', config.attr);
  filename.textContent = 'Connexion impossible';
  progressValue.textContent = '0%';
  progressFill.style.width = '0%';
  extruderTemp.textContent = '0';
  extruderTarget.textContent = '0';
  bedTemp.textContent = '0';
  bedTarget.textContent = '0';
  updateRing(nozzleRing, 0, 0);
  updateRing(bedRing, 0, 0);
};

// ===== Update Stats =====
const updateStats = () => {
  const stats = history.getStats();
  statTotal.textContent = stats.total;
  statSuccess.textContent = `${stats.success}%`;
  statCompleted.textContent = stats.completed;
  statTime.textContent = formatDuration(stats.time);
};

// ===== Render History =====
const renderHistory = () => {
  if (history.items.length === 0) {
    historyList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-text">Aucun historique</div>
      </div>
    `;
    return;
  }

  const icons = {
    completed: '✓',
    failed: '✕',
    cancelled: '◼'
  };

  historyList.innerHTML = history.items.map(item => `
    <div class="history-item">
      <div class="history-icon">${icons[item.state] || '•'}</div>
      <div class="history-content">
        <div class="history-filename">${item.filename}</div>
        <div class="history-meta">
          <span class="history-state ${item.state}">${item.state}</span>
          <span>${formatDuration(item.duration)}</span>
          <span>${item.timestamp}</span>
        </div>
      </div>
    </div>
  `).join('');
};

// ===== Stats Modal =====
const openStats = () => {
  updateStats();
  statsModal.classList.remove('hidden');
};

const closeStats = () => {
  statsModal.classList.add('hidden');
};

statsBtn.addEventListener('click', openStats);
statsClose.addEventListener('click', closeStats);
statsBackdrop.addEventListener('click', closeStats);

viewHistoryBtn.addEventListener('click', () => {
  closeStats();
  openHistory();
});

// ===== History Modal =====
const openHistory = () => {
  renderHistory();
  historyModal.classList.remove('hidden');
};

const closeHistory = () => {
  historyModal.classList.add('hidden');
};

historyClose.addEventListener('click', closeHistory);
historyBackdrop.addEventListener('click', closeHistory);

// ===== Thumbnail Modal =====
const openThumbnail = () => {
  if (thumbnail.src && thumbnail.style.display !== 'none') {
    thumbnailFullscreen.src = thumbnail.src;
    thumbnailModal.style.display = 'flex';
  }
};

const closeThumbnail = () => {
  thumbnailModal.style.display = 'none';
};

thumbnail.addEventListener('click', openThumbnail);
thumbnailBackdrop.addEventListener('click', closeThumbnail);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!statsModal.classList.contains('hidden')) {
      closeStats();
    }
    if (!historyModal.classList.contains('hidden')) {
      closeHistory();
    }
    if (thumbnailModal.style.display === 'flex') {
      closeThumbnail();
    }
  }
});

// ===== Light Button =====
const lightBtn = $('light-btn');

lightBtn.addEventListener('click', async () => {
  try {
    lightBtn.style.opacity = '0.5';
    lightBtn.style.pointerEvents = 'none';

    const response = await fetch('/api/gcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'GANTRY_LIGHT_ON' })
    });

    const data = await response.json();
    
    if (data.success) {
      console.log('💡 Lumière allumée');
    } else {
      console.error('Erreur:', data.error);
    }
  } catch (error) {
    console.error('Erreur lumière:', error);
  } finally {
    lightBtn.style.opacity = '1';
    lightBtn.style.pointerEvents = 'auto';
  }
});

// ===== API Polling =====
const fetchStatus = async () => {
  try {
    const res = await fetch('/api/status', {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });

    if (!res.ok) {
      setDisconnected();
      return;
    }

    const data = await res.json();
    updateUI(data);
  } catch (err) {
    console.error('Fetch error:', err);
    setDisconnected();
  }
};

// ===== Init =====
console.log('🎨 Klipper Overlay v3.0');
fetchStatus();
setInterval(fetchStatus, 1000);
setInterval(() => { lastUpdate.textContent = now(); }, 1000);
