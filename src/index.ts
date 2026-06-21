import express, { Express, NextFunction, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import http from 'http';
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';
import { RawData, WebSocket, WebSocketServer } from 'ws';
import { config } from './config';
import apiRoutes from './routes/api.routes';
import { moonrakerService } from './services/moonraker.service';
import { printCostService } from './services/print-cost.service';

const app: Express = express();
const go2rtcBaseUrl = process.env.GO2RTC_URL || 'http://192.168.1.155:1984';
const go2rtcWsBaseUrl = go2rtcBaseUrl.replace(/^http/, 'ws');

app.set('trust proxy', true);

app.use((req: Request, res: Response, next: NextFunction) => {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const isHttps = req.secure || forwardedProto === 'https';
  const isLocalRequest = ['localhost', '127.0.0.1', '::1'].includes(req.hostname);

  if (!isHttps && !isLocalRequest && req.method === 'GET' && !req.path.startsWith('/.well-known/acme-challenge/')) {
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  }

  next();
});

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

const proxyGo2RtcHtml = async (req: Request, res: Response) => {
  try {
    const targetUrl = `${go2rtcBaseUrl}${req.originalUrl.replace(/^\/go2rtc/, '')}`;
    const response = await axios.get(targetUrl, {
      responseType: 'text',
      timeout: 10000,
      headers: {
        Accept: req.headers.accept || 'text/html,*/*',
      },
    });

    const rewrittenHtml = String(response.data).replace(
      /https:\/\/alexxit\.github\.io\/go2rtc\/manifest\.json/g,
      '/go2rtc/manifest.json'
    ).replace(
      './video-stream.js',
      '/go2rtc/video-stream.js?v=2'
    );

    res.setHeader('Content-Type', response.headers['content-type'] || 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(rewrittenHtml);
  } catch (error) {
    console.error('Erreur proxy go2rtc HTML:', error);
    res.status(502).send('go2rtc unavailable');
  }
};

app.get('/go2rtc/stream.html', proxyGo2RtcHtml);

app.get('/go2rtc/manifest.json', async (req: Request, res: Response) => {
  try {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(__dirname, '../public/manifest.json'));
  } catch (error) {
    console.error('Erreur proxy go2rtc manifest:', error);
    res.status(502).json({ error: 'go2rtc manifest unavailable' });
  }
});

app.get('/go2rtc/video-rtc.js', async (req: Request, res: Response) => {
  try {
    const targetUrl = `${go2rtcBaseUrl}/video-rtc.js`;
    const response = await axios.get(targetUrl, {
      responseType: 'text',
      timeout: 10000,
      headers: {
        Accept: 'text/javascript,*/*',
      },
    });

    const patchedScript = String(response.data)
      .replaceAll('this.ondata = null;', 'this.ondata = () => {};')
      .replace(
        "this.ws.addEventListener('message', ev => {\n              if (typeof ev.data === 'string') {\n                  const msg = JSON.parse(ev.data);\n                  for (const mode in this.onmessage) {\n                      this.onmessage[mode](msg);\n                  }\n              } else {\n                  this.ondata(ev.data);\n              }\n          });",
        "this.ws.addEventListener('message', ev => {\n              if (typeof ev.data === 'string') {\n                  try {\n                      const msg = JSON.parse(ev.data);\n                      for (const mode in this.onmessage) {\n                          this.onmessage[mode](msg);\n                      }\n                  } catch {\n                      if (typeof this.ondata === 'function') {\n                          this.ondata(ev.data);\n                      }\n                  }\n              } else if (typeof this.ondata === 'function') {\n                  this.ondata(ev.data);\n              }\n          });"
      );

    res.setHeader('Content-Type', response.headers['content-type'] || 'text/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(patchedScript);
  } catch (error) {
    console.error('Erreur proxy go2rtc video-rtc:', error);
    res.status(502).send('go2rtc unavailable');
  }
});

app.get('/go2rtc/video-stream.js', async (req: Request, res: Response) => {
  try {
    const targetUrl = `${go2rtcBaseUrl}/video-stream.js`;
    const response = await axios.get(targetUrl, {
      responseType: 'text',
      timeout: 10000,
      headers: {
        Accept: 'text/javascript,*/*',
      },
    });

    const patchedScript = String(response.data).replace(
      './video-rtc.js',
      '/go2rtc/video-rtc.js?v=2'
    );

    res.setHeader('Content-Type', response.headers['content-type'] || 'text/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(patchedScript);
  } catch (error) {
    console.error('Erreur proxy go2rtc video-stream:', error);
    res.status(502).send('go2rtc unavailable');
  }
});

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
  const publicOrigin = `${req.protocol}://${req.get('host')}`;

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
          <li>URL: <code>${publicOrigin}/overlay</code></li>
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

server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
  const requestUrl = req.url || '';
  if (!requestUrl.startsWith('/go2rtc/api/ws')) {
    socket.destroy();
    return;
  }

  wsServer.handleUpgrade(req, socket, head, (clientSocket: WebSocket) => {
    const queryStart = requestUrl.indexOf('?');
    const queryString = queryStart >= 0 ? requestUrl.slice(queryStart) : '';
    const targetWsUrl = `${go2rtcWsBaseUrl}/api/ws${queryString}`;
    const targetSocket = new WebSocket(targetWsUrl);

    targetSocket.on('open', () => {
        clientSocket.on('message', (data: RawData, isBinary: boolean) => {
          if (targetSocket.readyState === WebSocket.OPEN) {
            targetSocket.send(data, { binary: isBinary });
          }
        });
    });

      targetSocket.on('message', (data: RawData, isBinary: boolean) => {
        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.send(data, { binary: isBinary });
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
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || 'https://printer.mathilde.online';

  console.log(`
╔═══════════════════════════════════════════╗
║   🖨️  Klipper Overlay Server              ║
╠═══════════════════════════════════════════╣
║  Port:        ${config.server.port}                       ║
║  Moonraker:   ${config.moonraker.url.padEnd(24, ' ')}║
║  CORS:        ${config.server.corsEnabled ? 'Enabled' : 'Disabled'}                   ║
╠═══════════════════════════════════════════╣
║  Overlay:     ${publicBaseUrl}/overlay  ║
║  API:         ${publicBaseUrl}/api      ║
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
