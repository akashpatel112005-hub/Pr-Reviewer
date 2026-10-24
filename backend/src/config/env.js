import dotenv from 'dotenv';

dotenv.config();

// Required in development and production
const required = ['MONGODB_URI', 'FRONTEND_URL'];
const missing = required.filter((key) => !process.env[key] || !process.env[key].trim());

if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('Add them to backend/.env (see .env.example).');
  process.exit(1);
}

// In production every secret must be present, and JWT_SECRET must be long enough to be safe.
if (process.env.NODE_ENV === 'production') {
  const prodRequired = [
    'JWT_SECRET',
    'GITHUB_WEBHOOK_SECRET',
    'GITHUB_APP_ID',
    'GITHUB_APP_PRIVATE_KEY',
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
    'LLM_API_KEY',
    'LLM_MODEL',
  ];
  const missingProd = prodRequired.filter((key) => !process.env[key] || !process.env[key].trim());
  if (missingProd.length > 0) {
    console.error(`Missing required production environment variables: ${missingProd.join(', ')}`);
    process.exit(1);
  }
  if (process.env.JWT_SECRET.length < 32) {
    console.error('JWT_SECRET must be at least 32 characters in production.');
    process.exit(1);
  }
}

const port = Number(process.env.PORT) || 5000;

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port,
  mongoUri: process.env.MONGODB_URI,
  frontendUrl: (process.env.FRONTEND_URL || 'http://localhost:5173').trim().replace(/\/+$/, ''),
  backendUrl: (process.env.BACKEND_URL || `http://localhost:${port}`).trim().replace(/\/+$/, ''),
  githubAppId: process.env.GITHUB_APP_ID || '',
  githubAppSlug: process.env.GITHUB_APP_SLUG || '',
  githubAppPrivateKey: process.env.GITHUB_APP_PRIVATE_KEY || '',
  githubClientId: process.env.GITHUB_CLIENT_ID || '',
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET || '',
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
  githubToken: process.env.GITHUB_TOKEN || '', // optional legacy
  adminPassword: process.env.ADMIN_PASSWORD || '', // optional legacy
  llmApiKey: process.env.LLM_API_KEY || '',
  llmProvider: (process.env.LLM_PROVIDER || 'anthropic').trim().toLowerCase(),
  llmModel: process.env.LLM_MODEL || '',
  jwtSecret: process.env.JWT_SECRET || 'dev_jwt_secret_must_be_overridden_in_prod',
  workerEnabled: process.env.WORKER_ENABLED !== 'false',
};
