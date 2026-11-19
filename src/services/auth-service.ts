import bcrypt from 'bcrypt';
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import {
  createUser,
  findUserByEmail,
  findUserById,
  PublicUser,
} from '../repo/user.repo';
import {
  generateRefreshToken,
  hashToken,
  signAccessToken,
} from './token-service';
import { env } from '../config/env';
import {
  deleteExpiredTokens,
  findRefreshToken,
  insertRefreshToken,
  revokeFamily,
  revokeToken,
} from '../repo/refresh-tokens.repo';
import { AppError } from '../utils/AppError';

const BCRYPT_COST = 12;
const REUSE_GRACE_MS = 10_000;
const SESSION_ENDED = 'Session expired, please sign in again';

const DUMMY_HASH = bcrypt.hashSync(
  randomBytes(16).toString('hex'),
  BCRYPT_COST,
);

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

function sameSecret(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

async function issueSession(
  user: PublicUser,
  familyId: string = randomUUID(),
): Promise<AuthResult> {
  const { token, hash } = generateRefreshToken();
  const refreshExpiresAt = new Date(
    Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  await insertRefreshToken({
    userId: user.id,
    familyId,
    tokenHash: hash,
    expiresAt: refreshExpiresAt,
  });

  return {
    user,
    accessToken: signAccessToken(user.id),
    refreshToken: token,
    refreshExpiresAt,
  };
}

export function createAuthService() {
  return {
    async register(
      email: string,
      password: string,
      inviteCode?: string,
    ): Promise<AuthResult> {
      if (env.INVITE_CODE && !sameSecret(inviteCode ?? '', env.INVITE_CODE)) {
        throw new AppError(403, 'Invalid invite code');
      }
      const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
      const user = await createUser(email, passwordHash);
      if (!user) {
        throw new AppError(409, 'An account with this email already exists');
      }
      void deleteExpiredTokens().catch(() => undefined);
      return issueSession(user);
    },

    async login(email: string, password: string): Promise<AuthResult> {
      const found = await findUserByEmail(email);
      const ok = await bcrypt.compare(
        password,
        found?.passwordHash ?? DUMMY_HASH,
      );
      if (!found || !ok) throw new AppError(401, 'Invalid email or password');
      void deleteExpiredTokens().catch(() => undefined);
      return issueSession({ id: found.id, email: found.email });
    },

    async refresh(rawToken: string): Promise<AuthResult> {
      const stored = await findRefreshToken(hashToken(rawToken));
      if (!stored) throw new AppError(401, SESSION_ENDED);
      if (stored.revokedAt) {
        if (Date.now() - stored.revokedAt.getTime() > REUSE_GRACE_MS) {
          await revokeFamily(stored.familyId);
        }
        throw new AppError(401, SESSION_ENDED);
      }
      if (stored.expiresAt.getTime() <= Date.now()) {
        throw new AppError(401, SESSION_ENDED);
      }
      if (!(await revokeToken(stored.id)))
        throw new AppError(401, SESSION_ENDED);
      const user = await findUserById(stored.userId);
      if (!user) throw new AppError(401, SESSION_ENDED);
      return issueSession(user, stored.familyId);
    },

    async logout(rawToken: string | undefined): Promise<void> {
      if (!rawToken) return;
      const stored = await findRefreshToken(hashToken(rawToken));
      if (stored) await revokeFamily(stored.familyId);
    },

    async me(userId: string): Promise<PublicUser> {
      const user = await findUserById(userId);
      if (!user) throw new AppError(401, 'Authentication required');
      return user;
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
