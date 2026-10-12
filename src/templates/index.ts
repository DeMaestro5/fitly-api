import { classic } from './classic';
import type { ResumeTemplate } from './types';

const templates: ResumeTemplate[] = [classic];

export const listTemplates = () =>
  templates.map(({ id, name }) => ({ id, name }));
export const getTemplate = (id: string): ResumeTemplate | null =>
  templates.find((template) => template.id === id) ?? null;
