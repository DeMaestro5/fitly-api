import type { MasterResume } from '../schemas/resume.schema';
import { baseCss, buildParts, renderDocument } from './shared';
import type { ResumeTemplate } from './types';

const CSS = `
  ${baseCss('11mm 13mm')}

  :root {
    --navy: #12263f;
    --teal: #0f766e;
    --muted: #4b5563;
  }

  body {
    font-family: Helvetica, Arial, sans-serif;
    font-size: 9.3pt;
    line-height: 1.34;
    color: #111827;
  }

  header {
    padding: 13px 16px 12px;
    border-radius: 3px;
    background: var(--navy);
    color: #fff;
  }

  h1 {
    font-size: 24pt;
    line-height: 1.1;
    font-weight: 700;
    letter-spacing: 0.3px;
  }

  .headline {
    margin-top: 4px;
    font-size: 10.6pt;
    color: #9fc4e8;
  }

  .contact {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 16px;
    margin-top: 8px;
    font-size: 8.6pt;
    line-height: 1.5;
    color: #dbe6f3;
  }

  header a {
    color: #fff;
    text-decoration: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.45);
  }

  a {
    color: var(--teal);
    text-decoration: none;
  }

  h2 {
    margin: 13px 0 5px;
    padding-bottom: 2px;
    border-bottom: 1.5px solid var(--navy);
    font-size: 10pt;
    line-height: 1.2;
    font-weight: 800;
    letter-spacing: 1.1px;
    text-transform: uppercase;
    color: var(--navy);
  }

  .title {
    font-weight: 700;
  }

  .company {
    color: var(--teal);
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
    color: var(--teal);
  }

  .skill-group {
    font-weight: 700;
    color: var(--navy);
  }
`;

export function renderBanner(resume: MasterResume): string {
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

export const banner: ResumeTemplate = {
  id: 'banner',
  name: 'Banner',
  render: renderBanner,
};
