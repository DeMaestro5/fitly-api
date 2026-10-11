import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError';

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', details: err.issues });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // Errors raised by the body parsers (invalid JSON, body too large)
  const parserError = err as { type?: string };
  if (parserError.type === 'entity.parse.failed') {
    res.status(400).json({
      error:
        'The request body is not valid JSON. If you are pasting a long text, send it as plain text (Content-Type: text/plain) or let JSON.stringify build the body.',
    });
    return;
  }
  if (parserError.type === 'entity.too.large') {
    res.status(413).json({ error: 'The request body is too large' });
    return;
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};
