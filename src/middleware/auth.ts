import { RequestHandler, Request } from 'express';
import { verifyAccessToken } from '../services/token-service';
import { AppError } from '../utils/AppError';

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer') ? header.slice(7) : undefined;
  const userId = token ? verifyAccessToken(token) : null;
  if (!userId) throw new AppError(401, 'Authentication required');
  req.user = { id: userId };
  next();
};

export function userIdOf(req: Request): string {
  if (!req.user) throw new AppError(401, 'Authentication required');
  return req.user.id;
}
