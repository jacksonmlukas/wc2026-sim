/* World Cup Sim — showcase site app (website_plan.md). Vanilla SPA over the inlined data contract
   (window.WCSIM), ECharts for charts, D3 for the bracket + shot-map. Theme-aware, reduced-motion
   aware, keyboard-navigable. No fabricated data — every value comes from window.WCSIM. */
(function () {
  "use strict";
  var D = window.WCSIM || {};
  var charts = [];
  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- helpers ---------------------------------------------------------------------------------
  function $(s, r) { return (r || document).querySelector(s); }
  function ce(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function pct(x, d) { return (x * 100).toFixed(d == null ? 1 : d) + "%"; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  // P(X >= k) for X ~ Poisson(lambda) — client-side goal-distribution tails (View 3).
  function poissonTail(lam, k) { var c = Math.exp(-lam), s = c; for (var i = 1; i < k; i++) { c *= lam / i; s += c; } return Math.max(0, 1 - s); }
  function flagURL(team, w) {
    var code = (D.flags || {})[team] || (D.flags || {})[(team || "").replace(/\s*(Women's|U-?\d+).*$/, "").trim()];
    return code ? (D.flag_base + "/w" + (w || 40) + "/" + code + ".png") : null;
  }
  function flagImg(team, cls) { var u = flagURL(team); return u ? '<img class="flag ' + (cls || "") + '" src="' + u + '" alt="">' : '<span class="flag ' + (cls || "") + '" style="background:var(--line)"></span>'; }
  function avatarURL(name) { return "https://api.dicebear.com/9.x/avataaars/svg?seed=" + encodeURIComponent(name || "") + "&backgroundType=gradientLinear"; }
  // R8: headshots hotlink Wikimedia with no guarantee the image still resolves — every <img class=hs>
  // gets an onerror that swaps to the generated Dicebear avatar so a 404 never shows a broken image.
  function hsImg(name, hs, extra) {
    var src = (hs || {})[name] || avatarURL(name);
    var av = avatarURL(name);
    return '<img class="hs ' + (extra || "") + '" src="' + src + '" alt="" loading="lazy" ' +
      'onerror="this.onerror=null;this.src=\'' + av + '\'">';
  }
  function odds(t) { return (D.odds || {})[t] || {}; }
  function disposeCharts() { charts.forEach(function (c) { try { c.dispose(); } catch (e) {} }); charts = []; }
  // U1.6: defer expensive work until `node` nears the viewport (build once, then unobserve). Builds
  // eagerly if reduced-motion or no observer. In-view nodes fire immediately, so first paint is snappy.
  function lazyChart(node, build) {
    if (REDUCED || !("IntersectionObserver" in window)) { build(); return; }
    var done = false;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting && !done) { done = true; build(); io.disconnect(); } });
    }, { rootMargin: "200px" });
    io.observe(node);
    charts.push({ dispose: function () { io.disconnect(); } });  // cleaned up on route change
  }
  function mkChart(node, option) {
    // Build the ECharts instance lazily (the canvas init + setOption is the costly part).
    lazyChart(node, function () {
      var c = window.echarts.init(node, null, { renderer: "canvas" });
      c.setOption(option); charts.push(c);
    });
  }
  // U2.1: give a (canvas) chart a text alternative — role/aria-label on the node + a coded data
  // table (caption + th scope) revealed by a "Show table / Show chart" toggle. `rows[i][0]` is the
  // row header. Appends the toggle + table to `panel`; the table is sr-only until shown.
  function attachChartTable(panel, node, caption, headers, rows) {
    node.setAttribute("role", "img"); node.setAttribute("aria-label", caption);
    var btn = ce("button", "tbl-toggle"); btn.type = "button"; btn.textContent = "Show table";
    btn.setAttribute("aria-expanded", "false");
    var tbl = ce("table", "chart-table sr-only");
    tbl.innerHTML = "<caption>" + esc(caption) + "</caption><thead><tr>" +
      headers.map(function (h) { return '<th scope="col">' + esc(h) + "</th>"; }).join("") +
      "</tr></thead><tbody>" + rows.map(function (r) {
        return "<tr>" + r.map(function (c, i) { return i === 0 ? '<th scope="row">' + esc(c) + "</th>" : "<td>" + esc(c) + "</td>"; }).join("") + "</tr>";
      }).join("") + "</tbody>";
    btn.onclick = function () {
      var showing = tbl.classList.toggle("sr-only") === false;
      node.style.display = showing ? "none" : "";
      btn.textContent = showing ? "Show chart" : "Show table";
      btn.setAttribute("aria-expanded", showing ? "true" : "false");
    };
    panel.appendChild(btn); panel.appendChild(tbl);
  }
  // U2.2: keyboard-operable sortable header row — real <button>s (Enter/Space sort) + aria-sort on
  // the <th>. Pair with `wireSort(tbl, onSort)` which delegates clicks from the `.th-sort` buttons.
  function sortHead(cols, st) {
    return "<thead><tr>" + cols.map(function (c) {
      var active = c[0] === st.key, sort = active ? (st.dir < 0 ? "descending" : "ascending") : "none";
      return '<th aria-sort="' + sort + '" class="' + (active ? (st.dir < 0 ? "sorted" : "asc") : "") + '"><button type="button" class="th-sort" data-k="' + c[0] + '">' + esc(c[1]) + "</button></th>";
    }).join("") + "</tr></thead>";
  }
  function wireSort(tbl, onSort) {
    tbl.querySelectorAll(".th-sort").forEach(function (b) { b.onclick = function () { onSort(b.dataset.k); }; });
  }
  function axisTheme() {
    return {
      textStyle: { fontFamily: cssVar("--font") },
      grid: { left: 8, right: 14, top: 18, bottom: 6, containLabel: true },
      tooltip: { backgroundColor: cssVar("--panel"), borderColor: cssVar("--line"),
        textStyle: { color: cssVar("--text") } },
    };
  }
  function axisStyle() {
    return { axisLine: { lineStyle: { color: cssVar("--line-2") } }, axisLabel: { color: cssVar("--muted") },
      splitLine: { lineStyle: { color: cssVar("--line") } }, axisTick: { show: false } };
  }
  // U2.3: Wong colorblind-safe categorical order for multi-series charts.
  function CB_PALETTE() {
    return ["--cb-blue", "--cb-orange", "--cb-green", "--cb-purple", "--cb-vermillion", "--cb-skyblue", "--cb-yellow", "--cb-grey"].map(cssVar);
  }
  function countUp(node, target, suffix, dec) {
    if (REDUCED) { node.textContent = target.toFixed(dec || 0) + (suffix || ""); return; }
    var t0 = null, dur = 900;
    function step(t) { if (!t0) t0 = t; var k = Math.min(1, (t - t0) / dur);
      node.textContent = (target * (1 - Math.pow(1 - k, 3))).toFixed(dec || 0) + (suffix || "");
      if (k < 1) requestAnimationFrame(step); }
    requestAnimationFrame(step);
  }

  // ---- sub-navigation + scroll-spy (U1.1) ------------------------------------------------------
  // Sticky in-page sub-nav. `items` = [{href, label, key}]. In TAB mode (opts.active set) the link
  // whose key === opts.active is highlighted (sub-route switcher). In SPY mode (opts.spy = ids the
  // links point at, in order) an IntersectionObserver highlights the link of the section in view.
  function sectionNav(items, opts) {
    opts = opts || {};
    var nav = ce("nav", "subnav"); nav.setAttribute("aria-label", "In-page sections");
    nav.innerHTML = items.map(function (it) {
      var on = opts.active && it.key === opts.active;
      return '<a href="' + it.href + '" data-key="' + esc(it.key || "") + '"' + (on ? ' class="active" aria-current="true"' : "") + ">" + esc(it.label) + "</a>";
    }).join("");
    if (opts.scroll) {  // in-page anchors: scroll without letting the hash router hijack the click
      nav.querySelectorAll("a").forEach(function (a) {
        a.addEventListener("click", function (e) {
          var el = document.getElementById(a.dataset.key);
          if (el) { e.preventDefault(); el.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "start" }); el.focus({ preventScroll: true }); }
        });
      });
    }
    if (opts.spy && opts.spy.length && "IntersectionObserver" in window && !REDUCED) {
      // defer until the sections exist in the DOM and have layout.
      requestAnimationFrame(function () {
        var links = {}; nav.querySelectorAll("a").forEach(function (a) { links[a.dataset.key] = a; });
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) {
              nav.querySelectorAll("a").forEach(function (a) { a.classList.remove("active"); a.removeAttribute("aria-current"); });
              var l = links[en.target.id]; if (l) { l.classList.add("active"); l.setAttribute("aria-current", "true"); }
            }
          });
        }, { rootMargin: "-58px 0px -70% 0px" });
        opts.spy.forEach(function (id) { var el = document.getElementById(id); if (el) io.observe(el); });
        charts.push({ dispose: function () { io.disconnect(); } });  // cleaned up on route change
      });
    }
    return nav;
  }

  // ---- HOME ------------------------------------------------------------------------------------
  function renderHome(root) {
    var os = D.odds_sorted || [], fav = os[0], o = odds(fav);
    var fp = (D.final_pairs || [])[0], gb = (D.golden_boot || [])[0], ev = D.eval || {};
    var beats = ev.results_backtest_brier != null && ev.results_backtest_brier < ev.results_backtest_naive;
    var hero = ce("section", "hero");
    hero.innerHTML =
      '<div class="wrap"><div class="kick">FORECAST · 2026</div>' +
      '<h1>World Cup Sim</h1>' +
      '<p class="lede">A two-engine soccer simulator — a fast Elo + Dixon–Coles model runs the ' +
      (D.meta && D.meta.n_sims ? D.meta.n_sims.toLocaleString() : "") +
      '-run tournament Monte Carlo, and an events-as-language transformer generates a believable ' +
      'single match, event by event.</p>' +
      ((D.as_of && D.as_of.status) ? '<div class="asof-chip">📅 ' + esc(D.as_of.status) + '</div>' : '') +
      '</div>';
    root.appendChild(hero);

    var wrap = ce("div", "wrap");
    var kpis = ce("div", "kpis");
    function kpi(lbl, valHTML, sub, cls) {
      var k = ce("div", "kpi " + (cls || "")); k.innerHTML = '<div class="lbl">' + lbl + '</div><div class="val">' + valHTML + '</div><div class="sub">' + (sub || "") + '</div>'; return k;
    }
    if (fav) {
      // B5: show the bootstrap parameter-uncertainty band on the favourite's title odds when present.
      var favSub = pct(o.champion) + " to win";
      if (o.champion_ci && o.champion_ci.lo != null) favSub += " · 90% CI " + pct(o.champion_ci.lo) + "–" + pct(o.champion_ci.hi);
      kpis.appendChild(kpi("Title favourite", '<span class="flagrow">' + flagImg(fav) + esc(fav) + "</span>", favSub));
    }
    if (fp) kpis.appendChild(kpi("Most-likely final", esc(fp.a) + " – " + esc(fp.b), pct(fp.p) + " of runs"));
    if (gb) kpis.appendChild(kpi("Golden Boot pick", esc(gb.player), gb.exp_goals.toFixed(1) + " proj. goals · " + esc(gb.team)));
    if (ev.results_backtest_brier != null) kpis.appendChild(kpi("Model credibility",
      '<span class="ku" data-v="' + ev.results_backtest_brier + '">0</span> Brier',
      (beats ? "✓ beats the " : "vs ") + ev.results_backtest_naive.toFixed(3) + " base rate", beats ? "good" : ""));
    if (D.meta && D.meta.n_sims) kpis.appendChild(kpi("Monte Carlo", '<span class="ku" data-v="' + D.meta.n_sims + '" data-d="0">0</span>', "tournament simulations"));
    wrap.appendChild(kpis);

    var th = ce("div", "sec-head"); th.innerHTML = '<h2>Championship odds</h2><span class="note">top 6 by P(win)</span>';
    wrap.appendChild(th);
    var p = ce("div", "panel"); var cn = ce("div", "chart short"); p.appendChild(cn); wrap.appendChild(p);

    var tiles = ce("div", "tiles");
    [["#/tournament", "🏆", "Tournament", "Bracket, odds, groups, outcome distribution, upsets & the Golden Boot."],
     ["#/matches", "📋", "Matches", "Every WC2026 group-stage fixture by date with the model's prediction — plus a fully-simulated match."],
     ["#/model", "📊", "The model", "Two engines, calibration, the backtest, and the honest limits."]].forEach(function (t) {
      var a = ce("a", "tile"); a.href = t[0]; a.innerHTML = '<div class="ic">' + t[1] + '</div><h3>' + t[2] + '</h3><p>' + t[3] + '</p>'; tiles.appendChild(a);
    });
    wrap.appendChild(tiles);
    root.appendChild(wrap);

    // count-ups
    wrap.querySelectorAll(".ku").forEach(function (n) { countUp(n, +n.dataset.v, "", n.dataset.d != null ? +n.dataset.d : 3); });
    if (+(D.meta && D.meta.n_sims)) { var nn = wrap.querySelector('.kpi:last-child .ku'); if (nn) nn.textContent = (+D.meta.n_sims).toLocaleString(); }

    var top6 = os.slice(0, 6);
    mkChart(cn, Object.assign(axisTheme(), {
      grid: { left: 8, right: 40, top: 8, bottom: 6, containLabel: true },
      xAxis: Object.assign({ type: "value", max: Math.max.apply(null, top6.map(function (t) { return odds(t).champion; })) * 1.15, axisLabel: { formatter: function (v) { return (v * 100).toFixed(0) + "%"; } } }, axisStyle()),
      yAxis: Object.assign({ type: "category", inverse: true, data: top6 }, axisStyle()),
      series: [{ type: "bar", data: top6.map(function (t) { return odds(t).champion; }), barWidth: 18,
        itemStyle: { color: cssVar("--accent"), borderRadius: [0, 5, 5, 0] },
        label: { show: true, position: "right", color: cssVar("--text"), formatter: function (p2) { return (p2.value * 100).toFixed(1) + "%"; } } }],
    }));
    attachChartTable(p, cn, "Championship odds — top 6 by probability", ["Team", "Champion %"],
      top6.map(function (t) { return [t, (odds(t).champion * 100).toFixed(1) + "%"]; }));
  }

  // ---- TOURNAMENT ------------------------------------------------------------------------------
  function teamCell(t) { return '<a class="team-cell" href="#/team/' + encodeURIComponent(t) + '">' + flagImg(t, "sm") + esc(t) + "</a>"; }
  // A3: panels with no free in-tournament data source (pre-tournament projections / market odds)
  // are explicitly stamped once the tournament is under way, so a frozen panel can never be mistaken
  // for current. Returns "" before kickoff (it IS current then). `what` is the hover explanation.
  function staleStamp(what) {
    if (!midTournament()) return "";
    return '<span class="stale-stamp" title="' + esc(what || "no free live source for this metric in-tournament") +
      '" style="display:inline-block;margin-left:8px;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:600;background:var(--line,#e6e6e6);color:var(--muted,#777);vertical-align:middle">pre-tournament · as of kickoff</span>';
  }

  // Qualification status (from groups_detail.table[].status): mathematically clinched / out / alive
  // only via the best-third race. A team that can't finish top-2 but still has a best-third path is
  // NOT eliminated — that's why its advance odds are small-but-nonzero, and the badge says so.
  var STATUS_BY_TEAM = (function () {
    var m = {}, gd = D.groups_detail || {};
    Object.keys(gd).forEach(function (g) { (gd[g].table || []).forEach(function (r) { if (r.status) m[r.team] = r.status; }); });
    return m;
  })();
  var STATUS_CFG = {
    qualified: ["pos", "✓ Through", "Mathematically through to the knockouts (top-2 clinched)"],
    eliminated: ["neg", "Eliminated", "No remaining path to advance — out of the tournament"],
    third_hope: ["warn", "3rd-place hope", "Can no longer finish top-2; alive only via the best-third race (8 of 12 third-placed teams advance)"],
  };
  function statusBadge(team) {
    var c = STATUS_CFG[STATUS_BY_TEAM[team]];
    return c ? ' <span class="chip ' + c[0] + '" title="' + esc(c[2]) + '">' + c[1] + "</span>" : "";
  }

  function titleTable(wrap) {
    var head = ce("div", "sec-head"); head.id = "title";
    head.innerHTML = '<h2>Title race</h2><span class="note">sortable · click a header</span><input class="search" placeholder="filter team…" aria-label="filter team">';
    wrap.appendChild(head);
    var p = ce("div", "panel"); p.style.overflowX = "auto";
    var cols = [["team", "Team", "s"], ["champion", "Champ", "n"], ["final", "Final", "n"], ["semi", "SF", "n"],
      ["quarterfinal", "QF", "n"], ["round16", "R16", "n"], ["advance", "Adv", "n"], ["expected_finish", "Exp. finish", "s"], ["draw_luck", "Draw luck", "n"]];
    var rows = (D.odds_sorted || []).map(function (t) { return Object.assign({ team: t }, odds(t)); });
    var st = { key: "champion", dir: -1 };
    var maxC = Math.max.apply(null, rows.map(function (r) { return r.champion || 0; })) || 1;
    var tbl = ce("table", "tbl sticky cardify"); p.appendChild(tbl); wrap.appendChild(p);  // U3.2: cardify on mobile
    function draw(filter) {
      var data = rows.slice().sort(function (a, b) { var x = a[st.key], y = b[st.key]; if (typeof x === "string") return st.dir * String(x).localeCompare(String(y)); return st.dir * ((x || 0) - (y || 0)); });
      if (filter) data = data.filter(function (r) { return r.team.toLowerCase().indexOf(filter) >= 0; });
      var thead = sortHead(cols, st);
      var body = "<tbody>" + data.map(function (r) {
        var dl = r.draw_luck || 0;
        return "<tr>" + cols.map(function (c) {
          var k = c[0], v = r[k], inner;
          if (k === "team") inner = teamCell(r.team);
          else if (k === "expected_finish") inner = '<span style="color:var(--muted)">' + esc(v || "") + "</span>";
          else if (k === "draw_luck") inner = "<span class='chip " + (dl >= 0 ? "pos" : "neg") + "'>" + (dl >= 0 ? "+" : "") + (dl * 100).toFixed(1) + "pp</span>";
          else if (k === "champion") { var ci = r.champion_ci; inner = '<span class="barcell" style="width:' + (v / maxC * 46) + 'px"></span> <span' + (ci && ci.lo != null ? ' title="90% CI ' + pct(ci.lo) + '–' + pct(ci.hi) + ' (goal-level parameter uncertainty)"' : '') + '>' + pct(v) + '</span>'; }
          else inner = pct(v);
          return '<td data-th="' + esc(c[1]) + '">' + inner + "</td>";
        }).join("") + "</tr>";
      }).join("") + "</tbody>";
      tbl.innerHTML = thead + body;
      wireSort(tbl, function (k) { st.dir = (st.key === k) ? -st.dir : (k === "team" ? 1 : -1); st.key = k; draw($(".search", head).value.toLowerCase()); });
    }
    draw("");
    $(".search", head).oninput = function () { draw(this.value.toLowerCase()); };
  }

  function bracketView(wrap) {
    var br = D.bracket; if (!br || !br.rounds) return;
    var head = ce("div", "sec-head"); head.id = "bracket";
    head.innerHTML = '<h2>Predicted bracket</h2><span class="note">official R32 slot map · most-likely path · hover a team to trace it · <span style="border:1px dashed var(--accent);border-radius:3px;padding:0 4px;color:var(--muted)">dashed</span> = projected best-third (not yet clinched)</span>';
    wrap.appendChild(head);
    var p = ce("div", "panel"); p.style.overflowX = "auto"; var holder = ce("div"); holder.style.minWidth = "920px"; p.appendChild(holder); wrap.appendChild(p);
    drawBracket(holder, br);
  }

  function drawBracket(holder, br) {
    var d3 = window.d3; if (!d3) return;
    var rounds = br.rounds, R = rounds.length, leafN = rounds[0].length;
    var W = 980, rowH = 30, H = leafN * rowH + 30, colW = W / R;
    var svg = d3.select(holder).append("svg").attr("viewBox", "0 0 " + W + " " + H).attr("width", "100%").style("height", H + "px");
    var pos = []; // pos[r][i] = {x,y, cell}
    for (var r = 0; r < R; r++) {
      pos[r] = []; var n = rounds[r].length, span = leafN / n;
      for (var i = 0; i < n; i++) {
        pos[r][i] = { x: r * colW + 8, y: (i * span + span / 2) * rowH + 18, cell: rounds[r][i], w: colW - 16 };
      }
    }
    // connectors
    for (var r2 = 0; r2 < R - 1; r2++) {
      for (var i2 = 0; i2 < pos[r2 + 1].length; i2++) {
        var a = pos[r2][i2 * 2], b = pos[r2][i2 * 2 + 1], c = pos[r2 + 1][i2];
        [a, b].forEach(function (s) {
          svg.append("path").attr("class", "bk-link").attr("d", "M" + (s.x + s.w) + "," + s.y + " H" + (c.x - 4) + " V" + c.y)
            .attr("fill", "none").attr("stroke", cssVar("--line-2")).attr("stroke-width", 1);
        });
      }
    }
    var champTeam = rounds[R - 1][0].team;
    pos.forEach(function (col, ri) {
      col.forEach(function (s) {
        var g = svg.append("g").attr("transform", "translate(" + s.x + "," + (s.y - 11) + ")").attr("class", "bk-node").style("cursor", s.cell.team ? "pointer" : "default");
        var rect = g.append("rect").attr("width", s.w).attr("height", 22).attr("rx", 5)
          .attr("fill", ri === R - 1 ? cssVar("--panel-2") : cssVar("--panel"))
          .attr("stroke", s.cell.team === champTeam && s.cell.team ? cssVar("--champ")
            : (s.cell.projected ? cssVar("--accent") : cssVar("--line"))).attr("data-team", s.cell.team || "");
        if (s.cell.projected) rect.attr("stroke-dasharray", "3,2");  // provisional best-third slot
        if (s.cell.team) {
          var fu = flagURL(s.cell.team, 20);
          if (fu) g.append("image").attr("href", fu).attr("x", 6).attr("y", 5).attr("width", 16).attr("height", 11).attr("opacity", s.cell.projected ? 0.8 : 1);
          g.append("text").attr("x", 26).attr("y", 15).attr("fill", s.cell.projected ? cssVar("--muted") : cssVar("--text")).attr("font-size", 11).attr("font-weight", 600).text(s.cell.team);
          if (s.cell.projected) {
            g.append("text").attr("x", s.w - 6).attr("y", 15).attr("text-anchor", "end").attr("fill", cssVar("--accent")).attr("font-size", 9).attr("font-weight", 700).text("proj");
            g.append("title").text(s.cell.label + " — projected best-third (" + (s.cell.p_qualify * 100).toFixed(0) + "% to qualify) — not yet clinched");
          } else {
            g.append("title").text(s.cell.team + " — " + (s.cell.champion * 100).toFixed(1) + "% title odds");
          }
          // U3.2: keyboard-reachable bracket nodes (tabindex + role + aria-label + focus highlight).
          g.attr("tabindex", 0).attr("role", "link").attr("class", "bk-node bk-team")
            .attr("aria-label", s.cell.team + ", " + (s.cell.champion * 100).toFixed(1) + "% title odds — open team");
          function hi(on) { svg.selectAll("rect[data-team]").attr("opacity", function () { return !on || d3.select(this).attr("data-team") === s.cell.team ? 1 : .28; }); }
          g.on("mouseenter", function () { hi(true); }).on("mouseleave", function () { hi(false); })
            .on("focus", function () { hi(true); }).on("blur", function () { hi(false); })
            .on("click", function () { location.hash = "#/team/" + encodeURIComponent(s.cell.team); })
            .on("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); location.hash = "#/team/" + encodeURIComponent(s.cell.team); } });
        } else {
          g.append("text").attr("x", 10).attr("y", 15).attr("fill", cssVar("--faint")).attr("font-size", 12).attr("font-style", "italic").text(s.cell.label);
        }
      });
    });
  }

  // Projected FIFA third-place ranking: each group's modal third-placed team, ranked by its odds of
  // grabbing one of the 8 best-third spots. The top 8 are the teams filling the dashed bracket slots.
  function projectedThirdsView(wrap) {
    var pt = D.projected_thirds || []; if (!pt.length) return;
    var head = ce("div", "sec-head"); head.id = "projected-thirds";
    head.innerHTML = '<h2>Projected 3rd-place qualifiers</h2><span class="note">FIFA advances the 8 best third-placed teams across the 12 groups — each group\'s most-likely third-placer, ranked by its odds of taking one of those 8 spots</span>';
    wrap.appendChild(head);
    var tp = ce("div", "panel"); tp.style.overflowX = "auto";
    var tbl = ce("table", "tbl sticky cardify"); tp.appendChild(tbl); wrap.appendChild(tp);
    function rowHtml(r, i) {
      var inOut = r.projected_in ? '<span class="chip pos">in</span>' : '<span class="chip neg">out</span>';
      return '<tr><td data-th="#">' + (i + 1) + '</td><td data-th="Group">' + esc(r.group) +
        '</td><td data-th="Team">' + teamCell(r.team) +
        '</td><td data-th="P(3rd)">' + (r.p_third * 100).toFixed(0) +
        '%</td><td data-th="P(qualify)">' + (r.p_qualify * 100).toFixed(0) +
        '%</td><td data-th="Status">' + inOut + "</td></tr>";
    }
    var body = "";
    pt.forEach(function (r, i) {
      if (i === 8) body += '<tr class="sep"><td colspan="6" style="text-align:center;color:var(--muted);font-size:11px;padding:4px">— cut line · projected out ↓ —</td></tr>';
      body += rowHtml(r, i);
    });
    tbl.innerHTML = '<thead><tr><th>#</th><th>Group</th><th>Team</th><th>P(3rd)</th><th>P(qualify)</th><th>Status</th></tr></thead><tbody>' + body + "</tbody>";
    var note = ce("p", "faint"); note.style.fontSize = "12px";
    note.textContent = "Marginal projection: each group's modal third-placed team and its standalone odds of "
      + "finishing among the top 8 thirds — not one joint draw, so the exact 8-team set varies run to run. "
      + "The top 8 fill the dashed best-third slots in the bracket above.";
    wrap.appendChild(note);
  }

  function groupsView(wrap) {
    var groups = D.groups; if (!groups || !Object.keys(groups).length) return;
    var head = ce("div", "sec-head"); head.id = "groups"; head.innerHTML = '<h2>Group stage</h2><span class="note">qualification probability · top 2 advance</span>';
    wrap.appendChild(head);
    var g = ce("div", "groups");
    Object.keys(groups).sort().forEach(function (gn) {
      var teams = groups[gn].slice().sort(function (a, b) { return (odds(b).advance || 0) - (odds(a).advance || 0); });
      var card = ce("div", "panel group"); var h = '<h4><a href="#/group/' + gn + '" class="grouplink">Group ' + gn + " →</a></h4>";
      h += teams.map(function (t, i) { var a = odds(t).advance || 0; return '<div class="grow ' + (i < 2 ? "q" : "") + '">' + flagImg(t, "sm") + '<span class="nm">' + esc(t) + statusBadge(t) + '</span><span class="qbar"><i style="width:' + (a * 100) + '%"></i></span><span class="av">' + (a * 100).toFixed(0) + "%</span></div>"; }).join("");
      card.innerHTML = h; g.appendChild(card);
    });
    wrap.appendChild(g);
  }

  function distView(wrap) {
    var rd = D.round_dist; if (!rd || !Object.keys(rd).length) return;
    var head = ce("div", "sec-head"); head.id = "dist"; head.innerHTML = '<h2>Outcome distribution</h2><span class="note">how far each contender goes, across the Monte Carlo runs</span>';
    wrap.appendChild(head);
    var p = ce("div", "panel"); var cn = ce("div", "chart tall"); p.appendChild(cn); wrap.appendChild(p);
    var teams = (D.odds_sorted || []).slice(0, 12).reverse();
    var stages = ["Group", "R32", "R16", "QF", "SF", "Final", "Champion"];
    // U2.3: Wong colorblind-safe categorical palette (was the raw round colors).
    var colors = [cssVar("--cb-grey"), cssVar("--cb-skyblue"), cssVar("--cb-blue"), cssVar("--cb-green"), cssVar("--cb-purple"), cssVar("--cb-orange"), cssVar("--cb-vermillion")];
    mkChart(cn, Object.assign(axisTheme(), {
      legend: { data: stages, textStyle: { color: cssVar("--muted") }, top: 0 },
      grid: { left: 8, right: 16, top: 34, bottom: 6, containLabel: true },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: function (v) { return (v * 100).toFixed(1) + "%"; }, backgroundColor: cssVar("--panel"), borderColor: cssVar("--line"), textStyle: { color: cssVar("--text") } },
      xAxis: Object.assign({ type: "value", max: 1, axisLabel: { formatter: function (v) { return (v * 100).toFixed(0) + "%"; } } }, axisStyle()),
      yAxis: Object.assign({ type: "category", data: teams }, axisStyle()),
      series: stages.map(function (s, i) { return { name: s, type: "bar", stack: "x", data: teams.map(function (t) { return (rd[t] || {})[s] || 0; }), itemStyle: { color: colors[i] } }; }),
    }));
    attachChartTable(p, cn, "Outcome distribution — P(furthest stage reached) per team",
      ["Team"].concat(stages),
      teams.slice().reverse().map(function (t) { return [t].concat(stages.map(function (s) { return ((rd[t] || {})[s] || 0) * 100 < 0.05 ? "0%" : (((rd[t] || {})[s] || 0) * 100).toFixed(1) + "%"; })); }));
  }

  function finalsView(wrap) {
    var fp = D.final_pairs || []; if (!fp.length) return;
    var head = ce("div", "sec-head"); head.id = "finals"; head.innerHTML = '<h2>Most-likely finals</h2><span class="note">final-pairing frequency in the Monte Carlo</span>';
    wrap.appendChild(head);
    var p = ce("div", "panel");
    p.innerHTML = fp.slice(0, 8).map(function (f) {
      return '<div class="gb-row"><span class="who" style="display:flex;align-items:center;gap:8px">' + flagImg(f.a, "sm") + esc(f.a) + ' <span class="faint">v</span> ' + flagImg(f.b, "sm") + esc(f.b) + '</span><span class="v">' + (f.p * 100).toFixed(1) + "%</span></div>";
    }).join("");
    wrap.appendChild(p);
  }

  function upsetView(wrap) {
    var up = D.upset_risk || [], dh = D.dark_horses || []; if (!up.length && !dh.length) return;
    var head = ce("div", "sec-head"); head.id = "upsets"; head.innerHTML = '<h2>Upset risk & dark horses</h2><span class="note">fragile favourites vs over-performers</span>';
    wrap.appendChild(head);
    var g = ce("div", "grid2");
    function panel(title, items, render) { var p = ce("div", "panel"); p.innerHTML = "<h4 style='color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px'>" + title + "</h4>" + (items.length ? items.slice(0, 6).map(render).join("") : "<p class='faint'>n/a</p>"); return p; }
    g.appendChild(panel("⚠️ Biggest upset risk", up, function (r) { return '<div class="gb-row"><span class="who" style="display:flex;align-items:center;gap:8px">' + flagImg(r.team, "sm") + esc(r.team) + '</span><span class="faint" style="font-size:12px">' + (r.group_exit * 100).toFixed(0) + "% group exit</span></div>"; }));
    g.appendChild(panel("🐎 Dark horses", dh, function (r) { return '<div class="gb-row"><span class="who" style="display:flex;align-items:center;gap:8px">' + flagImg(r.team, "sm") + esc(r.team) + '</span><span class="faint" style="font-size:12px">' + (r.qf * 100).toFixed(0) + "% reach QF</span></div>"; }));
    wrap.appendChild(g);
  }

  function drawLuckView(wrap) {
    var rows = (D.odds_sorted || []).map(function (t) { return { team: t, dl: odds(t).draw_luck || 0 }; }).filter(function (r) { return Math.abs(r.dl) > 1e-4; });
    if (!rows.length) return;
    rows.sort(function (a, b) { return b.dl - a.dl; });
    var pick = rows.slice(0, 6).concat(rows.slice(-6)).reverse();
    var head = ce("div", "sec-head"); head.id = "path"; head.innerHTML = '<h2>Path difficulty</h2><span class="note">official bracket vs an average draw (draw-luck, pp of title odds)</span>';
    wrap.appendChild(head);
    var p = ce("div", "panel"); var cn = ce("div", "chart"); p.appendChild(cn); wrap.appendChild(p);
    mkChart(cn, Object.assign(axisTheme(), {
      grid: { left: 8, right: 30, top: 10, bottom: 6, containLabel: true },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: function (v) { return (v >= 0 ? "+" : "") + v.toFixed(2) + "pp"; }, backgroundColor: cssVar("--panel"), borderColor: cssVar("--line"), textStyle: { color: cssVar("--text") } },
      xAxis: Object.assign({ type: "value", axisLabel: { formatter: function (v) { return v.toFixed(1); } } }, axisStyle()),
      yAxis: Object.assign({ type: "category", data: pick.map(function (r) { return r.team; }) }, axisStyle()),
      series: [{ type: "bar", data: pick.map(function (r) { return { value: +(r.dl * 100).toFixed(2), itemStyle: { color: r.dl >= 0 ? cssVar("--good") : cssVar("--bad"), borderRadius: 4 } }; }), barWidth: 14 }],
    }));
  }

  function goldenBootView(wrap) {
    var gb = D.golden_boot || []; if (!gb.length) return;
    var head = ce("div", "sec-head"); head.id = "gboot";
    // R6: the two metrics rank players differently (projected goals vs P(top)); a toggle makes the
    // active sort key explicit instead of leaving P(top) looking non-monotonic down a goals-sorted list.
    head.innerHTML = '<h2>Golden Boot race</h2><span class="note">sort by</span>' +
      '<span class="seg-toggle"><button data-k="exp_goals" class="on">Projected goals</button><button data-k="p_top">P(top scorer)</button></span>';
    wrap.appendChild(head);
    // E/A2: mid-tournament this is a projection of the *remaining* race with goals already scored
    // banked in (the live feed credits actual scorers). The pure actual board is the "Top scorers
    // (actual)" panel below; this one stays a forecast of who finishes top.
    var anyBanked = gb.some(function (g) { return (g.banked || 0) > 0; });
    if (D.as_of && D.as_of.stage && D.as_of.stage !== "pre") {
      var cap = anyBanked
        ? 'Live <b>projection</b>: each player\'s goals already scored are banked in, plus their expected remaining goals across the Monte Carlo. The actual goals-only board is "Top scorers (actual)" on the Live tab.'
        : 'Pre-tournament <b>projection</b> (expected goals across the Monte Carlo), not goals scored so far. The actual board appears below once players start scoring.';
      wrap.appendChild(ce("div", "panel", '<p class="faint" style="margin:0;font-size:13px">' + cap + '</p>'));
    }
    var hs = D.headshots || {};
    var podium = ce("div", "gb-podium"); wrap.appendChild(podium);
    var p = ce("div", "panel"); wrap.appendChild(p);
    function draw(key) {
      var rows = gb.slice().sort(function (a, b) { return (b[key] || 0) - (a[key] || 0); });
      podium.innerHTML = rows.slice(0, 3).map(function (p2, i) {
        return '<div class="gb-card ' + (i === 0 ? "first" : "") + '">' + hsImg(p2.player, hs) + '<div class="pn">' + esc(p2.player) + '</div><div class="tn faint" style="font-size:12px;display:flex;align-items:center;gap:6px;justify-content:center;margin-top:3px">' + flagImg(p2.team, "sm") + esc(p2.team) + '</div><div class="xg">' + p2.exp_goals.toFixed(1) + ' proj. goals</div><div class="faint" style="font-size:12px">' + (p2.p_top * 100).toFixed(1) + "% top scorer</div></div>";
      }).join("");
      p.innerHTML = rows.map(function (g, i) {
        var primary = key === "p_top" ? (g.p_top * 100).toFixed(1) + "% top · " + g.exp_goals.toFixed(1) + " goals" : g.exp_goals.toFixed(1) + " proj. goals · " + (g.p_top * 100).toFixed(1) + "%";
        // View 3: tournament goal distribution from a Poisson(exp_goals) — P(≥3 / ≥5 goals).
        var d3 = (poissonTail(g.exp_goals, 3) * 100).toFixed(0), d5 = (poissonTail(g.exp_goals, 5) * 100).toFixed(0);
        var bankBadge = (g.banked || 0) > 0 ? ' <span class="chip pos" title="goals already scored at WC2026, banked into the projection" style="font-size:10px;padding:0 5px">⚽ ' + g.banked + ' banked</span>' : "";
        return '<div class="gb-row"><span class="r">' + (i + 1) + '</span>' + hsImg(g.player, hs) + '<span class="who"><span class="pn">' + esc(g.player) + bankBadge + '</span><span class="tn">' + flagImg(g.team, "sm") + esc(g.team) + '</span></span><span class="v">' + primary + ' <span class="faint" style="font-size:11px">· ≥3: ' + d3 + "% · ≥5: " + d5 + "%</span></span></div>";
      }).join("");
    }
    draw("exp_goals");
    head.querySelectorAll(".seg-toggle button").forEach(function (b) {
      b.onclick = function () { head.querySelectorAll(".seg-toggle button").forEach(function (x) { x.classList.remove("on"); }); b.classList.add("on"); draw(b.dataset.k); };
    });
  }

  // A2: actual goals scored so far at WC2026 (martj42 live feed) — the honest companion to the
  // projected Golden Boot. Refreshes every update cycle; hidden until someone has scored.
  function liveScorersView(wrap) {
    var ls = D.live_scorers || []; if (!ls.length) return;
    var head = ce("div", "sec-head"); head.id = "live-scorers";
    head.innerHTML = '<h2>Top scorers (actual)</h2><span class="note">goals scored so far at WC2026 (live feed) — the real board behind the projected Golden Boot in Awards</span>';
    wrap.appendChild(head);
    var hs = D.headshots || {};
    var p = ce("div", "panel");
    p.innerHTML = ls.slice(0, 20).map(function (s, i) {
      return '<div class="gb-row"><span class="r">' + (i + 1) + '</span>' + hsImg(s.player, hs) +
        '<span class="who"><span class="pn">' + esc(s.player) + '</span><span class="tn">' + flagImg(s.team, "sm") + esc(s.team) + '</span></span>' +
        '<span class="v">' + s.goals + (s.goals === 1 ? " goal" : " goals") + "</span></div>";
    }).join("");
    wrap.appendChild(p);
    var note = ce("p", "faint"); note.style.fontSize = "12px";
    note.textContent = "Source: martj42/international_results goalscorers feed (own goals excluded). Players who have already scored are also credited into the Golden Boot projection in Awards.";
    wrap.appendChild(note);
  }

  function ratingsView(wrap) {
    var rs = D.ratings || []; if (!rs.length) return;
    var head = ce("div", "sec-head"); head.id = "ratings";
    head.innerHTML = '<h2>Team ratings</h2><span class="note">results-Elo (+host bonus) and per-match attack vs defense — the "why" behind the odds</span>';
    wrap.appendChild(head);
    // attack-vs-defense scatter (top 24 by Elo)
    var pts = rs.slice(0, 24);
    var p = ce("div", "panel"); var cn = ce("div", "chart"); p.appendChild(cn); wrap.appendChild(p);
    mkChart(cn, Object.assign(axisTheme(), {
      grid: { left: 8, right: 18, top: 18, bottom: 28, containLabel: true },
      tooltip: { backgroundColor: cssVar("--panel"), borderColor: cssVar("--line"), textStyle: { color: cssVar("--text") },
        formatter: function (pp) { var d = pp.data; return "<b>" + esc(d.team) + "</b><br>Elo " + d.elo + "<br>attack " + d.value[0] + " · defense " + d.value[1]; } },
      xAxis: Object.assign({ type: "value", name: "attack → (exp. goals for)", nameLocation: "middle", nameGap: 22, nameTextStyle: { color: cssVar("--muted") } }, axisStyle()),
      yAxis: Object.assign({ type: "value", inverse: true, name: "← defense (goals against)", nameLocation: "middle", nameGap: 30, nameTextStyle: { color: cssVar("--muted") } }, axisStyle()),
      series: [{ type: "scatter", symbolSize: function (v) { return 8 + (v[2] || 0) / 220; },
        data: pts.map(function (r) { return { team: r.team, elo: r.elo, value: [r.attack, r.defense, r.elo] }; }),
        itemStyle: { color: cssVar("--accent"), opacity: .85 },
        label: { show: true, position: "right", fontSize: 10, color: cssVar("--muted"), formatter: function (pp) { return pp.data.team; } } }],
    }));
    // sortable ratings table
    var tp = ce("div", "panel"); tp.style.overflowX = "auto";
    var cols = [["team", "Team", "s"], ["elo", "Elo", "n"], ["attack", "Attack", "n"], ["defense", "Defense", "n"], ["exp_goals_for", "Proj GF", "n"], ["exp_goals_against", "Proj GA", "n"]];
    var st = { key: "elo", dir: -1 };
    var maxE = Math.max.apply(null, rs.map(function (r) { return r.elo; })) || 1;
    var tbl = ce("table", "tbl sticky cardify"); tp.appendChild(tbl); wrap.appendChild(tp);  // F2: cardify on mobile
    function draw() {
      var data = rs.slice().sort(function (a, b) { var x = a[st.key], y = b[st.key]; if (typeof x === "string") return st.dir * String(x).localeCompare(String(y)); return st.dir * ((x || 0) - (y || 0)); });
      tbl.innerHTML = sortHead(cols, st) + "<tbody>" +
        data.map(function (r) {
          return "<tr>" + cols.map(function (c) {
            var k = c[0], v = r[k], th = ' data-th="' + esc(c[1]) + '"';  // F2: stacked-card labels
            if (k === "team") return "<td" + th + ">" + teamCell(r.team) + (r.host ? ' <span class="chip pos" title="co-host">host</span>' : "") + "</td>";
            if (k === "elo") return "<td" + th + '><span class="barcell" style="width:' + (v / maxE * 46) + 'px"></span> ' + v.toFixed(0) + "</td>";
            return "<td" + th + ">" + (typeof v === "number" ? v.toFixed(2) : esc(v)) + "</td>";
          }).join("") + "</tr>";
        }).join("") + "</tbody>";
      wireSort(tbl, function (k) { st.dir = (st.key === k) ? -st.dir : (k === "team" ? 1 : -1); st.key = k; draw(); });
    }
    draw();
  }

  var STYLE_LABEL = { possession: "Possession", press: "High press", directness: "Directness", width: "Width", tempo: "Carrying / tempo", set_pieces: "Set-piece reliance" };
  function styleView(wrap) {
    var sty = D.style || {}; var teams = sty.teams || {}; var axes = sty.axes || [];
    var names = Object.keys(teams); if (!names.length || !axes.length) return;
    var head = ce("div", "sec-head"); head.id = "style";
    head.innerHTML = '<h2>Play-style profiles</h2><span class="note">event-derived style axes (normalized across the field) — pick a team, add a second to compare</span>';
    wrap.appendChild(head);
    // order teams by Elo where available, else alphabetical.
    var order = (D.odds_sorted || []).filter(function (t) { return teams[t]; });
    names.sort(); order = order.concat(names.filter(function (t) { return order.indexOf(t) < 0; }));
    var p = ce("div", "panel");
    var ctrl = ce("div", "stylectrl");
    function opts(sel) { return order.map(function (t) { return '<option value="' + esc(t) + '"' + (t === sel ? " selected" : "") + ">" + esc(t) + "</option>"; }).join(""); }
    var t0 = order[0], t1 = "";
    ctrl.innerHTML = '<label>Team <select class="dsel s0">' + opts(t0) + '</select></label>' +
      '<label>Compare <select class="dsel s1"><option value="">— none —</option>' + opts(t1) + "</select></label>";
    p.appendChild(ctrl);
    var cn = ce("div", "chart"); p.appendChild(cn); wrap.appendChild(p);
    var note = ce("p", "faint"); note.style.fontSize = "12.5px";
    note.innerHTML = "Axes from the open SPADL event corpus; " + names.length + " of the 48 finalists have open event data (the rest are omitted, not estimated).";
    wrap.appendChild(note);
    function radar() {
      var a = ctrl.querySelector(".s0").value, b = ctrl.querySelector(".s1").value;
      var series = [];
      function row(t) { return axes.map(function (ax) { return teams[t].axes[ax]; }); }
      function rawTip(t) { return axes.map(function (ax) { return (teams[t].raw[ax]); }); }
      var data = [{ value: row(a), name: a, raw: rawTip(a) }];
      if (b && teams[b]) data.push({ value: row(b), name: b, raw: rawTip(b) });
      mkChart(cn, {
        textStyle: { fontFamily: cssVar("--font") },
        tooltip: { backgroundColor: cssVar("--panel"), borderColor: cssVar("--line"), textStyle: { color: cssVar("--text") } },
        legend: { data: data.map(function (d) { return d.name; }), top: 0, textStyle: { color: cssVar("--muted") } },
        radar: { indicator: axes.map(function (ax) { return { name: STYLE_LABEL[ax] || ax, max: 1 }; }),
          axisName: { color: cssVar("--muted"), fontSize: 11 }, splitLine: { lineStyle: { color: cssVar("--line") } },
          splitArea: { areaStyle: { color: ["transparent"] } }, axisLine: { lineStyle: { color: cssVar("--line") } } },
        color: [cssVar("--accent"), cssVar("--away")],
        series: [{ type: "radar", data: data.map(function (d) { return { value: d.value, name: d.name, areaStyle: { opacity: .18 } }; }) }],
      });
    }
    ctrl.querySelector(".s0").onchange = radar; ctrl.querySelector(".s1").onchange = radar;
    radar();
  }

  function conditionsView(wrap) {
    var c = D.conditions || {}; var venues = c.venues || {}; var teams = c.teams || {};
    var vnames = Object.keys(venues); if (!vnames.length) return;
    var head = ce("div", "sec-head"); head.id = "conditions";
    head.innerHTML = '<h2>Conditions & logistics</h2><span class="note">venue heat (WBGT proxy) + each team\'s group-stage travel, rest, altitude & heat burden</span>';
    wrap.appendChild(head);
    // C1: these are CONTEXTUAL displays — they describe each fixture's environment but do NOT feed
    // the published title odds (only the host bonus + the ET-fatigue penalty move the MC). Stated
    // here so a reader never mistakes a heat/travel display for a calibrated odds input.
    var note = ce("div", "callout");
    note.innerHTML = "Context only — heat, travel, rest and altitude are shown to characterise each fixture; they do <b>not</b> move the published odds (only the host-advantage bonus and the extra-time fatigue penalty are wired into the Monte Carlo). The raw style win-probability term measured ΔBrier≈0 on held-out data, so it is kept off by design.";
    wrap.appendChild(note);
    // venue heat scale — ranked by EFFECTIVE (roof-discounted) heat-load, hot→cool (R4).
    function effLoad(v) { return v.effective_heat_load != null ? v.effective_heat_load : v.heat_load; }
    var vs = vnames.map(function (n) { return venues[n]; }).sort(function (a, b) { return effLoad(b) - effLoad(a); });
    var vp = ce("div", "panel"); vp.innerHTML = '<h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Venue heat — effective in-stadium load · ▦ = roof / AC (discounted)</h4>';
    var cn = ce("div", "chart"); vp.appendChild(cn); wrap.appendChild(vp);
    mkChart(cn, Object.assign(axisTheme(), {
      grid: { left: 8, right: 46, top: 6, bottom: 18, containLabel: true },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, backgroundColor: cssVar("--panel"), borderColor: cssVar("--line"), textStyle: { color: cssVar("--text") },
        formatter: function (ps) { var v = vs[ps[0].dataIndex]; return "<b>" + esc(v.city) + "</b> (" + esc(v.nation) + ")<br>effective heat-load " + (effLoad(v) * 100).toFixed(0) + "%" + (v.climate_controlled ? " (roof / AC)" : "") + "<br>outdoor WBGT " + v.wbgt + "°C · raw load " + (v.heat_load * 100).toFixed(0) + "%<br>" + v.temp_c + "°C / " + v.rh_pct + "% RH · alt " + v.altitude_m + "m"; } },
      xAxis: Object.assign({ type: "value", max: 1, name: "effective heat-load", nameLocation: "middle", nameGap: 22, nameTextStyle: { color: cssVar("--muted") }, axisLabel: { formatter: function (v) { return (v * 100).toFixed(0) + "%"; } } }, axisStyle()),
      yAxis: Object.assign({ type: "category", inverse: true, data: vs.map(function (v) { return v.city + (v.climate_controlled ? " ▦" : ""); }) }, axisStyle()),
      visualMap: { show: false, min: 0, max: 1, dimension: 0, inRange: { color: ["#2c7fb8", "#fec44f", "#e34a33"] } },
      series: [{ type: "bar", data: vs.map(effLoad), barWidth: 13, itemStyle: { borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: "right", color: cssVar("--muted"), formatter: function (p) { return (p.value * 100).toFixed(0) + "%"; } } }],
    }));
    // per-team logistics table (sortable).
    var rows = Object.keys(teams).map(function (t) { return Object.assign({ team: t }, teams[t]); });
    var tp = ce("div", "panel"); tp.style.overflowX = "auto";
    var cols = [["team", "Team", "s"], ["travel_km", "Travel km", "n"], ["min_rest_days", "Min rest", "n"],
      ["max_altitude_m", "Max alt (m)", "n"], ["heat_burden", "Heat burden", "n"], ["acclim_gap", "Acclim. gap", "n"]];
    var st = { key: "heat_burden", dir: -1 };
    var maxB = Math.max.apply(null, rows.map(function (r) { return r.heat_burden || 0; })) || 1;
    var tbl = ce("table", "tbl sticky"); tp.appendChild(tbl); wrap.appendChild(tp);
    function draw() {
      var data = rows.slice().sort(function (a, b) { var x = a[st.key], y = b[st.key]; if (typeof x === "string") return st.dir * String(x).localeCompare(String(y)); return st.dir * ((x || 0) - (y || 0)); });
      tbl.innerHTML = sortHead(cols, st) + "<tbody>" +
        data.map(function (r) {
          return "<tr>" + cols.map(function (cc) {
            var k = cc[0], v = r[k];
            if (k === "team") return "<td>" + teamCell(r.team) + "</td>";
            if (k === "heat_burden") return '<td><span class="barcell hot" style="width:' + (v / maxB * 46) + 'px"></span> ' + (v == null ? "—" : v.toFixed(2)) + "</td>";
            if (v == null) return "<td>—</td>";
            return "<td>" + (k === "travel_km" || k === "max_altitude_m" ? Math.round(v).toLocaleString() : (k === "min_rest_days" ? v : v.toFixed(2))) + "</td>";
          }).join("") + "</tr>";
        }).join("") + "</tbody>";
      wireSort(tbl, function (k) { st.dir = (st.key === k) ? -st.dir : (k === "team" ? 1 : -1); st.key = k; draw(); });
    }
    draw();
    var note = ce("p", "faint"); note.style.fontSize = "12px"; note.textContent = c.note || ""; wrap.appendChild(note);
  }

  function playerPropsView(wrap) {
    var pp = D.player_props || []; if (!pp.length) return;
    var hs = D.headshots || {};
    var head = ce("div", "sec-head"); head.id = "props";
    head.innerHTML = '<h2>Player prop hub</h2><span class="note">single match vs an average opponent · anytime (≥1) &amp; brace (≥2) from each player\'s per-match Poisson rate — filter &amp; sort</span>';
    wrap.appendChild(head);
    // View 4: a sortable + filterable hub over the props. Team + position filters; click a column to sort.
    var teams = [""].concat(Array.from(new Set(pp.map(function (r) { return r.team; }))).sort());
    var positions = [""].concat(Array.from(new Set(pp.map(function (r) { return r.attrs && r.attrs.position; }).filter(Boolean))).sort());
    var ctrl = ce("div", ""); ctrl.style.margin = "0 0 8px";
    ctrl.innerHTML = 'Team <select id="pp-team">' + teams.map(function (t) { return '<option value="' + esc(t) + '">' + (t ? esc(t) : "All") + "</option>"; }).join("") +
      '</select> Position <select id="pp-pos">' + positions.map(function (t) { return '<option value="' + esc(t) + '">' + (t ? esc(t) : "All") + "</option>"; }).join("") + "</select>";
    wrap.appendChild(ctrl);
    var p = ce("div", "panel"); p.style.overflowX = "auto"; wrap.appendChild(p);
    var sortKey = "anytime", sortDir = -1;
    var COLS = [["player", "Player"], ["attrs", "Age · Ht"], ["anytime", "Anytime"], ["multi", "Brace"],
      ["rate", "Rate (λ)"], ["tournament_goals", "Proj. goals"]];
    function draw() {
      var ft = document.getElementById("pp-team").value, fp = document.getElementById("pp-pos").value;
      var rows = pp.filter(function (r) {
        return (!ft || r.team === ft) && (!fp || (r.attrs && r.attrs.position === fp));
      }).slice().sort(function (a, b) {
        var x = a[sortKey], y = b[sortKey];
        if (typeof x === "string") return sortDir * x.localeCompare(y);
        return sortDir * ((x || 0) - (y || 0));
      });
      p.innerHTML = '<table class="tbl"><thead><tr>' + COLS.map(function (c) {
        return '<th data-k="' + c[0] + '" style="cursor:pointer' + (c[0] === "player" ? ";text-align:left" : "") + '">' + c[1] + (c[0] === sortKey ? (sortDir < 0 ? " ▾" : " ▴") : "") + "</th>";
      }).join("") + "</tr></thead><tbody>" + rows.map(function (r) {
        var a = r.attrs, who = a ? (a.age != null ? a.age + "y" : "") + (a.height_cm ? " · " + a.height_cm + "cm" : "") : "";
        return '<tr><td style="text-align:left"><span class="who" style="display:flex;align-items:center;gap:8px">' + hsImg(r.player, hs, "sm") + esc(r.player) + " " + flagImg(r.team, "sm") + (a && a.foot ? ' <span class="faint" style="font-size:11px">' + esc(a.foot) + "</span>" : "") + '</span></td>' +
          '<td class="faint">' + (who || "—") + "</td>" +
          '<td><span class="barcell" style="width:' + (r.anytime * 46) + 'px"></span> ' + (r.anytime * 100).toFixed(0) + "%</td>" +
          "<td>" + (r.multi * 100).toFixed(0) + "%</td><td>" + r.rate.toFixed(2) + "</td><td>" + r.tournament_goals.toFixed(1) + "</td></tr>";
      }).join("") + "</tbody></table>";
      p.querySelectorAll("th[data-k]").forEach(function (th) {
        th.onclick = function () {
          var k = th.dataset.k;
          if (k === sortKey) sortDir = -sortDir; else { sortKey = k; sortDir = -1; }
          draw();
        };
      });
    }
    document.getElementById("pp-team").addEventListener("change", draw);
    document.getElementById("pp-pos").addEventListener("change", draw);
    draw();
    var note = ce("p", "faint"); note.style.fontSize = "12px";
    var nA = pp.filter(function (r) { return r.attrs; }).length;
    note.textContent = "Age/height/foot/position from the CC0 Transfermarkt dump (basis tm) where a confident name+nation match exists (" + nA + " of " + pp.length + "). Assist/card props + a realism-slate scorer-frequency cross-check are pending (see GATED_ITEMS).";
    wrap.appendChild(note);
    setPieceTakers(wrap);
  }

  // L-B5: designated penalty / free-kick takers from CC0 EA ratings (basis ea) — labelled, not guessed.
  function setPieceTakers(wrap) {
    var t = D.set_piece_takers; if (!t) return;
    var teams = Object.keys(t).sort(); if (!teams.length) return;
    var d = ce("details", "exp"); var s = ce("summary");
    s.innerHTML = "Designated set-piece takers (EA ratings)" + staleStamp("From pre-tournament EA FC24 ratings; identities are fixed, not tracked to in-tournament form."); d.appendChild(s);
    var body = ce("div", "exp-body");
    body.innerHTML = '<table class="tbl"><thead><tr><th style="text-align:left">Team</th><th style="text-align:left">Penalty</th><th style="text-align:left">Free-kick</th></tr></thead><tbody>' +
      teams.map(function (tm) {
        var r = t[tm];
        return '<tr><td style="text-align:left">' + flagImg(tm, "sm") + esc(tm) + '</td><td style="text-align:left">' + esc(r.penalty || "—") + (r.penalty_rating ? ' <span class="faint">' + r.penalty_rating + "</span>" : "") + '</td><td style="text-align:left">' + esc(r.freekick || "—") + (r.fk_rating ? ' <span class="faint">' + r.fk_rating + "</span>" : "") + "</td></tr>";
      }).join("") + "</tbody></table>";
    d.appendChild(body); wrap.appendChild(d);
    var note = ce("p", "faint"); note.style.fontSize = "12px";
    note.textContent = "Designated taker = each squad's top EA penalty / free-kick rating (basis ea, FC24). Identity only — crediting it inside the generated box score is a separate item.";
    wrap.appendChild(note);
  }

  function goldenGloveView(wrap) {
    var gg = (D.awards || {}).golden_glove || []; if (!gg.length) return;
    var head = ce("div", "sec-head"); head.id = "glove";
    head.innerHTML = '<h2>🧤 Golden Glove</h2><span class="note">projected clean sheets (Monte Carlo) attributed to each nation\'s keeper</span>';
    wrap.appendChild(head);
    var mx = gg[0].exp_clean_sheets || 1;
    var p = ce("div", "panel");
    p.innerHTML = gg.map(function (r, i) {
      return '<div class="gb-row"><span class="r">' + (i + 1) + '</span><span class="who"><span class="pn">' + esc(r.gk || "(keeper TBD)") + '</span><span class="tn">' + flagImg(r.team, "sm") + esc(r.team) + (r.caps ? ' <span class="faint">· ' + r.caps + " caps</span>" : "") + '</span></span><span class="v"><span class="barcell" style="width:' + (r.exp_clean_sheets / mx * 46) + 'px"></span> ' + r.exp_clean_sheets.toFixed(1) + " clean sheets</span></div>";
    }).join("");
    wrap.appendChild(p);
    var note = ce("p", "faint"); note.style.fontSize = "12px";
    note.textContent = "Keeper = each nation’s most-capped goalkeeper in the CC0 Transfermarkt squad (basis tm). A full P(win) Golden Glove remains documented as gated in GATED_ITEMS.md.";
    wrap.appendChild(note);
  }
  // L-B7: Golden Ball — best player by VAEP per 90 (credits defenders/mids, not just goals).
  function goldenBallView(wrap) {
    var gb = (D.awards || {}).golden_ball || []; if (!gb.length) return;
    var head = ce("div", "sec-head"); head.id = "ball";
    head.innerHTML = '<h2>🏅 Golden Ball</h2><span class="note">best player by VAEP per 90 — total on-ball value (defence included), event-covered nations</span>' +
      staleStamp("VAEP board from the pre-tournament SPADL corpus; tracking in-tournament form needs WC2026 event data (we have scores + scorers only).");
    wrap.appendChild(head);
    var mx = gb[0].vaep_p90 || 1;
    var p = ce("div", "panel");
    p.innerHTML = gb.map(function (r, i) {
      return '<div class="gb-row"><span class="r">' + (i + 1) + '</span><span class="who"><span class="pn">' + esc(r.player) + '</span><span class="tn">' + flagImg(r.team, "sm") + esc(r.team) + '</span></span><span class="v"><span class="barcell" style="width:' + (r.vaep_p90 / mx * 46) + 'px"></span> ' + r.vaep_p90.toFixed(2) + " VAEP/90 · " + (r.p_top * 100).toFixed(0) + "%</span></div>";
    }).join("");
    wrap.appendChild(p);
    var note = ce("p", "faint"); note.style.fontSize = "12px";
    note.textContent = "VAEP (socceraction, learned from the open SPADL corpus — basis vaep) credits every on-ball action, so the board rewards playmakers/defenders, not just scorers. The data-poor 8 have no VAEP number (omitted, not estimated).";
    wrap.appendChild(note);
  }

  function youngPlayerView(wrap) {
    var yp = (D.awards || {}).young_player || {}; var b = yp.board || []; if (!b.length) return;
    var head = ce("div", "sec-head"); head.id = "young";
    head.innerHTML = '<h2>🌟 Best Young Player</h2><span class="note">born 2005 or later (FIFA U-21 rule) — ranked by VAEP per 90</span>' +
      staleStamp("Pre-tournament VAEP projection over the Wikipedia squads; no WC2026 event data to track tournament form.");
    wrap.appendChild(head);
    var mx = b[0].vaep_p90 || 1;
    var p = ce("div", "panel");
    p.innerHTML = b.map(function (r, i) {
      return '<div class="gb-row"><span class="r">' + (i + 1) + '</span><span class="who"><span class="pn">' + esc(r.player) + ' <span class="faint" style="font-weight:500">· ' + r.age + '</span></span><span class="tn">' + flagImg(r.team, "sm") + esc(r.team) + ' · ' + esc(r.club) + '</span></span><span class="v"><span class="barcell" style="width:' + (r.vaep_p90 / mx * 46) + 'px"></span> ' + r.vaep_p90.toFixed(2) + " VAEP/90 · " + (r.p_top * 100).toFixed(0) + "%</span></div>";
    }).join("");
    wrap.appendChild(p);
    var note = ce("p", "faint"); note.style.fontSize = "12px";
    note.textContent = "Squads (26×48) from Wikipedia “2026 FIFA World Cup squads” (CC BY-SA 4.0); " + yp.n_eligible + " players born ≥2005, " + yp.n_with_vaep + " with in-repo event coverage (the rest have no VAEP number — listed nowhere rather than estimated).";
    wrap.appendChild(note);
  }

  // Dixon–Coles scoreline distribution between two Elo ratings (standard Poisson path + DC low-score
  // correction; the tournament MC uses φ=1.2, so this explorer is labelled an approximation).
  function dcMatrix(eloH, eloA) {
    var dc = D.dc_params || {}; var total = dc.total || 2.7, sup100 = dc.sup_per_100 || 0.38, rho = dc.rho || -0.08;
    var sup = sup100 * (eloH - eloA) / 100;
    var lh = Math.max((total + sup) / 2, 0.15), la = Math.max((total - sup) / 2, 0.15), N = 8;
    function pois(k, l) { var p = Math.exp(-l); for (var i = 1; i <= k; i++) p *= l / i; return p; }
    var hp = [], ap = [], i, j;
    for (i = 0; i <= N; i++) { hp.push(pois(i, lh)); ap.push(pois(i, la)); }
    var m = [], s = 0;
    for (i = 0; i <= N; i++) { m[i] = []; for (j = 0; j <= N; j++) m[i][j] = hp[i] * ap[j]; }
    m[0][0] *= 1 - lh * la * rho; m[0][1] *= 1 + lh * rho; m[1][0] *= 1 + la * rho; m[1][1] *= 1 - rho;
    for (i = 0; i <= N; i++) for (j = 0; j <= N; j++) { m[i][j] = Math.max(0, m[i][j]); s += m[i][j]; }
    for (i = 0; i <= N; i++) for (j = 0; j <= N; j++) m[i][j] /= s;
    var ph = 0, pd = 0, pa = 0, tops = [];
    for (i = 0; i <= N; i++) for (j = 0; j <= N; j++) { if (i > j) ph += m[i][j]; else if (i === j) pd += m[i][j]; else pa += m[i][j]; tops.push({ home: i, away: j, p: m[i][j] }); }
    tops.sort(function (a, b) { return b.p - a.p; });
    return { matrix: m, wdl: { home: ph, draw: pd, away: pa }, top_scorelines: tops.slice(0, 6), lh: lh, la: la };
  }
  function headToHeadView(wrap) {
    var rs = D.ratings || []; if (!rs.length || !D.dc_params) return;
    var elo = {}; rs.forEach(function (r) { elo[r.team] = r.elo; });
    var teams = rs.map(function (r) { return r.team; });
    var head = ce("div", "sec-head"); head.id = "h2h";
    head.innerHTML = '<h2>Head-to-head explorer</h2><span class="note">pick any two of the 48 — neutral-venue Dixon–Coles scoreline (φ=1 approximation)</span>';
    wrap.appendChild(head);
    var p = ce("div", "panel");
    var ctrl = ce("div", "stylectrl");
    function opts(sel) { return teams.map(function (t) { return '<option' + (t === sel ? " selected" : "") + ">" + esc(t) + "</option>"; }).join(""); }
    ctrl.innerHTML = '<label>Team A <select class="dsel a">' + opts(teams[0]) + '</select></label><label>Team B <select class="dsel b">' + opts(teams[1]) + "</select></label>";
    p.appendChild(ctrl);
    var out = ce("div"); p.appendChild(out); wrap.appendChild(p);
    function draw() {
      var a = ctrl.querySelector(".a").value, b = ctrl.querySelector(".b").value;
      if (a === b) { out.innerHTML = '<p class="faint">Pick two different teams.</p>'; return; }
      var r = dcMatrix(elo[a], elo[b]);
      out.innerHTML = '<div class="match-head" style="padding:8px 0"><div class="side">' + flagImg(a) + '<span class="nm">' + esc(a) + '</span></div><div class="score" style="font-size:20px">' + (r.wdl.home * 100).toFixed(0) + "% · " + (r.wdl.draw * 100).toFixed(0) + "% · " + (r.wdl.away * 100).toFixed(0) + '%<div class="faint" style="font-size:12px;font-weight:500">win · draw · win · xG ' + r.lh.toFixed(2) + "–" + r.la.toFixed(2) + '</div></div><div class="side">' + flagImg(b) + '<span class="nm">' + esc(b) + "</span></div></div>";
      out.appendChild(scoreDistEl(r, a, b));
    }
    ctrl.querySelector(".a").onchange = draw; ctrl.querySelector(".b").onchange = draw;
    draw();
  }

  // U1.4: lead the Odds sub-view with 3–5 headline numbers (the Overview KPI pattern).
  function tournamentKpis(wrap) {
    var os = D.odds_sorted || [], fav = os[0]; if (!fav) return;
    var fp = (D.final_pairs || [])[0], up = (D.upset_risk || [])[0], dh = (D.dark_horses || [])[0];
    var kpis = ce("div", "kpis");
    function kpi(lbl, valHTML, sub) { var k = ce("div", "kpi"); k.innerHTML = '<div class="lbl">' + lbl + '</div><div class="val">' + valHTML + '</div><div class="sub">' + (sub || "") + "</div>"; return k; }
    kpis.appendChild(kpi("Favourite", '<span class="flagrow">' + flagImg(fav) + esc(fav) + "</span>", pct(odds(fav).champion) + " to win"));
    if (fp) kpis.appendChild(kpi("Most-likely final", esc(fp.a) + " – " + esc(fp.b), pct(fp.p) + " of runs"));
    if (up) kpis.appendChild(kpi("Biggest upset risk", esc(up.team), (up.group_exit * 100).toFixed(0) + "% group exit"));
    if (dh) kpis.appendChild(kpi("Top dark-horse", esc(dh.team), (dh.qf * 100).toFixed(0) + "% reach QF"));
    wrap.appendChild(kpis);
  }
  // L-B9: model-vs-market overlay — only renders when an Odds-API key produced odds_anchor.json.
  function marketAnchorView(wrap) {
    var a = D.odds_anchor; if (!a || !a.overlay || !a.overlay.length) return;
    var head = ce("div", "sec-head"); head.id = "market";
    head.innerHTML = '<h2>Model vs market</h2><span class="note">champion odds anchored toward de-vigged sharp consensus — both shown; the anchor reorders only where the market sharply disagrees (e.g. host-boosted sides)</span>' +
      staleStamp("Market snapshot taken pre-tournament; the free odds path excludes WC2026, so it is not refreshed in-tournament.");
    wrap.appendChild(head);
    var p = ce("div", "panel");
    p.innerHTML = '<table class="chart-table"><thead><tr><th>Team</th><th>Model</th><th>Market</th><th>Δ</th><th>Anchored</th></tr></thead><tbody>' +
      a.overlay.slice(0, 12).map(function (r) {
        var d = (r.model - r.market) * 100;
        var dcls = Math.abs(d) >= 3 ? (d > 0 ? "chip pos" : "chip neg") : "faint";
        return '<tr><td>' + flagImg(r.team, "sm") + esc(r.team) + '</td><td>' + (r.model * 100).toFixed(1) + '%</td><td>' + (r.market * 100).toFixed(1) + '%</td><td><span class="' + dcls + '">' + (d >= 0 ? "+" : "") + d.toFixed(1) + 'pp</span></td><td>' + (r.anchored * 100).toFixed(1) + '%</td></tr>';
      }).join("") + '</tbody></table>';
    wrap.appendChild(p);
    // C2: name the single biggest model↔market disagreement and why (host-boosted sides).
    var big = a.overlay.slice().sort(function (x, y) { return Math.abs(y.model - y.market) - Math.abs(x.model - x.market); })[0];
    if (big) {
      var d0 = (big.model - big.market) * 100;
      var why = ce("div", "callout");
      why.innerHTML = "Biggest disagreement: the model has <b>" + esc(big.team) + "</b> at " + (big.model * 100).toFixed(1) + "% vs the market's " + (big.market * 100).toFixed(1) + "% (" + (d0 >= 0 ? "+" : "") + d0.toFixed(1) + "pp). Where the model runs hotter than the market it is usually a <b>host-boosted</b> or Elo-strong side the market discounts on tournament priors; the anchored column splits the difference.";
      wrap.appendChild(why);
    }
    var note = ce("p", "faint"); note.style.fontSize = "12px";
    note.textContent = "Consensus distance " + a.dist_model + " → " + a.dist_anchored + " (closer); model↔anchored rank ρ=" + (a.rank_corr != null ? a.rank_corr.toFixed(2) : "—") + " (ordering largely preserved). De-vigged anchor only (no raw price mirror, no bookmaker named). Source: The Odds API.";
    wrap.appendChild(note);
  }

  // Rooting guide — how each unplayed result shifts every team's advance odds.
  function rootingBucketLabel(home, away, b) {
    if (b === "draw") return "Draw";
    var m = b.match(/^(home|away)_by_(\d\+?)$/); if (!m) return b;
    return (m[1] === "home" ? esc(home) : esc(away)) + " by " + m[2];
  }
  function rootingView(wrap) {
    var r = D.rooting; if (!r || !r.fixtures || !r.fixtures.length) return;
    var head = ce("div", "sec-head"); head.id = "rooting";
    head.innerHTML = '<h2>Rooting guide</h2><span class="note">how each upcoming result (by winner × goal-difference) swings every team’s odds to advance — pick a match</span>';
    wrap.appendChild(head);
    // Rank fixtures by their biggest single swing so the most consequential matches lead.
    function maxSwing(f) {
      var mx = 0;
      Object.keys(f.buckets || {}).forEach(function (b) {
        (f.buckets[b].movers || []).forEach(function (m) { mx = Math.max(mx, Math.abs(m.d_advance)); });
      });
      return mx;
    }
    var fixtures = r.fixtures.slice().sort(function (a, b) { return maxSwing(b) - maxSwing(a); }).slice(0, 16);
    fixtures.forEach(function (f) {
      var p = ce("div", "panel");
      var rows = Object.keys(f.buckets || {}).map(function (b) {
        var bk = f.buckets[b];
        var movers = (bk.movers || []).slice(0, 4).map(function (m) {
          var col = m.d_advance >= 0 ? "var(--good,#2e7d32)" : "var(--bad,#c62828)";
          var sign = m.d_advance >= 0 ? "+" : "";
          return '<span style="white-space:nowrap;margin-right:10px">' + flagImg(m.team, "sm") + esc(m.team) +
            ' <b style="color:' + col + '">' + sign + (m.d_advance * 100).toFixed(0) + 'pp</b></span>';
        }).join("");
        return '<tr><td style="white-space:nowrap">' + rootingBucketLabel(f.home, f.away, b) +
          ' <span class="faint">(' + (bk.p * 100).toFixed(0) + '%)</span></td><td>' + (movers || '<span class="faint">—</span>') + '</td></tr>';
      }).join("");
      p.innerHTML = '<h3 style="margin:.2em 0">' + flagImg(f.home, "sm") + esc(f.home) + ' vs ' + flagImg(f.away, "sm") + esc(f.away) +
        '</h3><table class="chart-table"><thead><tr><th>Result</th><th>Who it helps / hurts (Δ advance)</th></tr></thead><tbody>' + rows + '</tbody></table>';
      wrap.appendChild(p);
    });
    var note = ce("p", "faint"); note.style.fontSize = "12px";
    note.textContent = "Δ = change in P(advance from the group) vs the baseline, from one instrumented conditional Monte-Carlo pass (" + (r.n_sims || "") + " sims); cross-group best-third coupling included. Buckets below the sample floor are omitted.";
    wrap.appendChild(note);
  }

  // Team-centric "Your scenarios" — pick a team, see which of its own results and which
  // results elsewhere help or hurt its odds to advance. Reads D.rooting.by_team only.
  function rootingTeamView(wrap) {
    var r = D.rooting; if (!r || !r.by_team) return;
    var byTeam = r.by_team; var teams = Object.keys(byTeam).sort();
    if (!teams.length) return;
    var head = ce("div", "sec-head"); head.id = "rooting-team";
    head.innerHTML = '<h2>Your scenarios</h2><span class="note">pick your team — which of its remaining matches, and which results elsewhere, help or hurt its odds to advance</span>';
    wrap.appendChild(head);
    var p = ce("div", "panel");
    var sel = '<select id="root-team" style="padding:4px;margin:0 6px">' +
      teams.map(function (n) { return '<option>' + esc(n) + '</option>'; }).join("") + '</select>';
    p.innerHTML = '<div style="margin-bottom:10px"><b>Team:</b> ' + sel + '</div><div id="root-team-out"></div>';
    wrap.appendChild(p);
    // One scenario row: result text + signed Δ advance (and Δ round-16 if non-trivial).
    function pts(d) { var v = d * 100; return (v >= 0 ? "+" : "") + v.toFixed(1) + " pts"; }
    function row(e) {
      var pos = (e.d_advance || 0) >= 0;
      var col = pos ? "var(--good,#2e7d32)" : "var(--bad,#c62828)";
      var bits = '<b style="color:' + col + '">' + pts(e.d_advance || 0) + '</b> advance';
      if (e.d_round16 != null && Math.abs(e.d_round16) >= 0.005) {
        bits += ' <span class="faint">(' + pts(e.d_round16) + ' round of 16)</span>';
      }
      var ci = e.ci_flag ? ' <span class="faint" title="thin / noisy bucket — interpret with caution">~ thin sample</span>' : '';
      return '<tr><td>' + esc(e.result || rootingBucketLabel(e.home, e.away, e.bucket)) + ci +
        '</td><td style="white-space:nowrap;text-align:right">' + bits + '</td></tr>';
    }
    function section(title, entries) {
      if (!entries || !entries.length) return '';
      return '<h3 style="margin:.6em 0 .2em">' + esc(title) + '</h3>' +
        '<table class="chart-table"><tbody>' + entries.map(row).join("") + '</tbody></table>';
    }
    function render() {
      var name = document.getElementById("root-team").value;
      var t = byTeam[name] || {};
      var html = section("Your matches", t.own) + section("Root for / against elsewhere", t.other);
      if (!html) html = '<p class="faint">No impactful remaining scenarios for ' + esc(name) + '.</p>';
      document.getElementById("root-team-out").innerHTML = html;
    }
    p.querySelector("#root-team").addEventListener("change", render);
    render();
  }

  // View 2 — "if it goes to pens": interpolate the precomputed shootout win-curve for any pair.
  function shootoutCurve(curve, gap) {
    var g = curve.gap, p = curve.p_a_win;
    if (gap <= g[0]) return p[0];
    if (gap >= g[g.length - 1]) return p[p.length - 1];
    for (var i = 1; i < g.length; i++) {
      if (gap <= g[i]) { var t = (gap - g[i - 1]) / (g[i] - g[i - 1]); return p[i - 1] + t * (p[i] - p[i - 1]); }
    }
    return 0.5;
  }
  function shootoutView(wrap) {
    var s = D.shootout; if (!s || !s.teams) return;
    var head = ce("div", "sec-head"); head.id = "shootout";
    head.innerHTML = '<h2>Penalty shootout simulator</h2><span class="note">any two teams — "if it goes to pens" win probability (research-backed kick-order + leverage + Elo + each side’s shootout record)</span>';
    wrap.appendChild(head);
    var teamNames = Object.keys(s.teams).sort();
    var byEff = teamNames.slice().sort(function (a, b) { return s.teams[b].eff_elo - s.teams[a].eff_elo; });
    function sel(id, def) {
      return '<select id="' + id + '" style="padding:4px;margin:0 6px">' +
        teamNames.map(function (n) { return '<option' + (n === def ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join("") + '</select>';
    }
    var p = ce("div", "panel");
    p.innerHTML = '<div style="margin-bottom:10px">' + sel("so-a", byEff[0]) + ' vs ' + sel("so-b", byEff[1]) + '</div><div id="so-out"></div>';
    wrap.appendChild(p);
    function render() {
      var a = document.getElementById("so-a").value, b = document.getElementById("so-b").value;
      var ta = s.teams[a], tb = s.teams[b];
      var pa = shootoutCurve(s.curve, ta.eff_elo - tb.eff_elo);
      var bar = function (label, prob, who) {
        return '<div style="margin:4px 0"><b>' + flagImg(who, "sm") + esc(who) + '</b> ' + (prob * 100).toFixed(1) + '%' +
          '<div style="background:var(--rail,#eee);border-radius:4px;height:10px;width:100%"><div style="background:var(--accent,#1565c0);height:10px;border-radius:4px;width:' + (prob * 100).toFixed(1) + '%"></div></div></div>';
      };
      var rd = s.round_dist || {};
      document.getElementById("so-out").innerHTML =
        bar("", pa, a) + bar("", 1 - pa, b) +
        '<p class="faint" style="font-size:12px;margin-top:8px">Designated takers: ' +
        esc(a) + ' — ' + esc(ta.penalty_taker || "—") + ' · ' + esc(b) + ' — ' + esc(tb.penalty_taker || "—") +
        '. Records (W/played): ' + esc(a) + ' ' + ta.record + ', ' + esc(b) + ' ' + tb.record +
        '. At an even matchup ~' + ((rd.sudden_death || 0) * 100).toFixed(0) + '% go to sudden death.</p>';
    }
    p.querySelector("#so-a").addEventListener("change", render);
    p.querySelector("#so-b").addEventListener("change", render);
    render();
  }
  function contextIntro(wrap) {
    var p = ce("div", "sec-sub"); p.textContent = "Secondary context behind the odds — each team's data-derived play-style, its heat/travel/altitude burden, and a what-if head-to-head over any pairing. Expand a panel to dig in.";
    wrap.appendChild(p);
  }
  // U1.4: progressive disclosure — wrap a heavy panel builder in a collapsed <details> expander.
  function expander(wrap, label, fn, open) {
    var d = ce("details", "exp"); if (open) d.setAttribute("open", "");
    var s = ce("summary"); s.textContent = label; d.appendChild(s);
    var body = ce("div", "exp-body"); d.appendChild(body); wrap.appendChild(d);
    fn(body);
  }
  function styleViewX(w) { expander(w, "Play-style profiles", styleView, true); }
  function conditionsViewX(w) { expander(w, "Conditions & logistics", conditionsView); }
  function headToHeadViewX(w) { expander(w, "Head-to-head explorer", headToHeadView); }

  // U1.2: the 14 Tournament panels grouped into ≤5-panel sub-views (one question per view).
  // Phase M: most-pivotal upcoming fixtures — outcome uncertainty × combined title stakes.
  function pivotalView(wrap) {
    var pv = D.pivotal || []; if (!pv.length) return;
    var head = ce("div", "sec-head"); head.id = "pivotal";
    head.innerHTML = '<h2>Matches to watch</h2><span class="note">upcoming fixtures ranked by outcome uncertainty × combined title stakes (a proxy, no per-match re-sim)</span>';
    wrap.appendChild(head);
    var p = ce("div", "panel");
    p.innerHTML = pv.map(function (r, i) {
      return '<div class="gb-row"><span class="r">' + (i + 1) + '</span><span class="who" style="display:flex;align-items:center;gap:8px">' + flagImg(r.home, "sm") + esc(r.home) + ' <span class="faint">v</span> ' + flagImg(r.away, "sm") + esc(r.away) + ' <span class="faint" style="font-size:11px">' + esc(r.date) + (r.city ? " · " + esc(r.city) : "") + '</span></span><span class="v"><span class="barcell" style="width:' + (r.uncertainty * 46) + 'px"></span> ' + (r.uncertainty * 100).toFixed(0) + "% toss-up</span></div>";
    }).join("");
    wrap.appendChild(p);
  }

  // Phase M: auto-written match previews (templated, no LLM) for the next fixtures.
  function previewsView(wrap) {
    var pv = D.previews || []; if (!pv.length) return;
    var head = ce("div", "sec-head"); head.id = "previews";
    head.innerHTML = '<h2>Match previews</h2><span class="note">auto-written from the model\'s W/D/L, expected goals, and title odds — no hand-editing</span>';
    wrap.appendChild(head);
    var p = ce("div", "panel");
    p.innerHTML = pv.map(function (r) {
      return '<div class="cardify" style="margin-bottom:8px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><strong>' + flagImg(r.home, "sm") + esc(r.home) + " v " + flagImg(r.away, "sm") + esc(r.away) + '</strong> <span class="faint" style="font-size:11px">' + esc(r.date) + (r.city ? " · " + esc(r.city) : "") + '</span></div><span class="faint">' + esc(r.text) + "</span></div>";
    }).join("");
    wrap.appendChild(p);
  }

  // Phase M: fan chart — one team's "cone of uncertainty" over the rounds it might reach.
  function fanChartView(wrap) {
    var rd = D.round_dist; if (!rd || !Object.keys(rd).length) return;
    var head = ce("div", "sec-head"); head.id = "fan";
    head.innerHTML = '<h2>How far does a team go?</h2><span class="note">pick a team — its probability of reaching each stage, across the Monte Carlo</span>';
    wrap.appendChild(head);
    var p = ce("div", "panel");
    var teams = (D.odds_sorted || []).filter(function (t) { return rd[t]; });
    var ctrl = ce("div", "stylectrl");
    ctrl.innerHTML = '<label>Team <select class="dsel ft">' + teams.map(function (t) { return "<option>" + esc(t) + "</option>"; }).join("") + "</select></label>";
    p.appendChild(ctrl);
    var cn = ce("div", "chart"); p.appendChild(cn); wrap.appendChild(p);
    var stages = ["Group", "R32", "R16", "QF", "SF", "Final", "Champion"];
    function draw() {
      var t = ctrl.querySelector(".ft").value, d = rd[t] || {};
      // round_dist is P(furthest stage == s); "reaching a stage" is the suffix sum (survival curve):
      // P(reach s) = sum of P(furthest == s') for every s' at or beyond s. Monotonically non-increasing
      // Group(=100%) -> Champion. (Was plotting P(furthest == s), i.e. where they get knocked out.)
      var reach = {}, acc = 0;
      for (var i = stages.length - 1; i >= 0; i--) { acc += (d[stages[i]] || 0); reach[stages[i]] = acc; }
      mkChart(cn, Object.assign(axisTheme(), {
        grid: { left: 8, right: 16, top: 16, bottom: 6, containLabel: true },
        tooltip: { trigger: "axis", valueFormatter: function (v) { return (v * 100).toFixed(1) + "%"; }, backgroundColor: cssVar("--panel"), borderColor: cssVar("--line"), textStyle: { color: cssVar("--text") } },
        xAxis: Object.assign({ type: "category", data: stages }, axisStyle()),
        yAxis: Object.assign({ type: "value", max: 1, axisLabel: { formatter: function (v) { return (v * 100).toFixed(0) + "%"; } } }, axisStyle()),
        series: [{ type: "bar", data: stages.map(function (s) { return reach[s] || 0; }), itemStyle: { color: cssVar("--cb-blue") } }],
      }));
    }
    ctrl.querySelector(".ft").onchange = draw; draw();
  }

  // B2: most-likely knockout matchups per stage (R32→Final) with a team filter. Reads
  // D.ko_matchups (global top matchups per stage) and D.ko_opponents_by_team (per-team conditional
  // opponent + reach index). Conditioned on results — refreshes in the same conditional MC loop.
  var KO_STAGE_LABELS = [["R32", "Round of 32"], ["R16", "Round of 16"], ["QF", "Quarter-final"], ["SF", "Semi-final"], ["Final", "Final"]];
  function koMatchupsView(wrap) {
    var km = D.ko_matchups || {}, kobt = D.ko_opponents_by_team || {};
    var stages = KO_STAGE_LABELS.filter(function (s) { return (km[s[0]] || []).length; });
    if (!stages.length) return;
    var head = ce("div", "sec-head"); head.id = "ko-matchups";
    head.innerHTML = '<h2>Likely knockout matchups</h2><span class="note">the most probable pairing at each stage across the Monte Carlo — pick a stage, or filter to one team to see who it most likely meets and when</span>';
    wrap.appendChild(head);
    var teams = Object.keys(kobt).sort();
    var ctrl = ce("div", "panel");
    var tabs = stages.map(function (s, i) { return '<button data-st="' + s[0] + '" class="' + (i === 0 ? "on" : "") + '">' + esc(s[1]) + "</button>"; }).join("");
    var teamSel = '<select id="ko-team" style="padding:4px;margin:0 6px"><option value="">— all matchups —</option>' +
      teams.map(function (n) { return '<option>' + esc(n) + '</option>'; }).join("") + "</select>";
    ctrl.innerHTML = '<div class="seg-toggle ko-tabs" style="margin-bottom:8px">' + tabs + '</div>' +
      '<div style="margin-bottom:6px"><b>Filter team:</b> ' + teamSel + '</div>';
    wrap.appendChild(ctrl);
    var out = ce("div", "panel"); wrap.appendChild(out);
    var st = { stage: stages[0][0] };
    function labelFor(code) { for (var i = 0; i < KO_STAGE_LABELS.length; i++) if (KO_STAGE_LABELS[i][0] === code) return KO_STAGE_LABELS[i][1]; return code; }
    function drawGlobal() {
      var rows = (km[st.stage] || []).slice(0, 16);
      if (!rows.length) { out.innerHTML = '<p class="faint">No matchups recorded at this stage.</p>'; return; }
      out.innerHTML = '<table class="chart-table"><thead><tr><th>Matchup</th><th style="text-align:right">P(occurs)</th></tr></thead><tbody>' +
        rows.map(function (m) {
          return '<tr><td>' + teamCell(m.a) + ' <span class="faint">vs</span> ' + teamCell(m.b) + '</td><td style="text-align:right">' + (m.p * 100).toFixed(1) + "%</td></tr>";
        }).join("") + "</tbody></table>" +
        '<p class="faint" style="font-size:12px">P(occurs) = share of simulated tournaments in which exactly this pairing is played at the ' + esc(labelFor(st.stage)) + " stage.</p>";
    }
    function drawTeam(name) {
      var e = kobt[name]; if (!e) { out.innerHTML = '<p class="faint">No knockout data for ' + esc(name) + '.</p>'; return; }
      var pr = e.p_reach || {}, ops = e.opponents || {};
      var rows = KO_STAGE_LABELS.filter(function (s) { return (km[s[0]] || []).length; }).map(function (s) {
        var code = s[0], reach = pr[code] || 0, opp = (ops[code] || [])[0];
        var oppCell = opp ? teamCell(opp.opp) + ' <span class="faint">' + (opp.p * 100).toFixed(0) + '% if reached</span>' : '<span class="faint">—</span>';
        return '<tr><td>' + esc(s[1]) + '</td><td>' + (reach * 100).toFixed(1) + '%</td><td>' + oppCell + '</td></tr>';
      }).join("");
      out.innerHTML = '<h3 style="margin:.2em 0 .5em">' + flagImg(name, "sm") + esc(name) + ' — most likely opponent by stage</h3>' +
        '<table class="chart-table"><thead><tr><th>Stage</th><th>P(reach)</th><th>Most likely opponent</th></tr></thead><tbody>' + rows + "</tbody></table>" +
        '<p class="faint" style="font-size:12px">P(reach) is over all simulated tournaments; the opponent probability is conditional on ' + esc(name) + " reaching that stage.</p>";
    }
    function render() {
      var name = document.getElementById("ko-team").value;
      if (name) drawTeam(name); else drawGlobal();
    }
    ctrl.querySelectorAll(".ko-tabs button").forEach(function (b) {
      b.onclick = function () { ctrl.querySelectorAll(".ko-tabs button").forEach(function (x) { x.classList.remove("on"); }); b.classList.add("on"); st.stage = b.dataset.st; if (!document.getElementById("ko-team").value) drawGlobal(); };
    });
    ctrl.querySelector("#ko-team").addEventListener("change", render);
    render();
  }

  // A1: "Live" is a first-class group, shown only once the tournament is under way (mid-tournament
  // it is also the default sub-tab — see renderTournament). Pre-tournament it's filtered out so the
  // nav doesn't carry an empty tab.
  var TOUR_GROUPS = [
    { key: "live", label: "🔴 Live", panels: [resultsView, liveScorersView, historySection], midTournamentOnly: true },
    { key: "odds", label: "Odds", panels: [tournamentKpis, titleTable, marketAnchorView, ratingsView] },
    { key: "bracket", label: "Bracket & Groups", panels: [bracketView, projectedThirdsView, koMatchupsView, groupsView] },
    { key: "distributions", label: "Distributions", panels: [distView, finalsView, fanChartView, upsetView, drawLuckView] },
    { key: "watch", label: "Watch", panels: [pivotalView, previewsView] },
    { key: "rooting", label: "Rooting", panels: [rootingTeamView, rootingView] },
    { key: "shootout", label: "Shootout", panels: [shootoutView] },
    { key: "awards", label: "Awards", panels: [goldenBootView, goldenGloveView, goldenBallView, youngPlayerView, playerPropsView] },
    { key: "context", label: "Context", panels: [contextIntro, styleViewX, conditionsViewX, headToHeadViewX] },
  ];
  function midTournament() { return !!(D.as_of && D.as_of.stage && D.as_of.stage !== "pre"); }
  function renderTournament(root, sub) {
    // Hide the Live tab until the tournament starts; mid-tournament it leads and is the default.
    var groups = TOUR_GROUPS.filter(function (g) { return !g.midTournamentOnly || midTournament(); });
    var keys = groups.map(function (g) { return g.key; });
    if (!sub || keys.indexOf(sub) < 0) sub = midTournament() ? "live" : "odds";
    root.appendChild(sectionNav(groups.map(function (g) {
      return { href: "#/tournament/" + g.key, label: g.label, key: g.key };
    }), { active: sub }));
    var wrap = ce("div", "wrap");
    root.appendChild(wrap); // attach first so ECharts containers have layout (non-zero size)
    var grp = groups[keys.indexOf(sub)];
    grp.panels.forEach(function (fn) { fn(wrap); });
  }

  // ---- MATCH -----------------------------------------------------------------------------------
  function renderFeatured(root, backHref) {
    var m = D.match, wrap = ce("div", "wrap");
    root.appendChild(wrap); // attach first so ECharts containers have layout
    if (!m || !m._teams) { wrap.innerHTML = '<div class="sec-head"><h2>Single match</h2></div><div class="panel"><p class="faint">Run <code>make sim</code> to feature a generated match.</p></div>'; return; }
    var n0 = m._teams[0], n1 = m._teams[1], s = m.score;
    var head = ce("div", "sec-head");
    head.innerHTML = (backHref ? '<a href="' + backHref + '" class="faint" style="font-size:13px">← back</a> ' : "") + '<h2>Featured match — fully simulated</h2><span class="note">events-as-language Realism Engine rollout → full box score</span>';
    wrap.appendChild(head);
    var card = ce("div", "panel");
    card.innerHTML = '<div class="match-head"><div class="side">' + flagImg(n0).replace("flag ", "flag ") + '<span class="nm">' + esc(n0) + '</span></div><div class="score">' + s.home + " – " + s.away + '</div><div class="side">' + flagImg(n1) + '<span class="nm">' + esc(n1) + "</span></div></div>";
    function statrow(lbl, hv, av, fmt) { fmt = fmt || function (x) { return x; }; var tot = (hv + av) || 1; return '<div class="statrow"><div class="hv">' + fmt(hv) + '</div><div class="bar"><i class="bh" style="width:' + (hv / tot * 100) + '%"></i></div><div class="lbl">' + lbl + '</div><div class="bar"><i class="ba" style="width:' + (av / tot * 100) + '%"></i></div><div class="av">' + fmt(av) + "</div></div>"; }
    var stats = statrow("xG", m.xg.home, m.xg.away, function (x) { return x.toFixed(2); }) +
      statrow("Shots", m.shots.home, m.shots.away) +
      statrow("On target", (m.shots_on_target || {}).home || 0, (m.shots_on_target || {}).away || 0) +
      statrow("Possession", m.possession_pct.home, m.possession_pct.away, function (x) { return x + "%"; });
    if (m.passes) stats += statrow("Pass %", m.passes.home.pct, m.passes.away.pct, function (x) { return x + "%"; });
    card.innerHTML += stats;
    var sc = (m.scorers || []).map(function (g) { return '<div class="tl-goal"><span class="min">' + g.minute + "'</span> " + flagImg(g.team, "sm") + " " + esc(g.player || "—") + (g.method && g.method !== "open_play" ? ' <span class="method">(' + g.method + ")</span>" : "") + (g.assist ? ' <span class="method">assist ' + esc(g.assist) + "</span>" : "") + "</div>"; }).join("");
    card.innerHTML += '<div style="margin-top:12px"><h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">⚽ Goals</h4><div class="timeline">' + (sc || "<p class='faint'>no goals</p>") + "</div></div>";
    wrap.appendChild(card);

    // shot map + win prob
    var g2 = ce("div", "grid2");
    var pm = ce("div", "panel"); pm.innerHTML = '<h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Shot map <span class="faint">· size = xG · ★ = goal</span></h4>'; var pitch = ce("div"); pm.appendChild(pitch); g2.appendChild(pm);
    var pw = ce("div", "panel"); pw.innerHTML = '<h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Win / draw / loss probability <span class="faint">· in-running (Realism rollout)</span></h4><p class="faint" style="font-size:11px;margin:2px 0 4px">In-running estimate from the simulated events — differs from the pre-match Dixon–Coles split (scoreline panel) by design; this is the live model, that is the bookmaker-style prior.</p>'; var cw = ce("div", "chart short"); pw.appendChild(cw); g2.appendChild(pw);
    wrap.appendChild(g2);
    drawShotMap(pitch, m);
    if (m.timeline) winProbChart(cw, m);

    var g3 = ce("div", "grid2");
    var px = ce("div", "panel"); px.innerHTML = '<h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Cumulative xG</h4>'; var cx = ce("div", "chart short"); px.appendChild(cx); g3.appendChild(px);
    var pd = ce("div", "panel"); pd.innerHTML = '<h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Scoreline distribution <span class="faint">· pre-match (Dixon–Coles)</span></h4><p class="faint" style="font-size:11px;margin:2px 0 4px">Bookmaker-style prior from Elo + Dixon–Coles before kickoff — differs from the in-running W/D/L (left) by design: that one updates on the simulated events, this is the static pre-match split. (F1)</p>'; pd.appendChild(scoreDistEl(m.score_dist, n0, n1)); g3.appendChild(pd);
    wrap.appendChild(g3);
    if (m.timeline) xgChart(cx, m);

    if (m.lineups) {
      var lg = ce("div", "grid2");
      [["home", n0], ["away", n1]].forEach(function (sd) {
        var lu = m.lineups[sd[0]]; if (!lu) return; var p = ce("div", "panel xi");
        p.innerHTML = "<h4>" + esc(sd[1]) + " XI</h4>" + lu.xi.map(function (pl) { return '<div class="pl">' + esc(pl.player || "?") + ' <span class="pos">' + (pl.role || "") + "</span></div>"; }).join("") + (lu.subs && lu.subs.length ? '<h4 style="margin-top:10px">Subs</h4>' + lu.subs.map(function (s2) { return '<div class="pl faint">' + s2.minute + "' " + esc(s2.on) + " ← " + esc(s2.off) + "</div>"; }).join("") : "");
        lg.appendChild(p);
      });
      wrap.appendChild(lg);
    }
  }

  // ---- MATCHES (date schedule) -----------------------------------------------------------------
  function scheduleDates() {
    var seen = {}, out = [];
    (D.schedule || []).forEach(function (f) { if (!seen[f.date]) { seen[f.date] = 1; out.push(f.date); } });
    return out.sort();
  }
  function defaultDate(dates) {
    if (!dates.length) return null;
    var today; try { today = new Date().toISOString().slice(0, 10); } catch (e) { today = dates[0]; }
    for (var i = 0; i < dates.length; i++) if (dates[i] >= today) return dates[i]; // today or next
    return dates[dates.length - 1]; // tournament over -> last day
  }
  function fmtDate(d) { try { return new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); } catch (e) { return d; } }
  function wdlBar(p) {
    return '<span class="wdlbar"><i class="bh" style="width:' + (p.home * 100) + '%"></i><i class="bd" style="width:' + (p.draw * 100) + '%"></i><i class="ba" style="width:' + (p.away * 100) + '%"></i></span>';
  }
  // Confidence tier from the W/D/L spread (Phase M): a scannable matchday label.
  function tierChip(p) {
    var mx = Math.max(p.home, p.away), draw = p.draw;
    var t = mx >= 0.62 ? ["Lock", "lk"] : mx >= 0.5 ? ["Lean", "ln"] : draw >= 0.3 ? ["Tight", "ti"] : ["Coin-flip", "cf"];
    return '<span class="tier ' + t[1] + '">' + t[0] + "</span>";
  }

  function renderMatches(root, date) {
    var wrap = ce("div", "wrap"); root.appendChild(wrap);
    var sched = D.schedule || [], dates = scheduleDates();
    var head = ce("div", "sec-head"); head.innerHTML = '<h2>Matches</h2><span class="note">real WC2026 group-stage fixtures · full-time score for played matches, model prediction for upcoming · click for detail</span>';
    wrap.appendChild(head);

    // Featured (fully-simulated) match highlight.
    if (D.match && D.match._teams) {
      var fm = D.match, fc = ce("a", "panel feat"); fc.href = "#/match/featured";
      fc.innerHTML = '<span class="feat-tag">★ Fully simulated</span><span class="feat-mt">' + flagImg(fm._teams[0], "sm") + " " + esc(fm._teams[0]) + ' <b>' + fm.score.home + "–" + fm.score.away + "</b> " + esc(fm._teams[1]) + " " + flagImg(fm._teams[1], "sm") + '</span><span class="faint" style="font-size:13px">watch it unfold — box score, shot map, win-probability & xG timelines →</span>';
      wrap.appendChild(fc);
    }
    if (!dates.length) { wrap.appendChild(ce("div", "panel", "<p class='faint'>No fixtures available. Run <code>make tournament</code> / ensure the results dataset is cached.</p>")); return; }

    if (!date || dates.indexOf(date) < 0) date = defaultDate(dates);
    var di = dates.indexOf(date);
    var nav = ce("div", "datenav");
    var prev = di > 0 ? '#/matches/' + dates[di - 1] : null, next = di < dates.length - 1 ? '#/matches/' + dates[di + 1] : null;
    nav.innerHTML =
      (prev ? '<a class="dbtn" href="' + prev + '" aria-label="previous day">‹</a>' : '<span class="dbtn off">‹</span>') +
      '<select class="dsel" aria-label="pick date">' + dates.map(function (d) { return '<option value="' + d + '"' + (d === date ? " selected" : "") + ">" + fmtDate(d) + (d === defaultDate(dates) ? " · today" : "") + "</option>"; }).join("") + "</select>" +
      (next ? '<a class="dbtn" href="' + next + '" aria-label="next day">›</a>' : '<span class="dbtn off">›</span>');
    wrap.appendChild(nav);
    nav.querySelector(".dsel").onchange = function () { location.hash = "#/matches/" + this.value; };

    var todays = [];
    sched.forEach(function (f, i) { if (f.date === date) todays.push({ f: f, i: i }); });
    var grid = ce("div", "matchgrid");
    todays.forEach(function (o) {
      var f = o.f, p = f.pred.wdl, fav = p.home >= p.away ? f.home : f.away, favp = Math.max(p.home, p.away);
      var a = ce("a", "matchcard" + (f.played ? " played" : "")); a.href = "#/match/" + o.i;
      if (f.played && f.result) {
        // A: a played match shows the actual full-time score + whether the model's pre-match call hit.
        var rs = f.result;
        var favOut = (p.home >= p.draw && p.home >= p.away) ? "home"
          : (p.away >= p.draw && p.away >= p.home) ? "away" : "draw";
        var called = favOut === rs.outcome;
        a.innerHTML =
          '<div class="mc-city">' + esc(f.city || "") + '<span class="chip ' + (called ? "pos" : "neg") + '" style="margin-left:auto">' + (called ? "✓ called" : "✗ missed") + "</span></div>" +
          '<div class="mc-teams"><span>' + flagImg(f.home, "sm") + " " + esc(f.home) + '</span><b class="mc-score">' + rs.home_goals + "–" + rs.away_goals + "</b><span>" + esc(f.away) + " " + flagImg(f.away, "sm") + "</span></div>" +
          '<div class="mc-fav faint">Full time · pre-match ' + esc(fav) + " " + (favp * 100).toFixed(0) + "% win</div>";
      } else {
        a.innerHTML =
          '<div class="mc-city">' + esc(f.city || "") + tierChip(p) + "</div>" +
          '<div class="mc-teams"><span>' + flagImg(f.home, "sm") + " " + esc(f.home) + "</span><span class='faint'>v</span><span>" + esc(f.away) + " " + flagImg(f.away, "sm") + "</span></div>" +
          wdlBar(p) +
          '<div class="mc-fav faint">' + esc(fav) + " " + (favp * 100).toFixed(0) + "% · xG " + f.pred.lambda_home.toFixed(1) + "–" + f.pred.lambda_away.toFixed(1) + "</div>";
      }
      grid.appendChild(a);
    });
    wrap.appendChild(grid);
  }

  function renderMatchDetail(root, key) {
    if (key === "featured") { renderFeatured(root, "#/matches"); return; }
    var wrap = ce("div", "wrap"); root.appendChild(wrap);
    var idx = +key, f = (D.schedule || [])[idx];
    if (!f) { wrap.innerHTML = '<div class="sec-head"><h2>Match</h2></div><div class="panel"><p class="faint">Match not found. <a href="#/matches">Back to matches</a></p></div>'; return; }
    var p = f.pred, n0 = f.home, n1 = f.away;
    var titleTxt = f.played ? "Result &amp; pre-match prediction" : "Match prediction";
    var head = ce("div", "sec-head"); head.innerHTML = '<a href="#/matches/' + f.date + '" class="faint" style="font-size:13px">← ' + fmtDate(f.date) + '</a><h2 style="margin-top:4px">' + titleTxt + '</h2><span class="note">' + esc(f.city || "") + " · Elo + Dixon–Coles</span>";
    wrap.appendChild(head);
    // A: a played match leads with the actual full-time score; the prediction below becomes the
    // "what the model said beforehand" reference rather than a forecast of a finished game.
    if (f.played && f.result) {
      var rb = ce("div", "panel");
      rb.innerHTML = '<div class="match-head"><div class="side">' + flagImg(n0) + '<span class="nm">' + esc(n0) + '</span></div><div class="score" style="text-align:center">' + f.result.home_goals + " – " + f.result.away_goals + '<div class="faint" style="font-size:12px;font-weight:500;letter-spacing:0">full time</div></div><div class="side">' + flagImg(n1) + '<span class="nm">' + esc(n1) + "</span></div></div>";
      wrap.appendChild(rb);
    }
    var card = ce("div", "panel");
    card.innerHTML = '<div class="match-head"><div class="side">' + flagImg(n0) + '<span class="nm">' + esc(n0) + '</span></div><div class="score" style="font-size:20px;text-align:center">' + (p.wdl.home * 100).toFixed(0) + "% · " + (p.wdl.draw * 100).toFixed(0) + "% · " + (p.wdl.away * 100).toFixed(0) + '%<div class="faint" style="font-size:12px;font-weight:500;letter-spacing:0">win · draw · win</div></div><div class="side">' + flagImg(n1) + '<span class="nm">' + esc(n1) + "</span></div></div>";
    card.innerHTML += '<div style="margin-top:6px">' + wdlBar(p.wdl) + "</div>";
    card.innerHTML += '<div class="statrow" style="margin-top:14px"><div class="hv">' + p.lambda_home.toFixed(2) + '</div><div class="bar"><i class="bh" style="width:' + (p.lambda_home / (p.lambda_home + p.lambda_away) * 100) + '%"></i></div><div class="lbl">Expected goals</div><div class="bar"><i class="ba" style="width:' + (p.lambda_away / (p.lambda_home + p.lambda_away) * 100) + '%"></i></div><div class="av">' + p.lambda_away.toFixed(2) + "</div></div>";
    card.innerHTML += '<div class="faint" style="text-align:center;margin-top:8px;font-size:13px">expected total ' + p.expected_total.toFixed(1) + " goals</div>";
    wrap.appendChild(card);
    var pd = ce("div", "panel"); pd.innerHTML = '<h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Scoreline distribution <span class="faint">· Dixon–Coles</span></h4>'; pd.appendChild(scoreDistEl(p, n0, n1)); wrap.appendChild(pd);
    // View 1: the Realism Engine's generated box score for this fixture (from the offline slate).
    var sl = (D.realism_slate || {})[n0 + "|" + n1] || (D.realism_slate || {})[n1 + "|" + n0];
    if (sl) {
      var rp = ce("div", "panel");
      var scorers = (sl.scorers || []).slice(0, 6).map(function (s) {
        return '<li>' + esc(s.player) + ' <span class="faint">(' + esc(s.team) + ") ×" + s.n + "</span></li>";
      }).join("");
      rp.innerHTML = '<h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Realism Engine — typical match <span class="faint">· ' + (sl.n_sims || "") + ' sims</span>' + staleStamp("Offline GPU batch of Realism sims; regenerated only on a GPU pass, not in the live update loop.") + '</h4>' +
        '<p style="margin:.3em 0"><b>Most likely: ' + esc(n0) + " " + sl.modal_score[0] + "–" + sl.modal_score[1] + " " + esc(n1) +
        '</b> · mean goals ' + sl.mean_goals[0].toFixed(1) + "–" + sl.mean_goals[1].toFixed(1) +
        ' · xG ' + sl.mean_xg[0].toFixed(1) + "–" + sl.mean_xg[1].toFixed(1) + "</p>" +
        (scorers ? '<div class="faint" style="font-size:12px">Frequent scorers across sims:</div><ul style="margin:.2em 0 0;padding-left:18px;font-size:13px">' + scorers + "</ul>" : "");
      wrap.appendChild(rp);
    }
    // If we actually simulated this exact fixture, link to the full box score.
    var m = D.match;
    if (m && m._teams && ((m._teams[0] === n0 && m._teams[1] === n1) || (m._teams[0] === n1 && m._teams[1] === n0))) {
      var link = ce("a", "panel feat"); link.href = "#/match/featured"; link.innerHTML = '<span class="feat-tag">★ Fully simulated</span><span class="faint">We generated this match event-by-event — see the full box score, shot map & timelines →</span>'; wrap.appendChild(link);
    } else {
      wrap.appendChild(ce("div", "panel", '<p class="faint" style="font-size:13.5px">This is the Prediction Engine\'s forecast for the fixture. The event-by-event Realism Engine is run on demand for a featured match — see the <a href="#/match/featured">fully-simulated match</a>.</p>'));
    }
  }

  function drawShotMap(holder, m) {
    var d3 = window.d3; if (!d3) return; var W = 520, H = 340, pad = 10;
    var nShots = (m.shot_events || []).length;
    var nGoals = (m.shot_events || []).filter(function (s) { return s.goal; }).length;
    var svg = d3.select(holder).append("svg").attr("viewBox", "0 0 " + W + " " + H).attr("width", "100%").attr("class", "pitch")
      // F3 a11y: the pitch SVG carries no text -> mark it role=img with a summary label.
      .attr("role", "img")
      .attr("aria-label", "Shot map on a football pitch: " + nShots + " shots, " + nGoals +
        " goals; marker size is xG, stars are goals. Per-shot detail is in the box-score tables above.");
    var line = cssVar("--line-2");
    function rect(x, y, w, h) { svg.append("rect").attr("x", x).attr("y", y).attr("width", w).attr("height", h).attr("fill", "none").attr("stroke", line).attr("stroke-width", 1.2); }
    rect(pad, pad, W - 2 * pad, H - 2 * pad);
    svg.append("line").attr("x1", W / 2).attr("y1", pad).attr("x2", W / 2).attr("y2", H - pad).attr("stroke", line);
    svg.append("circle").attr("cx", W / 2).attr("cy", H / 2).attr("r", 40).attr("fill", "none").attr("stroke", line);
    rect(pad, H / 2 - 60, 70, 120); rect(W - pad - 70, H / 2 - 60, 70, 120);
    (m.shot_events || []).forEach(function (sh) {
      var home = sh.side === "home";
      var x = home ? pad + sh.x * (W - 2 * pad) : (W - pad) - sh.x * (W - 2 * pad);
      var y = pad + sh.y * (H - 2 * pad);
      var col = home ? cssVar("--home") : cssVar("--away");
      var r = 4 + Math.sqrt(sh.xg) * 16;
      if (sh.goal) {
        svg.append("text").attr("x", x).attr("y", y + 5).attr("text-anchor", "middle").attr("fill", cssVar("--champ")).attr("font-size", r + 8).text("★").append("title").text("Goal · xG " + sh.xg.toFixed(2) + " · " + sh.minute + "'");
      } else {
        svg.append("circle").attr("cx", x).attr("cy", y).attr("r", r).attr("fill", "none").attr("stroke", col).attr("stroke-width", 1.6).append("title").text("Shot · xG " + sh.xg.toFixed(2) + " · " + sh.minute + "'");
      }
    });
  }

  function winProbChart(node, m) {
    var tl = m.timeline, n0 = m._teams[0], n1 = m._teams[1];
    mkChart(node, Object.assign(axisTheme(), {
      grid: { left: 8, right: 12, top: 12, bottom: 18, containLabel: true },
      tooltip: { trigger: "axis", backgroundColor: cssVar("--panel"), borderColor: cssVar("--line"), textStyle: { color: cssVar("--text") },
        formatter: function (ps) { var p = tl[ps[0].dataIndex]; return "<b>" + p.minute + "'</b> " + n0 + " " + p.home_goals + "–" + p.away_goals + " " + n1 + "<br>" + n0 + " win " + (p.p_home * 100).toFixed(0) + "% · draw " + (p.p_draw * 100).toFixed(0) + "% · " + n1 + " win " + (p.p_away * 100).toFixed(0) + "%"; } },
      xAxis: Object.assign({ type: "category", data: tl.map(function (p) { return p.minute; }), boundaryGap: false, axisLabel: { formatter: function (v) { return v + "'"; }, interval: Math.ceil(tl.length / 8) } }, axisStyle()),
      yAxis: Object.assign({ type: "value", max: 1, axisLabel: { formatter: function (v) { return (v * 100).toFixed(0) + "%"; } } }, axisStyle()),
      series: [
        { name: n0 + " win", type: "line", stack: "p", areaStyle: { color: cssVar("--home") }, lineStyle: { width: 0 }, symbol: "none", data: tl.map(function (p) { return p.p_home; }) },
        { name: "draw", type: "line", stack: "p", areaStyle: { color: cssVar("--draw") }, lineStyle: { width: 0 }, symbol: "none", data: tl.map(function (p) { return p.p_draw; }) },
        { name: n1 + " win", type: "line", stack: "p", areaStyle: { color: cssVar("--away") }, lineStyle: { width: 0 }, symbol: "none", data: tl.map(function (p) { return p.p_away; }) },
      ],
    }));
    if (node.parentNode) {  // sample ~ every 10' so the data table stays compact
      var samp = tl.filter(function (p, i) { return p.minute % 10 === 0 || i === tl.length - 1; });
      attachChartTable(node.parentNode, node, "Win / draw / loss probability by minute (" + n0 + " vs " + n1 + ")",
        ["Minute", n0 + " win", "Draw", n1 + " win"],
        samp.map(function (p) { return [p.minute + "'", (p.p_home * 100).toFixed(0) + "%", (p.p_draw * 100).toFixed(0) + "%", (p.p_away * 100).toFixed(0) + "%"]; }));
    }
  }

  function xgChart(node, m) {
    var tl = m.timeline, n0 = m._teams[0], n1 = m._teams[1];
    mkChart(node, Object.assign(axisTheme(), {
      grid: { left: 8, right: 12, top: 12, bottom: 18, containLabel: true },
      legend: { data: [n0, n1], textStyle: { color: cssVar("--muted") }, top: 0 },
      tooltip: { trigger: "axis", backgroundColor: cssVar("--panel"), borderColor: cssVar("--line"), textStyle: { color: cssVar("--text") } },
      xAxis: Object.assign({ type: "category", data: tl.map(function (p) { return p.minute; }), boundaryGap: false, axisLabel: { formatter: function (v) { return v + "'"; }, interval: Math.ceil(tl.length / 8) } }, axisStyle()),
      yAxis: Object.assign({ type: "value" }, axisStyle()),
      series: [
        { name: n0, type: "line", step: "end", symbol: "none", lineStyle: { color: cssVar("--home"), width: 2 }, data: tl.map(function (p) { return p.xg_home; }) },
        { name: n1, type: "line", step: "end", symbol: "none", lineStyle: { color: cssVar("--away"), width: 2 }, data: tl.map(function (p) { return p.xg_away; }) },
      ],
    }));
  }

  function scoreDistEl(sd, n0, n1) {
    var box = ce("div");
    if (!sd || !sd.matrix) { box.innerHTML = "<p class='faint'>n/a</p>"; return box; }
    var mat = sd.matrix, mx = Math.max.apply(null, mat.map(function (r) { return Math.max.apply(null, r); })) || 1;
    var grid = ce("div", "heatgrid"); grid.style.gridTemplateColumns = "repeat(" + mat[0].length + ",1fr)"; grid.style.maxWidth = "300px";
    // F3 a11y: the colour grid is decorative for non-sighted users -> mark it role=img with a
    // summary label, and emit an .sr-only coded table of the same probabilities as the fallback.
    grid.setAttribute("role", "img");
    var topSc = (sd.top_scorelines || [])[0];
    grid.setAttribute("aria-label", "Scoreline probability heatmap, " + esc(n0) + " goals (rows) by " +
      esc(n1) + " goals (columns)" + (topSc ? "; most likely " + topSc.home + "–" + topSc.away +
      " at " + (topSc.p * 100).toFixed(1) + "%" : "") + ".");
    mat.forEach(function (row, i) { row.forEach(function (v, j) { var c = ce("div", "heatcell"); c.style.background = "color-mix(in srgb, var(--accent) " + (v / mx * 100).toFixed(0) + "%, var(--panel-2))"; c.textContent = i + "-" + j; c.title = n0 + " " + i + "-" + j + " " + n1 + ": " + (v * 100).toFixed(1) + "%"; c.setAttribute("aria-hidden", "true"); grid.appendChild(c); }); });
    box.appendChild(grid);
    var tbl = ce("table", "sr-only");
    tbl.innerHTML = "<caption>Scoreline probabilities (%): " + esc(n0) + " goals by row, " + esc(n1) +
      " goals by column</caption><tbody>" + mat.map(function (row, i) {
        return "<tr><th>" + esc(n0) + " " + i + "</th>" + row.map(function (v, j) {
          return "<td>" + esc(n1) + " " + j + ": " + (v * 100).toFixed(1) + "%</td>"; }).join("") + "</tr>";
      }).join("") + "</tbody>";
    box.appendChild(tbl);
    var w = sd.wdl;
    box.appendChild(ce("div", null, '<div class="legend" style="margin-top:10px"><span><b style="background:var(--home)"></b>' + esc(n0) + " " + (w.home * 100).toFixed(0) + "%</span><span><b style='background:var(--draw)'></b>draw " + (w.draw * 100).toFixed(0) + "%</span><span><b style='background:var(--away)'></b>" + esc(n1) + " " + (w.away * 100).toFixed(0) + "%</span></div>"));
    box.appendChild(ce("div", "toplines", (sd.top_scorelines || []).slice(0, 6).map(function (t) { return '<span class="topline">' + t.home + "–" + t.away + " <b>" + (t.p * 100).toFixed(1) + "%</b></span>"; }).join("")));
    return box;
  }

  function trackRecordView(wrap) {
    var tr = D.track_record || {}; if (!tr.baseline) return;
    var b = tr.baseline;
    var h = ce("div", "sec-head"); h.id = "m-track"; h.tabIndex = -1; h.innerHTML = "<h2 class='sec-h2'>Track record vs reality</h2><span class='note'>the immutable pre-tournament baseline, graded as results land</span>";
    wrap.appendChild(h);
    var p = ce("div", "panel");
    if (tr.status === "awaiting" || !tr.scored) {
      p.innerHTML = '<p>Baseline prediction <b>locked ' + esc(b.date) + '</b> (' + (b.n_sims ? (+b.n_sims).toLocaleString() : "?") + ' sims, seed ' + esc(String(b.seed)) + ', git ' + esc(String(b.git_sha)) + '). ' +
        (tr.n_results ? esc(String(tr.n_results)) + " match(es) ingested; group scoring begins once group games are played." : "Awaiting the first kickoff — every fixture’s pre-match forecast is frozen and will be scored against the real result.") + '</p>';
      wrap.appendChild(p); return;
    }
    var s = tr.scored;
    var cards = ce("div", "kpi-cards");
    function card(big, lbl, sub, good) { var c = ce("div", "kpi " + (good ? "good" : "")); c.innerHTML = '<div class="lbl">' + lbl + '</div><div class="val">' + big + '</div><div class="sub">' + sub + "</div>"; return c; }
    cards.appendChild(card(s.brier != null ? s.brier.toFixed(3) : "—", "Live Brier (" + s.n + " played)", s.brier_naive != null ? ((s.beats_prior ? "✓ beats " : "vs ") + s.brier_naive.toFixed(3) + " prior") : "", s.beats_prior));
    if (s.scoreline_hit_rate != null) cards.appendChild(card((s.scoreline_hit_rate * 100).toFixed(0) + "%", "Exact-scoreline hit rate", "most-likely scoreline landed"));
    if (s.log_loss != null) cards.appendChild(card(s.log_loss.toFixed(3), "Live log-loss", "lower is better"));
    p.appendChild(cards); wrap.appendChild(p);
    if ((tr.surprises || []).length) {
      var sp = ce("div", "panel"); sp.innerHTML = "<h4 style='font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px'>Biggest surprises</h4>" +
        tr.surprises.map(function (m) { return '<div class="gb-row"><span class="who">' + flagImg(m.home, "sm") + " " + esc(m.home) + " " + esc(m.actual_score) + " " + esc(m.away) + " " + flagImg(m.away, "sm") + '</span><span class="faint" style="font-size:12px">model gave the ' + esc(m.actual) + ' ' + (m.p_actual * 100).toFixed(0) + "%</span></div>"; }).join("");
      wrap.appendChild(sp);
    }
  }

  // F3: native ECharts reliability (calibration) diagram from JSON — observed-vs-predicted with the
  // y=x reference; point size scales with bin count. Mirrors the shot-map a11y pattern (role/aria +
  // a "Show table" coded fallback of the same bins). Replaces the old static reliability matplotlib PNG.
  function reliabilityPanel(cal) {
    var bins = cal.bins || [];
    var maxN = bins.reduce(function (m, b) { return Math.max(m, b.count); }, 1);
    var panel = ce("div", "panel");
    var caption = "Reliability diagram — held-out W/D/L (" + (cal.n_test || 0) +
      " matches). Predicted probability (x) vs observed frequency (y); points on the diagonal are " +
      "perfectly calibrated, marker size scales with bin count.";
    var cn = ce("div"); cn.style.height = "320px"; panel.appendChild(cn);
    mkChart(cn, Object.assign(axisTheme(), {
      grid: { left: 8, right: 18, top: 28, bottom: 30, containLabel: true },
      tooltip: {
        backgroundColor: cssVar("--panel"), borderColor: cssVar("--line"),
        textStyle: { color: cssVar("--text") },
        formatter: function (p) {
          if (p.seriesName === "perfect") { return "perfect calibration (y = x)"; }
          var d = p.data;
          return "predicted " + (d[0] * 100).toFixed(1) + "%<br>observed " + (d[1] * 100).toFixed(1) +
            "%<br>" + d[2] + " samples";
        },
      },
      legend: { data: [cal.label || "model", "perfect"], top: 0, textStyle: { color: cssVar("--muted") } },
      xAxis: Object.assign({ type: "value", min: 0, max: 1, name: "predicted probability",
        nameLocation: "middle", nameGap: 24, nameTextStyle: { color: cssVar("--muted") },
        axisLabel: { formatter: function (v) { return (v * 100).toFixed(0) + "%"; } } }, axisStyle()),
      yAxis: Object.assign({ type: "value", min: 0, max: 1, name: "observed frequency",
        nameLocation: "middle", nameGap: 34, nameTextStyle: { color: cssVar("--muted") },
        axisLabel: { formatter: function (v) { return (v * 100).toFixed(0) + "%"; } } }, axisStyle()),
      series: [
        { name: "perfect", type: "line", data: [[0, 0], [1, 1]], showSymbol: false,
          lineStyle: { color: cssVar("--muted"), type: "dashed", width: 1 }, silent: true, z: 1 },
        { name: cal.label || "model", type: "line", smooth: false, z: 2,
          symbolSize: function (v) { return 8 + 22 * (v[2] / maxN); },
          data: bins.map(function (b) { return [b.predicted, b.observed, b.count]; }),
          lineStyle: { color: cssVar("--accent"), width: 2 },
          itemStyle: { color: cssVar("--accent") } },
      ],
    }));
    attachChartTable(panel, cn, caption,
      ["Predicted", "Observed", "Samples"],
      bins.map(function (b) {
        return [(b.predicted * 100).toFixed(1) + "%", (b.observed * 100).toFixed(1) + "%", String(b.count)];
      }));
    return panel;
  }

  // ---- MODEL -----------------------------------------------------------------------------------
  function renderModel(root) {
    var ev = D.eval || {}, wrap = ce("div", "wrap");
    root.appendChild(wrap);
    var head = ce("div", "sec-head"); head.innerHTML = '<h2>The model</h2><span class="note">two engines · how it scores · the forecast over time · the honest limits</span>';
    wrap.appendChild(head);
    // U1.3: Model sub-nav (the standalone Time-machine tab was folded in here).
    wrap.appendChild(sectionNav([
      { href: "#m-track", label: "Track record", key: "m-track" },
      { href: "#m-history", label: "Forecast over time", key: "m-history" },
      { href: "#m-engines", label: "Engines & credibility", key: "m-engines" },
      { href: "#m-realism", label: "Realism", key: "m-realism" },
    ], { scroll: true, spy: ["m-track", "m-history", "m-engines", "m-realism"] }));
    trackRecordView(wrap);
    historySection(wrap);
    var intro = ce("div", "panel prose"); intro.id = "m-engines"; intro.tabIndex = -1;
    intro.innerHTML = "<p><b>Two decoupled engines.</b> A fast <b>Prediction Engine</b> (Elo + Dixon–Coles bivariate Poisson) runs the whole-tournament Monte Carlo in milliseconds per match — that's what every odds, bracket and distribution on this site comes from. A generative <b>Realism Engine</b> (an events-as-language transformer over SPADL tokens) writes a single match event-by-event into a believable box score. They're decoupled on purpose: a transformer match is ~3,400 forward passes, a tournament is billions — so the transformer informs prediction by <i>distillation</i>, never inside the Monte Carlo loop.</p>";
    wrap.appendChild(intro);

    var cards = ce("div", "kpi-cards");
    function card(big, lbl, sub, good) { var c = ce("div", "kpi " + (good ? "good" : "")); c.innerHTML = '<div class="lbl">' + lbl + '</div><div class="val">' + big + '</div><div class="sub">' + sub + "</div>"; return c; }
    if (ev.results_backtest_brier != null) cards.appendChild(card(ev.results_backtest_brier.toFixed(3), "Backtest Brier (199 matches)", "✓ beats " + ev.results_backtest_naive.toFixed(3) + " base rate", ev.results_backtest_brier < ev.results_backtest_naive));
    if (ev.holdout_brier != null) cards.appendChild(card(ev.holdout_brier.toFixed(3), "Held-out Brier (" + ev.holdout_n + " matches)", "vs " + ev.holdout_naive.toFixed(3) + " naive", ev.holdout_brier < ev.holdout_naive));
    if (ev.backtest_brier != null) cards.appendChild(card(ev.backtest_brier.toFixed(3), "Backtest (" + ev.backtest_target + ")", "vs " + ev.backtest_naive.toFixed(3) + " naive", ev.backtest_brier < ev.backtest_naive));
    cards.appendChild(card((D.meta && D.meta.n_sims ? (+D.meta.n_sims).toLocaleString() : "—"), "Monte Carlo runs", "Elo + Dixon–Coles"));
    var ch = ce("div", "sec-head"); ch.innerHTML = "<h2 class='sec-h2'>Prediction credibility</h2>"; wrap.appendChild(ch);
    var cp = ce("div", "panel"); cp.appendChild(cards); wrap.appendChild(cp);

    var rm = (D.model && D.model.realism_metrics) || [];
    if (rm.length) {
      var rh = ce("div", "sec-head"); rh.id = "m-realism"; rh.tabIndex = -1; rh.innerHTML = "<h2 class='sec-h2'>Realism — generated vs real</h2><span class='note'>held-out fold · 0.5σ tolerance · KS distribution test</span>"; wrap.appendChild(rh);
      var rp = ce("div", "panel"); rp.style.overflowX = "auto";
      rp.innerHTML = '<table class="tbl metric-tbl"><thead><tr><th>Metric</th><th>Sim</th><th>Real</th><th>Tol (0.5σ)</th><th>KS p</th><th>Pass</th></tr></thead><tbody>' +
        rm.map(function (r) { return "<tr><td>" + esc(r.metric) + "</td><td>" + r.sim + "</td><td>" + r.real + "</td><td>±" + r.tol + "</td><td>" + r.ks_p.toFixed(3) + "</td><td><span class='" + (r.pass ? "ok" : "no") + "'>" + (r.pass ? "✓" : "✕") + "</span></td></tr>"; }).join("") + "</tbody></table>";
      wrap.appendChild(rp);
    }
    var cal = (D.model && D.model.calibration) || {};
    var figs = (D.model && D.model.figures) || [];
    if ((cal.bins && cal.bins.length) || figs.length) {
      var fh = ce("div", "sec-head"); fh.innerHTML = "<h2 class='sec-h2'>Calibration & realism diagrams</h2><span class='note'>reliability (predicted vs observed) · generated-vs-real distributions</span>"; wrap.appendChild(fh);
      var fg = ce("div", "grid2");
      // F3: native ECharts reliability diagram drawn from JSON (replaces the old reliability.png).
      if (cal.bins && cal.bins.length) { fg.appendChild(reliabilityPanel(cal)); }
      // U3.1: descriptive alt text (was the bare filename) so the diagrams are screen-reader legible.
      var ALT = { "realism.png": "Realism diagram — distributions of generated vs real match statistics (shots, goals, possession) on the held-out fold; closer overlap means more realistic generated matches." };
      figs.forEach(function (f) { var p = ce("div", "panel"); p.innerHTML = '<img src="' + f + '" alt="' + esc(ALT[f] || f) + '" style="width:100%;border-radius:8px;background:#fff">'; fg.appendChild(p); });
      wrap.appendChild(fg);
    }
    var callout = ce("div", "panel");
    callout.innerHTML = '<div class="callout"><b>Honest limits.</b> The Realism Engine now generates realistic goals and shots (the xG-grounded decode hybrid, no flat boost); the remaining gap is match <em>duration / action-count</em> — matches reach too few events on the small open corpus, a possession-horizon modeling limit, not faked. The single-match scoreline distribution on this site comes from the calibrated Prediction Engine; the generated match is the believable narrative. See <code>GATED_ITEMS.md</code> in the repo for every gated item, why, and the exact unblock.</div>';
    wrap.appendChild(callout);
  }

  // ---- ABOUT -----------------------------------------------------------------------------------
  function renderAbout(root) {
    var wrap = ce("div", "wrap");
    wrap.innerHTML = '<div class="sec-head"><h2>About & data</h2></div>' +
      '<div class="panel prose"><p>An independent two-engine soccer simulator for the 2026 World Cup. Every number on this site is produced by the simulator and traces to a JSON output — no fabricated data.</p>' +
      '<h3>Data provenance</h3><ul>' +
      '<li><b>Event data:</b> StatsBomb open data (free, non-commercial, with attribution) — WC 2022, Euro 2020/2024, Copa América 2024, AFCON 2023, and women\'s tournaments; SPADL action schema.</li>' +
      '<li><b>Ratings:</b> World-Football Elo from full international results (1872–2026), with a host advantage for Canada/Mexico/USA.</li>' +
      '<li><b>Pretraining corpus (C7):</b> the CC BY 4.0 Wyscout / Pappalardo set (~3M club events).</li>' +
      '<li><b>Rosters / values (C5+):</b> the CC0 Transfermarkt dump; goalscorer histories from martj42 (CC BY).</li>' +
      '<li><b>Flags:</b> flagcdn.com · <b>player photos:</b> best-effort Wikipedia/Wikimedia with a generated-avatar fallback.</li></ul>' +
      '<h3>How it\'s built</h3><p>Python (PyTorch MPS), pandas/duckdb, scikit-learn. The tournament is an Elo + Dixon–Coles Monte Carlo; the single match is an events-as-language transformer. This site is generated by <code>make dashboard</code> from the run\'s JSON; charts use ECharts + D3 via CDN.</p>' +
      '<p class="faint">Not affiliated with FIFA; the 2026 marks are trademarked and the theme here is original.</p></div>';
    root.appendChild(wrap);
  }

  // ---- TEAM DETAIL -----------------------------------------------------------------------------
  function groupOf(team) {
    var gs = D.groups || {};
    for (var g in gs) { if (gs[g].indexOf(team) >= 0) return g; }
    return null;
  }
  function renderTeam(root, name) {
    name = decodeURIComponent(name || "");
    var wrap = ce("div", "wrap"); root.appendChild(wrap);
    var o = odds(name);
    if (!o || o.champion == null) { wrap.innerHTML = '<div class="sec-head"><h2>' + esc(name) + '</h2></div><div class="panel"><p class="faint">No team data. <a href="#/tournament">Back to tournament</a></p></div>'; return; }
    var g = groupOf(name);
    var head = ce("div", "sec-head");
    head.innerHTML = '<a href="#/tournament" class="faint" style="font-size:13px">← tournament</a>' +
      '<h2 style="margin-top:4px;display:flex;align-items:center;gap:10px">' + flagImg(name) + esc(name) + (g ? ' <a class="note grouplink" href="#/group/' + g + '">Group ' + g + " →</a>" : "") + "</h2>";
    wrap.appendChild(head);
    // KPIs
    var kpis = ce("div", "kpis");
    function kpi(lbl, val, sub) { var k = ce("div", "kpi"); k.innerHTML = '<div class="lbl">' + lbl + '</div><div class="val">' + val + '</div><div class="sub">' + (sub || "") + "</div>"; return k; }
    kpis.appendChild(kpi("Title odds", pct(o.champion), "expected finish: " + esc(o.expected_finish || "")));
    kpis.appendChild(kpi("Advance", pct(o.advance), "out of the group"));
    var mgp = (D.mean_group_points || {})[name];
    if (mgp != null) kpis.appendChild(kpi("Mean group pts", mgp.toFixed(1), "of 9"));
    var rt = (D.ratings || []).filter(function (r) { return r.team === name; })[0];
    if (rt) kpis.appendChild(kpi("Elo", rt.elo.toFixed(0), "attack " + rt.attack + " · def " + rt.defense));
    wrap.appendChild(kpis);

    // Group-position distribution.
    var gpd = (D.group_position_dist || {})[name];
    if (gpd) {
      var ph = ce("div", "sec-head"); ph.innerHTML = "<h2 class='sec-h2'>Group-position probability</h2><span class='note'>where it finishes in the group</span>"; wrap.appendChild(ph);
      var pp = ce("div", "panel"); var cn = ce("div", "chart short"); pp.appendChild(cn); wrap.appendChild(pp);
      var labels = ["1st", "2nd", "3rd", "4th"];
      mkChart(cn, Object.assign(axisTheme(), {
        tooltip: { trigger: "axis", valueFormatter: function (v) { return (v * 100).toFixed(1) + "%"; }, backgroundColor: cssVar("--panel"), borderColor: cssVar("--line"), textStyle: { color: cssVar("--text") } },
        xAxis: Object.assign({ type: "category", data: labels }, axisStyle()),
        yAxis: Object.assign({ type: "value", max: 1, axisLabel: { formatter: function (v) { return (v * 100).toFixed(0) + "%"; } } }, axisStyle()),
        series: [{ type: "bar", barWidth: 40, data: ["1", "2", "3", "4"].map(function (k, i) { return { value: gpd[k] || 0, itemStyle: { color: i < 2 ? cssVar("--good") : cssVar("--muted"), borderRadius: [4, 4, 0, 0] } }; }),
          label: { show: true, position: "top", color: cssVar("--text"), formatter: function (p) { return (p.value * 100).toFixed(0) + "%"; } } }],
      }));
    }

    // Expected results per group match.
    var fixtures = (D.schedule || []).filter(function (f) { return f.home === name || f.away === name; });
    if (fixtures.length) {
      var fh = ce("div", "sec-head"); fh.innerHTML = "<h2 class='sec-h2'>Group matches</h2><span class='note'>model prediction per fixture · click for detail</span>"; wrap.appendChild(fh);
      var grid = ce("div", "matchgrid");
      fixtures.forEach(function (f) {
        var idx = (D.schedule || []).indexOf(f), pr = f.pred.wdl, isHome = f.home === name;
        var opp = isHome ? f.away : f.home, pWin = isHome ? pr.home : pr.away, pLoss = isHome ? pr.away : pr.home;
        var a = ce("a", "matchcard"); a.href = "#/match/" + idx;
        a.innerHTML = '<div class="mc-city">' + esc(f.date) + " · " + esc(f.city || "") + "</div>" +
          '<div class="mc-teams"><span>vs ' + flagImg(opp, "sm") + " " + esc(opp) + "</span></div>" +
          '<span class="wdlbar"><i class="bh" style="width:' + (pWin * 100) + '%"></i><i class="bd" style="width:' + (pr.draw * 100) + '%"></i><i class="ba" style="width:' + (pLoss * 100) + '%"></i></span>' +
          '<div class="mc-fav faint">win ' + (pWin * 100).toFixed(0) + "% · draw " + (pr.draw * 100).toFixed(0) + "% · loss " + (pLoss * 100).toFixed(0) + "%</div>";
        grid.appendChild(a);
      });
      wrap.appendChild(grid);
    }

    // Most-likely first-knockout opponents.
    var opps = (D.r32_opponents || {})[name];
    if (opps && opps.length) {
      var oh = ce("div", "sec-head"); oh.innerHTML = "<h2 class='sec-h2'>Most-likely R32 opponent</h2><span class='note'>first knockout, conditional on qualifying (official slot map)</span>"; wrap.appendChild(oh);
      var op = ce("div", "panel");
      op.innerHTML = opps.map(function (r) { return '<div class="gb-row">' + teamCell(r.team) + '<span class="v">' + (r.p * 100).toFixed(0) + "%</span></div>"; }).join("");
      wrap.appendChild(op);
    }

    // Expected top scorers (from the Golden Boot board).
    var scorers = (D.golden_boot || []).filter(function (p) { return p.team === name; });
    if (scorers.length) {
      var sh = ce("div", "sec-head"); sh.innerHTML = "<h2 class='sec-h2'>Expected top scorers</h2>"; wrap.appendChild(sh);
      var sp = ce("div", "panel");
      sp.innerHTML = scorers.map(function (p) { return '<div class="gb-row"><span class="who">' + esc(p.player) + '</span><span class="v">' + p.exp_goals.toFixed(1) + " proj. goals · " + (p.p_top * 100).toFixed(1) + "% Golden Boot</span></div>"; }).join("");
      wrap.appendChild(sp);
    }
  }

  // ---- GROUP DETAIL ----------------------------------------------------------------------------
  function renderGroup(root, letter) {
    letter = (letter || "").toUpperCase();
    var wrap = ce("div", "wrap"); root.appendChild(wrap);
    var gd = (D.groups_detail || {})[letter];
    if (!gd) { wrap.innerHTML = '<div class="sec-head"><h2>Group ' + esc(letter) + '</h2></div><div class="panel"><p class="faint">No group data. <a href="#/tournament">Back</a></p></div>'; return; }
    var head = ce("div", "sec-head");
    head.innerHTML = '<a href="#/tournament" class="faint" style="font-size:13px">← tournament</a><h2 style="margin-top:4px">Group ' + esc(letter) + '</h2><span class="note">chaos index ' + (gd.chaos * 100).toFixed(0) + '% · higher = more open</span>';
    wrap.appendChild(head);
    var teams = gd.table.map(function (r) { return r.team; });

    // D: the REAL table so far (played matches only) — shown above the projections once any group
    // match has been played, so the page leads with reality rather than a pre-tournament forecast.
    var st = gd.standings || [];
    if (st.length) {
      var tp = ce("div", "panel"); tp.innerHTML = '<h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Table so far <span class="faint">· played results</span></h4>' +
        '<div class="standings"><div class="st-h">#</div><div class="st-h st-team">Team</div><div class="st-h">P</div><div class="st-h">W</div><div class="st-h">D</div><div class="st-h">L</div><div class="st-h">GF</div><div class="st-h">GA</div><div class="st-h">GD</div><div class="st-h">Pts</div>' +
        st.map(function (r, i) {
          return '<div class="st-r' + (i < 2 ? " q" : "") + '">' + (i + 1) + "</div>" +
            '<div class="st-team">' + flagImg(r.team, "sm") + " " + esc(r.team) + statusBadge(r.team) + "</div>" +
            "<div>" + r.played + "</div><div>" + r.w + "</div><div>" + r.d + "</div><div>" + r.l + "</div>" +
            "<div>" + r.gf + "</div><div>" + r.ga + "</div><div>" + (r.gd > 0 ? "+" : "") + r.gd + '</div><div class="st-pts">' + r.pts + "</div>";
        }).join("") + "</div>";
      wrap.appendChild(tp);
    }

    // finish-position heat-grid (team × 1st/2nd/3rd/4th).
    var hp = ce("div", "panel"); hp.innerHTML = '<h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Finish-position probability</h4>';
    var grid = ce("div", "posgrid");
    grid.innerHTML = '<div class="pg-h"></div><div class="pg-h">1st</div><div class="pg-h">2nd</div><div class="pg-h">3rd</div><div class="pg-h">4th</div>' +
      gd.table.map(function (r) {
        return '<div class="pg-t">' + flagImg(r.team, "sm") + esc(r.team) + "</div>" + ["1", "2", "3", "4"].map(function (k) {
          var p = (r.p_pos || {})[k] || 0;
          return '<div class="pg-c" style="background:color-mix(in srgb, var(--accent) ' + (p * 100).toFixed(0) + '%, var(--panel-2))" title="' + esc(r.team) + " " + k + ": " + (p * 100).toFixed(1) + '%">' + (p * 100).toFixed(0) + "</div>";
        }).join("");
      }).join("");
    hp.appendChild(grid); wrap.appendChild(hp);

    // expected points bar.
    var ep = ce("div", "panel"); var cn = ce("div", "chart short"); ep.innerHTML = '<h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Expected group points <span class="faint">· advance / qualify odds</span></h4>'; ep.appendChild(cn); wrap.appendChild(ep);
    mkChart(cn, Object.assign(axisTheme(), {
      grid: { left: 8, right: 60, top: 6, bottom: 18, containLabel: true },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, backgroundColor: cssVar("--panel"), borderColor: cssVar("--line"), textStyle: { color: cssVar("--text") },
        formatter: function (ps) { var r = gd.table[ps[0].dataIndex]; return "<b>" + esc(r.team) + "</b><br>exp " + r.exp_points.toFixed(1) + " pts<br>win group " + (r.p_win_group * 100).toFixed(0) + "% · advance " + (r.p_advance * 100).toFixed(0) + "%"; } },
      xAxis: Object.assign({ type: "value", max: 9, name: "pts", nameLocation: "end", nameTextStyle: { color: cssVar("--muted") } }, axisStyle()),
      yAxis: Object.assign({ type: "category", inverse: true, data: teams }, axisStyle()),
      series: [{ type: "bar", data: gd.table.map(function (r) { return { value: +r.exp_points.toFixed(2), itemStyle: { color: r.p_advance >= 0.5 ? cssVar("--good") : cssVar("--muted"), borderRadius: [0, 4, 4, 0] } }; }), barWidth: 16,
        label: { show: true, position: "right", color: cssVar("--text"), formatter: function (p) { return p.value + " pts"; } } }],
    }));

    // most-likely full tables.
    if ((gd.likely_tables || []).length) {
      var lp = ce("div", "panel"); lp.innerHTML = '<h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Most-likely final tables</h4>' +
        gd.likely_tables.map(function (t) { return '<div class="gb-row"><span class="who" style="gap:6px;flex-wrap:wrap">' + t.order.map(function (nm, i) { return '<span class="faint">' + (i + 1) + ".</span> " + flagImg(nm, "sm") + " " + esc(nm); }).join(" ") + '</span><span class="v">' + (t.p * 100).toFixed(1) + "%</span></div>"; }).join("");
      wrap.appendChild(lp);
    }
    // R32 opponents by finishing slot.
    if (gd.r32_by_finish && Object.keys(gd.r32_by_finish).length) {
      var rp = ce("div", "panel"); rp.innerHTML = '<h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">First knockout by finish</h4>' +
        Object.keys(gd.r32_by_finish).map(function (k) { var o = gd.r32_by_finish[k]; return '<div class="gb-row"><span class="who">' + (k === "winner" ? "Group winner" : "Runner-up") + ' → ' + esc(o.slot) + '</span><span class="v faint">likely ' + (o.likely_team ? esc(o.likely_team) : "—") + "</span></div>"; }).join("");
      wrap.appendChild(rp);
    }
  }

  // ---- HISTORY (prediction time-machine) -------------------------------------------------------
  // U1.3: rendered as a section inside the Model page (the standalone Time-machine tab was folded in).
  // ---- LIVE (LIVE_TRACKING A1–A4) --------------------------------------------------------------
  // The most recent played result involving `team` (D.results is newest-first), as "A 2–1 B".
  function lastResultFor(team) {
    var R = D.results || [];
    for (var i = 0; i < R.length; i++) {
      var m = R[i];
      if (m.home === team || m.away === team) {
        return esc(m.home) + " " + esc(String(m.score).replace("-", "–")) + " " + esc(m.away);
      }
    }
    return null;
  }

  // A4: a site-wide freshness banner (built once, prepended to every view by route()). Returns null
  // pre-tournament so the banner only appears once results condition the forecast.
  function liveBanner() {
    var a = D.as_of || {};
    if (!a.n_pinned) return null;
    var when = a.last_updated ? String(a.last_updated).slice(0, 10) : "";
    var isNew = false;
    if (a.last_updated) { var age = (Date.now() - Date.parse(a.last_updated)) / 36e5; isNew = age >= 0 && age < 2; }
    var b = ce("div", "live-banner");
    b.innerHTML = '<span class="lb-dot" aria-hidden="true"></span>' +
      '<a href="#/tournament/live"><strong>Live</strong></a> · Updated ' + esc(when) + ' · ' +
      a.n_pinned + ' match' + (a.n_pinned === 1 ? '' : 'es') + ' played · conditioned on reality' +
      (a.next_update_hint ? ' · <span class="faint">' + esc(a.next_update_hint) + '</span>' : '') +
      (isNew ? ' <span class="chip pos">NEW</span>' : '');
    return b;
  }

  // A2: the played-match recap — every result, newest-first, with the model's frozen pre-match call.
  function resultsView(wrap) {
    var R = D.results || [];
    var head = ce("div", "sec-head"); head.id = "live-results";
    head.innerHTML = "<h2 class='sec-h2'>Results so far</h2><span class=\"note\">every played match with the model's frozen pre-tournament call</span>";
    wrap.appendChild(head);
    if (!R.length) {
      wrap.appendChild(ce("div", "panel", '<p class="faint">No matches have been played yet. Once the tournament kicks off, every result appears here with the model\'s pre-match forecast and a ✓/✗ for whether it called the outcome.</p>'));
      return;
    }
    var withCall = R.filter(function (m) { return m.called != null; });
    var nCalled = withCall.filter(function (m) { return m.called; }).length;
    var p = ce("div", "panel");
    var html = withCall.length
      ? '<p class="faint" style="margin:0 0 10px">Model called <strong>' + nCalled + "/" + withCall.length + "</strong> outcomes correctly (most-likely W/D/L vs the actual result).</p>"
      : "";
    // group by matchday (date); R is already newest-first so groups come out newest-first too.
    var order = [], byDate = {};
    R.forEach(function (m) { var d = m.date || "—"; if (!byDate[d]) { byDate[d] = []; order.push(d); } byDate[d].push(m); });
    order.forEach(function (d) {
      html += '<div class="md-date faint">' + esc(d) + "</div>";
      byDate[d].forEach(function (m) {
        var call = m.called == null ? '<span class="chip faint">no pre-match line</span>'
          : (m.called ? '<span class="chip pos">✓ called</span>' : '<span class="chip neg">✗ missed</span>');
        var pre = m.wdl ? '<span class="faint" style="font-size:11.5px">pre-match ' + esc(m.fav) + " " + Math.round((m.fav_p || 0) * 100) + "%</span>" : "";
        html += '<div class="res-row">' +
          '<span class="res-match">' + flagImg(m.home, "sm") + " " + esc(m.home) +
          ' <strong>' + esc(m.score) + "</strong> " + esc(m.away) + " " + flagImg(m.away, "sm") + "</span>" +
          '<span class="res-call">' + pre + " " + call + "</span></div>";
      });
    });
    p.innerHTML = html;
    wrap.appendChild(p);
  }

  function historySection(wrap) {
    var h = D.history || {}; var series = h.series || [], tracked = h.tracked || [];
    var head = ce("div", "sec-head"); head.id = "m-history";
    head.innerHTML = "<h2 class='sec-h2'>Prediction time-machine</h2><span class=\"note\">how the forecast has moved from the pre-tournament baseline through each matchday</span>";
    wrap.appendChild(head);
    if (series.length <= 1) {
      wrap.appendChild(ce("div", "panel", '<p class="faint">Only the pre-tournament baseline exists so far. As matchdays are played, <code>make update</code> freezes one immutable snapshot per day and this chart becomes the "stock ticker" of the tournament — each team\'s title odds over time, biggest movers, and any past day side-by-side with reality.</p>'));
    }
    // title-odds-over-time (top 8 tracked teams).
    var show = tracked.slice(0, 8);
    var dates = series.map(function (s) { return s.label === "baseline" ? "pre-tournament" : (s.date === "now" ? "now" : s.date); });
    var p = ce("div", "panel"); var cn = ce("div", "chart tall"); p.innerHTML = '<h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Championship odds over time</h4>'; p.appendChild(cn); wrap.appendChild(p);
    // U2.3: Wong palette + a 2nd channel (cycling solid/dashed/dotted line style + distinct markers).
    var dashes = ["solid", "dashed", "dotted"], marks = ["circle", "triangle", "rect", "diamond"];
    mkChart(cn, Object.assign(axisTheme(), {
      color: CB_PALETTE(),
      legend: { data: show, textStyle: { color: cssVar("--muted") }, top: 0, type: "scroll" },
      grid: { left: 8, right: 16, top: 30, bottom: 6, containLabel: true },
      tooltip: { trigger: "axis", valueFormatter: function (v) { return (v * 100).toFixed(1) + "%"; }, backgroundColor: cssVar("--panel"), borderColor: cssVar("--line"), textStyle: { color: cssVar("--text") } },
      xAxis: Object.assign({ type: "category", data: dates, boundaryGap: false }, axisStyle()),
      yAxis: Object.assign({ type: "value", axisLabel: { formatter: function (v) { return (v * 100).toFixed(0) + "%"; } } }, axisStyle()),
      series: show.map(function (t, i) { return { name: t, type: "line", symbol: marks[i % marks.length], symbolSize: 7, lineStyle: { type: dashes[i % dashes.length] }, data: series.map(function (s) { return (s.champion || {})[t]; }) }; }),
    }));
    // biggest movers (now vs baseline).
    var base = series[0], now = series[series.length - 1];
    if (base && now && base !== now) {
      var movers = tracked.map(function (t) { return { team: t, d: ((now.champion || {})[t] || 0) - ((base.champion || {})[t] || 0) }; }).filter(function (r) { return Math.abs(r.d) > 1e-4; });
      movers.sort(function (a, b) { return Math.abs(b.d) - Math.abs(a.d); });
      if (movers.length) {
        var mp = ce("div", "panel"); mp.innerHTML = '<h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Biggest movers vs pre-tournament</h4>' +
          movers.slice(0, 8).map(function (r) { return '<div class="gb-row">' + teamCell(r.team) + '<span class="v"><span class="chip ' + (r.d >= 0 ? "pos" : "neg") + '">' + (r.d >= 0 ? "+" : "") + (r.d * 100).toFixed(1) + "pp</span></span></div>"; }).join("");
        wrap.appendChild(mp);
      }
      // A3: day-over-day movers (since the LAST update) — diff the last two series points, and
      // annotate each with the most recent result involving that team that likely drove the swing.
      var prev = series[series.length - 2];
      if (prev && now && prev !== now) {
        var dmovers = tracked.map(function (t) { return { team: t, d: ((now.champion || {})[t] || 0) - ((prev.champion || {})[t] || 0) }; }).filter(function (r) { return Math.abs(r.d) > 1e-4; });
        dmovers.sort(function (a, b) { return Math.abs(b.d) - Math.abs(a.d); });
        if (dmovers.length) {
          var dp = ce("div", "panel"); dp.innerHTML = '<h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Movers since last update</h4>' +
            dmovers.slice(0, 8).map(function (r) {
              var ann = lastResultFor(r.team);
              return '<div class="gb-row">' + teamCell(r.team) + '<span class="v"><span class="chip ' + (r.d >= 0 ? "pos" : "neg") + '">' + (r.d >= 0 ? "+" : "") + (r.d * 100).toFixed(1) + "pp</span>" + (ann ? ' <span class="faint" style="font-size:11px">' + ann + "</span>" : "") + "</span></div>";
            }).join("");
          wrap.appendChild(dp);
        }
      }
    }
    // snapshot browser.
    var snaps = h.snapshots || [];
    if (snaps.length) {
      var sp = ce("div", "panel"); sp.innerHTML = '<h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Snapshots</h4>' +
        snaps.slice().reverse().map(function (s) { return '<div class="gb-row"><span class="who">' + esc(s.date) + (s.canonical ? ' <span class="chip pos">baseline</span>' : "") + '</span><span class="v faint">' + (s.n_pinned ? s.n_pinned + " matches · " + esc(s.through_stage) : "pre-tournament") + " · " + esc(String(s.git_sha)) + "</span></div>"; }).join("");
      wrap.appendChild(sp);
    }
  }

  // ---- router ----------------------------------------------------------------------------------
  var ROUTES = { home: renderHome, tournament: renderTournament, model: renderModel, about: renderAbout };
  function route() {
    // A1: mid-tournament, an empty hash lands on Live (the "what just happened" view); a user who
    // navigates to Home explicitly still gets Home. Pre-tournament the default stays Home.
    if (!location.hash && midTournament()) { location.hash = "#/tournament/live"; return; }
    var parts = (location.hash.replace(/^#\/?/, "") || "home").split("/");
    var name = parts[0];
    disposeCharts();
    var app = $("#app"); app.innerHTML = ""; var view = ce("div", "view active"); app.appendChild(view);
    var banner = liveBanner(); if (banner) view.appendChild(banner);  // A4: site-wide freshness banner
    var navKey;
    if (name === "matches") { renderMatches(view, parts[1]); navKey = "matches"; }
    else if (name === "match") { renderMatchDetail(view, parts[1]); navKey = "matches"; }
    else if (name === "team") { renderTeam(view, parts.slice(1).join("/")); navKey = "tournament"; }
    else if (name === "group") { renderGroup(view, parts[1]); navKey = "tournament"; }
    else if (name === "tournament") { renderTournament(view, parts[1]); navKey = "tournament"; }
    else if (name === "history") {  // U1.3: folded into Model; keep the deep-link working
      renderModel(view); navKey = "model";
      requestAnimationFrame(function () { var el = document.getElementById("m-history"); if (el) el.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "start" }); });
    }
    else { if (!ROUTES[name]) name = "home"; ROUTES[name](view); navKey = name; }
    document.querySelectorAll("nav.tabs a").forEach(function (a) { a.classList.toggle("active", a.dataset.route === navKey); });
    window.scrollTo(0, 0);
    document.title = "World Cup Sim 2026" + (navKey === "home" ? "" : " · " + navKey[0].toUpperCase() + navKey.slice(1));
  }
  window.addEventListener("hashchange", route);

  // theme
  function applyTheme(t) { document.documentElement.setAttribute("data-theme", t); try { localStorage.setItem("wcsim-theme", t); } catch (e) {} $("#themeToggle").textContent = t === "light" ? "🌙" : "☀️"; }
  window.addEventListener("DOMContentLoaded", function () {
    var saved; try { saved = localStorage.getItem("wcsim-theme"); } catch (e) {}
    applyTheme(saved || "dark");
    $("#themeToggle").onclick = function () { var cur = document.documentElement.getAttribute("data-theme"); applyTheme(cur === "light" ? "dark" : "light"); route(); };
    route();
  });
  // re-fit charts on resize
  var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { charts.forEach(function (c) { try { c.resize(); } catch (e) {} }); }, 150); });
})();
