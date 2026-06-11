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
  function flagURL(team, w) {
    var code = (D.flags || {})[team] || (D.flags || {})[(team || "").replace(/\s*(Women's|U-?\d+).*$/, "").trim()];
    return code ? (D.flag_base + "/w" + (w || 40) + "/" + code + ".png") : null;
  }
  function flagImg(team, cls) { var u = flagURL(team); return u ? '<img class="flag ' + (cls || "") + '" src="' + u + '" alt="">' : '<span class="flag ' + (cls || "") + '" style="background:var(--line)"></span>'; }
  function odds(t) { return (D.odds || {})[t] || {}; }
  function disposeCharts() { charts.forEach(function (c) { try { c.dispose(); } catch (e) {} }); charts = []; }
  function mkChart(node, option) {
    var c = window.echarts.init(node, null, { renderer: "canvas" });
    c.setOption(option); charts.push(c);
    return c;
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
  function countUp(node, target, suffix, dec) {
    if (REDUCED) { node.textContent = target.toFixed(dec || 0) + (suffix || ""); return; }
    var t0 = null, dur = 900;
    function step(t) { if (!t0) t0 = t; var k = Math.min(1, (t - t0) / dur);
      node.textContent = (target * (1 - Math.pow(1 - k, 3))).toFixed(dec || 0) + (suffix || "");
      if (k < 1) requestAnimationFrame(step); }
    requestAnimationFrame(step);
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
      'single match, event by event.</p></div>';
    root.appendChild(hero);

    var wrap = ce("div", "wrap");
    var kpis = ce("div", "kpis");
    function kpi(lbl, valHTML, sub, cls) {
      var k = ce("div", "kpi " + (cls || "")); k.innerHTML = '<div class="lbl">' + lbl + '</div><div class="val">' + valHTML + '</div><div class="sub">' + (sub || "") + '</div>'; return k;
    }
    if (fav) kpis.appendChild(kpi("Title favourite", '<span class="flagrow">' + flagImg(fav) + esc(fav) + "</span>", pct(o.champion) + " to win"));
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
  }

  // ---- TOURNAMENT ------------------------------------------------------------------------------
  function teamCell(t) { return '<a class="team-cell" href="#/team/' + encodeURIComponent(t) + '">' + flagImg(t, "sm") + esc(t) + "</a>"; }

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
    var tbl = ce("table", "tbl sticky"); p.appendChild(tbl); wrap.appendChild(p);
    function draw(filter) {
      var data = rows.slice().sort(function (a, b) { var x = a[st.key], y = b[st.key]; if (typeof x === "string") return st.dir * String(x).localeCompare(String(y)); return st.dir * ((x || 0) - (y || 0)); });
      if (filter) data = data.filter(function (r) { return r.team.toLowerCase().indexOf(filter) >= 0; });
      var thead = "<thead><tr>" + cols.map(function (c) { return '<th data-k="' + c[0] + '" class="' + (c[0] === st.key ? (st.dir < 0 ? "sorted" : "asc") : "") + '">' + c[1] + "</th>"; }).join("") + "</tr></thead>";
      var body = "<tbody>" + data.map(function (r) {
        var dl = r.draw_luck || 0;
        return "<tr>" + cols.map(function (c) {
          var k = c[0], v = r[k];
          if (k === "team") return "<td>" + teamCell(r.team) + "</td>";
          if (k === "expected_finish") return '<td style="text-align:left;color:var(--muted)">' + esc(v || "") + "</td>";
          if (k === "draw_luck") return "<td><span class='chip " + (dl >= 0 ? "pos" : "neg") + "'>" + (dl >= 0 ? "+" : "") + (dl * 100).toFixed(1) + "pp</span></td>";
          if (k === "champion") return '<td><span class="barcell" style="width:' + (v / maxC * 46) + 'px"></span> ' + pct(v) + "</td>";
          return "<td>" + pct(v) + "</td>";
        }).join("") + "</tr>";
      }).join("") + "</tbody>";
      tbl.innerHTML = thead + body;
      tbl.querySelectorAll("th").forEach(function (th) { th.onclick = function () { var k = th.dataset.k; st.dir = (st.key === k) ? -st.dir : (k === "team" ? 1 : -1); st.key = k; draw($(".search", head).value.toLowerCase()); }; });
    }
    draw("");
    $(".search", head).oninput = function () { draw(this.value.toLowerCase()); };
  }

  function bracketView(wrap) {
    var br = D.bracket; if (!br || !br.rounds) return;
    var head = ce("div", "sec-head"); head.id = "bracket";
    head.innerHTML = '<h2>Predicted bracket</h2><span class="note">official R32 slot map · most-likely path · hover a team to trace it</span>';
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
        g.append("rect").attr("width", s.w).attr("height", 22).attr("rx", 5)
          .attr("fill", ri === R - 1 ? cssVar("--panel-2") : cssVar("--panel"))
          .attr("stroke", s.cell.team === champTeam && s.cell.team ? cssVar("--champ") : cssVar("--line")).attr("data-team", s.cell.team || "");
        if (s.cell.team) {
          var fu = flagURL(s.cell.team, 20);
          if (fu) g.append("image").attr("href", fu).attr("x", 6).attr("y", 5).attr("width", 16).attr("height", 11);
          g.append("text").attr("x", 26).attr("y", 15).attr("fill", cssVar("--text")).attr("font-size", 11).attr("font-weight", 600).text(s.cell.team);
          g.append("title").text(s.cell.team + " — " + (s.cell.champion * 100).toFixed(1) + "% title odds");
          g.on("mouseenter", function () { svg.selectAll("rect[data-team]").attr("opacity", function () { return d3.select(this).attr("data-team") === s.cell.team ? 1 : .28; }); })
            .on("mouseleave", function () { svg.selectAll("rect[data-team]").attr("opacity", 1); });
        } else {
          g.append("text").attr("x", 10).attr("y", 15).attr("fill", cssVar("--faint")).attr("font-size", 10.5).attr("font-style", "italic").text(s.cell.label);
        }
      });
    });
  }

  function groupsView(wrap) {
    var groups = D.groups; if (!groups || !Object.keys(groups).length) return;
    var head = ce("div", "sec-head"); head.id = "groups"; head.innerHTML = '<h2>Group stage</h2><span class="note">qualification probability · top 2 advance</span>';
    wrap.appendChild(head);
    var g = ce("div", "groups");
    Object.keys(groups).sort().forEach(function (gn) {
      var teams = groups[gn].slice().sort(function (a, b) { return (odds(b).advance || 0) - (odds(a).advance || 0); });
      var card = ce("div", "panel group"); var h = "<h4>Group " + gn + "</h4>";
      h += teams.map(function (t, i) { var a = odds(t).advance || 0; return '<div class="grow ' + (i < 2 ? "q" : "") + '">' + flagImg(t, "sm") + '<span class="nm">' + esc(t) + '</span><span class="qbar"><i style="width:' + (a * 100) + '%"></i></span><span class="av">' + (a * 100).toFixed(0) + "%</span></div>"; }).join("");
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
    var colors = [cssVar("--group"), "#37474f", cssVar("--r16"), cssVar("--qf"), cssVar("--sf"), cssVar("--final"), cssVar("--champ")];
    mkChart(cn, Object.assign(axisTheme(), {
      legend: { data: stages, textStyle: { color: cssVar("--muted") }, top: 0 },
      grid: { left: 8, right: 16, top: 34, bottom: 6, containLabel: true },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: function (v) { return (v * 100).toFixed(1) + "%"; }, backgroundColor: cssVar("--panel"), borderColor: cssVar("--line"), textStyle: { color: cssVar("--text") } },
      xAxis: Object.assign({ type: "value", max: 1, axisLabel: { formatter: function (v) { return (v * 100).toFixed(0) + "%"; } } }, axisStyle()),
      yAxis: Object.assign({ type: "category", data: teams }, axisStyle()),
      series: stages.map(function (s, i) { return { name: s, type: "bar", stack: "x", data: teams.map(function (t) { return (rd[t] || {})[s] || 0; }), itemStyle: { color: colors[i] } }; }),
    }));
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
    var head = ce("div", "sec-head"); head.id = "gboot"; head.innerHTML = '<h2>Golden Boot race</h2><span class="note">ranked by projected goals · P(top scorer)</span>';
    wrap.appendChild(head);
    var hs = D.headshots || {};
    var podium = ce("div", "gb-podium");
    gb.slice(0, 3).forEach(function (p2, i) {
      var c = ce("div", "gb-card " + (i === 0 ? "first" : ""));
      c.innerHTML = '<img class="hs" src="' + (hs[p2.player] || "") + '" alt=""><div class="pn">' + esc(p2.player) + '</div><div class="tn faint" style="font-size:12px;display:flex;align-items:center;gap:6px;justify-content:center;margin-top:3px">' + flagImg(p2.team, "sm") + esc(p2.team) + '</div><div class="xg">' + p2.exp_goals.toFixed(1) + ' proj. goals</div><div class="faint" style="font-size:12px">' + (p2.p_top * 100).toFixed(1) + "% top scorer</div>";
      podium.appendChild(c);
    });
    wrap.appendChild(podium);
    var p = ce("div", "panel");
    p.innerHTML = gb.map(function (g, i) {
      return '<div class="gb-row"><span class="r">' + (i + 1) + '</span><img class="hs" src="' + (hs[g.player] || "") + '" alt=""><span class="who"><span class="pn">' + esc(g.player) + '</span><span class="tn">' + flagImg(g.team, "sm") + esc(g.team) + '</span></span><span class="v">' + g.exp_goals.toFixed(1) + " proj. goals · " + (g.p_top * 100).toFixed(1) + "%</span></div>";
    }).join("");
    wrap.appendChild(p);
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
    var tbl = ce("table", "tbl sticky"); tp.appendChild(tbl); wrap.appendChild(tp);
    function draw() {
      var data = rs.slice().sort(function (a, b) { var x = a[st.key], y = b[st.key]; if (typeof x === "string") return st.dir * String(x).localeCompare(String(y)); return st.dir * ((x || 0) - (y || 0)); });
      tbl.innerHTML = "<thead><tr>" + cols.map(function (c) { return '<th data-k="' + c[0] + '" class="' + (c[0] === st.key ? (st.dir < 0 ? "sorted" : "asc") : "") + '">' + c[1] + "</th>"; }).join("") + "</tr></thead><tbody>" +
        data.map(function (r) {
          return "<tr>" + cols.map(function (c) {
            var k = c[0], v = r[k];
            if (k === "team") return "<td>" + teamCell(r.team) + (r.host ? ' <span class="chip pos" title="co-host">host</span>' : "") + "</td>";
            if (k === "elo") return '<td><span class="barcell" style="width:' + (v / maxE * 46) + 'px"></span> ' + v.toFixed(0) + "</td>";
            return "<td>" + (typeof v === "number" ? v.toFixed(2) : esc(v)) + "</td>";
          }).join("") + "</tr>";
        }).join("") + "</tbody>";
      tbl.querySelectorAll("th").forEach(function (th) { th.onclick = function () { var k = th.dataset.k; st.dir = (st.key === k) ? -st.dir : (k === "team" ? 1 : -1); st.key = k; draw(); }; });
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
    // venue heat scale — horizontal bars by WBGT, hot→cool.
    var vs = vnames.map(function (n) { return venues[n]; }).sort(function (a, b) { return b.wbgt - a.wbgt; });
    var vp = ce("div", "panel"); vp.innerHTML = '<h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Venue heat — WBGT (°C) · ▦ = roof / AC</h4>';
    var cn = ce("div", "chart"); vp.appendChild(cn); wrap.appendChild(vp);
    mkChart(cn, Object.assign(axisTheme(), {
      grid: { left: 8, right: 40, top: 6, bottom: 18, containLabel: true },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, backgroundColor: cssVar("--panel"), borderColor: cssVar("--line"), textStyle: { color: cssVar("--text") },
        formatter: function (ps) { var v = vs[ps[0].dataIndex]; return "<b>" + esc(v.city) + "</b> (" + esc(v.nation) + ")<br>WBGT " + v.wbgt + "°C · heat-load " + (v.heat_load * 100).toFixed(0) + "%<br>" + v.temp_c + "°C / " + v.rh_pct + "% RH · alt " + v.altitude_m + "m" + (v.climate_controlled ? "<br>roof / AC" : ""); } },
      xAxis: Object.assign({ type: "value", name: "WBGT °C", nameLocation: "middle", nameGap: 22, nameTextStyle: { color: cssVar("--muted") } }, axisStyle()),
      yAxis: Object.assign({ type: "category", inverse: true, data: vs.map(function (v) { return v.city + (v.climate_controlled ? " ▦" : ""); }) }, axisStyle()),
      visualMap: { show: false, min: 24, max: 33, dimension: 0, inRange: { color: ["#2c7fb8", "#fec44f", "#e34a33"] } },
      series: [{ type: "bar", data: vs.map(function (v) { return v.wbgt; }), barWidth: 13, itemStyle: { borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: "right", color: cssVar("--muted"), formatter: function (p) { return p.value + "°"; } } }],
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
      tbl.innerHTML = "<thead><tr>" + cols.map(function (cc) { return '<th data-k="' + cc[0] + '" class="' + (cc[0] === st.key ? (st.dir < 0 ? "sorted" : "asc") : "") + '">' + cc[1] + "</th>"; }).join("") + "</tr></thead><tbody>" +
        data.map(function (r) {
          return "<tr>" + cols.map(function (cc) {
            var k = cc[0], v = r[k];
            if (k === "team") return "<td>" + teamCell(r.team) + "</td>";
            if (k === "heat_burden") return '<td><span class="barcell hot" style="width:' + (v / maxB * 46) + 'px"></span> ' + (v == null ? "—" : v.toFixed(2)) + "</td>";
            if (v == null) return "<td>—</td>";
            return "<td>" + (k === "travel_km" || k === "max_altitude_m" ? Math.round(v).toLocaleString() : (k === "min_rest_days" ? v : v.toFixed(2))) + "</td>";
          }).join("") + "</tr>";
        }).join("") + "</tbody>";
      tbl.querySelectorAll("th").forEach(function (th) { th.onclick = function () { var k = th.dataset.k; st.dir = (st.key === k) ? -st.dir : (k === "team" ? 1 : -1); st.key = k; draw(); }; });
    }
    draw();
    var note = ce("p", "faint"); note.style.fontSize = "12px"; note.textContent = c.note || ""; wrap.appendChild(note);
  }

  function playerPropsView(wrap) {
    var pp = D.player_props || []; if (!pp.length) return;
    var hs = D.headshots || {};
    var head = ce("div", "sec-head"); head.id = "props";
    head.innerHTML = '<h2>Scorer props</h2><span class="note">single match vs an average opponent · anytime (≥1) &amp; brace (≥2) from each player\'s per-match Poisson rate</span>';
    wrap.appendChild(head);
    var p = ce("div", "panel"); p.style.overflowX = "auto";
    p.innerHTML = '<table class="tbl"><thead><tr><th style="text-align:left">Player</th><th>Age · Ht</th><th>Anytime</th><th>Brace</th><th>Rate (λ)</th><th>Proj. tourn. goals</th></tr></thead><tbody>' +
      pp.map(function (r) {
        var a = r.attrs, who = a ? (a.age != null ? a.age + "y" : "") + (a.height_cm ? " · " + a.height_cm + "cm" : "") : "";
        return '<tr><td style="text-align:left"><span class="who" style="display:flex;align-items:center;gap:8px"><img class="hs sm" src="' + (hs[r.player] || "") + '" alt="" style="width:26px;height:26px;border-radius:50%">' + esc(r.player) + " " + flagImg(r.team, "sm") + (a && a.foot ? ' <span class="faint" style="font-size:11px">' + esc(a.foot) + "</span>" : "") + '</span></td>' +
          '<td class="faint">' + (who || "—") + "</td>" +
          '<td><span class="barcell" style="width:' + (r.anytime * 46) + 'px"></span> ' + (r.anytime * 100).toFixed(0) + "%</td>" +
          "<td>" + (r.multi * 100).toFixed(0) + "%</td><td>" + r.rate.toFixed(2) + "</td><td>" + r.tournament_goals.toFixed(1) + "</td></tr>";
      }).join("") + "</tbody></table>";
    wrap.appendChild(p);
    var note = ce("p", "faint"); note.style.fontSize = "12px";
    var nA = pp.filter(function (r) { return r.attrs; }).length;
    note.textContent = "Age/height/foot from the CC0 Transfermarkt dump (basis tm) where a confident name+nation match exists (" + nA + " of " + pp.length + " shown).";
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
    note.textContent = "Keeper = each nation’s most-capped goalkeeper in the CC0 Transfermarkt squad (basis tm). A full P(win) Golden Glove, a VAEP Golden Ball and a best-young-player race are documented as gated in GATED_ITEMS.md.";
    wrap.appendChild(note);
  }

  function renderTournament(root) {
    var wrap = ce("div", "wrap");
    root.appendChild(wrap); // attach first so ECharts containers have layout (non-zero size)
    titleTable(wrap); ratingsView(wrap); styleView(wrap); conditionsView(wrap); bracketView(wrap);
    groupsView(wrap); distView(wrap); finalsView(wrap); upsetView(wrap); drawLuckView(wrap);
    goldenBootView(wrap); goldenGloveView(wrap); playerPropsView(wrap);
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
    var pw = ce("div", "panel"); pw.innerHTML = '<h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Win / draw / loss probability <span class="faint">· live, by match state</span></h4>'; var cw = ce("div", "chart short"); pw.appendChild(cw); g2.appendChild(pw);
    wrap.appendChild(g2);
    drawShotMap(pitch, m);
    if (m.timeline) winProbChart(cw, m);

    var g3 = ce("div", "grid2");
    var px = ce("div", "panel"); px.innerHTML = '<h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Cumulative xG</h4>'; var cx = ce("div", "chart short"); px.appendChild(cx); g3.appendChild(px);
    var pd = ce("div", "panel"); pd.innerHTML = '<h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Scoreline distribution <span class="faint">· Dixon–Coles · pre-match</span></h4>'; pd.appendChild(scoreDistEl(m.score_dist, n0, n1)); g3.appendChild(pd);
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

  function renderMatches(root, date) {
    var wrap = ce("div", "wrap"); root.appendChild(wrap);
    var sched = D.schedule || [], dates = scheduleDates();
    var head = ce("div", "sec-head"); head.innerHTML = '<h2>Matches</h2><span class="note">real WC2026 group-stage fixtures · model prediction per match · click a match for detail</span>';
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
      var a = ce("a", "matchcard"); a.href = "#/match/" + o.i;
      a.innerHTML =
        '<div class="mc-city">' + esc(f.city || "") + "</div>" +
        '<div class="mc-teams"><span>' + flagImg(f.home, "sm") + " " + esc(f.home) + "</span><span class='faint'>v</span><span>" + esc(f.away) + " " + flagImg(f.away, "sm") + "</span></div>" +
        wdlBar(p) +
        '<div class="mc-fav faint">' + esc(fav) + " " + (favp * 100).toFixed(0) + "% · xG " + f.pred.lambda_home.toFixed(1) + "–" + f.pred.lambda_away.toFixed(1) + "</div>";
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
    var head = ce("div", "sec-head"); head.innerHTML = '<a href="#/matches/' + f.date + '" class="faint" style="font-size:13px">← ' + fmtDate(f.date) + '</a><h2 style="margin-top:4px">Match prediction</h2><span class="note">' + esc(f.city || "") + " · Elo + Dixon–Coles</span>";
    wrap.appendChild(head);
    var card = ce("div", "panel");
    card.innerHTML = '<div class="match-head"><div class="side">' + flagImg(n0) + '<span class="nm">' + esc(n0) + '</span></div><div class="score" style="font-size:20px;text-align:center">' + (p.wdl.home * 100).toFixed(0) + "% · " + (p.wdl.draw * 100).toFixed(0) + "% · " + (p.wdl.away * 100).toFixed(0) + '%<div class="faint" style="font-size:12px;font-weight:500;letter-spacing:0">win · draw · win</div></div><div class="side">' + flagImg(n1) + '<span class="nm">' + esc(n1) + "</span></div></div>";
    card.innerHTML += '<div style="margin-top:6px">' + wdlBar(p.wdl) + "</div>";
    card.innerHTML += '<div class="statrow" style="margin-top:14px"><div class="hv">' + p.lambda_home.toFixed(2) + '</div><div class="bar"><i class="bh" style="width:' + (p.lambda_home / (p.lambda_home + p.lambda_away) * 100) + '%"></i></div><div class="lbl">Expected goals</div><div class="bar"><i class="ba" style="width:' + (p.lambda_away / (p.lambda_home + p.lambda_away) * 100) + '%"></i></div><div class="av">' + p.lambda_away.toFixed(2) + "</div></div>";
    card.innerHTML += '<div class="faint" style="text-align:center;margin-top:8px;font-size:13px">expected total ' + p.expected_total.toFixed(1) + " goals</div>";
    wrap.appendChild(card);
    var pd = ce("div", "panel"); pd.innerHTML = '<h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Scoreline distribution <span class="faint">· Dixon–Coles</span></h4>'; pd.appendChild(scoreDistEl(p, n0, n1)); wrap.appendChild(pd);
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
    var svg = d3.select(holder).append("svg").attr("viewBox", "0 0 " + W + " " + H).attr("width", "100%").attr("class", "pitch");
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
    mat.forEach(function (row, i) { row.forEach(function (v, j) { var c = ce("div", "heatcell"); c.style.background = "color-mix(in srgb, var(--accent) " + (v / mx * 100).toFixed(0) + "%, var(--panel-2))"; c.textContent = i + "-" + j; c.title = n0 + " " + i + "-" + j + " " + n1 + ": " + (v * 100).toFixed(1) + "%"; grid.appendChild(c); }); });
    box.appendChild(grid);
    var w = sd.wdl;
    box.appendChild(ce("div", null, '<div class="legend" style="margin-top:10px"><span><b style="background:var(--home)"></b>' + esc(n0) + " " + (w.home * 100).toFixed(0) + "%</span><span><b style='background:var(--draw)'></b>draw " + (w.draw * 100).toFixed(0) + "%</span><span><b style='background:var(--away)'></b>" + esc(n1) + " " + (w.away * 100).toFixed(0) + "%</span></div>"));
    box.appendChild(ce("div", "toplines", (sd.top_scorelines || []).slice(0, 6).map(function (t) { return '<span class="topline">' + t.home + "–" + t.away + " <b>" + (t.p * 100).toFixed(1) + "%</b></span>"; }).join("")));
    return box;
  }

  function trackRecordView(wrap) {
    var tr = D.track_record || {}; if (!tr.baseline) return;
    var b = tr.baseline;
    var h = ce("div", "sec-head"); h.innerHTML = "<h2 style='font-size:18px'>Track record vs reality</h2><span class='note'>the immutable pre-tournament baseline, graded as results land</span>";
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

  // ---- MODEL -----------------------------------------------------------------------------------
  function renderModel(root) {
    var ev = D.eval || {}, wrap = ce("div", "wrap");
    root.appendChild(wrap);
    var head = ce("div", "sec-head"); head.innerHTML = '<h2>The model</h2><span class="note">two engines · how it scores · the honest limits</span>';
    wrap.appendChild(head);
    trackRecordView(wrap);
    var intro = ce("div", "panel prose");
    intro.innerHTML = "<p><b>Two decoupled engines.</b> A fast <b>Prediction Engine</b> (Elo + Dixon–Coles bivariate Poisson) runs the whole-tournament Monte Carlo in milliseconds per match — that's what every odds, bracket and distribution on this site comes from. A generative <b>Realism Engine</b> (an events-as-language transformer over SPADL tokens) writes a single match event-by-event into a believable box score. They're decoupled on purpose: a transformer match is ~3,400 forward passes, a tournament is billions — so the transformer informs prediction by <i>distillation</i>, never inside the Monte Carlo loop.</p>";
    wrap.appendChild(intro);

    var cards = ce("div", "kpi-cards");
    function card(big, lbl, sub, good) { var c = ce("div", "kpi " + (good ? "good" : "")); c.innerHTML = '<div class="lbl">' + lbl + '</div><div class="val">' + big + '</div><div class="sub">' + sub + "</div>"; return c; }
    if (ev.results_backtest_brier != null) cards.appendChild(card(ev.results_backtest_brier.toFixed(3), "Backtest Brier (199 matches)", "✓ beats " + ev.results_backtest_naive.toFixed(3) + " base rate", ev.results_backtest_brier < ev.results_backtest_naive));
    if (ev.holdout_brier != null) cards.appendChild(card(ev.holdout_brier.toFixed(3), "Held-out Brier (" + ev.holdout_n + " matches)", "vs " + ev.holdout_naive.toFixed(3) + " naive", ev.holdout_brier < ev.holdout_naive));
    if (ev.backtest_brier != null) cards.appendChild(card(ev.backtest_brier.toFixed(3), "Backtest (" + ev.backtest_target + ")", "vs " + ev.backtest_naive.toFixed(3) + " naive", ev.backtest_brier < ev.backtest_naive));
    cards.appendChild(card((D.meta && D.meta.n_sims ? (+D.meta.n_sims).toLocaleString() : "—"), "Monte Carlo runs", "Elo + Dixon–Coles"));
    var ch = ce("div", "sec-head"); ch.innerHTML = "<h2 style='font-size:18px'>Prediction credibility</h2>"; wrap.appendChild(ch);
    var cp = ce("div", "panel"); cp.appendChild(cards); wrap.appendChild(cp);

    var rm = (D.model && D.model.realism_metrics) || [];
    if (rm.length) {
      var rh = ce("div", "sec-head"); rh.innerHTML = "<h2 style='font-size:18px'>Realism — generated vs real</h2><span class='note'>held-out fold · 0.5σ tolerance · KS distribution test</span>"; wrap.appendChild(rh);
      var rp = ce("div", "panel"); rp.style.overflowX = "auto";
      rp.innerHTML = '<table class="tbl metric-tbl"><thead><tr><th>Metric</th><th>Sim</th><th>Real</th><th>Tol (0.5σ)</th><th>KS p</th><th>Pass</th></tr></thead><tbody>' +
        rm.map(function (r) { return "<tr><td>" + esc(r.metric) + "</td><td>" + r.sim + "</td><td>" + r.real + "</td><td>±" + r.tol + "</td><td>" + r.ks_p.toFixed(3) + "</td><td><span class='" + (r.pass ? "ok" : "no") + "'>" + (r.pass ? "✓" : "✕") + "</span></td></tr>"; }).join("") + "</tbody></table>";
      wrap.appendChild(rp);
    }
    var figs = (D.model && D.model.figures) || [];
    if (figs.length) {
      var fh = ce("div", "sec-head"); fh.innerHTML = "<h2 style='font-size:18px'>Calibration & realism diagrams</h2><span class='note'>reliability (predicted vs observed) · generated-vs-real distributions</span>"; wrap.appendChild(fh);
      var fg = ce("div", "grid2");
      figs.forEach(function (f) { var p = ce("div", "panel"); p.innerHTML = '<img src="' + f + '" alt="' + f + '" style="width:100%;border-radius:8px;background:#fff">'; fg.appendChild(p); });
      wrap.appendChild(fg);
    }
    var callout = ce("div", "panel");
    callout.innerHTML = '<div class="callout"><b>Honest limits.</b> The Realism Engine still under-generates goals and match duration on the small open corpus — a documented data/compute ceiling, not faked. The single-match scoreline distribution on this site comes from the calibrated Prediction Engine; the generated match is the believable narrative. See <code>GATED_ITEMS.md</code> in the repo for every gated item, why, and the exact unblock.</div>';
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
      '<h2 style="margin-top:4px;display:flex;align-items:center;gap:10px">' + flagImg(name) + esc(name) + (g ? ' <span class="note">Group ' + g + "</span>" : "") + "</h2>";
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
      var ph = ce("div", "sec-head"); ph.innerHTML = "<h2 style='font-size:18px'>Group-position probability</h2><span class='note'>where it finishes in the group</span>"; wrap.appendChild(ph);
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
      var fh = ce("div", "sec-head"); fh.innerHTML = "<h2 style='font-size:18px'>Group matches</h2><span class='note'>model prediction per fixture · click for detail</span>"; wrap.appendChild(fh);
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
      var oh = ce("div", "sec-head"); oh.innerHTML = "<h2 style='font-size:18px'>Most-likely R32 opponent</h2><span class='note'>first knockout, conditional on qualifying (official slot map)</span>"; wrap.appendChild(oh);
      var op = ce("div", "panel");
      op.innerHTML = opps.map(function (r) { return '<div class="gb-row">' + teamCell(r.team) + '<span class="v">' + (r.p * 100).toFixed(0) + "%</span></div>"; }).join("");
      wrap.appendChild(op);
    }

    // Expected top scorers (from the Golden Boot board).
    var scorers = (D.golden_boot || []).filter(function (p) { return p.team === name; });
    if (scorers.length) {
      var sh = ce("div", "sec-head"); sh.innerHTML = "<h2 style='font-size:18px'>Expected top scorers</h2>"; wrap.appendChild(sh);
      var sp = ce("div", "panel");
      sp.innerHTML = scorers.map(function (p) { return '<div class="gb-row"><span class="who">' + esc(p.player) + '</span><span class="v">' + p.exp_goals.toFixed(1) + " proj. goals · " + (p.p_top * 100).toFixed(1) + "% Golden Boot</span></div>"; }).join("");
      wrap.appendChild(sp);
    }
  }

  // ---- router ----------------------------------------------------------------------------------
  var ROUTES = { home: renderHome, tournament: renderTournament, model: renderModel, about: renderAbout };
  function route() {
    var parts = (location.hash.replace(/^#\/?/, "") || "home").split("/");
    var name = parts[0];
    disposeCharts();
    var app = $("#app"); app.innerHTML = ""; var view = ce("div", "view active"); app.appendChild(view);
    var navKey;
    if (name === "matches") { renderMatches(view, parts[1]); navKey = "matches"; }
    else if (name === "match") { renderMatchDetail(view, parts[1]); navKey = "matches"; }
    else if (name === "team") { renderTeam(view, parts.slice(1).join("/")); navKey = "tournament"; }
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
