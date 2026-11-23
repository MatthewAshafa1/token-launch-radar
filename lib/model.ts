// Token Radar model (radar-3): sealed snapshot in, ranked board out.
//
// radar-3 fixes what made radar-2 a TVL table with a nudge:
//
//   1. The size multiple is FITTED, not asserted. The snapshot's own traded
//      protocols (market cap vs TVL) give a log-log size curve, and a
//      two-fold hold-out test reports how far that curve beats a flat 0.30
//      multiple. The fit and the hold-out numbers are computed at run time
//      from the snapshot and shipped in data.js, so the dashboard shows
//      numbers the program just measured, not numbers typed in by hand.
//   2. The exclusion rule is applied to EVERY ranked row, not just the
//      watchlist. A wrapped, staked or bridged product of a token that
//      already trades is not a protocol waiting on a launch, whatever its
//      TVL: radar-2 ranked 34 of them (11 Bridge, 15 Liquid Staking, 6
//      Canonical Bridge, 2 Liquid Restaking). radar-3 ranks none.
//   3. The board ranks EVERY rankable pre-token protocol, not the top 160
//      by TVL below the floor. A small protocol growing fast is visible.
//   4. Every row carries a costed verdict (FARM / WATCH / SKIP) from a
//      stated rule, chain-aware gas assumptions, and a peer base rate: the
//      share of non-exchange protocols in the same age band that already
//      have a token. The base rate is a snapshot fact, never a prediction
//      of a date, and the ranking itself stays on implied value.
//
// Implied value, one function of the snapshot's own figures:
//
//   base      = 10 ^ (fit.intercept + fit.slope * log10(tvl_usd))
//               the fitted size curve; the implied/TVL ratio is then
//               clamped to [0.02, 0.60] so no row's value is an extreme
//               extrapolation of the curve.
//   growth    = clamp(change_7d, -80, 200) per cent, shown beside the raw
//               figure so the page never hides a clamp.
//   growth    = 1 + (growth / 100) x 0.8
//   maturity  = 0.55 + min(age_days, 1460) / 1460 x 0.45
//               age_days is days since DefiLlama first listed the protocol;
//               unknown age counts as 365 days AND is flagged age-unknown.
//   breadth   = 1 + min(max(chains - 1, 0), 5) x 0.02
//   implied   = max(1, round(base x growth x maturity x breadth))
//
// Nothing is fetched, no clock or random value is read in the scoring
// path, and every sort breaks ties by slug, so the same snapshot always
// produces the same board in the same order.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export const MODEL_VERSION = 'radar-3';

/** Growth is clamped to this band before it is weighted. */
export const GROWTH_FLOOR = -80;
export const GROWTH_CAP = 200;
export const GROWTH_WEIGHT = 0.8;

/** Maturity runs from this floor to floor + range over this many days. */
export const MATURITY_FLOOR = 0.55;
export const MATURITY_RANGE = 0.45;
export const MATURITY_DAYS = 1460;
export const UNKNOWN_AGE_DAYS = 365;

/** Breadth nudge per extra chain, capped at this many extra chains. */
export const BREADTH_PER_CHAIN = 0.02;
export const BREADTH_MAX_CHAINS = 5;

/** The fitted implied/TVL ratio is never allowed outside this band. */
export const RATIO_FLOOR = 0.02;
export const RATIO_CAP = 0.6;

/** Live-token protocols shown in the Live view, by market cap. */
export const LIVE_ROWS = 24;

export interface SizeFit {
  n: number;
  slope: number;
  intercept: number;
  /** Median |log10 error| of the fitted curve on held-out comps. */
  holdout_fitted: number;
  /** Median |log10 error| of a flat 0.30 multiple on the same held-out comps. */
  holdout_flat: number;
  /** How many times better the fitted curve is than the flat multiple. */
  holdout_ratio: number;
}

export interface PeerBand {
  label: string;
  min_days: number;
  max_days: number | null;
  n: number;
  with_token: number;
  /** Share of the band's protocols that already have a token, 0..1. */
  rate: number;
}

