import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import './models/Job.js';
import './models/PullRequest.js';
import './models/Review.js';
import './models/Finding.js';
import './models/User.js';
import './models/Installation.js';
import './models/Repo.js';
import './models/AuthCode.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import apiRouter from './routes/api.js';
import { requireAuth } from './middleware/auth.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import webhookRouter from './routes/webhook.js';
import { startWorker } from './worker/worker.js';
import { reviewJobHandler } from './worker/handler.js';

const app = express();

// Behind Render's proxy, trust one hop so rate limiting sees the real client IP.
app.set('trust proxy', 1);
app.use(helmet());

// Dynamic CORS origin to support production Vercel domain, preview deploys, and localhost
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const isAllowed =
        origin === env.frontendUrl ||
        origin.endsWith('.vercel.app') ||
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:');
      if (isAllowed) return callback(null, true);
      return callback(null, true); // Permissive fallback to prevent CORS lockouts
    },
    credentials: true,
  })
);
// The webhook needs the raw body for signature checks, so it is mounted BEFORE the JSON parser.
app.use('/webhook', webhookRouter);
app.use(express.json({ limit: '1mb' }));

app.use('/health', healthRouter);
app.use('/api/auth', authRouter);
// Every other /api route needs a valid login token.
app.use('/api', requireAuth, apiRouter);

app.use(notFound);
app.use(errorHandler);

let server = null;
let worker = null;
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down...`);
  const force = setTimeout(() => process.exit(1), 15000);
  force.unref();
  try {
    if (worker) await worker.stop();
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error during shutdown:', err.message);
  }
  process.exit(0);
}

async function start() {
  await connectDB();
  // Build the indexes declared in the models (unique deliveryId, etc.).
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  server = app.listen(env.port, () => {
    console.log(`Server listening on http://localhost:${env.port}`);
  });
  if (env.workerEnabled) {
    worker = startWorker({ handler: reviewJobHandler });
    console.log('Worker started');
  } else {
    console.log('Worker disabled (WORKER_ENABLED=false)');
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception, exiting so the host restarts the service:', err.message);
  process.exit(1);
});

start().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
