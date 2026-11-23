// Token Radar entry, radar-4 (Node 22, standard library only).
//
// Reads the sealed DefiLlama snapshot from /input/snapshot.json (or --input
// <file|dir>), scores every rankable pre-token protocol with the radar-4
// model in lib/model.ts — one log-linear regression whose every term is
// blind-tested (leave-one-out plus older-to-newer) and kept only if it
// helps — and writes the ranked board to /output/board.json.
// It also writes the dashboard's data beside the page as data.js, the
// momentum panel as insights.js, copies this repository's dashboard/ and
// screenshots/ into /output, and finishes by writing /output/dossier.json
// with the vendored make.fun library — the exact summary the judge reads.
// The scorer rebuilds the dossier from /output and compares it byte for
// byte, so the dossier is always written last.
//
// The run is deterministic: the same snapshot in always produces the same
// board out, because every sort has a slug tie-break and no clock or random
// value is read anywhere in the scoring path.
//
// Run outside the grader's container with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildInsights, insightsScript } from './lib/insights.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the dossier, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(
    `token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`,
  );
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

// Score first, write second: nothing is written until the board passes the gate.
const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}
// The census must account for every protocol exactly once, and the
// watchlist must be inside the ranked rows: a silent gap here would be
// a radar that quietly drops part of the universe it claims to cover.
const census = radar.census;
const accounted =
  census.ranked + census.has_token + census.cex_no_token + census.excluded_category + census.excluded_name;
if (accounted !== census.total) {
  process.stderr.write(
    `token radar: the census accounts for ${accounted} of ${census.total} protocols: ranked ${census.ranked}, has-token ${census.has_token}, CEX ${census.cex_no_token}, excluded-category ${census.excluded_category}, excluded-name ${census.excluded_name}\n`,
  );
  process.exit(1);
}

const insights = buildInsights(snapshot);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));
writeFileSync(join(out, 'insights.js'), insightsScript(insights));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

// Dashboard and screenshots are copied verbatim, so the dossier built from
// these copies describes exactly the files the judge will open.
const dashboardFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(
    `token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`,
  );
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }),
);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.census.excluded_category} excluded by category, ${radar.census.excluded_name} excluded by name, ${radar.census.has_token} already have a token, ${radar.census.cex_no_token} CEX with no token)\n` +
    `token radar: size fit on ${radar.fit.n} traded comps: log10(mcap) = ${radar.fit.intercept} + ${radar.fit.slope} x log10(tvl); hold-out median |log10 error| fitted ${radar.fit.holdout_fitted} vs flat 0.30 ${radar.fit.holdout_flat} (x${radar.fit.holdout_ratio})\n` +
    `token radar: term test on ${radar.term_test.n_comps} comps (older-to-newer ${radar.term_test.older_newer_n_train} train / ${radar.term_test.older_newer_n_test} test): ` +
    radar.term_test.models.map((m) => `${m.name} ${m.label} LOO ${m.loo_median_error} OTN ${m.older_newer_median_error ?? 'n/a'}`).join('; ') +
    `\n` +
    `token radar: term verdicts: ` +
    radar.term_test.verdicts.map((v) => `${v.term} ${v.kept ? 'KEPT' : 'DROPPED'} (LOO ${v.loo_with} vs ${v.loo_without}, coef ${v.coefficient})`).join('; ') +
    `; surviving features: ${radar.term_test.surviving_features.join(', ')}\n` +
    `token radar: verdicts FARM ${radar.verdict_counts.FARM}, WATCH ${radar.verdict_counts.WATCH}, SKIP ${radar.verdict_counts.SKIP}; tiers hot ${radar.tier_counts.hot}, warming ${radar.tier_counts.warming}, cooling ${radar.tier_counts.cooling}, cold ${radar.tier_counts.cold}, unknown ${radar.tier_counts.unknown}\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashboardFiles.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
