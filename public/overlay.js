// Configuration depuis les paramètres URL
const urlParams = new URLSearchParams(window.location.search);
const scale = parseFloat(urlParams.get('scale') || '1.0');
const compact = urlParams.get('compact') === '1';
const position = urlParams.get('pos') || '';

// Appliquer les paramètres
if (scale !== 1.0) {
  document.getElementById('overlay-container').style.transform = `scale(${scale})`;
}
if (compact) {
  document.body.classList.add('compact');
}
if (position) {
  document.body.classList.add(`pos-${position}`);
}

// Éléments DOM
const elements = {
  connectionStatus: document.getElementById('connection-status'),
  statusText: document.querySelector('.status-text'),
  state: document.getElementById('state'),
  filename: document.getElementById('filename'),
  progress: document.getElementById('progress'),
  progressFill: document.getElementById('progress-fill'),
  extruderTemp: document.getElementById('extruder-temp'),
  extruderTarget: document.getElementById('extruder-target'),
  bedTemp: document.getElementById('bed-temp'),
  bedTarget: document.getElementById('bed-target'),
  duration: document.getElementById('duration'),
  remaining: document.getElementById('remaining'),
  thumbnail: document.getElementById('thumbnail'),
  thumbnailContainer: document.getElementById('thumbnail-container'),
};

// Fonction pour formater le temps en HH:MM:SS
function formatTime(seconds) {
  if (!seconds || seconds < 0) return '--:--:--';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Fonction pour mettre à jour l'UI
function updateUI(data) {
  if (!data || !data.success) {
    setDisconnected();
    return;
  }

  const status = data.data;
  
  // Mise à jour du status de connexion
  if (status.state === 'disconnected') {
    setDisconnected();
    return;
  }
  
  elements.connectionStatus.className = 'connected';
  elements.statusText.textContent = 'Connecté';

  // État
  elements.state.textContent = getStateLabel(status.state);
  elements.state.className = `value state-${status.state}`;

  // Fichier
  elements.filename.textContent = status.filename || 'Aucun';

  // Progression
  const progressValue = Math.round(status.progress || 0);
  elements.progress.textContent = `${progressValue}%`;
  elements.progressFill.style.width = `${progressValue}%`;

  // Températures
  elements.extruderTemp.textContent = Math.round(status.extruderTemp);
  elements.extruderTarget.textContent = Math.round(status.extruderTarget);
  elements.bedTemp.textContent = Math.round(status.bedTemp);
  elements.bedTarget.textContent = Math.round(status.bedTarget);

  // Temps
  elements.duration.textContent = formatTime(status.printDuration);
  elements.remaining.textContent = formatTime(status.timeRemaining);

  // Thumbnail
  if (status.thumbnail) {
    elements.thumbnail.src = status.thumbnail;
    elements.thumbnail.style.display = 'block';
  } else {
    elements.thumbnail.style.display = 'none';
  }
}

// État déconnecté
function setDisconnected() {
  elements.connectionStatus.className = 'disconnected';
  elements.statusText.textContent = 'Déconnecté';
  elements.state.textContent = 'Déconnecté';
  elements.state.className = 'value state-disconnected';
}

// Labels d'état
function getStateLabel(state) {
  const labels = {
    printing: 'Impression',
    paused: 'Pause',
    idle: 'Inactif',
    error: 'Erreur',
    disconnected: 'Déconnecté',
  };
  return labels[state] || state;
}

// Fonction pour récupérer le status
async function fetchStatus() {
  try {
    const response = await fetch('/api/status');
    if (!response.ok) {
      console.error('Erreur API:', response.status, response.statusText);
      setDisconnected();
      return;
    }
    const data = await response.json();
    console.log('Status reçu:', data);
    updateUI(data);
  } catch (error) {
    console.error('Erreur lors de la récupération du status:', error);
    setDisconnected();
  }
}

// Polling toutes les secondes
console.log('🚀 Démarrage du polling...');
fetchStatus();
setInterval(fetchStatus, 1000);

// Log au chargement
console.log('✅ Klipper Overlay chargé');
console.log('📍 URL base:', window.location.origin);
console.log('🔧 Paramètres:', { scale, compact, position });
