import z from 'zod';

export const text = (max: number) => z.string().trim().min(1).max(max);

export const IdSchema = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Use lowercase letters, numbers and single hyphens'
  );
export const PartialDateSchema = z
  .string()
  .regex(/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/, 'Use YYYY or YYYY-MM');

export const EndDateSchema = z.union([PartialDateSchema, z.literal('present')]);
export const HttpUrlSchema = z.url({ protocol: /^https?$/ });
