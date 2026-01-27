import dotenv from 'dotenv';

dotenv.config();

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
};
