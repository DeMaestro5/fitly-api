import { closeDb } from '../repo/db';
import { countJobs, getRuns } from '../repo/jobs.repo';
import { refreshAll } from '../services/jobs-refresh-service';
import { buildSources } from '../sources';

(async () => {
  const force = process.argv.includes('--force');
  const reports = await refreshAll(
    buildSources({ himalayasApiKey: process.env.HIMALAYAS_API_KEY }),
    { force },
  );
  console.table(reports);
  console.log(countJobs());
  console.table(getRuns());
  closeDb();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
