import z from 'zod';
import { TailorableSchema } from './resume.schema';
import { IdSchema } from './common.scheme';

export const ParseRequestSchema = z.object({
  text: z.string().trim().min(200).max(30000),
});

export const TailorRequestSchema = z.object({
  text: z.string().trim().min(1).max(60000),
});

export const RenderRequestSchema = z.object({
  tailorable: TailorableSchema,
  templateId: IdSchema,
});
