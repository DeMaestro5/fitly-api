import {
  makeJobId,
  SourceJobSchema,
  type RemoteType,
  type SourceJob,
} from '../schemas/job.schema';
import { htmlToText } from '../utils/html';
import { decodeEntities } from './hn-parse';

export interface HnJobStoryInput {
  id: number;
  title: string;
  url: string | null;
  text: string | null;
  time: number | null; // unix seconds, as HN sends it
}

// "Nango (YC W23) Is Hiring Across Eng, FDE" -> company part, then what follows "hiring"
const HIRING_TITLE = /^(.+?)\s+(?:is\s+|are\s+)?hiring\b[\s:,–—-]*(.*)$/i;
const BATCH = /\(\s*(?:YC|Y Combinator)\s*([A-Za-z]?\d{2})?\s*\)/i;
const LEADING_FILLER =
  /^(?:an?\s+|the\s+|for\s+|across\s+|multiple\s+|our\s+)/i;
// Only a trailing "in Austin, TX" counts as a place. "in Office of CEO" does not.
const CITY_TAIL = /\s+in\s+([A-Z][A-Za-z.' -]+,\s*[A-Z]{2})\s*$/;
// ycombinator.com/companies/hazel-2/jobs/PpNKYBS-full-stack-engineer
const YC_JOB_SLUG = /\/companies\/[^/]+\/jobs\/[A-Za-z0-9]+-([a-z0-9-]+)/i;

function validUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return /^https?:$/.test(new URL(url).protocol) ? url : null;
  } catch {
    return null;
  }
}

function roleFromUrl(url: string | null): string | null {
  const match = url ? YC_JOB_SLUG.exec(url) : null;
  if (!match) return null;
  return match[1]
    .split('-')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function remoteTypeOf(text: string, hasCity: boolean): RemoteType {
  if (/\bremote\b/i.test(text)) return 'remote';
  if (hasCity || /\b(?:onsite|on-site|in[- ]person)\b/i.test(text))
    return 'onsite';
  if (/\bhybrid\b/i.test(text)) return 'hybrid';
  return 'unknown';
}

// Returns null for job posts whose title does not follow "<Company> is hiring ...".
export function parseHnJobStory(input: HnJobStoryInput): SourceJob | null {
  const title = decodeEntities(input.title).replace(/\s+/g, ' ').trim();
  const match = HIRING_TITLE.exec(title);
  if (!match) return null;

  const batchMatch = BATCH.exec(match[1]);
  const batch = batchMatch
    ? batchMatch[1]
      ? `YC ${batchMatch[1].toUpperCase()}`
      : 'YC'
    : null;
  const company = match[1].replace(BATCH, ' ').replace(/\s+/g, ' ').trim();
  if (!company) return null;

  const rest = ` ${match[2]}`;
  const city = CITY_TAIL.exec(rest)?.[1] ?? null;
  const role = rest
    .replace(CITY_TAIL, '')
    .trim()
    .replace(LEADING_FILLER, '')
    .replace(/[\s,;:.-]+$/g, '')
    .trim();
  const roleTitle =
    role || roleFromUrl(input.url) || 'Open roles (see careers page)';

  const sourceUrl = `https://news.ycombinator.com/item?id=${input.id}`;
  const body = input.text ? htmlToText(input.text) : '';
  const remoteType = remoteTypeOf(`${title} ${body}`, city !== null);

  const description =
    body ||
    `${company}${batch ? ` (${batch})` : ''} posted this job on Hacker News. ` +
      `It links to the company's careers page, where the open roles are listed.`;

  return SourceJobSchema.parse({
    id: makeJobId('hn', input.id),
    source: 'hn',
    sourceUrl,
    applyUrl: validUrl(input.url) ?? sourceUrl,
    applyEmail: null,
    title: roleTitle.slice(0, 140),
    company: company.slice(0, 80),
    location: city,
    regionNote: city ? `On-site: ${city}` : null,
    remoteType,
    employmentType: null,
    salaryText: null,
    tags: batch ? [batch] : [],
    descriptionText: description,
    postedAt: input.time ? new Date(input.time * 1000).toISOString() : null,
  });
}
