import { readFileSync } from 'node:fs';
import { MasterResumeSchema } from '../schemas/resume.schema';
import { checkTailored } from '../services/guardrail';

const master = MasterResumeSchema.parse(
  JSON.parse(readFileSync('data/master-resume.json', 'utf8'))
);
const original = master.tailorable;
const jd =
  'Senior Backend Engineer. Required: Go, Kafka, Kubernetes, AWS. Event-driven microservices, gRPC and Terraform.';

const clean = structuredClone(original);
const cleanErrors = checkTailored(original, clean, jd).filter(
  (f) => f.severity === 'error'
);
console.log('unchanged output, errors:', cleanErrors.length, '(expect 0)');

const tampered = structuredClone(original);
const novba = tampered.experience.find((r) => r.id === 'novba')!;
novba.bullets[0].text =
  'Designed and shipped a microservice-style platform with Next.js 15, deployed with Docker-based CI/CD.';
novba.bullets[6].text =
  'Implemented JWT auth with bcrypt (14 rounds) and per-route rate limiting.';
tampered.skills[0].items.push('Kafka');
tampered.experience[1].bullets[0].id = 'reach-ai-99';

for (const f of checkTailored(original, tampered, jd)) {
  console.log(`[${f.severity}] ${f.rule} ${f.path}: ${f.message}`);
}
