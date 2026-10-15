import { z } from 'zod';

const optional = z
  .string()
  .nullish()
  .transform((value) => value?.trim() || undefined);

const list = <T extends z.ZodType>(item: T) =>
  z
    .array(item)
    .nullish()
    .transform((value) => value ?? []);

const strings = list(z.string().transform((value) => value.trim())).transform(
  (items) => items.filter(Boolean)
);

export const ExtractedResumeSchema = z.object({
  basics: z
    .object({
      fullName: optional,
      email: optional,
      phone: optional,
      location: optional,
    })
    .nullish()
    .transform(
      (value) =>
        value ?? {
          fullName: undefined,
          email: undefined,
          phone: undefined,
          location: undefined,
        }
    ),
  links: z
    .object({
      github: optional,
      linkedin: optional,
      portfolio: optional,
      other: list(z.object({ label: optional, url: optional })),
    })
    .nullish()
    .transform(
      (value) =>
        value ?? {
          github: undefined,
          linkedin: undefined,
          portfolio: undefined,
          other: [],
        }
    ),
  headline: optional,
  summary: optional,
  education: list(
    z.object({
      institution: optional,
      area: optional,
      qualification: optional,
      location: optional,
      endDate: optional,
    })
  ),
  experience: list(
    z.object({
      title: optional,
      company: optional,
      location: optional,
      startDate: optional,
      endDate: optional,
      tagline: optional,
      url: optional,
      bullets: strings,
    })
  ),
  projects: list(
    z.object({
      name: optional,
      technologies: strings,
      url: optional,
      description: optional,
    })
  ),
  skills: list(z.object({ group: optional, items: strings })),
  hobbies: strings,
  certifications: list(
    z.object({
      name: optional,
      issuer: optional,
      date: optional,
      url: optional,
    })
  ),
  languages: list(z.object({ language: optional, proficiency: optional })),
  awards: list(z.object({ title: optional, issuer: optional, date: optional })),
});

export type ExtractedResume = z.infer<typeof ExtractedResumeSchema>;
