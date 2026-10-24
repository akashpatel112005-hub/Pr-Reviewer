import { Router } from 'express';
import mongoose from 'mongoose';

const router = Router();
const STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

router.get('/', (req, res) => {
  const state = mongoose.connection.readyState;
  const ok = state === 1;

  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'error',
    db: STATES[state] || 'unknown',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

export default router;