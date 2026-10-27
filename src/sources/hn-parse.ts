import {
  makeJobId,
  SourceJobSchema,
  type RemoteType,
  type SourceJob,
} from '../schemas/job.schema';
import { htmlToText } from '../utils/html';

export interface HnPostInput {
  id: number;
  html: string;
  postedAt: string | null;
}

/* ------------------------------ thread helpers ------------------------------ */

export interface ThreadHit {
  objectID: string;
  title?: string | null;
}

// Only "Who is hiring?": the same account also posts "Who wants to be hired?" and a
// freelancer thread. Hits arrive newest first.
export function selectHiringThreads<T extends ThreadHit>(
  hits: T[],
  limit: number,
): T[] {
  return hits
    .filter((hit) => /^ask hn: who is hiring\?/i.test(hit.title ?? ''))
    .slice(0, limit);
}

// An unreadable date counts as fresh: better to show a job than to lose it.
export function isFreshEnough(
  createdAt: string | null | undefined,
  now: number,
  maxAgeDays: number,
): boolean {
  const time = createdAt ? Date.parse(createdAt) : NaN;
  return Number.isNaN(time) || now - time <= maxAgeDays * 24 * 60 * 60 * 1000;
}

/* ------------------------------ text helpers ------------------------------ */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

// HN stores slashes as &#x2F; and quotes as &#x27;, also inside link addresses.
export function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (match, body: string) => {
      if (body.startsWith('#')) {
        const hex = body[1] === 'x' || body[1] === 'X';
        const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
        return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? match;
    },
  );
}

const stripTags = (html: string): string =>
  decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

/* --------------------------------- links --------------------------------- */

// HN shortens long links in the visible text ("https://site.com/a/b..."), so the real
// address is read from href, never from the text.
function extractLinks(html: string): string[] {
  const links = new Set<string>();
  for (const match of html.matchAll(/href\s*=\s*"([^"]+)"/gi)) {
    const url = decodeEntities(match[1]).trim();
    if (!/^https?:\/\//i.test(url)) continue;
    try {
      void new URL(url);
      links.add(url);
    } catch {
      // not a valid address: ignore it
    }
  }
  return [...links];
}

