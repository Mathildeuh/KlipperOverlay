import dotenv from 'dotenv';

dotenv.config();

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const tapoEmail = process.env.TAPO_EMAIL || '';
const tapoPassword = process.env.TAPO_PASSWORD || '';
const tapoDeviceIp = process.env.TAPO_DEVICE_IP || '';
const tapoEnabled = Boolean(tapoEmail && tapoPassword && tapoDeviceIp);

if (!tapoEnabled) {
  console.warn('⚠️ TAPO_* manquants. Le coût electricite sera indisponible.');
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
    email: tapoEmail,
    password: tapoPassword,
    deviceIp: tapoDeviceIp,
    enabled: tapoEnabled,
  },
  costs: {
    electricityEurPerKwh: parseNumber(process.env.ELECTRICITY_EUR_PER_KWH, 0.25),
    machineEurPerHour: parseNumber(process.env.MACHINE_EUR_PER_HOUR, 0.3),
    filamentEurPerKg: parseNumber(process.env.FILAMENT_EUR_PER_KG, 20),
  },
};
