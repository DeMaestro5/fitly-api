import { banner } from './banner';
import { classic } from './classic';
import { elegant } from './elegant';
import { modern } from './modern';
import { timeline } from './timeline';
import type { ResumeTemplate } from './types';

const templates: ResumeTemplate[] = [
  classic,
  modern,
  elegant,
  banner,
  timeline,
];

export function getTemplate(id: string): ResumeTemplate | undefined {
  return templates.find((template) => template.id === id);
}

export function listTemplates(): { id: string; name: string }[] {
  return templates.map(({ id, name }) => ({ id, name }));
}
