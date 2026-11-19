import { ZodError } from 'zod';
import {
  MasterResumeSchema,
  type MasterResume,
} from '../schemas/resume.schema';
import { AppError } from '../utils/AppError';
import { query } from './db';

export interface ResumeRepository {
  get(userId: string): Promise<MasterResume | null>;
  save(userId: string, resume: MasterResume): Promise<void>;
  listAll(): Promise<{ userId: string; resume: MasterResume }[]>;
}

function parseStored(data: unknown): MasterResume {
  try {
    return MasterResumeSchema.parse(data);
  } catch (err) {
    if (err instanceof ZodError) {
      throw new AppError(500, 'Stored master resume is corrupted');
    }
    throw err;
  }
}

export function createResumeRepository(): ResumeRepository {
  return {
    async get(userId) {
      const rows = await query<{ data: unknown }>(
        'SELECT data FROM master_resumes WHERE user_id = $1',
        [userId],
      );
      return rows[0] ? parseStored(rows[0].data) : null;
    },

    async save(userId, resume) {
      await query(
        `INSERT INTO master_resumes (user_id, data) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, updated_at = now()`,
        [userId, JSON.stringify(resume)],
      );
    },

    async listAll() {
      const rows = await query<{ userId: string; data: unknown }>(
        'SELECT user_id AS "userId", data FROM master_resumes',
      );
      const result: { userId: string; resume: MasterResume }[] = [];
      for (const row of rows) {
        try {
          result.push({ userId: row.userId, resume: parseStored(row.data) });
        } catch (err) {
          console.warn(
            `[resume] skipping corrupted resume for ${row.userId}`,
            err,
          );
        }
      }
      return result;
    },
  };
}
