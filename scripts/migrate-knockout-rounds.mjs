#!/usr/bin/env node
/**
 * One-off helper: preview knockout round_label migrations before applying SQL migration.
 * Usage: node scripts/migrate-knockout-rounds.mjs
 *
 * Requires DATABASE_URL or Supabase connection — prints mapping plan only when no DB set.
 */

const SINGLE_MAP = {
  'KO Last 2': 'F',
  PF: 'F-P',
  CF: 'F-C',
  PO1: 'L32-1',
  PO2: 'L32-2',
  PO3: 'L32-3',
  PO4: 'L32-4',
};

const GROUP_PREFIX = {
  'KO Last 4': (n) => `SF${n}`,
  'KO Last 8': (n) => `QF${n}`,
  'KO Last 16': (n) => `L16-${n}`,
  'KO Last 32': (n) => `L32-${n}`,
  PQ: (n) => `QF${n}`,
  PS: (n) => `SF${n}`,
  CS: (n) => `SF${n}`,
};

function mapLabel(oldLabel, index) {
  if (SINGLE_MAP[oldLabel]) return SINGLE_MAP[oldLabel];
  if (GROUP_PREFIX[oldLabel]) return GROUP_PREFIX[oldLabel](index);
  if (/^KO Pre-/i.test(oldLabel)) return `L32-${index}`;
  if (/^L32-\d+$|^L16-\d+$|^QF[1-4]$|^SF[1-2]$|^F(-P|-C)?$/.test(oldLabel)) return oldLabel;
  return oldLabel;
}

function planMigration(fixtures) {
  const groups = {};
  fixtures
    .filter((f) => f.stage === 'knockout')
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .forEach((f) => {
      const key = `${f.competitionId}::${f.roundLabel}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(f);
    });

  const updates = [];
  Object.values(groups).forEach((rows) => {
    rows.forEach((f, idx) => {
      const newLabel = mapLabel(f.roundLabel, idx + 1);
      if (newLabel !== f.roundLabel) {
        updates.push({ fixtureId: f.fixtureId, from: f.roundLabel, to: newLabel });
      }
    });
  });
  return updates;
}

if (process.argv.includes('--demo')) {
  const sample = [
    { fixtureId: '1', competitionId: 'c1', stage: 'knockout', roundLabel: 'KO Last 16', sortOrder: 1 },
    { fixtureId: '2', competitionId: 'c1', stage: 'knockout', roundLabel: 'KO Last 16', sortOrder: 2 },
    { fixtureId: '3', competitionId: 'c1', stage: 'knockout', roundLabel: 'KO Last 4', sortOrder: 10 },
  ];
  console.log(JSON.stringify(planMigration(sample), null, 2));
}

export { mapLabel, planMigration };
