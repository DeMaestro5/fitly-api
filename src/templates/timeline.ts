import type { MasterResume } from '../schemas/resume.schema';
import { baseCss, buildParts, renderDocument } from './shared';
import type { ResumeTemplate } from './types';

const CSS = `
  ${baseCss('13mm 15mm')}

  :root {
    --gutter: 40mm;
    --gap: 14px;
    --muted: #6b7280;
  }

  body {
    font-family: Helvetica, Arial, sans-serif;
    font-size: 9.3pt;
    line-height: 1.38;
    color: #1f2937;
  }

  h1 {
    font-size: 26pt;
    line-height: 1.1;
    font-weight: 300;
    letter-spacing: 0.5px;
  }

  .headline {
    margin-top: 4px;
    font-size: 10.6pt;
    color: var(--muted);
  }

  .contact {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 16px;
    margin-top: 8px;
    font-size: 8.6pt;
    line-height: 1.5;
    color: var(--muted);
  }

  a {
    color: inherit;
    text-decoration: underline;
    text-decoration-color: #c4c9d2;
  }

  h2 {
    margin: 15px 0 6px;
    font-size: 8.4pt;
    line-height: 1.2;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: var(--muted);
  }

  /* Content sits right of a date gutter; dates and locations hang in it. */
  .section-content {
    padding-left: var(--gutter);
  }

  .role-head,
  .education-item {
    margin-left: calc(-1 * var(--gutter));
  }

  .row {
    gap: var(--gap);
  }

  .role-head .meta,
  .education-item .meta {
    order: -1;
    flex: 0 0 calc(var(--gutter) - var(--gap));
    max-width: none;
    text-align: left;
    font-size: 8.6pt;
    color: var(--muted);
  }

  .title {
    font-weight: 700;
  }

  .company {
    font-weight: 400;
  }

  .tagline {
    font-style: italic;
    color: var(--muted);
  }

  .role-bullets {
    padding-left: 13px;
  }

  .skill-group {
    font-weight: 700;
  }
`;

export function renderTimeline(resume: MasterResume): string {
  const parts = buildParts(resume);

  const body = `
  <header>
    <h1>${parts.fullName}</h1>
    ${parts.headline ? `<p class="headline">${parts.headline}</p>` : ''}
    <p class="contact">${parts.contactItems
      .map((item) => `<span class="contact-item">${item}</span>`)
      .join(' ')}</p>
  </header>
  ${parts.sections}`;

  return renderDocument(resume, CSS, body);
}

export const timeline: ResumeTemplate = {
  id: 'timeline',
  name: 'Timeline',
  render: renderTimeline,
};
