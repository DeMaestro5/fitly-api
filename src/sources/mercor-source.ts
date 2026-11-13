import { z } from 'zod';
import type { SourceJob } from '../schemas/job.schema';
import { fetchJson } from '../utils/http';
import { MercorListingSchema, parseMercorListing } from './mercor-parse';
import type { JobSource } from './source.type';

const LISTINGS_URL = 'https://aws.api.mercor.com/work/listings-explore-page';
const debug = process.env.JOBS_DEBUG === '1';

const ResponseSchema = z
  .object({ listings: z.array(z.unknown()) })
  .passthrough();

export function createMercorSource(): JobSource {
  return {
    id: 'mercor',
    name: 'Mercor',
    minIntervalMs: 6 * 60 * 60 * 1000, // one request every few hours is enough
    async fetchJobs(signal) {
      const data = ResponseSchema.parse(
        await fetchJson<unknown>(LISTINGS_URL, {
          headers: { Accept: 'application/json' },
          signal,
        }),
      );
      // An empty answer most likely means the endpoint changed, so say so loudly.
      if (data.listings.length === 0)
        throw new Error('Mercor returned no listings');

      const byId = new Map<string, SourceJob>();
      let skipped = 0;
      for (const item of data.listings) {
        const parsed = MercorListingSchema.safeParse(item);
        if (!parsed.success) {
          skipped += 1;
          continue;
        }
        try {
          const job = parseMercorListing(parsed.data);
          if (job) byId.set(job.id, job);
          else skipped += 1;
        } catch {
          skipped += 1;
        }
      }
      if (debug) {
        console.log(
          `[mercor] ${byId.size} kept, ${skipped} skipped or filtered of ${data.listings.length}`,
        );
      }
      return Array.from(byId.values());
    },
  };
}
