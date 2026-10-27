import z from 'zod';

export const JOB_SOURCES = [
  'himalayas',
  'remoteok',
  'wwr',
  'remotive',
  'jobicy',
  'arbeitnow',
  'hn',
  'ats',
] as const;

export const JobSourceSchema = z.enum(JOB_SOURCES);
export const RemoteTypeSchema = z.enum([
  'remote',
  'hybrid',
  'onsite',
  'unknown',
]);

export const JobStatusSchema = z.enum(['new', 'saved', 'applied', 'skipped']);

export const SourceJobSchema = z.object({
  id: z.string().min(1),
  source: JobSourceSchema,
  sourceUrl: z.string().url(),
  applyUrl: z.string().url(),
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().nullable(),
  regionNote: z.string().nullable(),
  remoteType: RemoteTypeSchema,
  employmentType: z.string().nullable(),
  salaryText: z.string().nullable(),
  tags: z.array(z.string()),
  descriptionText: z.string(),
  postedAt: z.string().nullable(),
  applyEmail: z.string().max(254).nullish(),
});

// What Fitly stores: source facts plus fields Fitly owns.
export const JobSchema = SourceJobSchema.extend({
  fetchedAt: z.string(),
  score: z.number().min(0).max(100),
  matched: z.array(z.string()),
  status: JobStatusSchema,
  notes: z.string().nullable(),
});

export type JobSourceId = z.infer<typeof JobSourceSchema>;
export type RemoteType = z.infer<typeof RemoteTypeSchema>;
export type JobStatus = z.infer<typeof JobStatusSchema>;
export type SourceJob = z.infer<typeof SourceJobSchema>;
export type Job = z.infer<typeof JobSchema>;

export const makeJobId = (
  source: JobSourceId,
  sourceId: string | number,
): string => `${source}:${sourceId}`;