export type MomentumTier = 'hot' | 'warming' | 'cooling' | 'cold' | 'unknown';
export type Verdict = 'FARM' | 'WATCH' | 'SKIP';

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  change_7d_raw: number | null;
  change_7d_used: number;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  age_known: boolean;
  implied_value_usd: number;
  implied_per_tvl: number;
  expected_value_usd: number;
  peer_base_rate: number;
  peer_band: string;
  tier: MomentumTier;
  flags: string[];
  verdict: Verdict;
  capital_usd: number;
  gas_usd: number;
  weekly_gas_usd: number;
  hold_days: number;
  model: {
    base_usd: number;
    growth_pct_used: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  change_7d_used: number;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  age_known: boolean;
  implied_value_usd: number;
  implied_per_tvl: number;
  expected_value_usd: number;
  peer_base_rate: number;
  peer_band: string;
  tier: MomentumTier;
  flags: string[];
  verdict: Verdict;
  capital_usd: number;
  gas_usd: number;
  weekly_gas_usd: number;
  hold_days: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  base_usd: number;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface Census {
  total: number;
  ranked: number;
  watchlist: number;
  has_token: number;
  cex_no_token: number;
  excluded_category: number;
  excluded_name: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  fit: SizeFit;
  peer_bands: PeerBand[];
  census: Census;
  watchlist: string[];
  watchlist_size: number;
  board_size: number;
  live_size: number;
  verdict_counts: Record<Verdict, number>;
  tier_counts: Record<MomentumTier, number>;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `listedAt` to `asOf`; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** A protocol records no token at all in the snapshot. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Categories whose products are not launches of their own: the house rule. */
export const EXCLUDED_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

/** A name beginning with an exchange's name is that exchange's product. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** A name ending in a release marker is a versioned pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word wrapped, staked, staking, restaked or restaking anywhere in the name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking|restaked|restaking)\b/i;

/**
 * Why a pre-token protocol is NOT a launch candidate, or null when it is
 * one. The same rule gates the watchlist and every early row alike.
 */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (!isPreToken(p)) return 'has-token';
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return 'excluded-category';
  if (VERSIONED.test(p.name)) return 'excluded-name';
  if (WRAPPED_WORD.test(p.name)) return 'excluded-name';
  if (EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x))) return 'excluded-name';
  return null;
}

/** A protocol the board may rank: pre-token and not an excluded product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return exclusionReason(p) === null;
}

/** A protocol's momentum tier from its 7-day TVL change; null is unknown. */
export function momentumTier(change7d: number | null): MomentumTier {
  if (change7d === null || !Number.isFinite(change7d)) return 'unknown';
  if (change7d >= 25) return 'hot';
  if (change7d >= 10) return 'warming';
  if (change7d >= -5) return 'cooling';
  return 'cold';
}

/**
 * The risk flags for one protocol. Age comes from the listing date
 * against the snapshot date; a missing listing date earns an explicit
 * age-unknown flag instead of a silent guess.
 */
export function riskFlags(p: SnapshotProtocol, asOf: string, floorUsd: number): string[] {
  const flags: string[] = [];
  const age = ageDays(asOf, p.listed_at);
  if (age === null) flags.push('age-unknown');
  else if (age < 180) flags.push('young');
  if (p.chains.length <= 1) flags.push('single-chain');
  if (p.tvl_usd < floorUsd * 1.5) flags.push('near-floor');
  return flags;
}

/** Deterministic two-fold split: even and odd sums of a slug's char codes. */
function foldOf(slug: string): number {
  let s = 0;
  for (let i = 0; i < slug.length; i++) s += slug.charCodeAt(i);
  return s % 2;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Least squares on log10(mcap) against log10(tvl) for one set of comps. */
function fitLine(comps: SnapshotProtocol[]): { slope: number; intercept: number } {
  const xs = comps.map((p) => Math.log10(p.tvl_usd));
  const ys = comps.map((p) => Math.log10(p.mcap_usd!));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) * (xs[i]! - mx);
  }
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: my - slope * mx };
}

/**
 * The size curve, fitted on the snapshot's own traded protocols
 * (a market cap and a TVL, not an exchange), and tested two-fold:
 * each half of the comps is held out in turn and the fitted curve is
 * scored against a flat 0.30 multiple on the same held-out rows.
 * A curve that loses the hold-out would be reported as losing, not hidden.
 */
