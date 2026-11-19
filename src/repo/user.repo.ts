import { query } from './db';

export interface PublicUser {
  id: string;
  email: string;
}

export interface UserWithHash extends PublicUser {
  passwordHash: string;
}

// Returns null when the email is already taken.
export async function createUser(
  email: string,
  passwordHash: string,
): Promise<PublicUser | null> {
  const rows = await query<PublicUser>(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email`,
    [email, passwordHash],
  );
  return rows[0] ?? null;
}

export async function findUserByEmail(
  email: string,
): Promise<UserWithHash | null> {
  const rows = await query<UserWithHash>(
    `SELECT id, email, password_hash AS "passwordHash" FROM users WHERE email = $1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<PublicUser | null> {
  const rows = await query<PublicUser>(
    'SELECT id, email FROM users WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}
