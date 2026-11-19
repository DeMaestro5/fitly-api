import type { Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const common = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' },
} as const;

// Signed-in users are counted by account; anything else falls back to IP.
const byUser = (req: Request) => req.user?.id ?? ipKeyGenerator(req.ip ?? '');

export const tailorRateLimit = rateLimit({
  ...common,
  windowMs: 60_000,
  limit: 10,
  keyGenerator: byUser,
});

export const renderRateLimit = rateLimit({
  ...common,
  windowMs: 60_000,
  limit: 20,
  keyGenerator: byUser,
});

export const loginRateLimit = rateLimit({
  ...common,
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true, // only failed attempts count
});

export const registerRateLimit = rateLimit({
  ...common,
  windowMs: 60 * 60_000,
  limit: 5,
});

export const refreshRateLimit = rateLimit({
  ...common,
  windowMs: 60_000,
  limit: 30,
});
