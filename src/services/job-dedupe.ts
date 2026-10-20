import type { JobSourceId, SourceJob } from '../schemas/job.schema';

// Lower index wins when the same job shows up on several sources.
const SOURCE_PRIORITY: JobSourceId[] = [
  'ats',
  'hn',
  'himalayas',
  'jobicy',
  'remotive',
  'wwr',
  'remoteok',
  'arbeitnow',
];

const COMPANY_SUFFIX =
  /\b(inc|llc|ltd|limited|gmbh|corp|corporation|co|pvt|plc|ag|sa|bv)\b/g;

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');

export function dedupeKey(job: Pick<SourceJob, 'company' | 'title'>): string {
  const company = fold(job.company)
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(COMPANY_SUFFIX, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const title = fold(job.title)
    .replace(/\([^)]*\)/g, ' ') // (m/f/d), (Remote), ...
    .replace(/\bsr\b/g, 'senior')
    .replace(/\bjr\b/g, 'junior')
    .replace(/\bremote\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return `${company}|${title}`;
}

export interface DedupeRow {
  id: string;
  source: JobSourceId;
  salaryText: string | null;
  descLength: number;
  dedupeKey: string;
}

function rank(row: DedupeRow): [number, number, number] {
  const priority = SOURCE_PRIORITY.indexOf(row.source);
  return [
    row.salaryText ? 0 : 1,
    priority === -1 ? 99 : priority,
    -row.descLength,
  ];
}

function compare(a: DedupeRow, b: DedupeRow): number {
  const ra = rank(a);
  const rb = rank(b);
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] !== rb[i]) return ra[i] - rb[i];
  }
  return a.id.localeCompare(b.id);
}

// Returns duplicate id -> canonical id. Jobs missing from the map are canonical.
export function assignDuplicates(rows: DedupeRow[]): Map<string, string> {
  const groups = new Map<string, DedupeRow[]>();
  for (const row of rows) {
    if (row.dedupeKey.startsWith('|') || row.dedupeKey.endsWith('|')) continue; // empty company or title
    const group = groups.get(row.dedupeKey);
    if (group) group.push(row);
    else groups.set(row.dedupeKey, [row]);
  }

  const result = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // The same source appearing twice means we can't tell which opening matches: leave all visible.
    if (new Set(group.map((r) => r.source)).size !== group.length) continue;
    group.sort(compare);
    const [canonical, ...rest] = group;
    for (const row of rest) result.set(row.id, canonical.id);
  }
  return result;
}
