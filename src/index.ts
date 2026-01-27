import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
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

// Route pour l'overlay
app.get('/overlay', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/overlay.html'));
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
