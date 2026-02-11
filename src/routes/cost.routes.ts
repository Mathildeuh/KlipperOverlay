import express, { Request, Response } from 'express';
import { printCostService } from '../services/print-cost.service';

const router = express.Router();

router.get('/current', async (req: Request, res: Response) => {
  try {
    const data = await printCostService.getLiveCosts();
    res.json(data);
  } catch (err) {
    console.error('GET /api/cost/current error:', (err as Error).message);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.get('/history', (req: Request, res: Response) => {
  try {
    const limit = parseInt((req.query.limit as string) || '50', 10);
    const data = printCostService.getHistory(limit);
    res.json(data);
  } catch (err) {
    console.error('GET /api/cost/history error:', (err as Error).message);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const s = printCostService.getById(id);
    if (!s) return res.status(404).json({ error: 'not_found' });
    res.json(s);
  } catch (err) {
    console.error('GET /api/cost/:id error:', (err as Error).message);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
