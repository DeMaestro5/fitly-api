import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ZodError } from 'zod';
import {
  MasterResumeSchema,
  type MasterResume,
} from '../schemas/resume.schema';
import { AppError } from '../utils/AppError';

export interface ResumeRepository {
  get(): Promise<MasterResume | null>;
  save(resume: MasterResume): Promise<void>;
}

export function createFileResumeRepository(filePath: string): ResumeRepository {
  async function get(): Promise<MasterResume | null> {
    let raw: string;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
    try {
      return MasterResumeSchema.parse(JSON.parse(raw));
    } catch (err) {
      if (err instanceof ZodError || err instanceof SyntaxError) {
        throw new AppError(500, 'Stored master resume is corrupted');
      }
      throw err;
    }
  }

  async function save(resume: MasterResume): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp`;
    await writeFile(tempPath, JSON.stringify(resume, null, 2), 'utf8');
    await rename(tempPath, filePath); // atomic swap: a crash mid-write can't leave half a file
  }

  return { get, save };
}
