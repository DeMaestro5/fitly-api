import type { MasterResume } from '../schemas/resume.schema';
import { baseCss, buildParts, renderDocument } from './shared';
import type { ResumeTemplate } from './types';

const CSS = `
  ${baseCss('12mm 14mm')}

  :root {
    --accent: #1f4e79;
    --ink: #1a1a1a;
    --muted: #555;
  }

  body {
    font-family: Helvetica, Arial, sans-serif;
    font-size: 9.4pt;
    line-height: 1.35;
    color: var(--ink);
  }

  header {
    padding-bottom: 8px;
    border-bottom: 2.5px solid var(--accent);
  }

  h1 {
    font-size: 25pt;
    line-height: 1.1;
    font-weight: 800;
    letter-spacing: -0.2px;
  }

  .headline {
    margin-top: 4px;
    font-size: 11pt;
    font-weight: 600;
    color: var(--accent);
  }

  .contact {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 16px;
    margin-top: 6px;
    font-size: 8.6pt;
    line-height: 1.5;
    color: var(--muted);
  }

  a {
    color: var(--accent);
    text-decoration: none;
  }

  h2 {
    margin: 13px 0 6px;
    padding: 1px 0 1px 8px;
    border-left: 3px solid var(--accent);
    font-size: 9.8pt;
    line-height: 1.25;
    font-weight: 800;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    color: var(--accent);
  }

  .title {
    font-weight: 700;
  }

  .company {
    color: var(--accent);
  }

  .tagline {
    margin-top: 1px;
    font-style: italic;
    color: var(--muted);
  }

  .meta {
    font-size: 8.8pt;
    color: var(--muted);
  }

  .role-bullets li::marker {
    color: var(--accent);
  }

  .skill-group {
    font-weight: 700;
    color: var(--accent);
  }
`;

export function renderModern(resume: MasterResume): string {
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

export const modern: ResumeTemplate = {
  id: 'modern',
  name: 'Modern',
  render: renderModern,
};
