import { z } from 'zod';

const EmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

const NewPasswordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .refine(
    (p) => Buffer.byteLength(p, 'utf8') <= 72,
    'Password is too long (72 bytes maximum)',
  );

export const RegisterSchema = z.object({
  email: EmailSchema,
  password: NewPasswordSchema,
  inviteCode: z.string().max(100).optional(),
});

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(128),
});
