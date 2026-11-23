// Momentum and risk insights for the token radar (radar-3).
//
// radar-3 fixes radar-2's insights panel:
//
//   - Chain leaders are drawn from rankable protocols only, one leader
//     per chain, deduplicated by slug. radar-2's strip showed the same
//     protocol (Bybit, a CEX with no token) as the leader of all 8 chains.
//   - A missing 7-day change is shown as "n/a", never as 0.00% / cooling.
//   - Growth is shown raw AND clamped: the board's model clamps extreme
//     weeks, and the panel says so next to the number instead of showing
//     +4,448% in one place and +150% in another with no note.
//
// Everything here is computed from the sealed snapshot alone. No network
// calls, no clocks, no randomness: the same snapshot always yields the
// same insights, so the panel is as reproducible as the board itself.
//
// Momentum tiers, from a protocol's 7-day TVL change in percent:
//   hot      +25% or more     — moving fast, look first
//   warming  +10% to +25%     — building momentum
//   cooling  -5% to +10%      — flat to gently rising
//   cold     below -5%        — TVL shrinking, look twice
//   unknown  no change reported — no tier claimed
//
// Risk flags, from the protocol's own snapshot record:
//   young         listed less than 180 days before the snapshot date
//   age-unknown   no listing date in the snapshot at all
//   single-chain  live on one chain only
//   near-floor    TVL under 1.5x the snapshot's $50M floor

import { ageDays, isRankable, momentumTier, riskFlags } from './model.ts';
import type { MomentumTier, Snapshot, SnapshotProtocol } from './model.ts';
import { GROWTH_CAP, GROWTH_FLOOR } from './model.ts';

/** How many movers the panel lists. */
export const MOVER_COUNT = 10;

/** 7-day growth at or above this is hot. */
export const HOT_AT = 25;

/** 7-day growth at or above this is warming. */
export const WARMING_AT = 10;

/** 7-day growth at or above this is cooling; below it is cold. */
export const COOLING_AT = -5;

/** A protocol listed fewer days ago than this counts as young. */
export const YOUNG_DAYS = 180;

/** TVL below this multiple of the snapshot floor counts as near-floor. */
export const NEAR_FLOOR_MULTIPLE = 1.5;

/** One row of the movers table: the fastest-growing rankable protocols. */
export interface InsightMover {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  change_7d_used: number;
  tier: MomentumTier;
  flags: string[];
}

/** The panel's headline numbers, for the summary line above the table. */
export interface InsightSummary {
  as_of: string;
  pre_token_count: number;
  rankable_count: number;
  hot_count: number;
  warming_count: number;
  cooling_count: number;
  cold_count: number;
  unknown_count: number;
  median_change_7d: number | null;
  top_mover_slug: string | null;
  flagged_count: number;
}

/** One row of the chain-leaders strip: the biggest rankable protocol on each chain. */
export interface ChainLeader {
  chain: string;
  slug: string;
  name: string;
  tvl_usd: number;
  change_7d: number | null;
  tier: MomentumTier;
  flag_count: number;
}

/** How many chains the leaders strip shows. */
export const LEADER_CHAINS = 8;

/** The change the model actually uses: raw, clamped to the model's band. */
export function clampedChange(change7d: number | null): number {
  if (change7d === null || !Number.isFinite(change7d)) return 0;
  return Math.min(GROWTH_CAP, Math.max(GROWTH_FLOOR, change7d));
}

/**
 * The biggest rankable protocol on each chain, best first by TVL.
 * Leaders are deduplicated by slug, so one protocol that spans many
 * chains takes only its biggest chain's slot and the strip shows eight
 * different protocols. Chains are ordered by their leader's TVL.
 */