export function fitSizeCurve(protocols: SnapshotProtocol[]): SizeFit {
  const comps = protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX',
  );
  const full = fitLine(comps);
  const fittedErrs: number[] = [];
  const flatErrs: number[] = [];
  for (const held of [0, 1]) {
    const train = comps.filter((p) => foldOf(p.slug) !== held);
    const test = comps.filter((p) => foldOf(p.slug) === held);
    const f = fitLine(train);
    for (const p of test) {
      const pred = f.intercept + f.slope * Math.log10(p.tvl_usd);
      fittedErrs.push(Math.abs(Math.log10(p.mcap_usd!) - pred));
      flatErrs.push(Math.abs(Math.log10(p.mcap_usd!) - Math.log10(p.tvl_usd * 0.3)));
    }
  }
  const holdoutFitted = median(fittedErrs);
  const holdoutFlat = median(flatErrs);
  return {
    n: comps.length,
    slope: round4(full.slope),
    intercept: round4(full.intercept),
    holdout_fitted: round4(holdoutFitted),
    holdout_flat: round4(holdoutFlat),
    holdout_ratio: round4(holdoutFlat / Math.max(holdoutFitted, 1e-9)),
  };
}

/** Age bands for the peer base rate, in days. */
const PEER_BANDS: Array<{ label: string; min: number; max: number | null }> = [
  { label: 'under 6 months', min: 0, max: 180 },
  { label: '6–12 months', min: 180, max: 365 },
  { label: '1–2 years', min: 365, max: 730 },
  { label: '2–4 years', min: 730, max: 1460 },
  { label: 'over 4 years', min: 1460, max: null },
];

/**
 * For each age band, the share of non-exchange protocols in that band
 * that already have a token. A base rate from the snapshot's own record:
 * it says how often protocols of this age have launched, never whether
 * or when this one will.
 */
export function peerBaseRates(snapshot: Snapshot): PeerBand[] {
  const peers = snapshot.protocols.filter((p) => p.category !== 'CEX');
  const bands: PeerBand[] = PEER_BANDS.map((b) => {
    const inBand = peers.filter((p) => {
      const age = ageDays(snapshot.as_of, p.listed_at);
      if (age === null) return false;
      return age >= b.min && (b.max === null || age < b.max);
    });
    const withToken = inBand.filter((p) => !isPreToken(p)).length;
    return {
      label: b.label,
      min_days: b.min,
      max_days: b.max,
      n: inBand.length,
      with_token: withToken,
      rate: inBand.length === 0 ? 0 : round4(withToken / inBand.length),
    };
  });
  const unknown = peers.filter((p) => ageDays(snapshot.as_of, p.listed_at) === null);
  const unknownWith = unknown.filter((p) => !isPreToken(p)).length;
  bands.push({
    label: 'age unknown',
    min_days: -1,
    max_days: -1,
    n: unknown.length,
    with_token: unknownWith,
    rate: unknown.length === 0 ? 0 : round4(unknownWith / unknown.length),
  });
  return bands;
}

/** The peer band a protocol's age falls in. */
export function peerBandFor(age: number | null, bands: PeerBand[]): PeerBand {
  if (age === null) return bands[bands.length - 1]!;
  for (const b of bands) {
    if (b.min_days < 0) continue;
    if (age >= b.min_days && (b.max_days === null || age < b.max_days)) return b;
  }
  return bands[bands.length - 1]!;
}

/**
 * The multipliers and the implied value one protocol gets under the
 * fitted model. Every factor comes from the protocol's own snapshot
 * record plus the fitted curve; nothing is fetched or looked up
 * elsewhere, so the value is fully reproducible.
 */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fit: SizeFit,
): {
  implied: number;
  base: number;
  ratio: number;
  growthRaw: number | null;
  growthUsed: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = protocol.change_7d;
  const growthUsed = Math.min(GROWTH_CAP, Math.max(GROWTH_FLOOR, finite(rawGrowth, 0)));
  const growthMult = 1 + (growthUsed / 100) * GROWTH_WEIGHT;
  const ageForModel = age ?? UNKNOWN_AGE_DAYS;
  const maturityMult =
    MATURITY_FLOOR + (Math.min(Math.max(ageForModel, 0), MATURITY_DAYS) / MATURITY_DAYS) * MATURITY_RANGE;
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), BREADTH_MAX_CHAINS);
  const breadthMult = 1 + extraChains * BREADTH_PER_CHAIN;
  const fitted = Math.pow(10, fit.intercept + fit.slope * Math.log10(Math.max(1, protocol.tvl_usd)));
  const ratio = Math.min(RATIO_CAP, Math.max(RATIO_FLOOR, fitted / Math.max(1, protocol.tvl_usd)));
  const base = protocol.tvl_usd * ratio;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * breadthMult));
  return { implied, base: Math.round(base), ratio: round4(ratio), growthRaw: rawGrowth, growthUsed, growthMult, maturityMult, breadthMult, age };
}

