const $ = (id) => document.getElementById(id);

const connectionStatus = $('connection-status');
const statusLabel = $('status-label');
const stateBadge = $('state-badge');
const stateText = $('state-text');
const stateIcon = $('state-icon');

const filename = $('filename');
const startedAt = $('started-at');
const elapsed = $('elapsed');
const powerW = $('power-w');
const costTotal = $('cost-total');
const costElectricity = $('cost-electricity');
const costFilament = $('cost-filament');
const costWear = $('cost-wear');
const energyKwh = $('energy-kwh');
const filamentG = $('filament-g');
const estimatedTime = $('estimated-time');
const historyList = $('history-list');
const lastUpdate = $('last-update');

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

const now = () => new Date().toLocaleTimeString('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
});

const formatEur = (value) => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(2).replace('.', ',') + ' €';
};

const formatNumber = (value, suffix) => {
  if (!Number.isFinite(value)) return `-- ${suffix}`;
  return `${value.toFixed(2)} ${suffix}`;
};

const formatDuration = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) return '--:--';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const formatTime = (sec) => {
  if (!Number.isFinite(sec) || sec <= 0) return '--:--';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

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

const updateStateBadge = (state) => {
  const config = stateConfig[state] || stateConfig.idle;
  stateIcon.innerHTML = config.icon;
  stateText.textContent = config.text;
  stateBadge.setAttribute('data-state', config.attr);
};

const resetUI = () => {
  updateStateBadge('idle');
  filename.textContent = 'Aucune impression';
  startedAt.textContent = '--:--';
  elapsed.textContent = '--:--';
  powerW.textContent = '-- W';
  costTotal.textContent = '0,00 €';
  costElectricity.textContent = '0,00 €';
  costFilament.textContent = '0,00 €';
  costWear.textContent = '0,00 €';
  energyKwh.textContent = '-- kWh';
  filamentG.textContent = '-- g';
  estimatedTime.textContent = '--:--';
};

const updateCurrent = (data) => {
  if (!data?.success) {
    setConnected(false);
    updateStateBadge('disconnected');
    return;
  }

  setConnected(true);
  const payload = data.data;

  if (!payload?.printing || !payload.session) {
    resetUI();
    updateStateBadge('idle');
    return;
  }

  const session = payload.session;
  const file = (session.filename || 'Impression').replace(/\.gcode$/i, '').replace(/_/g, ' ');
  filename.textContent = file;

  updateStateBadge('printing');

  const startedDate = new Date(session.startedAt);
  startedAt.textContent = startedDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  elapsed.textContent = formatDuration(Date.now() - session.startedAt);

  const powerValue = Number.isFinite(payload.powerW) ? payload.powerW : undefined;
  powerW.textContent = powerValue !== undefined ? `${Math.round(powerValue)} W` : '-- W';

  costTotal.textContent = formatEur(session.costs?.totalEur);
  costElectricity.textContent = formatEur(session.costs?.electricityEur);
  costFilament.textContent = formatEur(session.costs?.filamentEur);
  costWear.textContent = formatEur(session.costs?.wearEur);

  energyKwh.textContent = formatNumber(session.energyDeltaKwh, 'kWh');
  filamentG.textContent = Number.isFinite(session.filamentG)
    ? `${Math.round(session.filamentG)} g`
    : '-- g';

  const estimated = session.meta?.estimatedTimeSec;
  estimatedTime.textContent = formatTime(estimated);
};

const renderHistory = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    historyList.innerHTML = '<div class="empty-state"><div class="empty-text">Aucun historique</div></div>';
    return;
  }

  historyList.innerHTML = items.map((item) => {
    const duration = item.endedAt && item.startedAt ? formatDuration(item.endedAt - item.startedAt) : '--:--';
    const when = item.endedAt || item.startedAt;
    const timestamp = when ? new Date(when).toLocaleDateString('fr-FR') : '--';
    const state = item.status || 'completed';
    return `
      <div class="history-item">
        <div class="history-main">
          <div class="history-filename">${(item.filename || 'Print').replace(/\.gcode$/i, '').replace(/_/g, ' ')}</div>
          <div class="history-meta">
            <span>${state}</span>
            <span>${duration}</span>
            <span>${timestamp}</span>
          </div>
        </div>
        <div class="history-cost">${formatEur(item.costs?.totalEur)}</div>
      </div>
    `;
  }).join('');
};

const fetchCurrent = async () => {
  try {
    const res = await fetch('/api/cost/current', { method: 'GET', signal: AbortSignal.timeout(3000) });
    if (!res.ok) {
      setConnected(false);
      updateStateBadge('disconnected');
      return;
    }
    const data = await res.json();
    updateCurrent(data);
  } catch (err) {
    console.error('Fetch current error:', err);
    setConnected(false);
    updateStateBadge('disconnected');
  }
};

const fetchHistory = async () => {
  try {
    const res = await fetch('/api/cost/history?limit=20', { method: 'GET', signal: AbortSignal.timeout(3000) });
    if (!res.ok) return;
    const data = await res.json();
    renderHistory(data?.data || []);
  } catch (err) {
    console.error('Fetch history error:', err);
  }
};

const tick = async () => {
  await fetchCurrent();
  lastUpdate.textContent = now();
};

resetUI();
fetchHistory();
fetchCurrent();
setInterval(tick, 1000);
setInterval(fetchHistory, 15000);
