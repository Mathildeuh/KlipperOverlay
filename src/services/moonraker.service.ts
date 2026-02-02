import axios, { AxiosError } from 'axios';
import WebSocket from 'ws';
import { config } from '../config';
import { PrinterStatus, MoonrakerQueryResponse } from '../types';

class MoonrakerService {
  private wsConnection: WebSocket | null = null;
  private wsReconnectTimer: NodeJS.Timeout | null = null;
  private lastStatus: PrinterStatus | null = null;
  private metadataCache: Map<string, { data: any; timestamp: number }> = new Map();

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
            gcode_metadata: '',
          },
          timeout: 5000,
        }
      );

      const status = response.data.result.status;
      
      // Calcul du temps restant
      let timeRemaining: number | null = null;
      let totalEstimated: number | null = null;

      // Essayer de récupérer le temps estimé total depuis les métadonnées
      if (status.print_stats?.filename) {
        const metadata = await this.getFileMetadata(status.print_stats.filename);
        if (metadata?.estimated_time) {
          totalEstimated = metadata.estimated_time;
        }
      }

      // Sinon utiliser le calcul basique
      if (!totalEstimated && status.print_stats && status.virtual_sdcard) {
        const progress = status.virtual_sdcard.progress || 0;
        const duration = status.print_stats.print_duration || 0;
        if (progress > 0 && progress < 1) {
          totalEstimated = Math.round(duration / progress);
        }
      }

      // Calculer le temps restant
      if (totalEstimated && status.print_stats?.print_duration) {
        timeRemaining = Math.round(totalEstimated - status.print_stats.print_duration);
        if (timeRemaining < 0) timeRemaining = 0;
      }

      // Récupération du thumbnail
      let thumbnail: string | null = null;
      if (status.print_stats?.filename) {
        thumbnail = await this.getThumbnail(status.print_stats.filename);
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
        thumbnail,
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
        thumbnail: null,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Récupère les métadonnées d'un fichier gcode (avec cache 30s)
   */
  private async getFileMetadata(filename: string): Promise<any | null> {
    try {
      const now = Date.now();
      
      // Vérifier le cache (30 secondes)
      const cached = this.metadataCache.get(filename);
      if (cached && now - cached.timestamp < 30000) {
        return cached.data;
      }

      const encodedFilename = encodeURIComponent(filename);
      const response = await axios.get(
        `${config.moonraker.url}/server/files/metadata?filename=${encodedFilename}`,
        { timeout: 3000 }
      );

      const result = response.data?.result || null;
      
      // Cacher le résultat
      if (result) {
        this.metadataCache.set(filename, { data: result, timestamp: now });
      }
      
      return result;
    } catch (error) {
      // Métadonnées non disponibles
      return null;
    }
  }

  /**
   * Récupère le thumbnail d'un fichier gcode
   */
  private async getThumbnail(filename: string): Promise<string | null> {
    try {
      // Utiliser les métadonnées déjà en cache
      const metadata = this.metadataCache.get(filename)?.data || 
                       await this.getFileMetadata(filename);
      
      if (!metadata?.thumbnails || metadata.thumbnails.length === 0) {
        return null;
      }

      // Préférer la plus grande image (généralement la dernière)
      const thumbnail = metadata.thumbnails[metadata.thumbnails.length - 1];
      
      // Si le thumbnail est en base64 (data:image/...)
      if (thumbnail.data) {
        return thumbnail.data;
      }
      
      // Si c'est une URL relative (format standard Moonraker)
      // relative_path est relatif au dossier du fichier gcode
      if (thumbnail.relative_path) {
        // Extraire le dossier du fichier
        const filePath = filename.substring(0, filename.lastIndexOf('/') + 1);
        const thumbPath = `${filePath}${thumbnail.relative_path}`;
        // Utiliser le proxy local au lieu de l'URL directe Moonraker
        // Cela permet l'accès à distance via redirection de port
        // Encode seulement le nom du fichier, pas les slashes du chemin
        const parts = thumbPath.split('/');
        const encodedParts = parts.map(part => encodeURIComponent(part));
        return `/thumbnail/${encodedParts.join('/')}`;
      }
    } catch (error) {
      // Thumbnail non disponible, ce n'est pas une erreur
      if (axios.isAxiosError(error)) {
        console.log(`⚠️ Pas de thumbnail pour: ${filename}`);
      }
    }
    
    return null;
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
    
    console.log(`📊 État Klipper reçu: "${state}" (${stateLower})`);
    
    if (stateLower === 'printing') return 'printing';
    if (stateLower === 'paused') return 'paused';
    if (stateLower === 'complete' || stateLower === 'standby' || stateLower === 'ready') return 'idle';
    if (stateLower === 'error' || stateLower === 'shutdown') return 'error';
    if (stateLower === 'cancelled') return 'idle';
    
    // Par défaut, si on ne reconnaît pas l'état, on retourne idle
    console.log(`⚠️ État inconnu: "${state}", défaut à idle`);
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
