import { execute, query } from './db';

export interface StoredRefreshToken {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export async function insertRefreshToken(input: {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<void> {
  await query(
    `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [input.userId, input.familyId, input.tokenHash, input.expiresAt],
  );
}

export async function findRefreshToken(
  tokenHash: string,
): Promise<StoredRefreshToken | null> {
  const rows = await query<StoredRefreshToken>(
    `SELECT id, user_id AS "userId", family_id AS "familyId",
            expires_at AS "expiresAt", revoked_at AS "revokedAt"
     FROM refresh_tokens WHERE token_hash = $1`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

// True only for the one caller that actually flipped it (guards against two refreshes racing).
export async function revokeToken(id: string): Promise<boolean> {
  const changed = await execute(
    'UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL',
    [id],
  );
  return changed > 0;
}

export async function revokeFamily(familyId: string): Promise<void> {
  await execute(
    'UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL',
    [familyId],
  );
}

export async function deleteExpiredTokens(): Promise<void> {
  await execute(
    `DELETE FROM refresh_tokens WHERE expires_at < now() - interval '1 day'`,
  );
}