const NOT_APPLY =
  /^https?:\/\/(?:[^/]*\.)?(?:news\.ycombinator\.com|twitter\.com|x\.com|facebook\.com|youtube\.com|youtu\.be|crunchbase\.com)(?:[/?#]|$)/i;
const NOT_APPLY_LINKEDIN =
  /^https?:\/\/(?:[^/]*\.)?linkedin\.com\/(?:in|company)\//i;
const APPLY_HINT =
  /(careers?|jobs?|apply|hiring|greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters|recruitee|bamboohr|wellfound|workatastartup)/i;

function pickApplyUrl(links: string[]): string | null {
  const usable = links.filter(
    (url) => !NOT_APPLY.test(url) && !NOT_APPLY_LINKEDIN.test(url),
  );
  return usable.find((url) => APPLY_HINT.test(url)) ?? usable[0] ?? null;
}

/* --------------------------------- emails --------------------------------- */

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const EMAIL_PREFERRED =
  /^(?:jobs?|careers?|hiring|talent|recruit(?:ing|ment|er)?|apply|hr|people|team|hello|work)@/i;

// "jobs [at] acme [dot] com" and "jobs (at) acme (dot) com" are common on HN.
function deobfuscate(text: string): string {
  return text
    .replace(/\s*[[(]\s*at\s*[\])]\s*/gi, '@')
    .replace(/\s*[[(]\s*dot\s*[\])]\s*/gi, '.');
}

function pickEmail(plain: string): string | null {
  const found = [
    ...new Set(
      (deobfuscate(plain).match(EMAIL) ?? []).map((e) => e.toLowerCase()),
    ),
  ];
  return found.find((email) => EMAIL_PREFERRED.test(email)) ?? found[0] ?? null;
}

/* ---------------------------------- header ---------------------------------- */

// The HN convention: "Company | Role | Location | REMOTE | Full-time | Salary".
const REMOTE_RE =
  /\b(?:remote|onsite|on-site|on site|hybrid|worldwide|anywhere|global|in[- ]person)\b/i;
const WORLDWIDE_RE =
  /\b(?:worldwide|anywhere|global|any time ?zone|all time ?zones)\b/i;
const RESTRICTION_RE =
  /\b(?:only|within|based in|must be|residents?|time ?zones?|tz|eu|us|usa|uk|europe|canada|americas|north america|latam|apac|emea|cet|est|pst|gmt|utc)\b/i;
const EMPLOYMENT_RE =
  /\b(?:full[- ]?time|part[- ]?time|contract(?:or)?|internship|intern|freelance|permanent)\b/i;
const EMPLOYMENT_G = new RegExp(EMPLOYMENT_RE.source, 'gi');
const ROLE_RE =
  /\b(?:engineers?|engineering|developers?|architects?|sre|devops|designers?|scientists?|managers?|leads?|analysts?|founding|cto|head of|researchers?|recruiters?|sales|support|marketing|product|programmers?|administrators?|specialists?|consultants?)\b/i;
const ROLE_PHRASE =
  /\b(?:(?:senior|staff|principal|lead|founding|junior|mid(?:-level)?|sr\.?)\s+)?(?:(?:full[\s-]?stack|back[\s-]?end|front[\s-]?end|software|platform|infrastructure|data|ml|machine learning|ai|devops|mobile|ios|android|security|site reliability|embedded|systems|web|cloud|product|ux|ui)\s+)+(?:engineer|developer|architect|designer|scientist)s?\b/i;
const SALARY_VALUE =
  /[$€£]\s?\d[\d,.]*\s?[kKmM]?(?:\s?(?:-|–|—|to)\s?[$€£]?\s?\d[\d,.]*\s?[kKmM]?)?/;
const SALARY_NOISE =
  /raised|funding|series|valuation|\barr\b|revenue|customers/i;
const NOT_LOCATION =
  /\b(?:series\s+[a-e]|seed|pre-seed|raised|funded|yc|y combinator|startup|stealth|b2b|b2c|saas|fintech|healthtech|biotech|ai|ml)\b/i;
const LOCATION_BAD =
  /\b(?:for|that|with|we|our|the|your|build|building|platform|software|tool|tools)\b/i;

const titleCase = (text: string): string =>
  text.replace(/\s+/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());

function roleFromText(text: string): string | null {
  const match = ROLE_PHRASE.exec(text);
  return match ? titleCase(match[0]) : null;
}

// A role part is short and names a job. "Payments for developers" is a tagline, not a role.
function isRolePart(part: string): boolean {
  if (ROLE_PHRASE.test(part)) return true;
  return (
    ROLE_RE.test(part) &&
    part.length <= 60 &&
    !/\b(?:for|that|to|with|we|our|the)\b/i.test(part)
  );
}

function splitHeader(header: string): string[] {
  const pipes = header
    .split(/\s*[|•·]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (pipes.length > 1) return pipes.slice(0, 10);
  const dashes = header
    .split(/\s+[-–—]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return dashes.length > 1 ? dashes.slice(0, 10) : [header];
}

function proseCompany(header: string): string {
  const match =
    /^(.{2,60}?)(?:\s+(?:is|are)\s+(?:hiring|looking)|\s*[:(,]|\s+[-–—]\s)/i.exec(
      header,
    );
  return match ? match[1] : header.split(' ').slice(0, 3).join(' ');
}

function splitCompany(raw: string): { name: string; place: string | null } {
  let place: string | null = null;
  let name = raw
    .replace(/\s*\(([^)]*)\)\s*/g, (_match, inner: string) => {
      const text = inner.trim();
      if (/^https?:\/\//i.test(text) || /\b(?:YC|Y Combinator)\b/i.test(text))
        return ' ';
      if (REMOTE_RE.test(text) || RESTRICTION_RE.test(text)) {
        if (!place) place = text;
        return ' ';
      }
      return ` (${text}) `;
    })
    .replace(/\s+/g, ' ')
    .trim();
  if (/^https?:\/\//i.test(name)) {
    try {
      name = new URL(name).hostname.replace(/^www\./, '');
    } catch {
      name = name.slice(0, 60);
    }
  }
  return {
    name: name.replace(/^[\s*_]+|[\s*_.,:;|-]+$/g, '').slice(0, 80),
    place,
  };
}

interface HeaderInfo {
  structured: boolean;
  company: string;
  roles: string[];
  locationText: string | null;
  salaryText: string | null;
}

function readHeader(header: string): HeaderInfo {
  const parts = splitHeader(header);
  const structured = parts.length > 1;
  const { name: company, place: companyPlace } = splitCompany(
    structured ? parts[0] : proseCompany(header),
  );

  const roles: string[] = [];
  const leftovers: string[] = [];
  let locationText: string | null = null;
  let salaryText: string | null = null;

  for (const part of structured ? parts.slice(1) : []) {
    if (isRolePart(part)) {
      roles.push(part);
      continue;
    }
    const salary = SALARY_VALUE.exec(part);
    if (salary && !SALARY_NOISE.test(part)) {
      if (!salaryText) salaryText = salary[0].trim();
      continue;
    }
    if (REMOTE_RE.test(part)) {
      if (!locationText) locationText = part;
      continue;
    }
    if (EMPLOYMENT_RE.test(part)) continue;
    leftovers.push(part);
  }
  if (!locationText && companyPlace) locationText = companyPlace;

  if (!locationText) {
    locationText =
      leftovers.find(
        (part) =>
          part.length <= 60 &&
          !/\d/.test(part) &&
          part.split(' ').length <= 4 &&
          !NOT_LOCATION.test(part) &&
          !LOCATION_BAD.test(part),
      ) ?? null;
  }
  return { structured, company, roles, locationText, salaryText };
}

/* -------------------------- remote type and place -------------------------- */

function remoteTypeOf(header: string, body: string): RemoteType {
  if (
    /\b(?:no remote|not remote|onsite only|on-site only|in[- ]office only)\b/i.test(
      `${header} ${body}`,
    )
  ) {
    return 'onsite';
  }
  if (/\bremote\b/i.test(header)) return 'remote';
  if (/\bhybrid\b/i.test(header)) return 'hybrid';
  if (/\b(?:onsite|on-site|on site|in[- ]person)\b/i.test(header))
    return 'onsite';
  if (/\bremote\b/i.test(body)) return 'remote';
  if (/\bhybrid\b/i.test(body)) return 'hybrid';
  return 'unknown';
}

const shorten = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max).replace(/\s+\S*$/, '')}…`;

const placeOf = (text: string): string =>
  text
    .replace(/\b(?:remote|onsite|on-site|on site|hybrid|in[- ]person)\b/gi, ' ')
    .replace(/[()\-–—:/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:or|and)\s+|\s+(?:or|and)$/gi, '') // "European time zones or" -> without "or"
    .replace(/^[,\s]+|[,\s]+$/g, '');

const cleanLocation = (text: string): string =>
  text
    .replace(EMPLOYMENT_G, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,/&-]+|[\s,/&-]+$/g, '');

function normalizeEmployment(raw: string): string {
  const t = raw.toLowerCase().replace(/[-\s]+/g, ' ');
  if (t.startsWith('full')) return 'Full time';
  if (t.startsWith('part')) return 'Part time';
  if (t.startsWith('contract')) return 'Contract';
  if (t.startsWith('intern')) return 'Internship';
  if (t.startsWith('freelance')) return 'Freelance';
  return 'Permanent';
}

/* --------------------------------- the job --------------------------------- */

// Returns null for comments that are not job posts (questions, thanks, replies).
export function parseHiringPost(input: HnPostInput): SourceJob | null {
  const chunks = input.html.split(/<p>/i).map(stripTags).filter(Boolean);
  const header = (chunks[0] ?? '').slice(0, 300);
  const plain = stripTags(input.html);
  if (plain.length < 120) return null;

  const body = plain.slice(0, 600);
  const info = readHeader(header);
  const looksLikeJob =
    info.structured ||
    ROLE_PHRASE.test(body) ||
    /\b(?:hiring|we are looking|we're looking|looking for|join us)\b/i.test(
      body,
    );
  if (!looksLikeJob || !info.company) return null;

  const title = (
    info.roles.slice(0, 2).join(' / ') ||
    roleFromText(header) ||
    roleFromText(body) ||
    'Open role (see post)'
  ).slice(0, 140);

  const remoteType = remoteTypeOf(header, body);

  const fullLocation = info.locationText
    ? cleanLocation(info.locationText)
    : '';
  let location: string | null = fullLocation
    ? shorten(fullLocation, 120)
    : null;
  let regionNote: string | null = null;
  if (fullLocation) {
    if (WORLDWIDE_RE.test(fullLocation)) {
      location = 'Worldwide';
    } else if (remoteType === 'remote') {
      const place = placeOf(fullLocation);
      regionNote =
        RESTRICTION_RE.test(fullLocation) && place
          ? `Open to: ${shorten(place, 80)}`
          : null;
    } else if (remoteType === 'onsite' || remoteType === 'hybrid') {
      const place = placeOf(fullLocation);
      regionNote = place
        ? `${remoteType === 'onsite' ? 'On-site' : 'Hybrid'}: ${shorten(place, 80)}`
        : null;
    }
  }

  const employment = EMPLOYMENT_RE.exec(header);
  const sourceUrl = `https://news.ycombinator.com/item?id=${input.id}`;

  return SourceJobSchema.parse({
    id: makeJobId('hn', input.id),
    source: 'hn',
    sourceUrl,
    // Email-only posts have no link, so "Open post" falls back to the HN comment itself.
    applyUrl: pickApplyUrl(extractLinks(input.html)) ?? sourceUrl,
    applyEmail: pickEmail(plain),
    title,
    company: info.company,
    location,
    regionNote,
    remoteType,
    employmentType: employment ? normalizeEmployment(employment[0]) : null,
    salaryText: info.salaryText,
    tags: [],
    descriptionText: htmlToText(input.html),
    postedAt: input.postedAt,
  });
}