/** Capital for one farm position, from the protocol's own TVL. */
export function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 500_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  if (p.tvl_usd >= 50_000_000) return 75;
  return 50;
}

/** Gas for one action, by the protocol's main chain: a stated assumption. */
export function gasFor(p: SnapshotProtocol): number {
  const chain = p.chains.length > 0 ? p.chains[0]! : '';
  if (chain === 'Ethereum') return 12;
  if (chain === 'Solana') return 1;
  if (chain === 'Base' || chain === 'Arbitrum' || chain === 'Optimism' || chain === 'Polygon') return 2;
  return 5;
}

/** Hold length from the protocol's age: younger protocols get a longer window. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/**
 * The verdict, from a rule stated on the dashboard: FARM when the
 * protocol is top-40 by implied value, moving (hot or warming) and
 * carrying at most one risk flag — or top-10 with no risk flag at all,
 * where the value case does not rest on a single week's move. WATCH when
 * it is top-100 or moving fast; otherwise SKIP. A big protocol shrinking
 * for a week with flags on it is never a FARM.
 */
export function verdictFor(rank: number, tier: MomentumTier, flags: string[]): Verdict {
  if (rank <= 40 && (tier === 'hot' || tier === 'warming') && flags.length <= 1) return 'FARM';
  if (rank <= 10 && tier === 'cooling' && flags.length === 0) return 'FARM';
  if (rank <= 100 || tier === 'hot') return 'WATCH';
  return 'SKIP';
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** One farm step as a single string: action, cost, time. Kept inside 20..600 chars. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The category's main action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm'))
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge'))
    return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak'))
    return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative'))
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator'))
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('restak')) return `Restake $${capital} through ${name} on ${chain} and keep the receipt token.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A second, deeper action for the same protocol, so the plan is not one deposit and done. */
function deepenFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const half = Math.max(10, Math.round(capital / 2));
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Borrow $${half} against the supply on ${name}, then repay it the same week so the borrow side is on record too.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm'))
    return `Add a second, smaller position of $${half} to another pool on ${name} so the activity is not a single deposit.`;
  if (c.includes('bridge'))
    return `Send $${half} back through ${name} the other way, so both directions of the bridge are used.`;
  if (c.includes('staking') || c.includes('restak'))
    return `Restake or compound the first rewards ${name} pays, instead of withdrawing them.`;
  if (c.includes('perpetual') || c.includes('derivative'))
    return `Close the first hedge on ${name} and open a second one at a smaller size, keeping margin on the account.`;
  if (c.includes('prediction')) return `Settle the first market on ${name}, then fund a second market with $${half}.`;
  if (c.includes('curator') || c.includes('allocator'))
    return `Move $${half} into a second ${name} vault on ${chain} with a different strategy.`;
  if (c.includes('stable')) return `Swap $${half} of the stable asset back to USDC through ${name} and deposit it again.`;
  if (c.includes('rwa')) return `Claim any yield the $${capital} position earned and reinvest it in the same asset.`;
  if (c.includes('insurance')) return `Open a second, smaller cover of $${half} on ${name} so the policy is not a single purchase.`;
  return `Make a second deposit of $${half} into ${name} on ${chain} a week after the first.`;
}

/** The weekly habit, varied by what the protocol actually does. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Once a week, check the borrow rate on ${name} and adjust the supply or repay a little so the position stays active.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm'))
    return `Once a week, claim or compound the fees the ${name} position earned instead of letting them sit unclaimed.`;
  if (c.includes('bridge'))
    return `Once a week, move a small amount through ${name} so the bridge sees repeated use, not one crossing.`;
  if (c.includes('perpetual') || c.includes('derivative'))
    return `Once a week, review the open hedge on ${name} and rebalance it so the margin account stays active.`;
  if (c.includes('prediction')) return `Once a week, settle or open one market on ${name} so the account shows steady activity.`;
  if (c.includes('curator') || c.includes('allocator'))
    return `Once a week, check the ${name} vault's performance and move a little between its strategies if one lags.`;
  if (c.includes('stable')) return `Once a week, swap a small amount through ${name} so the stable position is used, not parked.`;
  if (c.includes('rwa')) return `Once a week, check the yield the ${name} position accrued and reinvest it in the same asset.`;
  if (c.includes('insurance')) return `Once a week, confirm the ${name} policy is still active and note its expiry date in the farm log.`;
  if (c.includes('staking') || c.includes('restak'))
    return `Once a week, compound the staking rewards ${name} pays instead of withdrawing them.`;
  return `Once a week, make one qualifying action on ${name} — a deposit, a swap or a vote — so the activity is steady.`;
}

