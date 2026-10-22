import { z } from 'zod';
import { JobSourceSchema, JobStatusSchema } from './job.schema';

export const JobScopeSchema = z.enum(['worldwide', 'limited', 'unknown']);

// Query strings always arrive as text, so numbers use z.coerce.
export const ListJobsQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  source: JobSourceSchema.optional(),
  status: JobStatusSchema.optional(),
  minScore: z.coerce.number().int().min(0).max(100).default(0),
  sinceDays: z.coerce.number().int().min(1).max(365).optional(),
  scope: JobScopeSchema.optional(),
  sort: z.enum(['score', 'posted']).default('score'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

// .strict() rejects unknown keys: a request with {"score": 100} is an error, not ignored.
export const PatchJobBodySchema = z
  .object({
    status: JobStatusSchema.optional(),
    notes: z.string().max(5000).nullable().optional(),
  })
  .strict()
  .refine((body) => body.status !== undefined || body.notes !== undefined, {
    message: 'Provide status and/or notes',
  });

// NOT z.coerce.boolean(): it turns the text "false" into true (any non-empty string is true).
export const RefreshQuerySchema = z.object({
  source: JobSourceSchema.optional(),
  force: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type ListJobsQuery = z.infer<typeof ListJobsQuerySchema>;
export type PatchJobBody = z.infer<typeof PatchJobBodySchema>;
export type RefreshQuery = z.infer<typeof RefreshQuerySchema>;
