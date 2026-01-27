import axios, { AxiosError } from 'axios';
import WebSocket from 'ws';
import { config } from '../config';
import { PrinterStatus, MoonrakerQueryResponse } from '../types';

class MoonrakerService {
  private wsConnection: WebSocket | null = null;
  private wsReconnectTimer: NodeJS.Timeout | null = null;
  private lastStatus: PrinterStatus | null = null;

  constructor() {
    this.initWebSocket();
  }

  /**
   * Récupère le status de l'imprimante via HTTP
   */
  async getPrinterStatus(): Promise<PrinterStatus> {
    try {
      const response = await axios.get<MoonrakerQueryResponse>(
        `${config.moonraker.url}/printer/objects/query`,
        {
          params: {
            heater_bed: '',
            extruder: '',
            print_stats: '',
            display_status: '',
            virtual_sdcard: '',
          },
          timeout: 5000,
        }
      );

      const status = response.data.result.status;
      
      // Calcul du temps restant (estimation basique)
      let timeRemaining: number | null = null;
      if (status.print_stats && status.virtual_sdcard) {
        const progress = status.virtual_sdcard.progress || 0;
        const duration = status.print_stats.print_duration || 0;
        if (progress > 0 && progress < 1) {
          timeRemaining = Math.round((duration / progress) - duration);
        }
      }

      const printerStatus: PrinterStatus = {
        state: this.mapPrintState(status.print_stats?.state || 'unknown'),
        progress: Math.round((status.virtual_sdcard?.progress || 0) * 100),
        filename: status.print_stats?.filename || null,
        extruderTemp: status.extruder?.temperature || 0,
        extruderTarget: status.extruder?.target || 0,
        bedTemp: status.heater_bed?.temperature || 0,
        bedTarget: status.heater_bed?.target || 0,
        timeRemaining,
        printDuration: status.print_stats?.print_duration || null,
        timestamp: Date.now(),
      };

      this.lastStatus = printerStatus;
      return printerStatus;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Erreur Moonraker:', error.message);
      }
      
      // Retourne un état "disconnected"
      return {
        state: 'disconnected',
        progress: 0,
        filename: null,
        extruderTemp: 0,
        extruderTarget: 0,
        bedTemp: 0,
        bedTarget: 0,
        timeRemaining: null,
        printDuration: null,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Initialise la connexion WebSocket pour les updates en temps réel
   */
  private initWebSocket() {
    try {
      const wsUrl = `${config.moonraker.wsUrl}/websocket`;
      console.log(`Connexion WebSocket à: ${wsUrl}`);
      
      this.wsConnection = new WebSocket(wsUrl);

      this.wsConnection.on('open', () => {
        console.log('✓ WebSocket connecté à Moonraker');
        
        // S'abonner aux updates de l'imprimante
        const subscribeMessage = {
          jsonrpc: '2.0',
          method: 'printer.objects.subscribe',
          params: {
            objects: {
              heater_bed: null,
              extruder: null,
              print_stats: null,
              display_status: null,
              virtual_sdcard: null,
            },
          },
          id: 1,
        };
        
        this.wsConnection?.send(JSON.stringify(subscribeMessage));
      });

      this.wsConnection.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          // Les updates arrivent ici, on peut les traiter si besoin
          // Pour l'instant on se contente du polling HTTP
        } catch (err) {
          console.error('Erreur parsing WebSocket message:', err);
        }
      });

      this.wsConnection.on('error', (error) => {
        console.error('Erreur WebSocket:', error.message);
      });

      this.wsConnection.on('close', () => {
        console.log('WebSocket déconnecté, reconnexion dans 5s...');
        this.wsConnection = null;
        
        // Auto-reconnect
        this.wsReconnectTimer = setTimeout(() => {
          this.initWebSocket();
        }, 5000);
      });
    } catch (error) {
      console.error('Impossible d\'initialiser WebSocket:', error);
    }
  }

  /**
   * Mappe l'état Klipper vers un état simplifié
   */
  private mapPrintState(state: string): PrinterStatus['state'] {
    const stateLower = state.toLowerCase();
    
    if (stateLower.includes('printing')) return 'printing';
    if (stateLower.includes('paused')) return 'paused';
    if (stateLower.includes('standby') || stateLower.includes('ready')) return 'idle';
    if (stateLower.includes('error')) return 'error';
    
    return 'idle';
  }

  /**
   * Retourne le dernier status connu (cache)
   */
  getLastStatus(): PrinterStatus | null {
    return this.lastStatus;
  }

  /**
   * Ferme les connexions proprement
   */
  close() {
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
    }
    if (this.wsConnection) {
      this.wsConnection.close();
    }
  }
}

export const moonrakerService = new MoonrakerService();
