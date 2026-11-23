// Token Radar dashboard (radar-4). It reads window.RADAR — written beside
// dashboard/ by main.ts — and renders the ranked board, a filterable table,
// a per-protocol detail view with the model's own inputs, the protocol's
// farm plan (read from the data, never recomputed here), and a model
// sandbox. No network: every byte it shows is in data.js, and the page
// recomputes each row's implied value from the snapshot figures, so the
// page and board.json always agree. Farm steps come from board.json via
// data.js; the page never re-derives them.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var state = { q: '', category: 'all', chain: 'all', tier: 'all', verdict: 'all', watch: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days, known) {
    if (known === false || days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtRatio(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(3) + 'x';
  }

  // The radar-4 model in one function: one log-linear regression on the
  // snapshot's own traded protocols. Only terms that survived the blind
  // test (leave-one-out plus older-to-newer, in DATA.term_test) get a
  // non-zero coefficient; a dropped term contributes exactly 1.0. The
  // page recomputes a row and checks the number board.json carries, so
  // a stale dataset would show up here. `weight` and `scale` are the
  // sandbox what-ifs: they scale the fitted curve, they never revive
  // a dropped term.
  function impliedOf(row, fit, weight, scale) {
    var m = DATA.fitted_model;
    var w = weight === undefined ? 1 : weight;
    var s = scale === undefined ? 1 : scale;
    var x = Math.log10(Math.max(1, row.tvl_usd));
    var growth = Math.min(200, Math.max(-80, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d)) / 100;
    var age = row.age_days === null || row.age_days === undefined ? 365 : row.age_days;
    var a = Math.min(Math.max(age, 0), 1460) / 1460;
    var b = Math.min(Math.max((row.chains || []).length - 1, 0), 5);
    var pred = m.intercept + m.coef_x * x * s
      + (m.kept_growth ? m.coef_g * growth * w : 0)
      + (m.kept_maturity ? m.coef_a * a : 0)
      + (m.kept_breadth ? m.coef_b * b : 0);
    var fitted = Math.pow(10, pred);
    var ratio = Math.min(0.6, Math.max(0.02, fitted / Math.max(1, row.tvl_usd)));
    return Math.max(1, Math.round(row.tvl_usd * ratio));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tier')) state.tier = params.get('tier');
    if (params.get('verdict')) state.verdict = params.get('verdict');
    if (params.get('watch') === '1') state.watch = true;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tier !== 'all') params.set('tier', state.tier);
    if (state.verdict !== 'all') params.set('verdict', state.verdict);
    if (state.watch) params.set('watch', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rowMatches(r) {
    if (state.category !== 'all' && r.category !== state.category) return false;
    if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
    if (state.tier !== 'all' && r.tier !== state.tier) return false;
    if (state.verdict !== 'all' && r.verdict !== state.verdict) return false;
    if (state.watch && !DATA.watchlistSlugs[r.slug]) return false;
    var q = state.q.trim().toLowerCase();
    if (!q) return true;
    var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
    return hay.indexOf(q) >= 0;
  }
  function rows() { return DATA.rows.filter(rowMatches); }
  function liveMatches(r) {
    if (state.category !== 'all' && r.category !== state.category) return false;
    if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
    var q = state.q.trim().toLowerCase();
    if (!q) return true;
    var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
    return hay.indexOf(q) >= 0;
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'ratio') { av = a.implied_per_tvl; bv = b.implied_per_tvl; }
      else if (key === 'expected') { av = a.expected_value_usd; bv = b.expected_value_usd; }
      else if (key === 'rank') { av = a.rank; bv = b.rank; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model · every term blind-tested' })
      )
    );
  }

  function lede() {
    var f = DATA.fit;
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by fitted implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. This radar ranks all ' + DATA.board_size + ' pre-token protocols that pass the exclusion rule — no wrapped, staked or bridged product of a token that already trades. Implied value is a model fitted on the snapshot\'s own traded protocols (' + f.n + ' comparables), not a promise — and "no token on record" is what the snapshot says, never a claim that a token does not exist.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Verdicts: FARM' }), el('b', { text: String(DATA.verdict_counts.FARM) + ' · WATCH ' + DATA.verdict_counts.WATCH + ' · SKIP ' + DATA.verdict_counts.SKIP })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function integrityStrip() {
    var rows = DATA.rows;
    var checks = [];
    var watchOk = DATA.watchlistSlugs ? Object.keys(DATA.watchlistSlugs).length : DATA.watchlist_size;
    var ranksOk = rows.every(function (r, i) { return r.rank === i + 1; });
    var orderOk = rows.every(function (r, i) { return i === 0 || r.implied_value_usd <= rows[i - 1].implied_value_usd; });
    var distinct = new Set(rows.map(function (r) { return r.implied_value_usd; })).size;
    var census = DATA.census;
    var censusOk = census.ranked + census.has_token + census.cex_no_token + census.excluded_category + census.excluded_name === census.total;
    checks.push({ ok: watchOk === DATA.watchlist_size, text: 'Watchlist ' + watchOk + '/' + DATA.watchlist_size });
    checks.push({ ok: ranksOk, text: 'Ranks 1–' + rows.length + ' exact' });
    checks.push({ ok: orderOk, text: 'Implied value never rises down the board' });
    checks.push({ ok: distinct === rows.length, text: distinct + '/' + rows.length + ' distinct values' });
    checks.push({ ok: censusOk, text: 'Census ' + census.total + '/' + census.total + ' accounted for' });
    checks.push({ ok: DATA.fit.holdout_fitted < DATA.fit.holdout_flat, text: 'Fitted curve beats flat 0.30× on held-out comps (x' + DATA.fit.holdout_ratio + ')' });
    return el('div', { class: 'strip' }, checks.map(function (c) {
      return el('span', { class: c.ok ? '' : 'bad', text: (c.ok ? '✓ ' : '✗ ') + c.text });
    }));
  }

  function topFive() {
    var top = DATA.rows.slice(0, 5);
    return el('section', { class: 'top5', 'aria-label': 'Top five protocols by implied value' },
      top.map(function (r) {
        return el('button', { type: 'button', class: 'top5-card', onclick: function () { openDetail(r.slug); } },
          el('span', { class: 'top5-rank', text: '#' + r.rank + ' · ' + r.verdict }),
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: fmtUsd(r.implied_value_usd) + ' implied · ' + fmtUsd(r.tvl_usd) + ' TVL' })
        );
      })
    );
  }

  function selectOpts(values, current, allLabel) {
    var opts = [el('option', { value: 'all', text: allLabel })];
    values.forEach(function (v) {
      opts.push(el('option', { value: v, text: v, selected: v === current ? 'selected' : null }));
    });
    return opts;
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.flatMap(function (r) { return r.chains || []; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' }, selectOpts(categories, state.category, 'All categories'));
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' }, selectOpts(chains, state.chain, 'All chains'));
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var tierSelect = el('select', { id: 'tier', 'aria-label': 'Filter by momentum' }, selectOpts(['hot', 'warming', 'cooling', 'cold', 'unknown'], state.tier, 'All momentum'));
    tierSelect.addEventListener('change', function () { state.tier = tierSelect.value; writeHash(); render(); });
    var verdictSelect = el('select', { id: 'verdict', 'aria-label': 'Filter by verdict' }, selectOpts(['FARM', 'WATCH', 'SKIP'], state.verdict, 'All verdicts'));
    verdictSelect.addEventListener('change', function () { state.verdict = verdictSelect.value; writeHash(); render(); });
    var watchBtn = el('button', { type: 'button', class: 'check', 'aria-pressed': state.watch ? 'true' : 'false', text: 'Watchlist only', onclick: function () { state.watch = !state.watch; writeHash(); render(); } });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('label', { for: 'tier', text: 'Momentum' }), tierSelect),
      el('div', { class: 'field' }, el('label', { for: 'verdict', text: 'Verdict' }), verdictSelect),
      el('div', { class: 'field' }, el('span', { text: 'Scope' }), watchBtn),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.filter(liveMatches).length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another filter to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.tier = 'all'; state.verdict = 'all'; state.watch = false; writeHash(); render(); } })
      ));
    }
    var max = DATA.rows[0] ? DATA.rows[0].implied_value_usd : 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days, r.age_known) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.min(100, Math.max(3, Math.round((r.implied_value_usd / max) * 100))) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'num', text: fmtRatio(r.implied_per_tvl) }),
        el('td', null, el('span', { class: 'tier tier-' + r.tier, text: r.tier })),
        el('td', null, el('span', { class: 'verdict verdict-' + r.verdict, text: r.verdict }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model, verdict and farm plan. Bars are scaled to rank 1, so the same value always draws the same bar.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            sortHeader('ratio', 'Value / TVL'),
            sortHeader('growth', 'Momentum'),
            sortHeader('implied', 'Verdict')
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var list = DATA.live.filter(liveMatches);
    var tbody = el('tbody');
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No live-token protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the live list again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ));
    }
    list.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking, and the same search and filters apply.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var f = DATA.fit;
    var t = DATA.term_test;
    var m = DATA.fitted_model;
    var bandRows = DATA.peer_bands.map(function (b) {
      return el('tr', null,
        el('td', { text: b.label }),
        el('td', { class: 'num', text: String(b.n) }),
        el('td', { class: 'num', text: String(b.with_token) }),
        el('td', { class: 'num', text: Math.round(b.rate * 100) + '%' })
      );
    });
    var termRows = t.verdicts.map(function (v) {
      var label = v.term === 'growth' ? '7-day growth' : v.term === 'maturity' ? 'Age (maturity)' : 'Chain breadth';
      return el('tr', null,
        el('td', { text: label }),
        el('td', { text: v.kept ? 'KEPT' : 'DROPPED' }),
        el('td', { class: 'num', text: v.loo_with.toFixed(4) + ' vs ' + v.loo_without.toFixed(4) }),
        el('td', { class: 'num', text: (v.older_newer_with === null ? 'n/a' : v.older_newer_with.toFixed(4)) + ' vs ' + (v.older_newer_without === null ? 'n/a' : v.older_newer_without.toFixed(4)) }),
        el('td', { class: 'num', text: String(v.coefficient) })
      );
    });
    var dropped = t.verdicts.filter(function (v) { return !v.kept; }).map(function (v) { return v.term; });
    var kept = t.verdicts.filter(function (v) { return v.kept; }).map(function (v) { return v.term; });
    var termLine = dropped.length === 0
      ? 'Every term survived the blind test, so the board uses all of them.'
      : (dropped.length === t.verdicts.length
        ? 'None of the three extra terms survived the blind test, so the board uses the TVL-only curve alone. That is the honest result on this snapshot: growth, age and breadth did not improve held-out error, so they are not used — the board does not pretend they help.'
        : 'Dropped: ' + dropped.join(', ') + '. Kept: ' + (kept.length ? kept.join(', ') : 'none besides TVL') + '.');
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'log10(implied) = ' + m.intercept + ' + ' + m.coef_x + ' x log10(TVL)' +
        (m.kept_growth ? ' + ' + m.coef_g + ' x growth' : '') +
        (m.kept_maturity ? ' + ' + m.coef_a + ' x age' : '') +
        (m.kept_breadth ? ' + ' + m.coef_b + ' x breadth' : '') + '\n' +
        'implied = round( TVL x clamp( 10 ^ log10(implied) / TVL, 0.02, 0.60 ) )'
      ),
      el('p', { class: 'sub', text: 'The model is one log-linear regression fitted on the snapshot\'s own traded protocols: ' + f.n + ' comparables with a market cap and a TVL, exchanges excluded. Growth is the 7-day TVL change clamped to -80%…+200% and divided by 100 (no change reported counts as 0). Age is days since first listed, capped at 1460, over 1460 (unknown age uses 365 days and is flagged age-unknown). Breadth is extra chains beyond the first, capped at 5.' }),
      el('h3', { text: 'Term test: every value term blind-tested, failures dropped' }),
      el('p', { class: 'sub', text: 'Five nested models were scored on identical leave-one-out folds over ' + t.n_comps + ' traded comparables, plus an older-to-newer split (train on the ' + t.older_newer_n_train + ' older-listed protocols, test on the ' + t.older_newer_n_test + ' newer-listed ones — a one-date snapshot, so this is an older-to-newer split, never a true walk-forward). A term is kept only if it strictly lowers the median leave-one-out error, its fitted coefficient has the expected sign, and its older-to-newer error does not worsen by more than 0.02. ' + termLine }),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Term' }), el('th', { scope: 'col', text: 'Verdict' }), el('th', { scope: 'col', text: 'LOO error with vs without' }), el('th', { scope: 'col', text: 'Older-to-newer with vs without' }), el('th', { scope: 'col', text: 'Coefficient' }))),
          el('tbody', null, termRows)
        )
      ),
      el('p', { class: 'sub', text: 'Nested models, median |log10 error|: ' + t.models.map(function (mo) { return mo.name + ' ' + mo.label + ' LOO ' + mo.loo_median_error + ', older-to-newer ' + (mo.older_newer_median_error === null ? 'n/a' : mo.older_newer_median_error); }).join('; ') + '. The size curve alone is also tested two-fold against a flat 0.30x multiple: fitted median error ' + f.holdout_fitted + ' in log10 (about x' + Math.pow(10, f.holdout_fitted).toFixed(2) + ') against ' + f.holdout_flat + ' for flat 0.30x (about x' + Math.pow(10, f.holdout_flat).toFixed(2) + ') — the fit is ' + f.holdout_ratio + 'x closer. A flat multiple would say a $5B protocol is worth 100x a $50M one; the fitted curve says size pays off more slowly than that, which is why the ranking is not a TVL table.' }),
      el('p', { class: 'sub', text: 'Growth is clamped at -80% to +200% and the detail view shows the raw week beside the clamped figure the model used. Age is the time since the protocol was first listed; an unlisted age uses 365 days and is flagged age-unknown. Breadth is a small nudge for protocols live on more chains — when it is dropped, it contributes exactly 1.0.' }),
      el('h3', { text: 'Verdicts: FARM, WATCH, SKIP' }),
      el('p', { class: 'sub', text: 'FARM means top-40 by implied value, moving (hot or warming) and carrying at most one risk flag — or top-10 with no risk flag at all, where the value case does not rest on a single week\'s move. WATCH means top-100 or moving fast. Everything else is SKIP. A big protocol shrinking for a week with flags on it is never a FARM. Gas figures are assumptions, not snapshot facts: $12 on Ethereum, $1 on Solana, $2 on Base, Arbitrum, Optimism and Polygon, $5 elsewhere — the detail view says so next to the numbers.' }),
      el('h3', { text: 'Peer base rate: how often protocols of this age have a token' }),
      el('p', { class: 'sub', text: 'For each age band, the share of non-exchange protocols listed that long ago that already have a token. It is a base rate from this snapshot, not a prediction of a date. Expected value is implied value x that rate — a what-if, not a forecast.' }),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Listed' }), el('th', { scope: 'col', text: 'Protocols' }), el('th', { scope: 'col', text: 'With a token' }), el('th', { scope: 'col', text: 'Base rate' }))),
          el('tbody', null, bandRows)
        )
      ),
      el('h3', { text: 'What the snapshot cannot say' }),
      el('p', { class: 'sub', text: 'It carries no points programme, no funding, no team, no revenue or fees, no tokenomics, no confirmed airdrop and no launch date. Farm plans are therefore mechanism-based plans per category (deposit, provide liquidity, bridge, stake), labelled generic, and no per-user airdrop amount is ever estimated. Any entry that claims those signals from this snapshot is inventing them.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var recomputed = impliedOf(row, DATA.fit);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · ' + row.verdict }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    var growthLine = row.change_7d === null
      ? 'No 7-day change reported; the model used 0%.'
      : 'Raw week ' + fmtPct(row.change_7d) + '; the model used ' + fmtPct(row.change_7d_used) + ' (clamped to -80%…+200%).';
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Fitted base' }), el('b', { class: 'num', text: fmtUsd(row.base_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days, row.age_known) })),
        el('div', null, el('span', { text: 'Chains' }), el('b', { class: 'num', text: String((row.chains || []).length) })),
        el('div', null, el('span', { text: 'Implied / TVL' }), el('b', { class: 'num', text: fmtRatio(row.implied_per_tvl) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Breadth multiplier' }), el('b', { class: 'num', text: String(row.breadth_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'Peer base rate (' + row.peer_band + ')' }), el('b', { class: 'num', text: Math.round(row.peer_base_rate * 100) + '%' })),
        el('div', null, el('span', { text: 'Expected value (what-if)' }), el('b', { class: 'num', text: fmtUsd(row.expected_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' ' + growthLine + ' This is an estimate, not a price.' }),
      el('p', { class: 'sub', text: 'Momentum ' + row.tier + (row.flags.length ? ' · flags: ' + row.flags.join(', ') + '.' : ' · no risk flags.') + ' Verdict ' + row.verdict + ' on $' + row.capital_usd + ' of capital, about $' + row.gas_usd + ' of gas per action (assumption for its main chain), about $' + row.weekly_gas_usd + ' a week to keep the farm alive, held at least ' + row.hold_days + ' days.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('p', { class: 'sub', text: 'A generic, mechanism-based plan for this category — the snapshot records no points programme for this protocol, so nothing here claims one. Never pay to claim.' }),
      el('ol', { class: 'steps' }, (row.farm_steps || []).map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    var sandbox = el('section', { class: 'detail-section sandbox' },
      el('h3', { text: 'Try the model' }),
      el('p', { class: 'sub', text: 'Move the sliders to see how this row\'s implied value responds. This changes nothing on the board — it is a what-if for this protocol only.' })
    );
    var out = el('p', null, 'Implied value with these settings: ', el('output', { text: fmtUsd(row.implied_value_usd) }));
    var growthKept = DATA.fitted_model && DATA.fitted_model.kept_growth;
    var wLabel = el('label', { for: 'sb-weight', text: growthKept ? 'Growth coefficient scale (model: 1.0x)' : 'Growth term: DROPPED by the blind test — the slider cannot revive it' });
    var wSlider = el('input', { type: 'range', id: 'sb-weight', min: '0', max: '2', step: '0.1', value: '1', disabled: growthKept ? null : 'disabled' });
    var sLabel = el('label', { for: 'sb-scale', text: 'Size slope scale (model: 1.0x)' });
    var sSlider = el('input', { type: 'range', id: 'sb-scale', min: '0.5', max: '1.5', step: '0.1', value: '1' });
    function refreshSandbox() {
      var v = impliedOf(row, DATA.fit, parseFloat(wSlider.value), parseFloat(sSlider.value));
      out.querySelector('output').textContent = fmtUsd(v);
    }
    wSlider.addEventListener('input', refreshSandbox);
    sSlider.addEventListener('input', refreshSandbox);
    sandbox.appendChild(wLabel);
    sandbox.appendChild(wSlider);
    sandbox.appendChild(sLabel);
    sandbox.appendChild(sSlider);
    sandbox.appendChild(out);
    dialog.appendChild(sandbox);
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function fillInsightsPanel() {
    var panel = document.getElementById('insights-panel');
    var data = window.INSIGHTS;
    if (!panel || !data) return;
    var s = data.summary;
    panel.appendChild(el('p', { class: 'insights-lede' },
      'Across ' + s.rankable_count + ' rankable pre-token protocols (' + s.pre_token_count + ' pre-token in total), ' + s.hot_count + ' are hot, ' +
      s.warming_count + ' warming, ' + s.cooling_count + ' cooling, ' + s.cold_count + ' cold and ' + s.unknown_count +
      ' report no 7-day change. The middle rankable protocol moved ' + fmtPct(s.median_change_7d) +
      ' in the last 7 days, and ' + s.flagged_count + ' carry at least one risk flag. Select a mover or a leader to open its detail view.'));
    if (data.chain_leaders && data.chain_leaders.length > 0) {
      panel.appendChild(el('h3', { class: 'insights-subhead' }, 'Biggest rankable protocol on each chain'));
      var leaders = el('div', { class: 'insights-leaders' }, data.chain_leaders.map(function (l) {
        return el('button', { type: 'button', class: 'insights-leader', onclick: function () { openDetail(l.slug); } },
          el('span', { class: 'insights-leader-chain' }, l.chain),
          el('strong', null, l.name),
          el('span', { class: 'insights-leader-tvl' }, fmtUsd(l.tvl_usd)),
          el('span', { class: 'tier tier-' + l.tier }, l.tier),
          el('span', { class: 'insights-leader-flags' }, l.flag_count > 0 ? l.flag_count + (l.flag_count === 1 ? ' flag' : ' flags') : 'no flags'));
      }));
      panel.appendChild(leaders);
    }
    if (!data.movers || data.movers.length === 0) {
      panel.appendChild(el('p', { class: 'insights-empty' }, 'No movers in this snapshot.'));
      return;
    }
    var head = el('tr', null,
      el('th', { scope: 'col' }, '#'),
      el('th', { scope: 'col' }, 'Protocol'),
      el('th', { scope: 'col' }, 'TVL'),
      el('th', { scope: 'col' }, '7d raw'),
      el('th', { scope: 'col' }, '7d used'),
      el('th', { scope: 'col' }, 'Momentum'),
      el('th', { scope: 'col' }, 'Risk flags'));
    var body = el('tbody', null, data.movers.map(function (m, i) {
      return el('tr', {
        onclick: function () { openDetail(m.slug); },
        tabindex: '0',
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(m.slug); } }
      },
        el('td', null, String(i + 1)),
        el('td', null,
          el('strong', null, m.name),
          el('span', { class: 'insights-cat' }, ' ' + m.category)),
        el('td', null, fmtUsd(m.tvl_usd)),
        el('td', null, fmtPct(m.change_7d)),
        el('td', null, fmtPct(m.change_7d_used)),
        el('td', null, el('span', { class: 'tier tier-' + m.tier }, m.tier)),
        el('td', null, m.flags.length > 0 ? m.flags.join(' · ') : '—'));
    }));
    panel.appendChild(el('div', { class: 'insights-table-wrap' },
      el('table', { class: 'insights-table' }, el('thead', null, head), body)));
    panel.appendChild(el('p', { class: 'insights-note' },
      'Hot means +25% or more in 7 days; warming +10%; cooling -5% to +10%; cold below -5%. ' +
      '"7d used" is the raw week clamped to -80%…+200% for the model. ' +
      'Flags: young (listed under 180 days ago), age-unknown (no listing date), single-chain, near-floor (TVL under 1.5x the $50M floor). ' +
      'A flag is a prompt to check, not a verdict.'));
  }

  function fillCensusPanel() {
    var panel = document.getElementById('census-panel');
    if (!panel) return;
    var c = DATA.census;
    var rows = [
      ['Ranked on this board', c.ranked],
      ['Watchlist protocols (inside the ranked rows)', c.watchlist],
      ['Already have a token', c.has_token],
      ['Exchanges with no token', c.cex_no_token],
      ['Excluded by category (bridge / liquid staking / restaking)', c.excluded_category],
      ['Excluded by name (wrapped / staked / versioned / exchange product)', c.excluded_name],
      ['Total protocols in the snapshot', c.total],
    ];
    panel.appendChild(el('div', { class: 'panel' },
      el('h2', { text: 'Where every protocol went' }),
      el('p', { class: 'sub', text: 'The snapshot holds ' + c.total + ' protocols. Each one is accounted for exactly once below — nothing is silently dropped. Wrapped, staked and bridged products of tokens that already trade are excluded because they are not launches of their own.' }),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Outcome' }), el('th', { scope: 'col', text: 'Protocols' }))),
          el('tbody', null, rows.map(function (r) {
            return el('tr', null, el('td', { text: r[0] }), el('td', { class: 'num', text: String(r[1]) }));
          }))
        )
      )
    ));
  }

  function render() {
    var app = document.getElementById('board');
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(integrityStrip());
    if (state.tab === 'pre-token') shell.appendChild(topFive());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  // The watchlist as a lookup, for the watchlist-only toggle.
  DATA.watchlistSlugs = {};
  (DATA.watchlist || []).forEach(function (s) { DATA.watchlistSlugs[s] = true; });
  readHash();
  render();
  fillInsightsPanel();
  fillCensusPanel();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
