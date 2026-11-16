// Turns the parsed PC-Axis table into time series and computes the analysis:
// filtering (categories, period), rebasing to a chosen base year, yearly
// aggregation and inflation rates.

// Measures (MERITVE) used from table 0400608S.
const MEASURE_INDEX = '33';  // Index (month / average of 2025) – full history, kept up to date
const MEASURE_WEIGHT = '0';  // Structure of the consumer basket (%)

// Curated categories relevant to RiftVault. The order is fixed and defines the
// chart colour slot of each category, so a category keeps its colour no
// matter which other categories are selected.
export const CATEGORIES = [
  { code: '09212', short: 'Druge igre in igrače', note: 'vključuje družabne in kartne igre (TCG)', focus: true },
  { code: 'TOT',   short: 'Vse življenjske potrebščine', note: 'splošna inflacija' },
  { code: '09211', short: 'Videoigre in konzole', note: 'računalniki, konzole, aplikacije za videoigre' },
  { code: '0921',  short: 'Igre, igrače in hobiji', note: 'skupaj 09.2.1.1 in 09.2.1.2' },
  { code: '09',    short: 'Rekreacija, šport in kultura', note: 'celoten oddelek 09' },
  { code: '0922',  short: 'Športna oprema', note: 'oprema za šport, kampiranje in rekreacijo' },
  { code: '0971',  short: 'Knjige', note: 'izobraževalne in druge knjige' },
  { code: '0961',  short: 'Kino, gledališče, koncerti', note: 'vstopnice za kulturne prireditve' },
];

export const DEFAULT_CATEGORIES = ['09212', 'TOT', '09211'];

const isMissing = (v) => v === undefined || /^\.+$|^-$|^$/.test(v);
const round = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

let extracted = null; // { version, ... }

/** Reads the needed series out of the Px object (memoised per table version). */
function extract(state) {
  if (extracted?.version === state.version) return extracted;
  const px = state.px;

  const vars = px.variables();
  const catVar = vars.findIndex((v) => /POTREBŠČIN/i.test(v));
  const timeVar = vars.findIndex((v) => /MESEC/i.test(v));
  const measureVar = vars.findIndex((v) => /MERITVE/i.test(v));
  if ([catVar, timeVar, measureVar].includes(-1)) {
    throw new Error(`Unexpected table structure: ${vars.join(', ')}`);
  }

  const catCodes = px.codes(catVar);
  const catLabels = px.values(catVar);
  const measureCodes = px.codes(measureVar);
  const months = px.codes(timeVar); // e.g. "2026M10"

  const column = (catIdx, measureCode) => {
    const sel = [];
    sel[catVar] = catIdx;
    sel[timeVar] = '*';
    sel[measureVar] = measureCodes.indexOf(measureCode);
    return px.dataCol(sel).map((v) => (isMissing(v) ? null : Number(v)));
  };

  const series = {};
  for (const cat of CATEGORIES) {
    const idx = catCodes.indexOf(cat.code);
    if (idx === -1) continue;
    const weights = column(idx, MEASURE_WEIGHT);
    const lastWeight = weights.findLast((w) => w != null);
    series[cat.code] = {
      ...cat,
      label: catLabels[idx],
      slot: CATEGORIES.indexOf(cat) + 1,
      weight: lastWeight,
      values: column(idx, MEASURE_INDEX),
    };
  }

  const periods = months.map((m) => ({ year: Number(m.slice(0, 4)), month: Number(m.slice(5)) }));
  const lastPeriod = periods.at(-1);
  const lastCompleteYear = lastPeriod.month === 12 ? lastPeriod.year : lastPeriod.year - 1;

  const meta = (key) => {
    try { return px.keyword(key); } catch { return null; }
  };

  extracted = {
    version: state.version,
    title: meta('TITLE'),
    source: meta('SOURCE'),
    pxLastUpdated: meta('LAST-UPDATED'),
    pxNextUpdate: meta('NEXT-UPDATE'),
    periods,
    firstYear: periods[0].year,
    lastYear: lastPeriod.year,
    lastPeriod,
    lastCompleteYear,
    series,
  };
  return extracted;
}

const periodKey = ({ year, month }) => `${year}-${String(month).padStart(2, '0')}`;

/** Converts "20261106 10:30" (PX date) to ISO-like "2026-11-06 10:30". */
function pxDate(s) {
  const m = s?.match(/^(\d{4})(\d{2})(\d{2})\s*(\d{2}:\d{2})?/);
  return m ? `${m[1]}-${m[2]}-${m[3]}${m[4] ? ' ' + m[4] : ''}` : s;
}

