import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import axios from 'axios';
import { config } from './config';
import apiRoutes from './routes/api.routes';

const app: Express = express();

// Middleware
if (config.server.corsEnabled) {
  app.use(cors());
}
app.use(express.json());
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

// Proxy pour la webcam (streaming MJPEG)
app.get('/webcam/*', async (req: Request, res: Response) => {
  try {
    const path = req.params[0];
    // La webcam est sur le serveur web principal, pas sur Moonraker
    // On extrait l'host/port de l'URL Moonraker et on utilise le même host mais port 80
    const moonrakerUrl = new URL(config.moonraker.url);
    const webcamHost = moonrakerUrl.hostname;
    
    // Construire l'URL vers la vraie webcam
    const webcamPath = path ? `/${path}` : '';
    const webcamUrl = `http://${webcamHost}/webcam${webcamPath}`;
    
    console.log(`🎥 Proxy webcam vers: ${webcamUrl}`);

    const response = await axios.get(webcamUrl, {
      responseType: 'stream',
      timeout: 10000,
      headers: {
        'Connection': 'keep-alive',
      },
    });

    // Transférer les headers de streaming
    res.setHeader('Content-Type', response.headers['content-type'] || 'multipart/x-mixed-replace');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }

    // Streamer directement
    response.data.pipe(res);

    // Gestion des erreurs du stream
    response.data.on('error', (err: any) => {
      console.error('Erreur stream webcam:', err.message);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Webcam stream error' });
      }
    });

  } catch (error) {
    console.error('Erreur lors du proxy webcam:', error);
    if (!res.headersSent) {
      res.status(404).json({ error: 'Webcam not found' });
    }
  }
});

// Endpoint snapshot pour webcam (extrait un JPEG du stream MJPEG)
// Utile pour l'accès distant via img tags (plus fiable que le stream MJPEG brut)
app.get('/webcam/snapshot', async (req: Request, res: Response) => {
  try {
    const moonrakerUrl = new URL(config.moonraker.url);
    const webcamHost = moonrakerUrl.hostname;
    const snapshotUrl = `http://${webcamHost}/webcam/stream?action=snapshot`;
    
    console.log(`📸 Snapshot webcam depuis: ${snapshotUrl}`);

    const response = await axios.get(snapshotUrl, {
      responseType: 'arraybuffer',
      timeout: 5000,
    });

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(Buffer.from(response.data, 'binary'));

  } catch (error) {
    console.error('Erreur snapshot webcam:', error);
    if (!res.headersSent) {
      res.status(404).json({ error: 'Webcam snapshot not available' });
    }
  }
});

// Route pour l'overlay
app.get('/overlay', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/overlay.html'));
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

// Démarrage du serveur
app.listen(config.server.port, () => {
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
  process.exit(0);
});