/** What to check before claiming anything, varied by category. */
function eligibilityFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Before you withdraw, open ${name}'s own site and check its rewards page for what a supplier must have done; claim only from a link that site publishes, and never pay to claim.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm'))
    return `Before you withdraw, open ${name}'s own site and check whether liquidity providers earn points or fees, and what the minimum holding time is; claim only from a link that site publishes.`;
  if (c.includes('bridge'))
    return `Before you withdraw, open ${name}'s own site and check whether bridge volume counts toward any reward; claim only from a link that site publishes, and never pay to claim.`;
  if (c.includes('perpetual') || c.includes('derivative'))
    return `Before you withdraw, open ${name}'s own site and check whether trading volume or margin time counts toward any reward; claim only from a link that site publishes.`;
  if (c.includes('curator') || c.includes('allocator'))
    return `Before you withdraw, open ${name}'s own site and check what vault shareholders must have held and for how long; claim only from a link that site publishes.`;
  return `Before you withdraw, open ${name}'s own site and look for its points or rewards page; the snapshot records no points programme, so if there is none, there is nothing to claim yet. Claim only from a link that site publishes, and never pay to claim.`;
}

/** How to unwind the position, varied by category. */
function exitFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `To exit, repay any borrow on ${name} first, then withdraw the $${capital} supply back to ${chain} and write the dates and every transaction in a farm log.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm'))
    return `To exit, remove the ${name} liquidity in two parts so slippage stays low, then write the dates and every transaction in a farm log.`;
  if (c.includes('bridge'))
    return `To exit, bridge the funds back to the chain you started on through ${name}, then write the dates and every transaction in a farm log.`;
  if (c.includes('perpetual') || c.includes('derivative'))
    return `To exit, close the hedge on ${name}, withdraw the margin, then write the dates and every transaction in a farm log.`;
  if (c.includes('staking') || c.includes('restak'))
    return `To exit, unstake through ${name} and wait out any unbonding period before moving the funds, then write the dates and every transaction in a farm log.`;
  return `To exit, withdraw the $${capital} from ${name} on ${chain} in one move, then write the dates and every transaction in a farm log.`;
}

/** What can go wrong with this kind of protocol, in one line. */
function riskFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Risk to watch: a sharp price fall can liquidate a borrow on ${name}, so never borrow close to the limit.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm'))
    return `Risk to watch: providing liquidity on ${name} can lose value if the pool's prices move apart, so size the position to what you can afford to lose.`;
  if (c.includes('bridge')) return `Risk to watch: a bridge can pause or delay a crossing, so never bridge funds you need back the same day.`;
  if (c.includes('perpetual') || c.includes('derivative'))
    return `Risk to watch: leveraged positions on ${name} can be liquidated fast, so keep the hedge small and the margin topped up.`;
  if (c.includes('stable')) return `Risk to watch: a stable asset can lose its peg, so check what backs the one ${name} issues before depositing.`;
  if (c.includes('rwa')) return `Risk to watch: a yield asset's return depends on its real-world backing, so read what ${name} says backs it.`;
  if (c.includes('insurance')) return `Risk to watch: cover only pays under the policy's own terms, so read what ${name} actually covers before buying.`;
  return `Risk to watch: ${name} may never issue a token, so only farm with money you can afford to have parked.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a
 * time. Every step is derived from the protocol's own record (category,
 * chains, TVL, age) — never from a hand-written list of names. Nothing
 * here promises a token or an airdrop: the plan farms a protocol that
 * records no token, and the snapshot records no points programme.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(p);
  const weeklyGas = gas;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm on ${chain}, and keep its seed phrase offline.`,
      cost: `about $${gas} of gas for the first transaction on ${chain}`,
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: deepenFor(p, capital, chain),
      cost: `about $${gas} of gas on top of the first position`,
      time: '10 minutes',
    },
    {
      text: weeklyFor(p),
      cost: `about $${weeklyGas} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text:
        age === null
          ? `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot; the snapshot gives no listing date for this protocol, so the hold is a cautious default.`
          : `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: eligibilityFor(p),
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `${riskFor(p)} ${exitFor(p, capital, chain)}`,
      cost: `about $${gas} of gas to exit`,
      time: '15 minutes',
    },
  ];
}

