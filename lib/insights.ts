// Momentum and risk insights for the token radar.
//
// A companion to the radar-2 board: while the board ranks protocols by
// implied value, this module answers the next question a farmer asks —
// which pre-token protocols are moving fastest right now, and which of
// them carry a warning worth knowing before farming.
//
// Everything here is computed from the sealed snapshot alone. No network
// calls, no clocks, no randomness: the same snapshot always yields the
// same insights, so the panel is as reproducible as the board itself.
//
// Momentum tiers, from a protocol's 7-day TVL change in percent (so
// +25 means TVL grew 25% in a week, the same units the snapshot and
// the radar-2 model use):
//   hot      +25% or more     — moving fast, look first
//   warming  +10% to +25%     — building momentum
//   cooling  -5% to +10%      — flat to gently rising
//   cold     below -5%        — TVL shrinking, look twice
//
// Risk flags, from the protocol's own snapshot record:
//   young         listed less than 180 days before the snapshot date
//   single-chain  live on one chain only, so one chain's outage or
//                 incentive change hits it in full
//   near-floor    TVL under 1.5x the snapshot's $50M floor, so a small
//                 outflow drops it out of the radar's universe
//
// A flag is a prompt to check, not a verdict: a young single-chain
// protocol can still be the best farm on the board, and a cold one can
// still be worth watching. The panel shows the flags next to the
// numbers so the reader weighs both at once.

import { ageDays, isPreToken } from './model.ts';
import type { Snapshot, SnapshotProtocol } from './model.ts';

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

/** A protocol's momentum tier, from its 7-day TVL change. */
export type MomentumTier = 'hot' | 'warming' | 'cooling' | 'cold';

/** One row of the movers table: the fastest-growing pre-token protocols. */
export interface InsightMover {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number;
  tier: MomentumTier;
  flags: string[];
}

/** The panel's headline numbers, for the summary line above the table. */
export interface InsightSummary {
  as_of: string;
  pre_token_count: number;
  hot_count: number;
  warming_count: number;
  cooling_count: number;
  cold_count: number;
  median_change_7d: number;
  top_mover_slug: string | null;
  flagged_count: number;
}

/** One row of the chain-leaders strip: the biggest pre-token protocol on each chain. */
export interface ChainLeader {
  chain: string;
  slug: string;
  name: string;
  tvl_usd: number;
  change_7d: number;
  tier: MomentumTier;
  flag_count: number;
}

/** How many chains the leaders strip shows. */
export const LEADER_CHAINS = 8;

/**
 * The biggest pre-token protocol on each chain, best first by TVL.
 *
 * A chain's leader is the protocol a farmer would meet first there, so the
 * strip answers "where is the money on each chain" without scrolling the
 * whole board. Chains are ordered by their leader's TVL, biggest first, and
 * ties break on slug so the order is stable between runs. Only chains with
 * at least one pre-token protocol appear; a chain whose pre-token protocols
 * are all below the snapshot floor is still shown, because the floor is
 * about the snapshot, not about the chain. The flag count beside each
 * leader is the same risk-flag count the movers table shows, so a leader
 * carrying two flags reads as big but early, and a leader carrying none
 * reads as big and settled.
 */
export function buildChainLeaders(pre: SnapshotProtocol[], asOf: string, floorUsd: number): ChainLeader[] {
  const bestByChain = new Map<string, SnapshotProtocol>();
  for (const p of pre) {
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
    change_7d: round4dp(p.change_7d),
    tier: momentumTier(p.change_7d),
    flag_count: riskFlags(p, asOf, floorUsd).length,
  }));
  leaders.sort((a, b) => {
    if (b.tvl_usd !== a.tvl_usd) return b.tvl_usd - a.tvl_usd;
    return a.chain < b.chain ? -1 : a.chain > b.chain ? 1 : 0;
  });
  return leaders.slice(0, LEADER_CHAINS);
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

/**
 * The momentum tier for a 7-day TVL change. The bands are fixed above
 * so a reader can learn them once and read any row at a glance.
 */
export function momentumTier(change7d: number): MomentumTier {
  if (change7d >= HOT_AT) return 'hot';
  if (change7d >= WARMING_AT) return 'warming';
  if (change7d >= COOLING_AT) return 'cooling';
  return 'cold';
}

/**
 * The risk flags for one protocol. Age comes from the listing date
 * against the snapshot date; a missing listing date simply earns no
 * young flag rather than a guess.
 */
export function riskFlags(
  p: SnapshotProtocol,
  asOf: string,
  floorUsd: number,
): string[] {
  const flags: string[] = [];
  const age = ageDays(asOf, p.listed_at);
  if (age !== null && age < YOUNG_DAYS) flags.push('young');
  if (p.chains.length <= 1) flags.push('single-chain');
  if (p.tvl_usd < floorUsd * NEAR_FLOOR_MULTIPLE) flags.push('near-floor');
  return flags;
}

/** The middle value of a sorted list, or 0 for an empty one. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/** One mover row from a protocol and the snapshot date it was read on. */
function toMover(p: SnapshotProtocol, asOf: string, floorUsd: number): InsightMover {
  return {
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: [...p.chains],
    tvl_usd: p.tvl_usd,
    change_7d: round4dp(p.change_7d),
    tier: momentumTier(p.change_7d),
    flags: riskFlags(p, asOf, floorUsd),
  };
}

/**
 * Build the insights for a snapshot. Movers are the ten pre-token
 * protocols with the largest 7-day TVL growth; ties break by slug so
 * the order is stable run to run. Tier counts cover every pre-token
 * protocol, not just the movers, so the summary describes the whole
 * field the board ranks.
 */
export function buildInsights(snapshot: Snapshot): Insights {
  const pre = snapshot.protocols.filter(isPreToken);
  const ranked = [...pre].sort((a, b) => {
    if (b.change_7d !== a.change_7d) return b.change_7d - a.change_7d;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
  const movers = ranked
    .slice(0, MOVER_COUNT)
    .map((p) => toMover(p, snapshot.as_of, snapshot.floor_usd));
  const chain_leaders = buildChainLeaders(pre, snapshot.as_of, snapshot.floor_usd);
  const tier_counts: Record<MomentumTier, number> = {
    hot: 0,
    warming: 0,
    cooling: 0,
    cold: 0,
  };
  let flagged = 0;
  for (const p of pre) {
    tier_counts[momentumTier(p.change_7d)] += 1;
    if (riskFlags(p, snapshot.as_of, snapshot.floor_usd).length > 0) flagged += 1;
  }
  const summary: InsightSummary = {
    as_of: snapshot.as_of,
    pre_token_count: pre.length,
    hot_count: tier_counts.hot,
    warming_count: tier_counts.warming,
    cooling_count: tier_counts.cooling,
    cold_count: tier_counts.cold,
    median_change_7d: round4dp(median(pre.map((p) => p.change_7d))),
    top_mover_slug: movers.length > 0 ? movers[0].slug : null,
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
