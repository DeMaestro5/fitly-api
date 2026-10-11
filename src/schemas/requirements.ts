import { z } from 'zod';
import { text } from './common.schema';

export const RequirementsSchema = z.object({
  required: z.array(text(60)).max(40).default([]),
  preferred: z.array(text(60)).max(40).default([]),
});

export type Requirements = z.infer<typeof RequirementsSchema>;
