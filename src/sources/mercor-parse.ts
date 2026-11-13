import { z } from 'zod';
import {
  makeJobId,
  SourceJobSchema,
  type RemoteType,
  type SourceJob,
} from '../schemas/job.schema';

// Set to false to keep every Mercor category (law, medicine, ...), not just tech.
export const TECH_ONLY = true;

const TECH_DOMAIN =
  /software|data|machine learning|computer|devops|security|cyber/i;
const TECH_TITLE =
  /(software|developer|programmer|back-?end|front-?end|full[- ]?stack|devops|\bsre\b|\bswe\b|machine learning|data (?:engineer|scientist)|python|javascript|typescript|react|node\.?js)/i;
// Listings that exclude your country are dropped, because you cannot take them.
const MY_COUNTRY = /^(?:nga|ng|nigeria)$/i;
const WORLDWIDE = /\b(?:worldwide|anywhere|global)\b/i;

export const MercorListingSchema = z
  .object({
    listingId: z.string().min(1),
    title: z.string().min(1),
    description: z.string().nullish(),
    commitment: z.string().nullish(),
    rateMin: z.number().nullish(),
    rateMax: z.number().nullish(),
    payRateFrequency: z.string().nullish(),
    location: z.string().nullish(),
    workArrangement: z.string().nullish(),
    eligibleLocation: z.unknown(),
    eligibleResidenceLocation: z.unknown(),
    ineligibleLocation: z.unknown(),
    ineligibleResidenceLocation: z.unknown(),
    companyName: z.string().nullish(),
    listingDomain: z.string().nullish(),
    postedAt: z.string().nullish(),
    createdAt: z.string().nullish(),
    status: z.string().nullish(),
    deletedAt: z.string().nullish(),
    isPrivate: z.boolean().nullish(),
    disableApplications: z.boolean().nullish(),
  })
  .passthrough();

export type MercorListing = z.infer<typeof MercorListingSchema>;

// The four country fields can be null, empty or a list; read them all the same way.
function toList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    : [];
}

// Mercor sends dates without a timezone ("2026-11-11T08:10:24"); treated as UTC.
function toIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  const time = Date.parse(hasZone ? value : `${value}Z`);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

// Descriptions are markdown; the detail panel shows plain text.
function plainText(markdown: string): string {
  return markdown
    .replace(/\r/g, '')
    .replace(/^#{1,6}[ \t]*/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/^[ \t]*[-*][ \t]+/gm, '• ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\\([\\`*_{}[\]()#+.!>-])/g, '$1')
    .trim();
}

function salaryText(listing: MercorListing): string | null {
  const min = listing.rateMin ?? null;
  const max = listing.rateMax ?? null;
  if (!min && !max) return null;
  const unit =
    listing.payRateFrequency && listing.payRateFrequency !== 'hourly'
      ? `/${listing.payRateFrequency}`
      : '/hr';
  const range =
    min && max && min !== max ? `$${min}-$${max}` : `$${max ?? min}`;
  return `${range}${unit}`;
}

function remoteTypeOf(value: string | null | undefined): RemoteType {
  const text = (value ?? '').toLowerCase();
  if (text === 'remote') return 'remote';
  if (text === 'hybrid') return 'hybrid';
  if (text === 'onsite' || text === 'on-site' || text === 'in-person')
    return 'onsite';
  return 'unknown';
}

const EMPLOYMENT: Record<string, string> = {
  'full-time': 'Full time',
  'part-time': 'Part time',
  hourly: 'Hourly contract',
};

// Returns null for listings that are closed, not tech, or exclude your country.
export function parseMercorListing(listing: MercorListing): SourceJob | null {
  if (listing.status && listing.status !== 'active') return null;
  if (listing.deletedAt || listing.isPrivate || listing.disableApplications)
    return null;

  const title = listing.title.trim();
  const domain = listing.listingDomain?.trim() || null;
  if (
    TECH_ONLY &&
    !(domain && TECH_DOMAIN.test(domain)) &&
    !TECH_TITLE.test(title)
  ) {
    return null;
  }

  const eligible = [
    ...new Set([
      ...toList(listing.eligibleLocation),
      ...toList(listing.eligibleResidenceLocation),
    ]),
  ];
  const excluded = [
    ...toList(listing.ineligibleLocation),
    ...toList(listing.ineligibleResidenceLocation),
  ];
  if (excluded.some((code) => MY_COUNTRY.test(code))) return null;

  const place = listing.location?.trim() || null;
  const worldwide =
    eligible.length === 0 &&
    place !== null &&
    (WORLDWIDE.test(place) || /^remote$/i.test(place));
  const shown = eligible.slice(0, 6).join(', ');
  const regionNote =
    eligible.length > 0
      ? `Open to: ${shown}${eligible.length > 6 ? ` +${eligible.length - 6}` : ''}`
      : null;

  const url = `https://work.mercor.com/jobs/${listing.listingId}`;
  const commitment = listing.commitment ?? '';

  return SourceJobSchema.parse({
    id: makeJobId('mercor', listing.listingId),
    source: 'mercor',
    sourceUrl: url,
    applyUrl: url,
    applyEmail: null,
    title: title.slice(0, 140),
    company: listing.companyName?.trim() || 'Mercor', // hidden on many listings
    location: worldwide ? 'Worldwide' : place,
    regionNote,
    remoteType: remoteTypeOf(listing.workArrangement),
    employmentType: EMPLOYMENT[commitment] ?? null,
    salaryText: salaryText(listing),
    tags: domain ? [domain] : [],
    descriptionText: plainText(listing.description ?? ''),
    postedAt: toIso(listing.postedAt ?? listing.createdAt),
  });
}
