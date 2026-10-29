import type { Job } from '../schemas/job.schema';
import type { MasterResume } from '../schemas/resume.schema';
import { EMAIL_MAX_WORDS, EMAIL_MIN_WORDS } from '../services/email-rules';

export type EmailJob = Pick<
  Job,
  'title' | 'company' | 'descriptionText' | 'tags'
>;

const DESCRIPTION_LIMIT = 3000;

export function resumeToText(master: MasterResume): string {
  const { locked, tailorable } = master;
  const lines: string[] = [];
  if (tailorable.headline) lines.push(tailorable.headline);
  if (tailorable.summary) lines.push(tailorable.summary);

  for (const role of locked.experience) {
    lines.push(
      `${role.title}, ${role.company} (${role.startDate} to ${role.endDate})`,
    );
    const bullets =
      tailorable.experience.find((e) => e.id === role.id)?.bullets ?? [];
    for (const bullet of bullets) lines.push(`- ${bullet.text}`);
  }
  for (const project of locked.projects) {
    const description = tailorable.projects.find(
      (p) => p.id === project.id,
    )?.description;
    lines.push(
      `Project ${project.name} (${project.technologies.join(', ')})${description ? `: ${description}` : ''}`,
    );
  }
  for (const group of tailorable.skills) {
    lines.push(`${group.group}: ${group.items.join(', ')}`);
  }
  return lines.join('\n');
}

export function buildEmailPrompt(master: MasterResume, job: EmailJob) {
  const system = `You write short job application emails for one candidate.
Use ONLY facts found inside <resume>. Never invent skills, employers, numbers or achievements.

Rules:
- Body: plain text, about 120 words (never below ${EMAIL_MIN_WORDS} or above ${EMAIL_MAX_WORDS}), two short paragraphs.
- Paragraph 1: who the candidate is in one sentence, and why this role at this company fits.
- Paragraph 2: two concrete pieces of evidence from the resume that matter most for this job, then say the resume is attached and ask for a short conversation.
- Do NOT write a greeting, a sign-off or the candidate's name. They are added separately.
- No placeholders, no brackets, no filler such as "I am excited" or "passionate".
- Mention only technologies that appear in <resume>.
- Subject: under 80 characters and containing the role title.
- Do not use digits at all unless the exact number appears in <resume>.
- Write in first person as the candidate ("I"). Open with "I'm a ..." not "A ...". Use two short paragraphs separated by a blank line, about 110 words total.

Return ONLY a JSON object: {"subject": string, "body": string}`;

  const user = `<job>
Title: ${job.title}
Company: ${job.company === 'Location' ? 'not stated (do not name a company)' : job.company}
Tags: ${job.tags.join(', ') || 'none'}
Description:
${job.descriptionText.slice(0, DESCRIPTION_LIMIT)}
</job>

<resume>
${resumeToText(master)}
</resume>`;

  return { system, user };
}
