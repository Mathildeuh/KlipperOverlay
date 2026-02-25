import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import http from 'http';
import { RawData, WebSocket, WebSocketServer } from 'ws';
import { config } from './config';
import apiRoutes from './routes/api.routes';
import { moonrakerService } from './services/moonraker.service';
import { printCostService } from './services/print-cost.service';

const app: Express = express();
const go2rtcBaseUrl = process.env.GO2RTC_URL || 'http://192.168.1.155:1984';
const go2rtcWsBaseUrl = go2rtcBaseUrl.replace(/^http/, 'ws');

printCostService.start();
moonrakerService.startPolling(config.refreshInterval);

// Middleware
if (config.server.corsEnabled) {
  app.use(cors());
}
app.use(express.json());

// ACME challenge support for certbot (must be before static middleware)
app.get('/.well-known/acme-challenge/:token', async (req: Request, res: Response) => {
  try {
    const token = req.params.token;
    const acmePath = path.join('/var/lib/letsencrypt/webroot', '.well-known', 'acme-challenge', token);
    
    if (fs.existsSync(acmePath)) {
      const content = fs.readFileSync(acmePath, 'utf8');
      res.setHeader('Content-Type', 'text/plain');
      res.send(content);
    } else {
      res.status(404).send('Not found');
    }
  } catch (error) {
    console.error('ACME challenge error:', error);
    res.status(500).send('Error');
  }
});

app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api', apiRoutes);

// Proxy pour les thumbnails (accessible à distance)
app.get('/thumbnail/*', async (req: Request, res: Response) => {
  try {
    const filename = req.params[0];
    const encodedPath = encodeURIComponent(filename);
    const thumbnailUrl = `${config.moonraker.url}/server/files/gcodes/${encodedPath}`;
    
    const response = await axios.get(thumbnailUrl, {
      responseType: 'stream',
      timeout: 5000,
    });

    // Transférer les headers de type de contenu
    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type']);
    }
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }

    // Streamer l'image
    response.data.pipe(res);
  } catch (error) {
    console.error('Erreur lors du proxy de thumbnail:', error);
    res.status(404).json({ error: 'Thumbnail not found' });
  }
});

// Proxy HTTP vers go2rtc (WebRTC page et endpoints associés)
app.get('/go2rtc/*', async (req: Request, res: Response) => {
  try {
    const targetPath = req.originalUrl.replace(/^\/go2rtc/, '') || '/';
    if (targetPath.startsWith('/api/ws')) {
      res.setHeader('Connection', 'Upgrade');
      res.setHeader('Upgrade', 'websocket');
      res.status(426).send('Upgrade Required: WebSocket endpoint');
      return;
    }

    const targetUrl = `${go2rtcBaseUrl}${targetPath}`;

    const response = await axios.get(targetUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        Accept: req.headers.accept || '*/*',
      },
    });

    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type']);
    }

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.status(response.status).send(Buffer.from(response.data));
  } catch (error) {
    console.error('Erreur proxy go2rtc HTTP:', error);
    res.status(502).send('go2rtc unavailable');
  }
});

// Route pour l'overlay
app.get('/overlay', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/overlay.html'));
});

// Route pour la page cout
app.get('/cost', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/cost.html'));
});

// Route pour la webcam + overlay
app.get('/webcam', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/webcam.html'));
});

// Route pour la page mobile responsive
app.get('/mobile', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/mobile.html'));
});

