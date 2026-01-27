// Configuration depuis les paramètres URL
const urlParams = new URLSearchParams(window.location.search);
const scale = parseFloat(urlParams.get('scale') || '1.0');
const compact = urlParams.get('compact') === '1';
const position = urlParams.get('pos') || '';

// Paramètres pour afficher/masquer les blocs
const urlConfig = {
  showThumbnail: urlParams.get('thumbnail') !== '0',
  showFilename: urlParams.get('file') !== '0',
  showProgress: urlParams.get('progress_bar') !== '0',
  showState: urlParams.get('state') !== '0',
  showNozzle: urlParams.get('nozzle') !== '0',
  showBed: urlParams.get('bed') !== '0',
  showTimer: urlParams.get('timer') !== '0',
  showEta: urlParams.get('eta') !== '0',
  showStatus: urlParams.get('status') !== '0',
};

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
  mainInfo: document.getElementById('main-info'),
};

// Configuration de l'overlay
let overlayConfig = {
  showThumbnail: true,
  showFilename: true,
  showProgress: true,
  showTemperatures: true,
  showTimes: true,
  showStatus: true,
  showState: true,
  showNozzle: true,
  showBed: true,
  showTimer: true,
  showEta: true,
};

// Fonction pour formater le temps en HH:MM:SS
function formatTime(seconds) {
  if (!seconds || seconds < 0) return '--:--:--';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Charger la configuration de l'overlay
async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    if (response.ok) {
      const data = await response.json();
      overlayConfig = { ...overlayConfig, ...data.data };
      console.log('✅ Configuration chargée:', overlayConfig);
      
      // Appliquer les paramètres URL (priorité sur l'API)
      Object.keys(urlConfig).forEach(key => {
        overlayConfig[key] = urlConfig[key];
      });
      console.log('📍 Configuration avec paramètres URL appliquée:', overlayConfig);
      
      applyConfig();
    }
  } catch (error) {
    console.log('⚠️ Impossible de charger la configuration, utilisation des valeurs par défaut');
    // Appliquer juste les paramètres URL
    Object.keys(urlConfig).forEach(key => {
      overlayConfig[key] = urlConfig[key];
    });
    applyConfig();
  }
}

// Appliquer la configuration (afficher/masquer les blocs)
function applyConfig() {
  // Thumbnail
  const thumbnailSection = elements.thumbnailContainer?.parentElement;
  if (thumbnailSection) thumbnailSection.style.display = overlayConfig.showThumbnail ? '' : 'none';
  
  // État
  const stateRow = document.querySelector('.state-row');
  if (stateRow) stateRow.style.display = overlayConfig.showState ? '' : 'none';
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
  elements.filename.textContent = status.filename || 'Aucun';
  if (elements.filename.parentElement) {
    elements.filename.parentElement.parentElement.style.display = overlayConfig.showFilename ? '' : 'none';
  }

  // Progression
  const progressValue = Math.round(status.progress || 0);
  elements.progress.textContent = `${progressValue}%`;
  elements.progressFill.style.width = `${progressValue}%`;
  if (elements.progress.parentElement) {
    elements.progress.parentElement.parentElement.style.display = overlayConfig.showProgress ? '' : 'none';
    const progressBar = elements.progress.parentElement.parentElement.nextElementSibling;
    if (progressBar) progressBar.style.display = overlayConfig.showProgress ? '' : 'none';
  }

  // Températures - Buse
  elements.extruderTemp.textContent = Math.round(status.extruderTemp);
  elements.extruderTarget.textContent = Math.round(status.extruderTarget);
  const nozzleItem = elements.extruderTemp.closest('.temp-item');
  if (nozzleItem) nozzleItem.style.display = overlayConfig.showNozzle ? '' : 'none';

  // Températures - Plateau
  elements.bedTemp.textContent = Math.round(status.bedTemp);
  elements.bedTarget.textContent = Math.round(status.bedTarget);
  const bedItem = elements.bedTemp.closest('.temp-item');
  if (bedItem) bedItem.style.display = overlayConfig.showBed ? '' : 'none';

  // Temps
  elements.duration.textContent = formatTime(status.printDuration);
  elements.remaining.textContent = formatTime(status.timeRemaining);
  
  // Affichage sélectif des temps
  const timeItems = document.querySelectorAll('.time-item');
  if (timeItems.length >= 2) {
    timeItems[0].style.display = overlayConfig.showTimer ? '' : 'none';      // Durée
    timeItems[1].style.display = overlayConfig.showEta ? '' : 'none';        // Restant
  }
  
  // Masquer le conteneur si aucun temps n'est affiché
  const timeContainer = document.querySelector('.time-container');
  if (timeContainer) {
    const showAnyTime = overlayConfig.showTimer || overlayConfig.showEta;
    timeContainer.style.display = showAnyTime ? '' : 'none';
  }

  // Thumbnail
  if (status.thumbnail && overlayConfig.showThumbnail) {
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
  
  // Masquer la barre de statut si configuré
  if (!overlayConfig.showStatus) {
    elements.connectionStatus.style.display = 'none';
  }
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
loadConfig(); // Charger la config au démarrage
fetchStatus();
setInterval(fetchStatus, 1000);

// Log au chargement
console.log('✅ Klipper Overlay chargé');
console.log('📍 URL base:', window.location.origin);
console.log('🔧 Paramètres:', { scale, compact, position });
console.log('👁️ Blocs visibles:', urlConfig);
