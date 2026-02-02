import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { moonrakerService } from '../services/moonraker.service';

export class WebSocketManager {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private updateInterval: NodeJS.Timeout | null = null;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('✅ Client WebSocket connecté');
      this.clients.add(ws);

      // Envoyer les données immédiatement à la connexion
      this.sendStatusToClient(ws);

      ws.on('close', () => {
        console.log('❌ Client WebSocket déconnecté');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('Erreur WebSocket:', error);
        this.clients.delete(ws);
      });
    });

    // Démarrer les updates périodiques
    this.startUpdates();
  }

  private startUpdates() {
    // Envoyer les mises à jour toutes les 500ms (au lieu de 5000ms avec polling)
    this.updateInterval = setInterval(async () => {
      if (this.clients.size === 0) return;

      const status = await moonrakerService.getPrinterStatus();
      this.broadcast({
        type: 'status',
        data: status
      });
    }, 500);
  }

  private async sendStatusToClient(ws: WebSocket) {
    try {
      const status = await moonrakerService.getPrinterStatus();
      ws.send(JSON.stringify({
        type: 'status',
        data: status
      }));
    } catch (error) {
      console.error('Erreur envoi status:', error);
    }
  }

  private broadcast(message: any) {
    const data = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  public notifyPrintComplete(filename: string) {
    this.broadcast({
      type: 'print_complete',
      data: { filename, timestamp: Date.now() }
    });
  }

  public notifyPrinterOnline() {
    this.broadcast({
      type: 'printer_online',
      data: { timestamp: Date.now() }
    });
  }

  public destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.wss.close();
  }
}
