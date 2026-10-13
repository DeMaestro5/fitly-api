import type { MasterResume } from '../schemas/resume.schema';
import { baseCss, buildParts, renderDocument } from './shared';
import type { ResumeTemplate } from './types';

const CSS = `
  ${baseCss('13mm 16mm')}

  body {
    font-family: Georgia, 'Times New Roman', Times, serif;
    font-size: 10pt;
    line-height: 1.34;
    color: #1b1b1b;
  }

  header {
    text-align: center;
  }

  h1 {
    font-size: 24pt;
    line-height: 1.15;
    font-weight: 400;
    letter-spacing: 3px;
    text-transform: uppercase;
  }

  .headline {
    margin-top: 4px;
    font-size: 10.8pt;
    font-style: italic;
    color: #444;
  }

  .contact {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 2px 18px;
    margin-top: 7px;
    font-size: 9pt;
    line-height: 1.5;
    color: #444;
  }

  a {
    color: inherit;
    text-decoration: underline;
    text-decoration-color: #999;
  }

  h2 {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 14px 0 6px;
    font-size: 9.6pt;
    line-height: 1.2;
    font-weight: 700;
    letter-spacing: 2.2px;
    text-transform: uppercase;
    color: #222;
  }

  h2::before,
  h2::after {
    content: '';
    flex: 1;
    border-top: 1px solid #9a9a9a;
  }

  .title,
  .role-title {
    font-weight: 700;
  }

  .company {
    font-style: italic;
  }

  .tagline {
    margin-top: 1px;
    color: #444;
  }

  .meta {
    font-size: 9.4pt;
    font-style: italic;
    color: #333;
  }

  .skill-group {
    font-weight: 700;
  }
`;

export function renderElegant(resume: MasterResume): string {
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

export const elegant: ResumeTemplate = {
  id: 'elegant',
  name: 'Elegant',
  render: renderElegant,
};