// Route racine
app.get('/', (req: Request, res: Response) => {
  res.send(`
    <html>
      <head>
        <title>Klipper Overlay Server</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            line-height: 1.6;
          }
          h1 { color: #333; }
          a { color: #0066cc; text-decoration: none; }
          a:hover { text-decoration: underline; }
          .endpoint {
            background: #f5f5f5;
            padding: 10px;
            margin: 10px 0;
            border-radius: 5px;
            font-family: monospace;
          }
        </style>
      </head>
      <body>
        <h1>🖨️ Klipper Overlay Server</h1>
        <p>Serveur en ligne !</p>
        
        <h2>Endpoints disponibles:</h2>
        <div class="endpoint">
          <strong>GET</strong> <a href="/overlay">/overlay</a> - Page overlay pour OBS
        </div>
        <div class="endpoint">
          <strong>GET</strong> <a href="/webcam">/webcam</a> - Page webcam + overlay superposé
        </div>
        <div class="endpoint">
          <strong>GET</strong> <a href="/mobile">/mobile</a> - Page mobile responsive
        </div>
        <div class="endpoint">
          <strong>GET</strong> <a href="/api/status">/api/status</a> - Status de l'imprimante (JSON)
        </div>
        <div class="endpoint">
          <strong>GET</strong> <a href="/api/health">/api/health</a> - Health check
        </div>
        
        <h2>Configuration OBS:</h2>
        <ol>
          <li>Ajouter une source "Navigateur"</li>
          <li>URL: <code>http://localhost:${config.server.port}/overlay</code></li>
          <li>Largeur: 400 / Hauteur: 300 (ajustable)</li>
          <li>Cocher "Arrière-plan transparent"</li>
        </ol>
        
        <h2>Paramètres URL (optionnels):</h2>
        <ul>
          <li><code>?scale=1.2</code> - Échelle (défaut: 1.0)</li>
          <li><code>?compact=1</code> - Mode compact</li>
          <li><code>?pos=top-right</code> - Position (top-left, top-right, bottom-left, bottom-right)</li>
        </ul>
      </body>
    </html>
  `);
});

const server = http.createServer(app);
const wsServer = new WebSocketServer({ noServer: true });

const toTextMessage = (data: RawData): string => {
  if (typeof data === 'string') {
    return data;
  }

  if (Buffer.isBuffer(data)) {
    return data.toString('utf8');
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8');
  }

  return Buffer.from(data).toString('utf8');
};

server.on('upgrade', (req, socket, head) => {
  const requestUrl = req.url || '';
  if (!requestUrl.startsWith('/go2rtc/api/ws')) {
    socket.destroy();
    return;
  }

  wsServer.handleUpgrade(req, socket, head, (clientSocket) => {
    const queryStart = requestUrl.indexOf('?');
    const queryString = queryStart >= 0 ? requestUrl.slice(queryStart) : '';
    const targetWsUrl = `${go2rtcWsBaseUrl}/api/ws${queryString}`;
    const targetSocket = new WebSocket(targetWsUrl);

    targetSocket.on('open', () => {
      clientSocket.on('message', (data) => {
        if (targetSocket.readyState === WebSocket.OPEN) {
          targetSocket.send(toTextMessage(data), { binary: false });
        }
      });
    });

    targetSocket.on('message', (data) => {
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(toTextMessage(data), { binary: false });
      }
    });

    const closeBoth = () => {
      if (clientSocket.readyState === WebSocket.OPEN || clientSocket.readyState === WebSocket.CONNECTING) {
        clientSocket.close();
      }
      if (targetSocket.readyState === WebSocket.OPEN || targetSocket.readyState === WebSocket.CONNECTING) {
        targetSocket.close();
      }
    };

    clientSocket.on('close', closeBoth);
    targetSocket.on('close', closeBoth);
    clientSocket.on('error', closeBoth);
    targetSocket.on('error', closeBoth);
  });
});

// Démarrage du serveur
server.listen(config.server.port, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║   🖨️  Klipper Overlay Server              ║
╠═══════════════════════════════════════════╣
║  Port:        ${config.server.port}                       ║
║  Moonraker:   ${config.moonraker.url.padEnd(24, ' ')}║
║  CORS:        ${config.server.corsEnabled ? 'Enabled' : 'Disabled'}                   ║
╠═══════════════════════════════════════════╣
║  Overlay:     http://localhost:${config.server.port}/overlay  ║
║  API:         http://localhost:${config.server.port}/api      ║
╚═══════════════════════════════════════════╝
  `);
});

// Gestion propre de l'arrêt
process.on('SIGINT', () => {
  console.log('\n🛑 Arrêt du serveur...');
  printCostService.stop();
  moonrakerService.close();
  wsServer.close();
  server.close();
  process.exit(0);
});
