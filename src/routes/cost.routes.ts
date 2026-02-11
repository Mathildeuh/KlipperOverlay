import { Router, Request, Response } from 'express';
import { printCostService } from '../services/print-cost.service';

const router = Router();

/**
 * GET /api/cost/current
 */
router.get('/current', async (req: Request, res: Response) => {
  try {
    const current = await printCostService.getCurrent();
    res.json({
      success: true,
      data: current,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch current cost',
    });
  }
});

/**
 * GET /api/cost/history?limit=50
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const limitRaw = req.query.limit as string | undefined;
    const parsed = Number(limitRaw);
    const limitBase = Number.isFinite(parsed) ? parsed : 50;
    const limit = Math.min(Math.max(limitBase, 1), 500);
    const history = await printCostService.getHistory(limit);

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cost history',
    });
  }
});

/**
 * GET /api/cost/:id
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const session = await printCostService.getById(req.params.id);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch session',
    });
  }
});

export default router;
