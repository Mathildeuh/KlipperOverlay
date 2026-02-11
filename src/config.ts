import dotenv from 'dotenv';

dotenv.config();

function parseFloatEnv(name: string, fallback: number) {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  moonraker: {
    url: process.env.MOONRAKER_URL || 'http://192.168.1.155:7125',
    wsUrl: process.env.MOONRAKER_URL?.replace('http', 'ws') || 'ws://192.168.1.155:7125',
  },
  server: {
    port: parseInt(process.env.PORT || '8080', 10),
    corsEnabled: process.env.CORS_ENABLED === 'true',
  },
  refreshInterval: parseInt(process.env.REFRESH_INTERVAL || '1000', 10),
  tapo: {
    email: process.env.TAPO_EMAIL || '',
    password: process.env.TAPO_PASSWORD || '',
    deviceIp: process.env.TAPO_DEVICE_IP || '',
  },
  pricing: {
    electricityEurPerKwh: parseFloatEnv('ELECTRICITY_EUR_PER_KWH', 0.25),
    machineEurPerHour: parseFloatEnv('MACHINE_EUR_PER_HOUR', 0.3),
    filamentEurPerKg: parseFloatEnv('FILAMENT_EUR_PER_KG', 20),
  },
};

// Basic validation
if (!config.moonraker.url) {
  console.warn('⚠️ MOONRAKER_URL non configurée');
}

export type Config = typeof config;
