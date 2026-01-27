import { Router, Request, Response } from 'express';
import { moonrakerService } from '../services/moonraker.service';

const router = Router();

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
