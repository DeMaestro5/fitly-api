import { isDeepStrictEqual } from 'node:util';
import type { Tailorable } from '../schemas/resume.schema';
import { normalizeText } from '../utils/normalize-text';

const same = (a: string, b: string) => normalizeText(a) === normalizeText(b);

export interface TextChange {
  changed: boolean;
  before?: string;
  after?: string;
}

export interface BulletChange {
  id: string;
  status: 'unchanged' | 'reworded' | 'removed';
  moved: boolean;
  before?: string;
  after?: string;
}

export interface DiffReport {
  headline: TextChange;
  summary: TextChange;
  experience: { id: string; reordered: boolean; bullets: BulletChange[] }[];
  projects: { id: string; change: TextChange }[];
  skills: {
    groupsReordered: boolean;
    groups: { id: string; itemsReordered: boolean }[];
  };
  stats: { reworded: number; removed: number; moved: number };
}

function textChange(before?: string, after?: string): TextChange {
  if (before === undefined && after === undefined) return { changed: false };
  if (before !== undefined && after !== undefined && same(before, after))
    return { changed: false };
  return { changed: true, before, after };
}

export function diffTailorable(
  original: Tailorable,
  tailored: Tailorable
): DiffReport {
  const experience = original.experience.map((role) => {
    const nextBullets =
      tailored.experience.find((r) => r.id === role.id)?.bullets ?? [];
    const nextById = new Map(nextBullets.map((b) => [b.id, b]));
    const originalIds = new Set(role.bullets.map((b) => b.id));

    // Compare order only among bullets that survived, so removals don't count as moves
    const keptOldOrder = role.bullets
      .filter((b) => nextById.has(b.id))
      .map((b) => b.id);
    const keptNewOrder = nextBullets
      .filter((b) => originalIds.has(b.id))
      .map((b) => b.id);

    const bullets = role.bullets.map((bullet): BulletChange => {
      const after = nextById.get(bullet.id);
      if (!after)
        return {
          id: bullet.id,
          status: 'removed',
          moved: false,
          before: bullet.text,
        };
      const moved =
        keptOldOrder.indexOf(bullet.id) !== keptNewOrder.indexOf(bullet.id);
      if (same(bullet.text, after.text))
        return { id: bullet.id, status: 'unchanged', moved };
      return {
        id: bullet.id,
        status: 'reworded',
        moved,
        before: bullet.text,
        after: after.text,
      };
    });

    return {
      id: role.id,
      reordered: !isDeepStrictEqual(keptOldOrder, keptNewOrder),
      bullets,
    };
  });

  const allBullets = experience.flatMap((r) => r.bullets);

  return {
    headline: textChange(original.headline, tailored.headline),
    summary: textChange(original.summary, tailored.summary),
    experience,
    projects: original.projects.map((p) => ({
      id: p.id,
      change: textChange(
        p.description,
        tailored.projects.find((t) => t.id === p.id)?.description
      ),
    })),
    skills: {
      groupsReordered: !isDeepStrictEqual(
        original.skills.map((g) => g.id),
        tailored.skills.map((g) => g.id)
      ),
      groups: original.skills.map((g) => {
        const next = tailored.skills.find((t) => t.id === g.id);
        return {
          id: g.id,
          itemsReordered: !!next && !isDeepStrictEqual(g.items, next.items),
        };
      }),
    },
    stats: {
      reworded: allBullets.filter((b) => b.status === 'reworded').length,
      removed: allBullets.filter((b) => b.status === 'removed').length,
      moved: allBullets.filter((b) => b.moved).length,
    },
  };
}