export function getMeta(state) {
  const d = extract(state);
  return {
    title: d.title,
    source: d.source,
    pxLastUpdated: pxDate(d.pxLastUpdated),
    pxNextUpdate: pxDate(d.pxNextUpdate),
    firstPeriod: periodKey(d.periods[0]),
    lastPeriod: periodKey(d.lastPeriod),
    firstYear: d.firstYear,
    lastYear: d.lastYear,
    lastCompleteYear: d.lastCompleteYear,
    categories: Object.values(d.series).map(({ values, ...rest }) => ({
      ...rest,
      firstPeriod: periodKey(d.periods[values.findIndex((v) => v != null)]),
    })),
    defaultCategories: DEFAULT_CATEGORIES,
    fetch: {
      status: state.lastStatus,
      downloadedAt: state.downloadedAt,
      checkedAt: state.checkedAt,
      error: state.lastError,
    },
  };
}

/**
 * Main analysis.
 * @param {object} q  { cats: string[], from: number, to: number, base: number, freq: 'month'|'year' }
 */
export function analyse(state, q) {
  const d = extract(state);

  const cats = q.cats.filter((c) => d.series[c]);
  if (!cats.length) throw Object.assign(new Error('Izberi vsaj eno kategorijo.'), { status: 400 });

  const from = Math.max(d.firstYear, Math.min(q.from, d.lastYear));
  const to = Math.max(from, Math.min(q.to, d.lastYear));
  const base = Math.max(d.firstYear, Math.min(q.base, d.lastCompleteYear));
  const freq = q.freq === 'year' ? 'year' : 'month';

  const warnings = [];
  const out = [];

  // TOT is always computed so every category can be compared to overall inflation.
  for (const code of new Set([...cats, 'TOT'])) {
    const s = d.series[code];

    // 1) Rebase: index(base year average) = 100.
    const baseVals = s.values.filter((v, i) => d.periods[i].year === base && v != null);
    const baseAvg = baseVals.length === 12 ? mean(baseVals) : null;
    if (baseAvg == null) {
      warnings.push(`${s.short}: za bazno leto ${base} ni podatkov (na voljo od ${periodKey(d.periods[s.values.findIndex((v) => v != null)])}).`);
      continue;
    }
    const rebased = s.values.map((v) => (v == null ? null : (v / baseAvg) * 100));

    // 2) Monthly points with year-over-year change (month vs same month last year).
    const monthly = [];
    d.periods.forEach((p, i) => {
      if (p.year < from || p.year > to || rebased[i] == null) return;
      const prev = rebased[i - 12];
      monthly.push({
        period: periodKey(p),
        index: round(rebased[i]),
        yoy: prev != null ? round((rebased[i] / prev - 1) * 100) : null,
      });
    });

    // 3) Yearly aggregation: average of the year's months. For an incomplete
    //    year, inflation compares the same months of the previous year.
    const byYear = new Map();
    d.periods.forEach((p, i) => {
      if (rebased[i] == null) return;
      if (!byYear.has(p.year)) byYear.set(p.year, new Map());
      byYear.get(p.year).set(p.month, rebased[i]);
    });
    const yearly = [];
    for (const [year, months] of byYear) {
      if (year < from || year > to) continue;
      const prevMonths = byYear.get(year - 1);
      const sameMonthsPrev = prevMonths ? [...months.keys()].map((m) => prevMonths.get(m)) : [];
      const avg = mean([...months.values()]);
      const prevAvg = sameMonthsPrev.length && sameMonthsPrev.every((v) => v != null) ? mean(sameMonthsPrev) : null;
      yearly.push({
        period: String(year),
        months: months.size,
        partial: months.size < 12,
        index: round(avg),
        yoy: prevAvg ? round((avg / prevAvg - 1) * 100) : null,
      });
    }

    // 4) Summary over the selected period.
    const first = monthly[0];
    const last = monthly.at(-1);
    let summary = null;
    if (first && last) {
      const nMonths = monthly.length - 1;
      const change = last.index / first.index - 1;
      const fullYears = yearly.filter((y) => !y.partial && y.yoy != null);
      summary = {
        from: first.period,
        to: last.period,
        firstIndex: first.index,
        lastIndex: last.index,
        changePct: round(change * 100),
        avgAnnualPct: nMonths >= 12 ? round(((1 + change) ** (12 / nMonths) - 1) * 100) : null,
        latestYoy: last.yoy,
        maxYear: fullYears.length ? fullYears.reduce((a, b) => (b.yoy > a.yoy ? b : a)) : null,
        minYear: fullYears.length ? fullYears.reduce((a, b) => (b.yoy < a.yoy ? b : a)) : null,
      };
    }

    out.push({
      code,
      label: s.label,
      short: s.short,
      note: s.note,
      slot: s.slot,
      focus: !!s.focus,
      weight: s.weight,
      points: freq === 'year' ? yearly : monthly,
      yearly,
      summary,
    });
  }

  // 5) Comparison against overall inflation (percentage points).
  const total = out.find((c) => c.code === 'TOT');
  for (const c of out) {
    if (c.summary && total?.summary && c !== total) {
      c.summary.vsTotalPp = round(c.summary.changePct - total.summary.changePct);
    }
  }

  return {
    query: { cats, from, to, base, freq },
    warnings,
    series: out.filter((c) => cats.includes(c.code)),
  };
}
