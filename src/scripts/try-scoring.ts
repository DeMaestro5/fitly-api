import path from 'node:path';
import { closeDb, getDb } from '../repo/db';
import { saveScores, recomputeDuplicates } from '../repo/jobs.repo';
import { createFileResumeRepository } from '../repo/resume.repo';
import type { JobSourceId } from '../schemas/job.schema';
import { scoreJob } from '../services/job-score';
import { buildSkillProfile } from '../services/skill-profile';
import { COMPILED_KNOWN_STACKS } from '../services/skills-dictionary';
import {
  buildBoilerplateIndex,
  stripBoilerplate,
} from '../services/job-boilerplate';

interface StoredJobRow {
  id: string;
  source: string;
  title: string;
  company: string;
  tags: string;
  duplicateOf: string;
  descriptionText: string;
}

(async () => {
  const resumePath = path.resolve(process.cwd(), 'data/master-resume.json');
  const resumeRepo = createFileResumeRepository(resumePath);
  const resume = await resumeRepo.get();

  if (!resume) {
    console.error(`Error: Could not load master resume from ${resumePath}`);
    process.exit(1);
  }

  const profile = buildSkillProfile(resume);
  console.log(`\n=== Master Resume Skill Profile ===`);
  console.log(`Identified ${profile.size} canonical skills:`);
  console.log(Array.from(profile).sort().join(', '));

  const db = getDb();
  const duplicateCount = recomputeDuplicates();
  console.log(
    `\nMarked ${duplicateCount} jobs as duplicates (hidden from the reports below).`,
  );

  const rows = db
    .prepare(
      `SELECT id, source, title, company, tags, description_text AS descriptionText,
              duplicate_of AS duplicateOf
       FROM jobs
       WHERE expired = 0`,
    )
    .all() as StoredJobRow[];

  console.log(`\nLoaded ${rows.length} non-expired jobs from database.`);

  const boilerplate = buildBoilerplateIndex(rows);
  console.log(`\n=== Company Boilerplate Detected (top 10 companies) ===`);
  console.table(
    Array.from(boilerplate, ([company, segments]) => ({
      company,
      repeatedSegments: segments.size,
    }))
      .sort((a, b) => b.repeatedSegments - a.repeatedSegments)
      .slice(0, 10),
  );

  // Load previous scores from database for band comparison before overwriting
  const previousScores = new Map<string, number>();
  const prevRows = db
    .prepare('SELECT id, score FROM jobs WHERE expired = 0')
    .all() as { id: string; score: number }[];
  for (const r of prevRows) {
    previousScores.set(r.id, r.score);
  }

  const scoredJobs = rows.map((row) => {
    let parsedTags: string[] = [];
    try {
      const parsed = JSON.parse(row.tags);
      if (Array.isArray(parsed)) parsedTags = parsed;
    } catch {
      parsedTags = [];
    }

    const { score, matched, label } = scoreJob(
      {
        title: row.title,
        source: row.source as JobSourceId,
        tags: parsedTags,
        descriptionText: stripBoilerplate(row, boilerplate),
      },
      profile,
    );

    return {
      id: row.id,
      source: row.source,
      title: row.title,
      company: row.company,
      duplicateOf: row.duplicateOf,
      score,
      matched,
      label,
    };
  });

  // (c) How many jobs changed band (strong/possible/low) compared with previous saved scores
  const bandOf = (s: number) =>
    s >= 70 ? 'strong' : s >= 45 ? 'possible' : 'low';

  const transitions: Record<string, number> = {};
  let totalBandChanges = 0;

  for (const j of scoredJobs) {
    const prevScore = previousScores.get(j.id) ?? 0;
    const prevBand = bandOf(prevScore);
    const newBand = bandOf(j.score);
    if (prevBand !== newBand) {
      totalBandChanges++;
      const key = `${prevBand} -> ${newBand}`;
      transitions[key] = (transitions[key] || 0) + 1;
    }
  }

  console.log(`\n=== Band Changes Compared With Previous Saved Scores ===`);
  console.log(
    `Total jobs that changed band: ${totalBandChanges} / ${scoredJobs.length}`,
  );
  console.table(
    Object.entries(transitions).map(([transition, count]) => ({
      transition,
      count,
    })),
  );

  // Save scores back to database
  saveScores(
    scoredJobs.map((j) => ({
      id: j.id,
      score: j.score,
      matched: j.matched,
    })),
  );
  console.log(`Saved scores for ${scoredJobs.length} jobs to database.`);
  const visibleJobs = scoredJobs.filter((j) => !j.duplicateOf);
  console.log(
    `Reports below hide ${scoredJobs.length - visibleJobs.length} duplicates (${visibleJobs.length} jobs shown).`,
  );

  // 1. Score histogram in buckets of 10
  const buckets = [
    { label: ' 0 -  9', min: 0, max: 9, count: 0 },
    { label: '10 - 19', min: 10, max: 19, count: 0 },
    { label: '20 - 29', min: 20, max: 29, count: 0 },
    { label: '30 - 39', min: 30, max: 39, count: 0 },
    { label: '40 - 49', min: 40, max: 49, count: 0 },
    { label: '50 - 59', min: 50, max: 59, count: 0 },
    { label: '60 - 69', min: 60, max: 69, count: 0 },
    { label: '70 - 79', min: 70, max: 79, count: 0 },
    { label: '80 - 89', min: 80, max: 89, count: 0 },
    { label: '90 - 100', min: 90, max: 100, count: 0 },
  ];

  for (const j of scoredJobs) {
    const bucket = buckets.find((b) => j.score >= b.min && j.score <= b.max);
    if (bucket) bucket.count++;
  }

  console.log(`\n=== Score Histogram (Buckets of 10) ===`);
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  for (const b of buckets) {
    const bar = '■'.repeat(Math.round((b.count / maxCount) * 40));
    console.log(`${b.label} | ${b.count.toString().padStart(5)} | ${bar}`);
  }

  // 2. Average score per source
  const sourceStats: Record<string, { count: number; totalScore: number }> = {};
  for (const j of scoredJobs) {
    if (!sourceStats[j.source]) {
      sourceStats[j.source] = { count: 0, totalScore: 0 };
    }
    sourceStats[j.source].count++;
    sourceStats[j.source].totalScore += j.score;
  }

  console.log(`\n=== Average Score Per Source ===`);
  console.table(
    Object.entries(sourceStats)
      .map(([source, stats]) => ({
        source,
        jobs: stats.count,
        avgScore: Math.round((stats.totalScore / stats.count) * 10) / 10,
      }))
      .sort((a, b) => b.avgScore - a.avgScore),
  );

  // 3. Top 50 jobs source breakdown
  const sortedJobs = [...scoredJobs].sort(
    (a, b) => b.score - a.score || a.id.localeCompare(b.id),
  );
  const top50 = sortedJobs.slice(0, 50);
  const top50SourceCounts: Record<string, number> = {};
  for (const j of top50) {
    top50SourceCounts[j.source] = (top50SourceCounts[j.source] || 0) + 1;
  }

  console.log(`\n=== How Many of Top 50 Come From Each Source ===`);
  console.table(
    Object.entries(top50SourceCounts)
      .map(([source, count]) => ({
        source,
        countInTop50: count,
        percentOfTop50: `${Math.round((count / 50) * 100)}%`,
      }))
      .sort((a, b) => b.countInTop50 - a.countInTop50),
  );

  // 4. Top 25 scoring jobs
  const top25 = sortedJobs.slice(0, 25);
  console.log(`\n=== Top 25 Highest Scoring Jobs ===`);
  console.table(
    top25.map((j) => ({
      score: j.score,
      source: j.source,
      title: j.title.slice(0, 45),
      company: j.company.slice(0, 20),
      matched: j.matched.join(', '),
    })),
  );

  // (a) List of every job scored 70 or more whose title contains a stack outside the profile
  const highScoringForeign = scoredJobs.filter((j) => {
    if (j.score < 70) return false;
    return COMPILED_KNOWN_STACKS.some(
      (stack) =>
        !profile.has(stack.id) &&
        !(stack.id === 'nest' && profile.has('node')) &&
        stack.regexes.some((re) => re.test(j.title)),
    );
  });

  console.log(
    `\n=== Jobs Scored >= 70 Whose Title Contains a Stack Outside Profile ===`,
  );
  if (highScoringForeign.length === 0) {
    console.log(
      'None! All jobs scored >= 70 contain only profile stacks in their title.',
    );
  } else {
    console.table(
      highScoringForeign.map((j) => {
        const foreignInTitle = COMPILED_KNOWN_STACKS.filter(
          (s) =>
            !profile.has(s.id) &&
            !(s.id === 'nest' && profile.has('node')) &&
            s.regexes.some((re) => re.test(j.title)),
        )
          .map((s) => s.name)
          .join(', ');

        return {
          score: j.score,
          source: j.source,
          title: j.title.slice(0, 45),
          company: j.company.slice(0, 20),
          foreignInTitle,
          matched: j.matched.join(', '),
        };
      }),
    );
  }

  // (b) 15 Lemon.io jobs with titles and scores
  const lemonJobs = scoredJobs
    .filter((j) => /lemon/i.test(j.company) || /lemon/i.test(j.title))
    .slice(0, 15);

  console.log(`\n=== 15 Lemon.io Jobs With Titles and Scores ===`);
  console.table(
    lemonJobs.map((j) => ({
      score: j.score,
      source: j.source,
      title: j.title.slice(0, 45),
      company: j.company.slice(0, 20),
      label: j.label,
      matched: j.matched.join(', '),
    })),
  );

  // 5. 15 jobs scored 40-60
  const midRange = scoredJobs
    .filter((j) => j.score >= 40 && j.score <= 60)
    .slice(0, 15);

  console.log(`\n=== 15 Jobs Scored 40 - 60 ===`);
  console.table(
    midRange.map((j) => ({
      score: j.score,
      source: j.source,
      title: j.title.slice(0, 45),
      company: j.company.slice(0, 20),
      matched: j.matched.join(', '),
    })),
  );

  // 6. 15 jobs with Python, Vue or Angular in the title and their scores
  const pythonVueAngular = scoredJobs
    .filter((j) => /\b(python|vue|angular)\b/i.test(j.title))
    .slice(0, 15);

  console.log(`\n=== 15 Jobs With Python, Vue or Angular in the Title ===`);
  console.table(
    pythonVueAngular.map((j) => ({
      score: j.score,
      source: j.source,
      title: j.title.slice(0, 45),
      company: j.company.slice(0, 20),
      matched: j.matched.join(', '),
    })),
  );

  // 7. 15 lowest scoring titles containing "engineer" or "developer"
  const lowEng = scoredJobs
    .filter((j) => /\b(engineer|developer)\b/i.test(j.title))
    .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))
    .slice(0, 15);

  console.log(
    `\n=== 15 Lowest Scoring Titles Containing "Engineer" or "Developer" ===`,
  );
  console.table(
    lowEng.map((j) => ({
      score: j.score,
      source: j.source,
      title: j.title.slice(0, 45),
      company: j.company.slice(0, 20),
      matched: j.matched.join(', '),
    })),
  );

  closeDb();
})().catch((err) => {
  console.error(err);
  closeDb();
  process.exit(1);
});
