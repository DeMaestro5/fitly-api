import type { MasterResume } from '../schemas/resume.schema';

export interface ResumeTemplate {
  id: string;
  name: string;
  render: (resume: MasterResume) => string; // returns a complete, self-contained HTML document
}
