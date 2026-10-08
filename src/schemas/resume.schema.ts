import { z } from 'zod';
import {
  EndDateSchema,
  HttpUrlSchema,
  IdSchema,
  PartialDateSchema,
  text,
} from './common.scheme';

/* ------------------------- LOCKED ------------------------- */
/* Never sent to the LLM, never accepted from it.              */

const BasicsSchema = z.object({
  fullName: text(100),
  email: z.email(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9()\s-]{7,20}$/, 'Invalid phone number'),
  location: text(120),
});

const LinksSchema = z.object({
  github: HttpUrlSchema,
  linkedin: HttpUrlSchema,
  portfolio: HttpUrlSchema,
  other: z
    .array(z.object({ label: text(40), url: HttpUrlSchema }))
    .max(5)
    .optional(),
});

const EducationSchema = z.object({
  institution: text(150),
  area: text(150),
  qualification: text(100).optional(),
  location: text(120).optional(),
  endDate: EndDateSchema,
});

const ExperienceFrameSchema = z
  .object({
    id: IdSchema,
    title: text(120),
    company: text(120),
    location: text(120),
    startDate: PartialDateSchema,
    endDate: EndDateSchema,
    tagline: text(300).optional(),
    url: HttpUrlSchema.optional(),
  })
  .refine(
    (role) => role.endDate === 'present' || role.endDate >= role.startDate,
    {
      message: 'endDate cannot be before startDate',
      path: ['endDate'],
    }
  );

const ProjectFrameSchema = z.object({
  id: IdSchema,
  name: text(120),
  technologies: z.array(text(60)).min(1).max(20),
  url: HttpUrlSchema.optional(), // some projects have no public link
});

export const LockedSchema = z.object({
  basics: BasicsSchema,
  links: LinksSchema,
  education: z.array(EducationSchema).min(1).max(6),
  experience: z.array(ExperienceFrameSchema).min(1).max(20),
  projects: z.array(ProjectFrameSchema).max(20).default([]),
  // Optional sections: absent today, accepted whenever a future resume has them
  hobbies: z.array(text(60)).max(15).optional(),
  certifications: z
    .array(
      z.object({
        name: text(150),
        issuer: text(150).optional(),
        date: PartialDateSchema.optional(),
        url: HttpUrlSchema.optional(),
      })
    )
    .max(20)
    .optional(),
  languages: z
    .array(z.object({ language: text(60), proficiency: text(60).optional() }))
    .max(10)
    .optional(),
  awards: z
    .array(
      z.object({
        title: text(150),
        issuer: text(150).optional(),
        date: PartialDateSchema.optional(),
      })
    )
    .max(20)
    .optional(),
});

/* ------------------------ TAILORABLE ------------------------ */
/* The only part the LLM sees and returns. Strict at every level, */
/* so any extra key in the model's output is rejected.            */

const BulletSchema = z.strictObject({ id: IdSchema, text: text(700) });

const TailorableExperienceSchema = z.strictObject({
  id: IdSchema, // matches a locked experience id
  bullets: z.array(BulletSchema).min(1).max(12),
});

const TailorableProjectSchema = z.strictObject({
  id: IdSchema, // matches a locked project id
  description: text(500),
});

const SkillGroupSchema = z.strictObject({
  id: IdSchema,
  group: text(60),
  items: z.array(text(60)).min(1).max(30),
});

export const TailorableSchema = z.strictObject({
  headline: text(150).optional(),
  summary: text(1200).optional(),
  experience: z.array(TailorableExperienceSchema).max(20).default([]),
  projects: z.array(TailorableProjectSchema).max(20).default([]),
  skills: z.array(SkillGroupSchema).max(10).default([]),
});

/* ---------------------- MASTER RESUME ---------------------- */

type Report = (path: (string | number)[], message: string) => void;

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) repeated.add(id);
    seen.add(id);
  }
  return [...repeated];
}

const MasterResumeBase = z.object({
  schemaVersion: z.literal(1),
  locked: LockedSchema,
  tailorable: TailorableSchema,
});

function checkIntegrity(
  resume: z.infer<typeof MasterResumeBase>,
  report: Report
): void {
  const { locked, tailorable } = resume;
  const roleIds = new Set(locked.experience.map((r) => r.id));
  const projectIds = new Set(locked.projects.map((p) => p.id));

  for (const id of duplicates(locked.experience.map((r) => r.id)))
    report(['locked', 'experience'], `Duplicate experience id: ${id}`);
  for (const id of duplicates(locked.projects.map((p) => p.id)))
    report(['locked', 'projects'], `Duplicate project id: ${id}`);
  for (const id of duplicates(tailorable.skills.map((s) => s.id)))
    report(['tailorable', 'skills'], `Duplicate skill group id: ${id}`);
  for (const id of duplicates(tailorable.experience.map((e) => e.id)))
    report(
      ['tailorable', 'experience'],
      `Duplicate tailorable experience id: ${id}`
    );

  tailorable.experience.forEach((entry, i) => {
    if (!roleIds.has(entry.id))
      report(
        ['tailorable', 'experience', i, 'id'],
        `No locked role with id "${entry.id}"`
      );
  });
  tailorable.projects.forEach((entry, i) => {
    if (!projectIds.has(entry.id))
      report(
        ['tailorable', 'projects', i, 'id'],
        `No locked project with id "${entry.id}"`
      );
  });

  const bulletIds = tailorable.experience.flatMap((e) =>
    e.bullets.map((b) => b.id)
  );
  for (const id of duplicates(bulletIds))
    report(['tailorable', 'experience'], `Duplicate bullet id: ${id}`);
}

export const MasterResumeSchema = MasterResumeBase.superRefine(
  (resume, ctx) => {
    checkIntegrity(resume, (path, message) =>
      ctx.addIssue({ code: 'custom', path, message })
    );
  }
);

export type Locked = z.infer<typeof LockedSchema>;
export type Tailorable = z.infer<typeof TailorableSchema>;
export type MasterResume = z.infer<typeof MasterResumeSchema>;
