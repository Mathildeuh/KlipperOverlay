import { Router, Request, Response } from 'express';
import { moonrakerService } from '../services/moonraker.service';

const router = Router();

// Configuration de l'overlay (stockée en mémoire)
interface OverlayConfig {
  showThumbnail: boolean;
  showFilename: boolean;
  showProgress: boolean;
  showTemperatures: boolean;
  showTimes: boolean;
  showStatus: boolean;
}

const defaultConfig: OverlayConfig = {
  showThumbnail: true,
  showFilename: true,
  showProgress: true,
  showTemperatures: true,
  showTimes: true,
  showStatus: true,
};

let overlayConfig: OverlayConfig = { ...defaultConfig };

/**
 * GET /api/status
 * Retourne le status actuel de l'imprimante
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const status = await moonrakerService.getPrinterStatus();
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch printer status',
    });
  }
});

/**
 * GET /api/config
 * Retourne la configuration de l'overlay
 */
router.get('/config', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: overlayConfig,
  });
});

/**
 * POST /api/config
 * Met à jour la configuration de l'overlay
 */
router.post('/config', (req: Request, res: Response) => {
  try {
    const updates = req.body;
    
    // Valider et fusionner les updates
    overlayConfig = {
      ...overlayConfig,
      ...Object.keys(updates).reduce((acc, key) => {
        // Vérifier que la clé existe et que la valeur est un booléen
        if (key in overlayConfig && typeof updates[key] === 'boolean') {
          acc[key as keyof OverlayConfig] = updates[key];
        }
        return acc;
      }, {} as Partial<OverlayConfig>),
    };

    res.json({
      success: true,
      data: overlayConfig,
      message: 'Configuration mise à jour',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'Invalid configuration',
    });
  }
});

/**
 * POST /api/config/reset
 * Réinitialise la configuration par défaut
 */
router.post('/config/reset', (req: Request, res: Response) => {
  overlayConfig = { ...defaultConfig };
  res.json({
    success: true,
    data: overlayConfig,
    message: 'Configuration réinitialisée',
  });
});

/**
 * GET /health
 * Healthcheck simple
 */
router.get('/health', (req: Request, res: Response) => {
  const lastStatus = moonrakerService.getLastStatus();
  const isConnected = lastStatus && lastStatus.state !== 'disconnected';
  
  res.json({
    status: 'ok',
    moonraker: isConnected ? 'connected' : 'disconnected',
    timestamp: Date.now(),
  });
});

export default router;
