import type { MasterResume } from '../schemas/resume.schema';
import { escapeHtml as e } from '../utils/escape-html';
import { formatDate, formatRange } from '../utils/format-date';

const stripProtocol = (url: string) =>
  url.replace(/^https?:\/\//i, '').replace(/\/$/, '');

/**
 * Layout and pagination rules shared by every template that uses buildParts().
 * Templates only add the "look" (fonts, colours, headings) on top of this.
 */
export function baseCss(pageMargin: string): string {
  return `
  @page {
    size: A4;
    margin: ${pageMargin};
  }

  * {
    box-sizing: border-box;
  }

  html {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  body {
    margin: 0;
  }

  h1,
  h2,
  p,
  ul {
    margin: 0;
  }

  h2 {
    break-after: avoid;
    page-break-after: avoid;
  }

  .section-content {
    min-width: 0;
  }

  .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
  }

  .row > :first-child {
    flex: 1 1 auto;
    min-width: 0;
  }

  .meta {
    flex: 0 0 auto;
    max-width: 40%;
    text-align: right;
    white-space: nowrap;
  }

  .contact-item {
    display: inline-block;
    white-space: nowrap;
  }

  /* Roles may span pages; only the header stays attached to its first bullet. */
  .role {
    margin-top: 7px;
  }

  .role:first-of-type {
    margin-top: 0;
  }

  .role-head {
    break-inside: avoid;
    page-break-inside: avoid;
    break-after: avoid;
    page-break-after: avoid;
  }

  .tagline {
    overflow-wrap: anywhere;
  }

  .role-bullets {
    margin-top: 2px;
    padding-left: 15px;
  }

  .role-bullets li {
    margin: 1.5px 0;
    break-inside: avoid;
    page-break-inside: avoid;
    orphans: 2;
    widows: 2;
  }

  .project,
  .education-item,
  .skills p,
  .extra-item {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .project {
    margin-bottom: 3px;
  }

  .education-item {
    margin-bottom: 3px;
  }

  .skills p {
    margin: 2px 0;
  }

  .extra-item {
    margin-bottom: 2px;
  }
`;
}

export interface ResumeParts {
  /** Escaped full name. */
  fullName: string;
  /** Escaped headline, or '' when there is none. */
  headline: string;
  /** Contact entries (HTML), one per item. Wrap each in .contact-item. */
  contactItems: string[];
  /** Summary, experience, projects, skills, education and extras sections. */
  sections: string;
}

export function buildParts(resume: MasterResume): ResumeParts {
  const { locked, tailorable } = resume;
  const { basics, links } = locked;

  const contactItems = [
    basics.phone ? e(basics.phone) : '',
    basics.email ? e(basics.email) : '',
    basics.location ? e(basics.location) : '',
    ...[
      links.github,
      links.linkedin,
      links.portfolio,
      ...(links.other?.map((link) => link.url) ?? []),
    ]
      .filter((url): url is string => Boolean(url))
      .map((url) => `<a href="${e(url)}">${e(stripProtocol(url))}</a>`),
  ].filter(Boolean);

  const roles = locked.experience
    .map((role) => {
      const bullets =
        tailorable.experience.find((item) => item.id === role.id)?.bullets ??
        [];

      return `
        <div class="role">
          <div class="role-head">
            <div class="row">
              <span class="title">
                <span class="role-title">${e(role.title)}</span> &middot;
                <span class="company">${e(role.company)}</span>
              </span>
              <span class="meta">
                ${e(formatRange(role.startDate, role.endDate))}
              </span>
            </div>
            <div class="row">
              <span class="tagline">
                ${role.tagline ? e(role.tagline) : ''}
              </span>
              <span class="meta">${e(role.location)}</span>
            </div>
          </div>
          ${
            bullets.length
              ? `<ul class="role-bullets">${bullets
                  .map((bullet) => `<li>${e(bullet.text)}</li>`)
                  .join('')}</ul>`
              : ''
          }
        </div>
      `;
    })
    .join('');

  const projects = locked.projects
    .map((project) => {
      const description = tailorable.projects.find(
        (item) => item.id === project.id
      )?.description;

      const name = project.url
        ? `<a href="${e(project.url)}">${e(project.name)}</a>`
        : e(project.name);

      const technologies = e(project.technologies.join(', '));

      return `
        <p class="project">
          <span class="title">${name}</span>
          ${technologies ? `(${technologies})` : ''}
          ${description ? ` &mdash; ${e(description)}` : ''}
        </p>
      `;
    })
    .join('');

  const skills = tailorable.skills
    .map(
      (group) => `
        <p>
          <span class="skill-group">${e(group.group)}:</span>
          ${e(group.items.join(' · '))}
        </p>
      `
    )
    .join('');

  const education = locked.education
    .map((item) => {
      const title = [item.qualification, item.area].filter(Boolean).join(', ');
      const place = [item.institution, item.location]
        .filter(Boolean)
        .join(', ');

      return `
        <div class="row education-item">
          <span>
            <span class="title">${e(place)}</span>
            ${title ? ` &middot; ${e(title)}` : ''}
          </span>
          <span class="meta">${e(formatDate(item.endDate))}</span>
        </div>
      `;
    })
    .join('');

  const extraLine = (parts: (string | undefined)[]) =>
    `<p class="extra-item">${parts
      .filter(Boolean)
      .map((part) => e(part as string))
      .join(' &middot; ')}</p>`;

  const extras = [
    locked.certifications?.length
      ? `<h2>Certifications</h2>${locked.certifications
          .map((item) =>
            extraLine([
              item.name,
              item.issuer,
              item.date ? formatDate(item.date) : undefined,
            ])
          )
          .join('')}`
      : '',

    locked.awards?.length
      ? `<h2>Awards</h2>${locked.awards
          .map((item) =>
            extraLine([
              item.title,
              item.issuer,
              item.date ? formatDate(item.date) : undefined,
            ])
          )
          .join('')}`
      : '',

    locked.languages?.length
      ? `<h2>Languages</h2>${extraLine([
          locked.languages
            .map((language) =>
              language.proficiency
                ? `${language.language} (${language.proficiency})`
                : language.language
            )
            .join(' · '),
        ])}`
      : '',

    locked.hobbies?.length
      ? `<h2>Interests</h2>${extraLine([locked.hobbies.join(' · ')])}`
      : '',
  ].join('');

  const sections = `
    ${
      tailorable.summary
        ? `<h2>Summary</h2>
           <div class="section-content"><p>${e(tailorable.summary)}</p></div>`
        : ''
    }

    <h2>Experience</h2>
    <section class="section-content">${roles}</section>

    ${
      projects
        ? `<h2>Projects</h2>
           <section class="section-content">${projects}</section>`
        : ''
    }

    ${
      skills
        ? `<h2>Skills</h2>
           <section class="skills section-content">${skills}</section>`
        : ''
    }

    <h2>Education</h2>
    <section class="section-content">${education}</section>

    ${extras}
  `;

  return {
    fullName: e(basics.fullName),
    headline: tailorable.headline ? e(tailorable.headline) : '',
    contactItems,
    sections,
  };
}

/** Wraps a template's CSS and body in a complete HTML document. */
export function renderDocument(
  resume: MasterResume,
  css: string,
  body: string
): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${e(resume.locked.basics.fullName)} - Resume</title>
  <style>${css}</style>
</head>
<body>
${body}
</body>
</html>`;
}
