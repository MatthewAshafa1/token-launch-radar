# Token Radar (radar-3)

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/MatthewAshafa1/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/MatthewAshafa1/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

make.fun bounty: [Build the best token launch radar](https://make.fun/bounty/token-radar-01) — token-radar-01. $1,325 in prizes (1st $1,000, 2nd–5th $50, 6th–10th $25). Entries close 14 December 2026, 10:00 UTC.

A program plus the dashboard it writes. It reads a sealed snapshot of the
protocol universe (DefiLlama data, fetched once by the house), ranks the
protocols whose token does not exist yet by implied value, and shows a
reader how to farm each one.

## What radar-3 does differently

- **The size multiple is fitted, not asserted.** log10(market cap) is
  regressed on log10(TVL) over the snapshot's own traded protocols, and
  the fit is tested two-fold against a flat 0.30x multiple. The program
  prints the fit and the hold-out errors on every run, and the dashboard
  shows them.
- **The exclusion rule applies to every ranked row.** Wrapped, staked and
  bridged products of tokens that already trade are not launches of their
  own, so they are never ranked — radar-2 ranked 34 of them.
- **The board ranks every rankable pre-token protocol**, not just the top
  160 by TVL below the floor, so a small protocol growing fast is visible.
- **Costed verdicts.** Each row is FARM, WATCH or SKIP from a stated rule
  (top-40, moving, at most one risk flag earns FARM — or top-10 with no
  risk flag at all; a big shrinking protocol with flags on it never does),
  with chain-aware gas assumptions, a weekly upkeep cost and a
  hold period.
- **A peer base rate per row**: the share of non-exchange protocols in
  the same age band that already have a token. A snapshot fact, never a
  prediction of a date. Expected value is implied value x that rate — a
  what-if, not a forecast.
- **An integrity strip and a census.** The dashboard recomputes its own
  checks live (watchlist coverage, exact ranks, non-rising values,
  distinct values, fitted curve beating the flat multiple) and accounts
  for all 758 protocols exactly once.

## What the snapshot cannot say

It carries no points programme, no funding, no team, no revenue or fees,
no tokenomics, no confirmed airdrop and no launch date. Farm plans are
therefore mechanism-based plans per category, labelled generic, and no
per-user airdrop amount is ever estimated.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` (Node 22, standard library only) reads the snapshot, writes
`board.json`, `data.js` and `insights.js`, copies `dashboard/` and
`screenshots/` into the output directory, and writes `dossier.json` last
with the vendored make.fun library. Open `out/dashboard/index.html` in a
browser; the page works offline with no network requests.

## Layout

- `main.ts` — entrypoint: read, score, gate, write, dossier last.
- `lib/model.ts` — snapshot parsing, exclusion rule, fitted size curve,
  implied value, peer base rates, verdicts, farm plans, census.
- `lib/insights.ts` — momentum tiers, risk flags, movers, chain leaders.
- `dashboard/` — the static page (search, category, chain, momentum and
  verdict filters; detail view with a model sandbox; model and census
  panels).
- `vendor/makefun-board.ts` — the kit's dossier builder, byte for byte.
- `screenshots/` — board, detail view, filtered view.
