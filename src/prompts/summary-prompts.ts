import type { MasterResume } from '../schemas/resume.schema';
import type { Focus, JobSignals } from '../services/job-signals';
import type { PreparedPosting } from '../services/jobPosting-service';
import type { SummaryFacts } from '../services/summary-rules';

const FOCUS_GUIDANCE: Record<Focus, string> = {
  fullstack:
    'This is a full-stack role. Show balanced front-end and back-end strength and end-to-end ownership of features.',
  backend:
    'This is a back-end role. Lead with server-side work: APIs, databases, queues and reliability. Mention front-end work only briefly, if at all.',
  frontend:
    'This is a front-end role. Lead with user-interface work, component design and product quality. Mention back-end work only briefly, if at all.',
};

export function buildSummaryPrompt(input: {
  master: MasterResume;
  posting: PreparedPosting;
  signals: JobSignals;
  facts: SummaryFacts;
}): { system: string; user: string } {
  const { master, posting, signals, facts } = input;
  const { tailorable, locked } = master;

  const rules = [
    'Use ONLY facts found inside <candidate>. Never add technologies, tools, employers, numbers, certifications, seniority levels or years that are not there. Never mention a technology from the job unless it also appears in <candidate>.',
    'Attach each technology only to the work that <candidate> attaches it to. If something appears only in the skills list, mention it as a skill ("experience with ..."), never as something the candidate built, deployed or ran with.',
    'Avoid filler words such as "proven", "expertise", "diverse", "seasoned", "passionate", "innovative", "extensive" and "exceptional".',
    facts.yearsClaim
      ? `Keep the experience claim exactly as in the current summary ("${facts.yearsClaim}+ years").`
      : null,
    facts.founderOf
      ? `Mention that the candidate founded ${facts.founderOf}.`
      : null,
    'The summary has 3 to 5 sentences and at most 90 words. Write without first person (no "I", "my", "me"). No filler adjectives or buzzwords.',
    'The headline is one line of at most 12 words, parts separated by " · ", built only from roles and technologies found in <candidate>. No seniority words unless they appear in <candidate>.',
    'Do not copy sentences from the job. Tailor the emphasis: lead with the facts that matter most for this job and leave out what matters least.',
  ].filter((rule): rule is string => rule !== null);

  const system = `You write the headline and the professional summary at the top of a resume.
Return ONLY a JSON object: {"headline": string, "summary": string}.

Rules (an automatic checker rejects anything that breaks them):
${rules.map((rule, i) => `${i + 1}. ${rule}`).join('\n')}`;

  const requirements = posting.requirements;
  const jobLines = [
    `Title: ${posting.title ?? 'not stated'}`,
    FOCUS_GUIDANCE[signals.focus] +
      (signals.aiHeavy
        ? " The job also stresses AI: give the candidate's AI and automation experience extra prominence."
        : ''),
    requirements && requirements.required.length > 0
      ? `Required: ${requirements.required.slice(0, 20).join(', ')}`
      : null,
    requirements && requirements.preferred.length > 0
      ? `Preferred: ${requirements.preferred.slice(0, 20).join(', ')}`
      : null,
    requirements ? null : `Job text (excerpt): ${posting.text.slice(0, 1500)}`,
  ].filter((line): line is string => line !== null);

  const skillLines = tailorable.skills.map(
    (g) => `- ${g.group}: ${g.items.join(', ')}`,
  );
  const roleLines = locked.experience.map(
    (r) => `- ${r.title} at ${r.company}`,
  );

  const user = `<job>
${jobLines.join('\n')}
</job>

<candidate>
Current headline: ${tailorable.headline ?? '(none)'}
Current summary: ${tailorable.summary ?? '(none)'}
Skills:
${skillLines.join('\n')}
Roles:
${roleLines.join('\n')}
</candidate>`;

  return { system, user };
}
