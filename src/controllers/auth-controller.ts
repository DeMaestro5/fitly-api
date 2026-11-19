import type { CookieOptions, Request, Response } from 'express';
import type { z } from 'zod';
import { env } from '../config/env';
import { LoginSchema, RegisterSchema } from '../schemas/auth.schema';
import type { AuthResult, AuthService } from '../services/auth-service';
import { AppError } from '../utils/AppError';
import { userIdOf } from '../middleware/auth';

const REFRESH_COOKIE = 'fitly_rt';

const cookieBase: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production' || env.COOKIE_SAME_SITE === 'none',
  sameSite: env.COOKIE_SAME_SITE,
  path: '/api/auth',
};

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const message = result.error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
    .join('; ');
  throw new AppError(400, message);
}

function sendSession(res: Response, status: number, result: AuthResult) {
  res.cookie(REFRESH_COOKIE, result.refreshToken, {
    ...cookieBase,
    expires: result.refreshExpiresAt,
  });
  res
    .status(status)
    .json({ accessToken: result.accessToken, user: result.user });
}

export function createAuthController(service: AuthService) {
  return {
    register: async (req: Request, res: Response) => {
      const { email, password, inviteCode } = parse(RegisterSchema, req.body);
      sendSession(
        res,
        201,
        await service.register(email, password, inviteCode),
      );
    },

    login: async (req: Request, res: Response) => {
      const { email, password } = parse(LoginSchema, req.body);
      sendSession(res, 200, await service.login(email, password));
    },

    refresh: async (req: Request, res: Response) => {
      const token: unknown = req.cookies?.[REFRESH_COOKIE];
      if (typeof token !== 'string' || !token) {
        throw new AppError(401, 'Not signed in');
      }
      try {
        sendSession(res, 200, await service.refresh(token));
      } catch (err) {
        res.clearCookie(REFRESH_COOKIE, cookieBase);
        throw err;
      }
    },

    logout: async (req: Request, res: Response) => {
      const token: unknown = req.cookies?.[REFRESH_COOKIE];
      await service.logout(typeof token === 'string' ? token : undefined);
      res.clearCookie(REFRESH_COOKIE, cookieBase);
      res.status(204).end();
    },

    me: async (req: Request, res: Response) => {
      res.json({ user: await service.me(userIdOf(req)) });
    },
  };
}

export type AuthController = ReturnType<typeof createAuthController>;
