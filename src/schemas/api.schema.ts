import z from 'zod';
import { TailorableSchema } from './resume.schema';
import { IdSchema } from './common.schema';

export const ParseRequestSchema = z.object({
  text: z.string().trim().min(200).max(30000),
});

export const TailorRequestSchema = z.object({
  jobDescription: z.string().trim().min(50).max(60_000),
});

export const RenderRequestSchema = z.object({
  tailorable: TailorableSchema,
  templateId: IdSchema,
});

export type RenderRequest = z.infer<typeof RenderRequestSchema>;

export type TailorRequest = z.infer<typeof TailorRequestSchema>;
