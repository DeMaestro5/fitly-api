import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { closeDb, getDb } from '../repo/db';
import {
  BoardEntrySchema,
  boardFromUrl,
  type BoardEntry,
} from '../sources/boards-parse';

const FILE = path.resolve(process.cwd(), 'data/company-boards.json');

const existing: BoardEntry[] = fs.existsSync(FILE)
  ? z.array(BoardEntrySchema).parse(JSON.parse(fs.readFileSync(FILE, 'utf8')))
  : [];
const known = new Set(existing.map((b) => `${b.ats}:${b.slug.toLowerCase()}`));

const rows = getDb().prepare('SELECT DISTINCT apply_url FROM jobs').all() as {
  apply_url: string;
}[];
const added: BoardEntry[] = [];
for (const { apply_url } of rows) {
  const found = boardFromUrl(apply_url);
  if (!found) continue;
  const key = `${found.ats}:${found.slug.toLowerCase()}`;
  if (known.has(key)) continue;
  known.add(key);
  added.push({ ats: found.ats, slug: found.slug });
}

fs.mkdirSync(path.dirname(FILE), { recursive: true });
fs.writeFileSync(FILE, JSON.stringify([...existing, ...added], null, 2) + '\n');

console.log(
  `Watch-list: ${existing.length} existing + ${added.length} new = ${existing.length + added.length}`,
);
for (const b of added) console.log(`  + ${b.ats}: ${b.slug}`);
closeDb();