/**
 * The board: every rankable pre-token protocol, scored and ranked 1..N.
 * Ties on implied value break by slug, so the ranking is fully
 * deterministic. The watchlist is the floor: every watchlist slug must
 * appear, and the board is checked for that before anything is written.
 */
export function buildBoard(snapshot: Snapshot, fit: SizeFit, bands: PeerBand[]): BoardRow[] {
  const rankable = snapshot.protocols.filter(isRankable);
  const scored = rankable.map((p) => {
    const v = impliedValue(p, snapshot.as_of, fit);
    const tier = momentumTier(p.change_7d);
    const flags = riskFlags(p, snapshot.as_of, snapshot.floor_usd);
    const band = peerBandFor(v.age, bands);
    return { p, ...v, tier, flags, band };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const capital = capitalFor(s.p);
    const gas = gasFor(s.p);
    const hold = holdDaysFor(s.age);
    const verdict = verdictFor(i + 1, s.tier, s.flags);
    const expected = Math.max(1, Math.round(s.implied * s.band.rate));
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      change_7d_raw: s.growthRaw,
      change_7d_used: s.growthUsed,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      age_known: s.age !== null,
      implied_value_usd: s.implied,
      implied_per_tvl: round4(s.implied / Math.max(1, s.p.tvl_usd)),
      expected_value_usd: expected,
      peer_base_rate: s.band.rate,
      peer_band: s.band.label,
      tier: s.tier,
      flags: s.flags,
      verdict,
      capital_usd: capital,
      gas_usd: gas,
      weekly_gas_usd: gas,
      hold_days: hold,
      model: {
        base_usd: s.base,
        growth_pct_used: s.growthUsed,
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        breadth_multiplier: round4(s.breadthMult),
        age_days: s.age,
      },
      farm_steps: farmSteps(s.p, s.age).map(stepText),
    };
  });
}

/** Live-token protocols, by market cap, for the dashboard's Live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** The census: every protocol in the snapshot, accounted for exactly once. */
export function buildCensus(snapshot: Snapshot): Census {
  let ranked = 0;
  let hasToken = 0;
  let cexNoToken = 0;
  let excludedCategory = 0;
  let excludedName = 0;
  for (const p of snapshot.protocols) {
    const reason = exclusionReason(p);
    if (reason === null) ranked++;
    else if (reason === 'has-token') hasToken++;
    else if (reason === 'excluded-category' && p.category === 'CEX') cexNoToken++;
    else if (reason === 'excluded-category') excludedCategory++;
    else excludedName++;
  }
  return {
    total: snapshot.protocols.length,
    ranked,
    watchlist: snapshot.watchlist.length,
    has_token: hasToken,
    cex_no_token: cexNoToken,
    excluded_category: excludedCategory,
    excluded_name: excludedName,
  };
}

export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    change_7d_used: row.change_7d_used,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    age_known: row.age_known,
    implied_value_usd: row.implied_value_usd,
    implied_per_tvl: row.implied_per_tvl,
    expected_value_usd: row.expected_value_usd,
    peer_base_rate: row.peer_base_rate,
    peer_band: row.peer_band,
    tier: row.tier,
    flags: row.flags,
    verdict: row.verdict,
    capital_usd: row.capital_usd,
    gas_usd: row.gas_usd,
    weekly_gas_usd: row.weekly_gas_usd,
    hold_days: row.hold_days,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    base_usd: row.model.base_usd,
    farm_steps: row.farm_steps,
  };
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const fit = fitSizeCurve(snapshot.protocols);
  const bands = peerBaseRates(snapshot);
  const board = buildBoard(snapshot, fit, bands);
  const live = liveRows(snapshot);
  const census = buildCensus(snapshot);
  const verdictCounts: Record<Verdict, number> = { FARM: 0, WATCH: 0, SKIP: 0 };
  const tierCounts: Record<MomentumTier, number> = { hot: 0, warming: 0, cooling: 0, cold: 0, unknown: 0 };
  for (const r of board) {
    verdictCounts[r.verdict]++;
    tierCounts[r.tier]++;
  }
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    fit,
    peer_bands: bands,
    census,
    watchlist: snapshot.watchlist,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    live_size: live.length,
    verdict_counts: verdictCounts,
    tier_counts: tierCounts,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0)
    throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string'))
    throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v))
      throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0)
    return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++)
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0)
      return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** The dashboard's whole dataset as one script: no fetch, no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
