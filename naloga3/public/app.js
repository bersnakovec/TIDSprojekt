// RiftVault – Naloga 3 frontend.
// On every page load the data is requested from our API, which checks SURS
// for a newer PC-Axis file; filters re-query the API and redraw the charts.

const $ = (sel) => document.querySelector(sel);
const nf = (d = 1) => new Intl.NumberFormat('sl-SI', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmt = (v, d = 1) => (v == null ? '–' : nf(d).format(v));
const signed = (v, d = 1) => (v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + nf(d).format(Math.abs(v)));
const eur = new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' });
const monthName = (m) => new Intl.DateTimeFormat('sl-SI', { month: 'short' }).format(new Date(2000, m - 1, 1)).replace('.', '');
const periodLabel = (p) => {
  const [y, m] = p.split('-');
  return m ? `${monthName(Number(m))} ${y}` : y;
};
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const color = (slot) => css(`--series-${slot}`);

const ui = {
  meta: null,
  data: null,
  calc: null,
  charts: {},
  q: { cats: [], from: 2015, to: 0, base: 2015, freq: 'month' },
};

async function api(path) {
  const res = await fetch(path);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

// ---------- URL state (filters are shareable) ----------

function readUrl() {
  const p = new URLSearchParams(location.search);
  const { meta, q } = ui;
  const known = new Set(meta.categories.map((c) => c.code));
  const cats = (p.get('cats') || '').split(',').filter((c) => known.has(c));
  q.cats = cats.length ? cats : meta.defaultCategories;
  q.from = Number(p.get('from')) || 2015;
  q.to = Number(p.get('to')) || meta.lastYear;
  q.base = Number(p.get('base')) || 2015;
  q.freq = p.get('freq') === 'year' ? 'year' : 'month';
}

function writeUrl() {
  const { q } = ui;
  const p = new URLSearchParams({ cats: q.cats.join(','), from: q.from, to: q.to, base: q.base, freq: q.freq });
  history.replaceState(null, '', `?${p}`);
}

// ---------- Controls ----------

function buildControls() {
  const { meta, q } = ui;

  const cats = $('#cats');
  cats.replaceChildren(...meta.categories.map((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.code = c.code;
    b.style.setProperty('--c', `var(--series-${c.slot})`);
    b.title = `${c.label} – ${c.note}`;
    b.innerHTML = `<span class="sw" aria-hidden="true"></span>${c.short}`;
    b.addEventListener('click', () => {
      const on = q.cats.includes(c.code);
      if (on && q.cats.length === 1) return; // keep at least one
      q.cats = on ? q.cats.filter((x) => x !== c.code) : [...q.cats, c.code];
      // keep the fixed category order (= colour order)
      q.cats = meta.categories.map((x) => x.code).filter((x) => q.cats.includes(x));
      load();
    });
    return b;
  }));

  const years = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const fill = (sel, list) => sel.replaceChildren(...list.map((y) => new Option(y, y)));
  fill($('#from'), years(meta.firstYear, meta.lastYear));
  fill($('#to'), years(meta.firstYear, meta.lastYear));
  fill($('#base'), years(meta.firstYear, meta.lastCompleteYear));

  $('#from').addEventListener('change', (e) => { q.from = Number(e.target.value); if (q.to < q.from) q.to = q.from; load(); });
  $('#to').addEventListener('change', (e) => { q.to = Number(e.target.value); if (q.from > q.to) q.from = q.to; load(); });
  $('#base').addEventListener('change', (e) => { q.base = Number(e.target.value); load(); });
  document.querySelectorAll('.segmented button').forEach((b) =>
    b.addEventListener('click', () => { q.freq = b.dataset.freq; load(); }));
}

function syncControls() {
  const { q } = ui;
  document.querySelectorAll('#cats .chip').forEach((b) => b.setAttribute('aria-pressed', q.cats.includes(b.dataset.code)));
  $('#from').value = q.from;
  $('#to').value = q.to;
  $('#base').value = q.base;
  document.querySelectorAll('.segmented button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.freq === q.freq));
}

// ---------- Rendering ----------

function renderStatus() {
  const f = ui.meta.fetch;
  const what = {
    downloaded: 'prenesena nova različica datoteke .px',
    'not-modified': 'datoteka na SURS je nespremenjena (HTTP 304)',
    stale: `SURS ni dosegljiv, prikazana je shranjena kopija (${f.error})`,
  }[f.status] || 'naloženo';
  const checked = f.checkedAt ? new Date(f.checkedAt).toLocaleString('sl-SI') : '–';
  const el = $('#status');
  el.classList.toggle('error', f.status === 'stale');
  el.textContent = `SURS preverjen ${checked}: ${what}. Zadnji podatek: ${periodLabel(ui.meta.lastPeriod)}.`;
}

function renderAbout() {
  const m = ui.meta;
  const rows = [
    ['Tabela', `${m.tableId} – ${m.title}`],
    ['Vir', m.source],
    ['Obdobje', `${periodLabel(m.firstPeriod)} – ${periodLabel(m.lastPeriod)}`],
    ['Posodobljeno', m.pxLastUpdated],
    ['Naslednja objava', m.pxNextUpdate],
    ['Datoteka prenesena', m.fetch.downloadedAt ? new Date(m.fetch.downloadedAt).toLocaleString('sl-SI') : '–'],
    ['Datoteka', `<a href="${m.pxUrl}">${m.tableId}.px</a> (PC-Axis) · <a href="${m.tablePage}" target="_blank" rel="noopener">SiStat</a>`],
  ];
  $('#about').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  $('#src-link').href = m.tablePage;
}

function renderKpis() {
  const { data } = ui;
  $('#kpis').replaceChildren(...data.series.filter((s) => s.summary).map((s) => {
    const sm = s.summary;
    const el = document.createElement('article');
    el.className = 'kpi';
    el.style.setProperty('--c', `var(--series-${s.slot})`);
    const cls = sm.changePct > 0 ? 'delta-up' : sm.changePct < 0 ? 'delta-down' : '';
    const vs = sm.vsTotalPp != null
      ? `<br>${signed(sm.vsTotalPp)} o. t. glede na splošno inflacijo`
      : '';
    el.innerHTML = `
      <div class="kpi-name"><span class="sw"></span>${s.short}</div>
      <div class="kpi-value ${cls}">${signed(sm.changePct)} %</div>
      <div class="kpi-detail">
        sprememba cen ${periodLabel(sm.from)} – ${periodLabel(sm.to)}<br>
        povprečno letno <b>${signed(sm.avgAnnualPct)} %</b> · zadnja medletna <b>${signed(sm.latestYoy)} %</b>${vs}
      </div>`;
    el.title = `${s.label}\nDelež v košarici: ${s.weight < 0.1 ? '< 0,1' : fmt(s.weight)} %`;
    return el;
  }));
}

function legendHtml(series, bars = false) {
  return series.map((s) => `<span style="--c:${color(s.slot)}"><i></i>${s.short}</span>`).join('');
}

// Chart.js plugin: dashed reference line at index 100 (base year).
const baseLine = {
  id: 'baseLine',
  beforeDatasetsDraw(chart, args, opts) {
    const y = chart.scales.y?.getPixelForValue(opts.value);
    if (y == null || y < chart.chartArea.top || y > chart.chartArea.bottom) return;
    const { ctx, chartArea: a } = chart;
    ctx.save();
    ctx.strokeStyle = css('--axis');
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(a.left, y); ctx.lineTo(a.right, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = css('--muted');
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(opts.label, a.right - 4, y + 14);
    ctx.restore();
  },
};

// Chart.js plugin: direct labels at the end of each line (only when few series fit).
const endLabels = {
  id: 'endLabels',
  afterDatasetsDraw(chart, args, opts) {
    if (!opts.enabled) return;
    const { ctx } = chart;
    const placed = [];
    ctx.save();
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = css('--text-2');
    ctx.textBaseline = 'middle';
    chart.data.datasets.forEach((ds, i) => {
      const meta = chart.getDatasetMeta(i);
      const pt = [...meta.data].reverse().find((p, j) => ds.data[ds.data.length - 1 - j] != null);
      if (!pt) return;
      let y = pt.y;
      for (const py of placed.sort((a, b) => a - b)) if (Math.abs(py - y) < 14) y = py + 14;
      placed.push(y);
      ctx.fillText(ds.label, pt.x + 8, y);
    });
    ctx.restore();
  },
};

function commonOptions() {
  const grid = css('--grid');
  const muted = css('--muted');
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: ui.noAnimation ? false : { duration: 250 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: css('--surface'),
        titleColor: css('--text'),
        bodyColor: css('--text-2'),
        borderColor: css('--axis'),
        borderWidth: 1,
        padding: 10,
        boxPadding: 4,
        usePointStyle: true,
      },
    },
    scales: {
      x: { grid: { display: false }, border: { color: css('--axis') }, ticks: { color: muted, maxRotation: 0 } },
      y: { grid: { color: grid }, border: { display: false }, ticks: { color: muted } },
    },
  };
}

function renderIndexChart() {
  const { data, q } = ui;
  const series = data.series;
  const labels = [...new Set(series.flatMap((s) => s.points.map((p) => p.period)))].sort();
  const years = new Set(labels.map((l) => l.slice(0, 4))).size;
  const step = Math.max(1, Math.ceil(years / 12));
  const wide = $('#chart-index').parentElement.clientWidth > 640;
  const direct = wide && series.length <= 4;

  const opts = commonOptions();
  opts.layout = { padding: { right: direct ? 150 : 8 } };
  opts.plugins.baseLine = { value: 100, label: `${q.base} = 100` };
  opts.plugins.endLabels = { enabled: direct };
  opts.plugins.tooltip.callbacks = {
    title: (items) => periodLabel(items[0].label) + (q.freq === 'year' && items[0].raw?.partial ? ' (nepopolno)' : ''),
    label: (item) => {
      const p = series[item.datasetIndex].points[item.dataIndex] ?? {};
      return ` ${item.dataset.label}: ${fmt(item.parsed.y, 2)}  (medletno ${signed(p.yoy)} %)`;
    },
  };
  opts.scales.x.ticks.autoSkip = q.freq === 'year';
  opts.scales.x.ticks.callback = function (v) {
    const l = this.getLabelForValue(v);
    if (q.freq === 'year') return l;
    const [y, m] = l.split('-');
    return m === '01' && Number(y) % step === 0 ? y : null;
  };
  opts.scales.y.ticks.callback = (v) => fmt(v, 0);

  const datasets = series.map((s) => {
    const byPeriod = new Map(s.points.map((p) => [p.period, p]));
    return {
      label: s.short,
      data: labels.map((l) => byPeriod.get(l)?.index ?? null),
      borderColor: color(s.slot),
      backgroundColor: color(s.slot),
      borderWidth: s.focus ? 2.5 : 2,
      pointRadius: q.freq === 'year' ? 3 : 0,
      pointHoverRadius: 5,
      pointHoverBorderWidth: 2,
      pointHoverBorderColor: css('--surface'),
      tension: 0.15,
      spanGaps: false,
    };
  });

  ui.charts.index?.destroy();
  ui.charts.index = new Chart($('#chart-index'), {
    type: 'line',
    data: { labels, datasets },
    options: opts,
    plugins: [baseLine, endLabels],
  });
  $('#legend-index').innerHTML = legendHtml(series);
  $('#index-sub').textContent = `${q.base} = 100 · ${q.freq === 'year' ? 'letna povprečja' : 'mesečno'}`;
}

function renderYoyChart() {
  const { data } = ui;
  const series = data.series;
  const years = [...new Set(series.flatMap((s) => s.yearly.filter((y) => y.yoy != null).map((y) => y.period)))].sort();
  const partial = new Set(series.flatMap((s) => s.yearly.filter((y) => y.partial).map((y) => y.period)));

  const opts = commonOptions();
  opts.plugins.tooltip.callbacks = {
    title: (items) => {
      const y = items[0].label.replace('*', '');
      const p = series[0].yearly.find((x) => x.period === y);
      return partial.has(y) ? `${y} (jan–${monthName(p.months)}, primerjava z istimi meseci ${y - 1})` : y;
    },
    label: (item) => ` ${item.dataset.label}: ${signed(item.parsed.y)} %`,
  };
  opts.scales.y.ticks.callback = (v) => `${fmt(v, 0)} %`;
  opts.scales.y.grid.color = (ctx) => (ctx.tick.value === 0 ? css('--axis') : css('--grid'));

  const datasets = series.map((s) => {
    const byYear = new Map(s.yearly.map((y) => [y.period, y.yoy]));
    return {
      label: s.short,
      data: years.map((y) => byYear.get(y) ?? null),
      backgroundColor: color(s.slot),
      borderRadius: 4,
      borderSkipped: 'start',
      categoryPercentage: 0.8,
      barPercentage: 0.92,
      maxBarThickness: 28,
    };
  });

  ui.charts.yoy?.destroy();
  ui.charts.yoy = new Chart($('#chart-yoy'), {
    type: 'bar',
    data: { labels: years.map((y) => (partial.has(y) ? `${y}*` : y)), datasets },
    options: opts,
  });
  const legend = $('#legend-yoy');
  legend.classList.add('bars');
  legend.innerHTML = legendHtml(series, true);
}

function renderTable() {
  const { data, q } = ui;
  const series = data.series;
  const years = [...new Set(series.flatMap((s) => s.yearly.map((y) => y.period)))].sort();
  const head = `<thead><tr><th>Leto</th>${series.map((s) => `<th colspan="2">${s.short}</th>`).join('')}</tr>
    <tr><th></th>${series.map(() => `<th>indeks (${q.base}=100)</th><th>inflacija %</th>`).join('')}</tr></thead>`;
  const body = years.map((y) => {
    const cells = series.map((s) => {
      const r = s.yearly.find((x) => x.period === y);
      return `<td>${fmt(r?.index, 2)}</td><td>${signed(r?.yoy)}</td>`;
    }).join('');
    const partial = series.some((s) => s.yearly.find((x) => x.period === y)?.partial);
    return `<tr><td>${y}${partial ? '*' : ''}</td>${cells}</tr>`;
  }).join('');
  $('#table').innerHTML = head + `<tbody>${body}</tbody>`;
}

function renderWarnings() {
  const el = $('#warnings');
  el.hidden = !ui.data.warnings.length;
  el.textContent = ui.data.warnings.join(' ');
}

// ---------- Calculator ----------

async function loadCalculator() {
  const m = ui.meta;
  ui.calc = await api(`/api/cpi?cats=09212,0921,TOT&from=${m.firstYear}&to=${m.lastYear}&base=${m.lastCompleteYear}&freq=year`);
  const years = ui.calc.series[0].yearly.filter((y) => !y.partial).map((y) => y.period);
  const sel = $('#calc-year');
  sel.replaceChildren(...years.map((y) => new Option(y, y)));
  sel.value = years.includes('2020') ? '2020' : years[0];
  sel.addEventListener('change', renderCalculator);
  $('#calc-price').addEventListener('input', renderCalculator);
  renderCalculator();
}

function renderCalculator() {
  if (!ui.calc) return;
  const price = Number($('#calc-price').value);
  const year = $('#calc-year').value;
  const out = $('#calc-out');
  if (!(price >= 0)) { out.textContent = ''; return; }
  out.innerHTML = ui.calc.series.map((s) => {
    const then = s.yearly.find((y) => y.period === year)?.index;
    const now = s.summary?.lastIndex;
    const value = then && now ? price * (now / then) : null;
    return `<div class="calc-line" style="--c:var(--series-${s.slot})">
      <span><span class="sw"></span>po indeksu »${s.short}«</span>
      <strong>${value == null ? '–' : eur.format(value)}</strong></div>`;
  }).join('') + `<p class="hint">Cena ${eur.format(price)} iz leta ${year} preračunana na ${periodLabel(ui.meta.lastPeriod)}.</p>`;
}

// ---------- Main ----------

async function load() {
  writeUrl();
  syncControls();
  const { q } = ui;
  try {
    ui.data = await api(`/api/cpi?cats=${q.cats.join(',')}&from=${q.from}&to=${q.to}&base=${q.base}&freq=${q.freq}`);
    renderAll();
  } catch (err) {
    $('#status').classList.add('error');
    $('#status').textContent = `Napaka: ${err.message}`;
  }
}

function renderAll() {
  if (!ui.data) return;
  renderWarnings();
  renderKpis();
  renderIndexChart();
  renderYoyChart();
  renderTable();
}

async function init() {
  try {
    ui.meta = await api('/api/meta');
  } catch (err) {
    $('#status').classList.add('error');
    $('#status').textContent = `Podatkov ni bilo mogoče naložiti: ${err.message}`;
    return;
  }
  renderStatus();
  renderAbout();
  buildControls();
  readUrl();
  await Promise.all([load(), loadCalculator().catch((e) => console.error(e))]);

  // Redraw with the right palette when the OS theme changes, and on resize (direct labels).
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderAll);
  let t;
  let lastWidth = innerWidth;
  addEventListener('resize', () => {
    if (innerWidth === lastWidth) return;
    lastWidth = innerWidth;
    clearTimeout(t);
    t = setTimeout(() => { ui.noAnimation = true; renderAll(); ui.noAnimation = false; }, 200);
  });
}

init();