export function buildChainLeaders(rankable: SnapshotProtocol[], asOf: string, floorUsd: number): ChainLeader[] {
  const bestByChain = new Map<string, SnapshotProtocol>();
  for (const p of rankable) {
    for (const chain of p.chains) {
      const current = bestByChain.get(chain);
      if (current === undefined) {
        bestByChain.set(chain, p);
        continue;
      }
      if (p.tvl_usd === current.tvl_usd) {
        if (p.slug < current.slug) bestByChain.set(chain, p);
        continue;
      }
      if (p.tvl_usd > current.tvl_usd) bestByChain.set(chain, p);
    }
  }
  const leaders = [...bestByChain.entries()].map(([chain, p]) => ({
    chain,
    slug: p.slug,
    name: p.name,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    tier: momentumTier(p.change_7d),
    flag_count: riskFlags(p, asOf, floorUsd).length,
  }));
  leaders.sort((a, b) => {
    if (b.tvl_usd !== a.tvl_usd) return b.tvl_usd - a.tvl_usd;
    return a.chain < b.chain ? -1 : a.chain > b.chain ? 1 : 0;
  });
  const seen = new Set<string>();
  const deduped: ChainLeader[] = [];
  for (const l of leaders) {
    if (seen.has(l.slug)) continue;
    seen.add(l.slug);
    deduped.push(l);
    if (deduped.length >= LEADER_CHAINS) break;
  }
  return deduped;
}

/** Everything the dashboard panel needs, as plain JSON. */
export interface Insights {
  as_of: string;
  movers: InsightMover[];
  chain_leaders: ChainLeader[];
  tier_counts: Record<MomentumTier, number>;
  summary: InsightSummary;
}

/** Round to four decimal places, so the JSON stays stable and readable. */
function round4dp(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** The middle value of a sorted list, or null for an empty one. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** One mover row from a protocol and the snapshot date it was read on. */
function toMover(p: SnapshotProtocol, asOf: string, floorUsd: number): InsightMover {
  return {
    slug: p.slug,
    name: p.name,
    category: p.category ?? 'Other',
    chains: [...p.chains],
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    change_7d_used: clampedChange(p.change_7d),
    tier: momentumTier(p.change_7d),
    flags: riskFlags(p, asOf, floorUsd),
  };
}

/**
 * Build the insights for a snapshot. Movers are the ten rankable
 * protocols with the largest 7-day TVL growth; rows with no reported
 * change sort last, never as zero. Tier counts cover every rankable
 * protocol, not just the movers, so the summary describes the whole
 * field the board ranks.
 */
export function buildInsights(snapshot: Snapshot): Insights {
  const rankable = snapshot.protocols.filter(isRankable);
  const withChange = rankable.filter((p) => p.change_7d !== null && Number.isFinite(p.change_7d));
  const ranked = [...withChange].sort((a, b) => {
    if (b.change_7d !== a.change_7d) return (b.change_7d ?? 0) - (a.change_7d ?? 0);
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
  const movers = ranked.slice(0, MOVER_COUNT).map((p) => toMover(p, snapshot.as_of, snapshot.floor_usd));
  const chain_leaders = buildChainLeaders(rankable, snapshot.as_of, snapshot.floor_usd);
  const tier_counts: Record<MomentumTier, number> = {
    hot: 0,
    warming: 0,
    cooling: 0,
    cold: 0,
    unknown: 0,
  };
  let flagged = 0;
  for (const p of rankable) {
    tier_counts[momentumTier(p.change_7d)] += 1;
    if (riskFlags(p, snapshot.as_of, snapshot.floor_usd).length > 0) flagged += 1;
  }
  const pre = snapshot.protocols.filter((p) => p.mcap_usd === null && p.gecko_id === null && p.symbol === null);
  const summary: InsightSummary = {
    as_of: snapshot.as_of,
    pre_token_count: pre.length,
    rankable_count: rankable.length,
    hot_count: tier_counts.hot,
    warming_count: tier_counts.warming,
    cooling_count: tier_counts.cooling,
    cold_count: tier_counts.cold,
    unknown_count: tier_counts.unknown,
    median_change_7d:
      withChange.length === 0 ? null : round4dp(median(withChange.map((p) => p.change_7d!)) ?? 0),
    top_mover_slug: movers.length > 0 ? movers[0]!.slug : null,
    flagged_count: flagged,
  };
  return { as_of: snapshot.as_of, movers, chain_leaders, tier_counts, summary };
}

/**
 * The insights as a script the dashboard loads beside the page, in the
 * same shape as the board's data file: one global assignment, nothing
 * else, so the page stays free of network requests.
 */
export function insightsScript(insights: Insights): string {
  return `window.INSIGHTS=${JSON.stringify(insights)};\n`;
}
