// For errors we raise ourselves. expose: false hides the message from the client.
export class AppError extends Error {
  constructor(message, status = 500, { expose = true } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.expose = expose;
  }
}

export function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

const GENERIC = 'Internal server error';

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  let status = 500;
  let message = GENERIC;

  if (err?.type === 'entity.parse.failed') {
    status = 400;
    message = 'Request body is not valid JSON';
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    message = 'Request body is too large';
  } else if (err?.name === 'CastError' || err?.name === 'ValidationError') {
    status = 400;
    message = 'Invalid request data';
  } else if (err?.name === 'MongooseServerSelectionError' || err?.name === 'MongoNetworkError') {
    status = 503;
    message = 'The database is temporarily unavailable';
  } else if (err instanceof AppError) {
    status = err.status;
    message = err.expose ? err.message : GENERIC;
  } else if (Number.isInteger(err?.status) && err.status >= 400 && err.status < 500) {
    status = err.status;
    message = err.expose ? err.message : 'Request could not be processed';
  }

  // Log the cause on the server only: message, never the request body or headers.
  if (status >= 500) console.error(`[error] ${req.method} ${req.path} -> ${status}: ${err?.message}`);
  res.status(status).json({ error: message });
}