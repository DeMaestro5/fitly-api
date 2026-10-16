import type { MasterResume } from '../schemas/resume.schema';
import { escapeHtml as e } from '../utils/escape-html';
import { formatDate, formatRange } from '../utils/format-date';
import type { ResumeTemplate } from './types';

const CSS = `
  @page {
    size: A4;
    margin: 11mm 13mm;
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
    font-family: Helvetica, Arial, sans-serif;
    font-size: 9.3pt;
    line-height: 1.3;
    color: #111;
  }

  h1 {
    margin: 0;
    font-size: 21pt;
    line-height: 1.15;
    letter-spacing: 0.2px;
    font-weight: 700;
  }

  p {
    margin: 0;
  }

  a {
    color: #174ea6;
    text-decoration: underline;
  }

  .headline {
    margin: 3px 0 0;
    font-size: 10.3pt;
    line-height: 1.3;
    color: #333;
  }

  .contact {
    margin: 5px 0 0;
    font-size: 8.6pt;
    line-height: 1.5;
    color: #333;
    display: flex;
    flex-wrap: wrap;
    gap: 0 16px;
  }

  .contact-item {
    white-space: nowrap;
  }

  .contact-item:not(:last-child)::after {
    content: '|';
    margin: 0 6px;
    color: #888;
  }

  h2 {
    margin: 10px 0 4px;
    padding-bottom: 2px;
    border-bottom: 1px solid #333;
    font-size: 10pt;
    line-height: 1.2;
    text-transform: uppercase;
    letter-spacing: 0.7px;
    break-after: avoid;
    page-break-after: avoid;
  }

  .section-content {
    min-width: 0;
  }

  /* Shared alignment for dates, locations, and role information. */
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

  .title {
    font-weight: 700;
  }

  .meta {
    flex: 0 0 auto;
    max-width: 40%;
    color: #333;
    text-align: right;
    white-space: nowrap;
  }

  /* Roles may span pages; only the header is kept with its first bullet. */
  .role {
    margin-top: 6px;
    break-inside: auto;
    page-break-inside: auto;
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
    margin: 1px 0 0;
    font-style: italic;
    color: #444;
    overflow-wrap: anywhere;
  }

  .role-bullets {
    margin: 2px 0 0;
    padding-left: 15px;
  }

  .role-bullets li {
    margin: 1.5px 0;
    padding-left: 0;
    break-inside: avoid;
    page-break-inside: avoid;
    orphans: 2;
    widows: 2;
  }

  .project {
    margin: 0 0 3px;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .education-item {
    margin-bottom: 3px;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .skills p {
    margin: 2px 0;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .extra-item {
    margin-bottom: 2px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
`;

const stripProtocol = (url: string) =>
  url.replace(/^https?:\/\//i, '').replace(/\/$/, '');

export function renderClassic(resume: MasterResume): string {
  const { locked, tailorable } = resume;
  const { basics, links } = locked;

  const contact = [
    basics.phone ? e(basics.phone) : '',
    basics.email ? e(basics.email) : '',
    basics.location ? e(basics.location) : '',
    ...[
      links.github,
      links.linkedin,
      links.portfolio,
      ...(links.other?.map((link) => link.url) ?? []),
    ]
      .filter(Boolean)
      .map((url) => `<a href="${e(url)}">${e(stripProtocol(url))}</a>`),
  ]
    .filter(Boolean)
    .map((item) => `<span class="contact-item">${item}</span>`)
    .join(' ');

  const roles = locked.experience
    .map((role) => {
      const bullets =
        tailorable.experience.find((item) => item.id === role.id)?.bullets ??
        [];

      const roleHeader = `
        <div class="role-head">
          <div class="row">
            <span class="title">
              ${e(role.title)} &middot; ${e(role.company)}
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
      `;

      return `
        <div class="role">
          ${roleHeader}
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
          <span class="title">${e(group.group)}:</span>
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

  const extras = [
    locked.certifications?.length
      ? `
        <h2>Certifications</h2>
        ${locked.certifications
          .map(
            (certification) => `
              <p class="extra-item">
                ${e(certification.name)}
                ${
                  certification.issuer
                    ? ` &middot; ${e(certification.issuer)}`
                    : ''
                }
                ${
                  certification.date
                    ? ` &middot; ${e(formatDate(certification.date))}`
                    : ''
                }
              </p>
            `
          )
          .join('')}
      `
      : '',

    locked.awards?.length
      ? `
        <h2>Awards</h2>
        ${locked.awards
          .map(
            (award) => `
              <p class="extra-item">
                ${e(award.title)}
                ${award.issuer ? ` &middot; ${e(award.issuer)}` : ''}
                ${award.date ? ` &middot; ${e(formatDate(award.date))}` : ''}
              </p>
            `
          )
          .join('')}
      `
      : '',

    locked.languages?.length
      ? `
        <h2>Languages</h2>
        <p class="extra-item">
          ${e(
            locked.languages
              .map((language) =>
                language.proficiency
                  ? `${language.language} (${language.proficiency})`
                  : language.language
              )
              .join(' · ')
          )}
        </p>
      `
      : '',

    locked.hobbies?.length
      ? `
        <h2>Interests</h2>
        <p class="extra-item">
          ${e(locked.hobbies.join(' · '))}
        </p>
      `
      : '',
  ].join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${e(basics.fullName)} - Resume</title>
  <style>${CSS}</style>
</head>
<body>
  <header>
    <h1>${e(basics.fullName)}</h1>

    ${
      tailorable.headline
        ? `<p class="headline">${e(tailorable.headline)}</p>`
        : ''
    }

    <p class="contact">${contact}</p>
  </header>

  ${
    tailorable.summary
      ? `
        <h2>Summary</h2>
        <div class="section-content">
          <p>${e(tailorable.summary)}</p>
        </div>
      `
      : ''
  }

  <h2>Experience</h2>
  <section class="section-content">
    ${roles}
  </section>

  ${
    projects
      ? `
        <h2>Projects</h2>
        <section class="section-content">
          ${projects}
        </section>
      `
      : ''
  }

  ${
    skills
      ? `
        <h2>Skills</h2>
        <section class="skills section-content">
          ${skills}
        </section>
      `
      : ''
  }

  <h2>Education</h2>
  <section class="section-content">
    ${education}
  </section>

  ${extras}
</body>
</html>`;
}

export const classic: ResumeTemplate = {
  id: 'classic',
  name: 'Classic',
  render: renderClassic,
};
