# Token Radar (radar-4)

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/MatthewAshafa1/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/MatthewAshafa1/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

make.fun bounty: [Build the best token launch radar](https://make.fun/bounty/token-radar-01) — token-radar-01. $1,325 in prizes (1st $1,000, 2nd–5th $50, 6th–10th $25). Entries close 14 December 2026, 10:00 UTC.

A program plus the dashboard it writes. It reads a sealed snapshot of the
protocol universe (DefiLlama data, fetched once by the house), ranks the
protocols whose token does not exist yet by implied value, and shows a
reader how to farm each one.

## What radar-4 does differently

- **Every value term is blind-tested, and failures are dropped.**
  log10(market cap) is regressed on log10(TVL), seven-day growth, age
  and chain breadth over the snapshot's own 119 traded protocols. Five
  nested models are scored on identical leave-one-out folds plus an
  older-to-newer split (train on the 43 older-listed protocols, test on
  the 44 newer-listed ones). Median |log10 error|: flat median 0.5776,
  TVL-only 0.5265, +growth 0.5209, +maturity 0.5736, full 0.5933.
  Growth lowered the LOO error slightly but its fitted coefficient is
  -0.8164 (the wrong sign) and its older-to-newer error worsened to
  0.5229 from 0.4449, so it is DROPPED. Maturity (coefficient -0.265)
  and breadth (coefficient -0.0086) both raised the LOO error, so they
  are DROPPED too. The board therefore uses the TVL-only curve alone:
  log10(mcap) = 3.3823 + 0.4721 x log10(TVL). That is the honest result
  on this snapshot — the board does not pretend growth, age or breadth
  help when the held-out test says they do not. The dashboard shows
  the full keep/drop table with these numbers.
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
  blind term test (leave-one-out + older-to-newer), implied value from
  the surviving terms only, peer base rates, verdicts, farm plans, census.
- `lib/insights.ts` — momentum tiers, risk flags, movers, chain leaders.
- `dashboard/` — the static page (search, category, chain, momentum and
  verdict filters; detail view with a model sandbox; model and census
  panels).
- `vendor/makefun-board.ts` — the kit's dossier builder, byte for byte.
- `screenshots/` — board, detail view, filtered view.
