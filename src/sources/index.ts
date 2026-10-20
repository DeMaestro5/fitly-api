import { createArbeitnowSource } from './arbeitnow-source';
import { createHimalayasSource } from './himalayas-source';
import { createJobicySource } from './jobicy-source';
import { createRemoteOkSource } from './remoteok-source';
import { createRemotiveSource } from './remotive-source';
import type { JobSource } from './source.type';
import { createWwrSource } from './wwr-source';

export function buildSources(
  options: { himalayasApiKey?: string } = {},
): JobSource[] {
  return [
    createHimalayasSource(options.himalayasApiKey),
    createRemoteOkSource(),
    createWwrSource(),
    createJobicySource(),
    createRemotiveSource(),
    createArbeitnowSource(),
  ];
}
