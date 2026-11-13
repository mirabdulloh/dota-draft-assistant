import { connect } from './db.ts';
import { migrate, ingest, aggregate, DEFAULT_K } from './ingest.ts';
import { report } from './report.ts';
import { backtest } from './backtest.ts';
import { demo } from './demo.ts';
import { validateSafeMode } from './safe-validation.ts';
import { exportSnapshot } from './export-snapshot.ts';

function flag(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  if (!Number.isFinite(v)) throw new Error(`--${name} needs a number`);
  return v;
}

function strFlag(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : String(process.argv[i + 1]);
}

const USAGE = `
usage: node src/cli.ts <command> [options]

  rebuild     ingest + aggregate, from an empty database
  ingest      download public matches only
  aggregate   recompute matchups/synergies from stored matches
  backtest    train/test split, predict winners on held-out matches
  demo        print live suggestions for sample drafts
  safe-check  validate SAFE mode against held-out outcomes
  export      write the offline snapshot the app scores against
              (--refresh-items re-pulls core builds, ~2.5 min)
  report      show what is currently in the database

options:
  --matches N    how many matches to ingest   (default 60000)
  --batch N      rows per explorer request    (default 20000)
  --patch TAG    patch label for aggregates   (default 7.41)
  --k N          shrinkage pseudo-count       (default ${DEFAULT_K})

DATABASE_URL selects a real Postgres; without it PGlite is used locally.
`;

async function main() {
  const cmd = process.argv[2];
  if (!cmd || ['-h', '--help', 'help'].includes(cmd)) {
    console.log(USAGE);
    return;
  }

  const db = await connect();
  console.log(`database: ${db.kind}\n`);

  try {
    const opts = {
      matches: flag('matches', 60_000),
      batchSize: flag('batch', 20_000),
      patch: strFlag('patch', '7.41'),
      k: flag('k', DEFAULT_K),
    };

    if (cmd === 'rebuild' || cmd === 'ingest') {
      await migrate(db);
      const r = await ingest(db, opts);
      console.log(`ingested ${r.added.toLocaleString()} matches\n`);
    }

    if (cmd === 'rebuild' || cmd === 'aggregate') {
      await migrate(db);
      const t0 = Date.now();
      const r = await aggregate(db, opts);
      console.log(
        `aggregated ${r.matches.toLocaleString()} matches -> ` +
          `${r.heroStats} hero rows, ${r.matchups.toLocaleString()} matchups, ` +
          `${r.synergies.toLocaleString()} synergies  (k=${opts.k}, ${((Date.now() - t0) / 1000).toFixed(1)}s)\n`,
      );
    }

    if (cmd === 'backtest') {
      await migrate(db);
      await backtest(db, { k: opts.k, patch: opts.patch });
    }

    if (cmd === 'demo') {
      await migrate(db);
      await demo(db, { bracket: flag('bracket', 5), patch: opts.patch });
    }

    if (cmd === 'safe-check') {
      await migrate(db);
      await validateSafeMode(db, { k: opts.k, patch: opts.patch, maxLineups: flag('lineups', 40000) });
    }

    if (cmd === 'export') {
      await migrate(db);
      await exportSnapshot(db, {
        bracket: flag('bracket', 5),
        patch: opts.patch,
        out: strFlag('out', new URL('../../mobile/assets/snapshot.json', import.meta.url).pathname),
        refreshItems: process.argv.includes('--refresh-items'),
      });
    }

    if (cmd === 'report') await migrate(db);
    if (['rebuild', 'aggregate', 'report'].includes(cmd)) await report(db, opts.patch);

    if (!['rebuild', 'ingest', 'aggregate', 'report', 'backtest', 'demo', 'safe-check', 'export'].includes(cmd)) {
      console.log(USAGE);
    }
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
