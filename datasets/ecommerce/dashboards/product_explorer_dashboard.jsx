import React, { useEffect, useMemo, useState } from "react";
import { Controls, MultiSelect, Search, Select, TimeRange, VegaChart, useQuery } from "@malloyyo/dashboard";

// ---------------------------------------------------------------------------
// Product & Brand Explorer — custom React dashboard.
//
// A custom dashboard draws itself: no Malloy renderer, just controls + hooks +
// Vega-Lite specs over the flat queries in product_explorer_dashboard.malloy.
//
// Design contract (see the dataviz method):
//   • Categorical hues are assigned by ENTITY in a fixed order, never by rank —
//     filtering out a series must never repaint the survivors.
//   • One y-axis, always. Sales and gross margin are both dollars, so they can
//     share the trend chart's scale; nothing here ever gets a second scale.
//   • Slots 1–2 of the validated palette (blue / orange) are the only series
//     hues used, and both modes pass the all-pairs CVD + normal-vision floors.
//   • Ranked bars carry a direct value label at the tip and therefore drop the
//     x-axis and gridlines entirely — labels before gridlines.
// ---------------------------------------------------------------------------

const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// Light and dark are SELECTED, not flipped: each column is stepped for its own
// surface, so contrast and CVD separation hold in both.
const LIGHT = {
  page: "#f9f9f7",
  surface: "#fcfcfb",
  ink: "#0b0b0b",
  ink2: "#52514e",
  muted: "#898781",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  border: "rgba(11,11,11,0.10)",
  shadow: "0 1px 2px rgba(11,11,11,.05), 0 8px 24px -16px rgba(11,11,11,.28)",
  track: "#e9e8e2",
  s1: "#2a78d6",
  s2: "#eb6834",
  up: "#006300",
  down: "#d03b3b",
  controls: "#ffffff",
};
const DARK = {
  page: "#0d0d0d",
  surface: "#1a1a19",
  ink: "#ffffff",
  ink2: "#c3c2b7",
  muted: "#898781",
  grid: "#2c2c2a",
  axis: "#383835",
  border: "rgba(255,255,255,0.10)",
  shadow: "none",
  track: "#2c2c2a",
  s1: "#3987e5",
  s2: "#d95926",
  up: "#0ca30c",
  down: "#d03b3b",
  controls: "#141413",
};

/** The viewer's color scheme. Vega specs are plain JSON — CSS custom properties
    can't reach inside them — so the theme has to be resolved in JS and baked
    into each spec. */
function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      return !!window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = (e) => setDark(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return dark ? DARK : LIGHT;
}

// ── formatting ─────────────────────────────────────────────────────────────
const abs = Math.abs;
const usd = (n) => {
  if (n == null || !isFinite(n)) return "—";
  if (abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs(n) >= 1e4) return `$${Math.round(n / 1e3)}K`;
  if (abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};
const usd2 = (n) => (n == null || !isFinite(n) ? "—" : `$${n.toFixed(2)}`);
const num = (n) => {
  if (n == null || !isFinite(n)) return "—";
  if (abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs(n) >= 1e4) return `${Math.round(n / 1e3)}K`;
  if (abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
};
const pct = (n, d = 1) => (n == null || !isFinite(n) ? "—" : `${(n * 100).toFixed(d)}%`);
const signedPct = (n) => (n == null ? "" : `${n >= 0 ? "+" : "−"}${(abs(n) * 100).toFixed(1)}%`);

// ── shared Vega config ─────────────────────────────────────────────────────
// Recessive chrome: hairline solid gridlines one step off the surface, muted
// axis text, no view border, no chart background (the card supplies it).
const cfg = (t) => ({
  background: null,
  font: FONT,
  padding: 0,
  view: { stroke: null },
  axis: {
    labelColor: t.muted,
    titleColor: t.muted,
    domainColor: t.axis,
    tickColor: t.axis,
    gridColor: t.grid,
    gridWidth: 1,
    gridDash: [],
    labelFontSize: 11,
    labelFont: FONT,
    titleFont: FONT,
    titleFontSize: 11,
    titleFontWeight: 500,
    titlePadding: 10,
    labelPadding: 4,
    tickSize: 4,
  },
  legend: {
    labelColor: t.ink2,
    titleColor: t.muted,
    labelFont: FONT,
    titleFont: FONT,
    labelFontSize: 11,
    titleFontSize: 10,
    symbolStrokeWidth: 0,
    symbolSize: 90,
    titleFontWeight: 500,
  },
  text: { font: FONT },
});

// Entity-stable series scale for the trend's two dollar measures.
const trendScale = (t) => ({ domain: ["Sales", "Gross margin"], range: [t.s1, t.s2] });

/** Monthly sales (bars) with gross margin (line) on ONE dollar axis. */
const trendSpec = (t) => ({
  height: 250,
  config: cfg(t),
  encoding: {
    x: {
      field: "order_month",
      type: "temporal",
      title: null,
      axis: { format: "%b ’%y", labelAngle: 0, tickCount: 7, grid: false, domainColor: t.axis },
    },
  },
  layer: [
    {
      // width band < 1 leaves the 2px-equivalent surface gap between columns.
      mark: { type: "bar", width: { band: 0.62 }, cornerRadiusTopLeft: 3, cornerRadiusTopRight: 3 },
      encoding: {
        y: {
          field: "sales",
          type: "quantitative",
          title: null,
          axis: { format: "$~s", grid: true, domain: false, ticks: false, tickCount: 5 },
        },
        color: {
          datum: "Sales",
          scale: trendScale(t),
          legend: { title: null, orient: "top", direction: "horizontal", symbolType: "square", offset: 2 },
        },
      },
    },
    {
      mark: { type: "line", strokeWidth: 2, strokeJoin: "round", strokeCap: "round", interpolate: "monotone" },
      encoding: {
        y: { field: "margin", type: "quantitative" },
        color: { datum: "Gross margin", scale: trendScale(t) },
      },
    },
    {
      // Crosshair: a soft band that snaps to the nearest month. The reader aims
      // at a date, not at a 2px column — and one readout lists every series.
      params: [
        {
          name: "hov",
          select: { type: "point", encodings: ["x"], on: "pointerover", nearest: true, clear: "pointerout" },
        },
      ],
      mark: { type: "rule", strokeWidth: 16, stroke: t.ink2 },
      encoding: {
        opacity: { condition: { param: "hov", empty: false, value: 0.1 }, value: 0 },
        tooltip: [
          { field: "order_month", type: "temporal", title: "Month", format: "%B %Y" },
          { field: "sales", type: "quantitative", title: "Sales", format: "$,.0f" },
          { field: "margin", type: "quantitative", title: "Gross margin", format: "$,.0f" },
          { field: "units", type: "quantitative", title: "Units", format: "," },
        ],
      },
    },
  ],
});

/** Ranked horizontal bars: one series, one hue, value direct-labelled at the
    tip — so the chart needs no x-axis and no gridlines at all. */
function rankedSpec(t, { field, labelLimit, tooltip, max }) {
  return {
    height: { step: 27 },
    config: cfg(t),
    transform: [{ calculate: "format(datum.sales, '$,.3s')", as: "vlabel" }],
    encoding: {
      y: {
        field,
        type: "nominal",
        title: null,
        sort: { field: "sales", op: "max", order: "descending" },
        axis: {
          labelLimit,
          labelFontSize: 12,
          labelColor: t.ink2,
          labelPadding: 8,
          domain: false,
          ticks: false,
        },
      },
      // Headroom on the right so the tip label never runs off the card.
      x: { field: "sales", type: "quantitative", title: null, axis: null, scale: { domain: [0, max], nice: false } },
    },
    layer: [
      {
        mark: {
          type: "bar",
          height: { band: 0.62 },
          color: t.s1,
          cornerRadiusTopRight: 4,
          cornerRadiusBottomRight: 4,
        },
        encoding: { tooltip },
      },
      {
        mark: { type: "text", align: "left", dx: 8, fontSize: 11, color: t.ink2, font: FONT },
        encoding: { text: { field: "vlabel" } },
      },
    ],
  };
}

/** Category positioning map: price vs margin rate, area = sales, hue =
    department (an entity-stable two-slot domain, so a filter can't recolor it). */
const mixSpec = (t) => ({
  height: 300,
  config: cfg(t),
  transform: [{ window: [{ op: "rank", as: "srank" }], sort: [{ field: "sales", order: "descending" }] }],
  encoding: {
    x: {
      field: "avg_item_price",
      type: "quantitative",
      title: "Average item price",
      axis: { format: "$,.0f", grid: true, domain: false, ticks: false },
      scale: { zero: false, nice: true, padding: 26 },
    },
    y: {
      field: "margin_rate",
      type: "quantitative",
      title: "Gross margin rate",
      axis: { format: ".0%", grid: true, domain: false, ticks: false },
      scale: { zero: false, nice: true, padding: 22 },
    },
  },
  layer: [
    {
      // The 2px surface ring keeps overlapping bubbles legible without drawing
      // a data-weight border around them.
      mark: { type: "circle", opacity: 0.78, stroke: t.surface, strokeWidth: 2 },
      encoding: {
        size: { field: "sales", type: "quantitative", legend: null, scale: { range: [90, 1700] } },
        color: {
          field: "department",
          type: "nominal",
          title: null,
          scale: { domain: ["Men", "Women"], range: [t.s1, t.s2] },
          legend: { orient: "top", direction: "horizontal", symbolType: "circle", offset: 2 },
        },
        tooltip: [
          { field: "category", title: "Category" },
          { field: "department", title: "Department" },
          { field: "sales", type: "quantitative", title: "Sales", format: "$,.0f" },
          { field: "margin_rate", type: "quantitative", title: "Margin rate", format: ".1%" },
          { field: "avg_item_price", type: "quantitative", title: "Avg item price", format: "$,.2f" },
          { field: "units", type: "quantitative", title: "Units", format: "," },
        ],
      },
    },
    {
      // Label selectively — the six biggest carry their name; the rest are in
      // the tooltip and in the Top categories bars beside this chart.
      mark: { type: "text", align: "left", baseline: "middle", dx: 11, fontSize: 10, color: t.muted, font: FONT },
      encoding: {
        text: { field: "category" },
        opacity: { condition: { test: "datum.srank <= 6", value: 1 }, value: 0 },
      },
    },
  ],
});

// ── small pieces ───────────────────────────────────────────────────────────

/** 12-point sparkline: the run in the de-emphasis hue, the latest point in the
    accent. Supplements the tile's value — it is never the only way to read it. */
function Sparkline({ values, t, w = 96, h = 26 }) {
  if (!values || values.length < 2) return <div style={{ height: h }} />;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const x = (i) => (i / (values.length - 1)) * (w - 6) + 3;
  const y = (v) => h - 4 - ((v - lo) / span) * (h - 8);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values.length - 1;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
      <path d={d} fill="none" stroke={t.axis} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(last)} cy={y(values[last])} r="3" fill={t.s1} stroke={t.surface} strokeWidth="2" />
    </svg>
  );
}

function Delta({ value, t }) {
  if (value == null) return null;
  const good = value >= 0;
  return (
    <span style={{ color: good ? t.up : t.down, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
      {good ? "▲" : "▼"} {signedPct(value)}
      <span style={{ color: t.muted, fontWeight: 400 }}> vs prior 3 mo</span>
    </span>
  );
}

function Stat({ label, value, hint, spark, delta, t }) {
  return (
    <div className="pe-stat">
      <div className="pe-stat-label">{label}</div>
      <div className="pe-stat-row">
        <div className="pe-stat-value">{value}</div>
        {spark ? <Sparkline values={spark} t={t} /> : null}
      </div>
      {delta != null ? <Delta value={delta} t={t} /> : hint ? <div className="pe-stat-hint">{hint}</div> : null}
    </div>
  );
}

function Card({ title, subtitle, children, className }) {
  return (
    <section className={`pe-card${className ? " " + className : ""}`}>
      <header className="pe-card-head">
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </header>
      {children}
    </section>
  );
}

/** Department mix as a single part-to-whole bar. Two segments separated by a
    2px surface gap — the gap does the separating, never a stroke. Hue is keyed
    to the department NAME (alphabetical), so filtering can't repaint it. */
function DepartmentMix({ rows, t }) {
  const order = useMemo(() => [...rows].sort((a, b) => String(a.department).localeCompare(String(b.department))), [rows]);
  const hue = (i) => [t.s1, t.s2][i] ?? t.muted;
  const total = order.reduce((s, r) => s + (r.sales || 0), 0);
  if (!order.length) return <div className="pe-empty">No matching orders.</div>;
  return (
    <div>
      <div className="pe-seg">
        {order.map((r, i) => (
          <div
            key={r.department}
            className="pe-seg-part"
            style={{ flexGrow: Math.max(r.sales || 0, 1), background: hue(i) }}
            title={`${r.department}: ${usd(r.sales)}`}
          />
        ))}
      </div>
      <ul className="pe-seg-key">
        {order.map((r, i) => (
          <li key={r.department}>
            <span className="pe-dot" style={{ background: hue(i) }} />
            <span className="pe-seg-name">{r.department}</span>
            <span className="pe-seg-val">{usd(r.sales)}</span>
            <span className="pe-seg-share">{pct(total ? (r.sales || 0) / total : null, 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── trend helpers ──────────────────────────────────────────────────────────

/** Drop a trailing month that is still in progress — otherwise every trend ends
    in a cliff that reads as a collapse in sales rather than an unfinished month. */
function completeMonths(rows) {
  if (rows.length < 2) return rows;
  const last = new Date(rows[rows.length - 1].order_month);
  const now = new Date();
  const partial = last.getUTCFullYear() === now.getUTCFullYear() && last.getUTCMonth() === now.getUTCMonth();
  return partial ? rows.slice(0, -1) : rows;
}

/** Trailing 3 months vs the 3 before — steadier than month-over-month, and the
    tile labels the comparison so the number is never ambiguous. */
function trailingDelta(rows, field) {
  if (rows.length < 6) return null;
  const sum = (a) => a.reduce((s, r) => s + (r[field] || 0), 0);
  const n = rows.length;
  const prev = sum(rows.slice(n - 6, n - 3));
  if (!prev) return null;
  return sum(rows.slice(n - 3)) / prev - 1;
}

const spark = (rows, field) => rows.slice(-12).map((r) => r[field] || 0);

// ── the dashboard ──────────────────────────────────────────────────────────

export default function Dashboard({ dashboard, givens }) {
  const t = useTheme();

  const kpi = useQuery({ query: "product_explorer_dashboard", givens });
  const trend = useQuery({ query: "explorer_trend", givens });
  const depts = useQuery({ query: "explorer_departments", givens });
  const cats = useQuery({ query: "explorer_categories", givens });
  const brands = useQuery({ query: "explorer_brands", givens });
  const products = useQuery({ query: "explorer_products", givens });
  const mix = useQuery({ query: "explorer_category_mix", givens });

  const k = kpi.rows?.[0] ?? {};
  const months = useMemo(() => completeMonths(trend.rows ?? []), [trend.rows]);

  // Ranked bars share one rule: 18% headroom past the longest bar so the tip
  // label always has room to sit outside the mark instead of being clipped.
  const headroom = (rows) => Math.max(...rows.map((r) => r.sales || 0), 1) * 1.18;

  const anyError = [kpi, trend, depts, cats, brands, products, mix].find((q) => q.error);
  const busy = [kpi, trend, depts, cats, brands, products, mix].some((q) => q.loading);

  return (
    <div className="pe" style={{ colorScheme: t === DARK ? "dark" : "light" }}>
      <style>{css(t)}</style>

      <header className="pe-head">
        <div>
          <h1>{dashboard?.title ?? "Product & Brand Explorer"}</h1>
          <p>
            The catalog from the top down — <strong>department → category → brand → product</strong> — with sales,
            gross margin, and units moving together. Every control below rescopes the whole page.
          </p>
        </div>
      </header>

      {/* One filter row, above everything it scopes. Date range first. */}
      <Controls style={{ background: t.controls, borderColor: t.border, borderRadius: 12 }}>
        <TimeRange given="PERIOD" />
        <Select given="DEPARTMENT" />
        <MultiSelect given="CATEGORY" />
        <Search given="BRAND" />
        <Search given="PRODUCT" />
      </Controls>

      {anyError ? <pre className="pe-error">{anyError.error}</pre> : null}

      <div className="pe-grid" style={{ opacity: busy ? 0.55 : 1 }}>
        {/* Hero — exactly one per view. */}
        <section className="pe-card pe-hero">
          <div className="pe-stat-label">Total sales</div>
          <div className="pe-hero-value">{usd(k.sales)}</div>
          <div className="pe-hero-foot">
            <Delta value={trailingDelta(months, "sales")} t={t} />
            <Sparkline values={spark(months, "sales")} t={t} w={140} h={34} />
          </div>
          <div className="pe-hero-sub">
            {num(k.units)} units · {num(k.orders)} orders · {num(k.products)} products · {num(k.brands)} brands ·{" "}
            {num(k.categories)} categories
          </div>
        </section>

        <div className="pe-stats">
          <Stat label="Gross margin" value={usd(k.margin)} delta={trailingDelta(months, "margin")} t={t} />
          <Stat label="Margin rate" value={pct(k.margin_rate)} hint="gross margin ÷ sales" t={t} />
          <Stat label="Units sold" value={num(k.units)} spark={spark(months, "units")} t={t} />
          <Stat label="Avg item price" value={usd2(k.avg_item_price)} hint="sales ÷ units" t={t} />
        </div>

        <Card title="Department mix" subtitle="Share of sales" className="pe-span-4">
          <DepartmentMix rows={depts.rows ?? []} t={t} />
        </Card>

        <Card
          title="Sales and gross margin by month"
          subtitle="Both measures are dollars, so they share one axis. In-progress months are excluded."
          className="pe-span-12"
        >
          <VegaChart spec={trendSpec(t)} data={months} />
        </Card>

        <Card title="Top categories" subtitle="By sales" className="pe-span-6">
          <VegaChart
            spec={rankedSpec(t, {
              field: "category",
              labelLimit: 150,
              max: headroom(cats.rows ?? []),
              tooltip: [
                { field: "category", title: "Category" },
                { field: "sales", type: "quantitative", title: "Sales", format: "$,.0f" },
                { field: "margin", type: "quantitative", title: "Gross margin", format: "$,.0f" },
                { field: "margin_rate", type: "quantitative", title: "Margin rate", format: ".1%" },
                { field: "units", type: "quantitative", title: "Units", format: "," },
              ],
            })}
            data={cats.rows ?? []}
          />
        </Card>

        <Card
          title="Where each category sits"
          subtitle="Average item price against gross margin rate; bubble area is sales."
          className="pe-span-6"
        >
          <VegaChart spec={mixSpec(t)} data={mix.rows ?? []} />
        </Card>

        <Card title="Top brands" subtitle="By sales" className="pe-span-6">
          <VegaChart
            spec={rankedSpec(t, {
              field: "brand",
              labelLimit: 150,
              max: headroom(brands.rows ?? []),
              tooltip: [
                { field: "brand", title: "Brand" },
                { field: "sales", type: "quantitative", title: "Sales", format: "$,.0f" },
                { field: "margin", type: "quantitative", title: "Gross margin", format: "$,.0f" },
                { field: "units", type: "quantitative", title: "Units", format: "," },
              ],
            })}
            data={brands.rows ?? []}
          />
        </Card>

        <Card title="Top products" subtitle="By sales" className="pe-span-6">
          <VegaChart
            spec={rankedSpec(t, {
              field: "product",
              labelLimit: 230,
              max: headroom(products.rows ?? []),
              tooltip: [
                { field: "product", title: "Product" },
                { field: "brand", title: "Brand" },
                { field: "sales", type: "quantitative", title: "Sales", format: "$,.0f" },
                { field: "units", type: "quantitative", title: "Units", format: "," },
              ],
            })}
            data={products.rows ?? []}
          />
        </Card>
      </div>
    </div>
  );
}

// ── styles ─────────────────────────────────────────────────────────────────
// Theme is resolved in JS (the Vega specs need the same values), so the CSS is
// emitted for the active mode rather than duplicated behind a media query. The
// --dash-* overrides restyle the runtime's built-in controls to match.
const css = (t) => `
.pe {
  --dash-fg: ${t.ink};
  --dash-muted: ${t.muted};
  --dash-border: ${t.border};
  --dash-accent: ${t.s1};
  --dash-control-bg: ${t.surface};
  --dash-controls-bg: ${t.controls};
  --dash-chip-bg: ${t.s1}1f;
  --dash-chip-fg: ${t.ink2};
  font-family: ${FONT};
  color: ${t.ink};
  background: ${t.page};
  min-height: 100vh;
  padding: 28px 24px 56px;
  box-sizing: border-box;
  -webkit-font-smoothing: antialiased;
}
.pe * { box-sizing: border-box; }

.pe-head { max-width: 1360px; margin: 0 auto 18px; }
.pe-head h1 { font-size: 24px; font-weight: 650; letter-spacing: -0.015em; margin: 0 0 6px; }
.pe-head p { margin: 0; max-width: 68ch; font-size: 13.5px; line-height: 1.55; color: ${t.ink2}; }
.pe-head strong { color: ${t.ink}; font-weight: 600; }

.pe > form, .pe > div:not(.pe-grid) { max-width: 1360px; margin-left: auto; margin-right: auto; }

.pe-grid {
  max-width: 1360px;
  margin: 18px auto 0;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 14px;
  transition: opacity .18s ease;
}
.pe-span-4  { grid-column: span 4; }
.pe-span-6  { grid-column: span 6; }
.pe-span-12 { grid-column: span 12; }

.pe-card {
  grid-column: span 12;
  background: ${t.surface};
  border: 1px solid ${t.border};
  border-radius: 12px;
  box-shadow: ${t.shadow};
  padding: 16px 18px 14px;
  min-width: 0;
}
.pe-card-head { margin-bottom: 12px; }
.pe-card-head h2 { margin: 0; font-size: 13.5px; font-weight: 600; letter-spacing: -0.005em; color: ${t.ink}; }
.pe-card-head p { margin: 3px 0 0; font-size: 11.5px; line-height: 1.45; color: ${t.muted}; }

/* Hero — the one number the page leads with. */
.pe-hero { grid-column: span 4; display: flex; flex-direction: column; gap: 4px; }
.pe-hero-value { font-size: 50px; font-weight: 650; letter-spacing: -0.03em; line-height: 1.05; color: ${t.ink}; }
.pe-hero-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 6px; min-height: 34px; }
.pe-hero-sub { margin-top: auto; padding-top: 12px; font-size: 11.5px; line-height: 1.6; color: ${t.muted}; }

.pe-stats { grid-column: span 4; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.pe-stat {
  background: ${t.surface};
  border: 1px solid ${t.border};
  border-radius: 12px;
  box-shadow: ${t.shadow};
  padding: 14px 16px 12px;
  display: flex; flex-direction: column; gap: 4px; min-width: 0;
}
.pe-stat-label { font-size: 10.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: ${t.muted}; }
.pe-stat-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; }
.pe-stat-value { font-size: 25px; font-weight: 620; letter-spacing: -0.02em; line-height: 1.15; color: ${t.ink}; }
.pe-stat-hint { font-size: 11.5px; color: ${t.muted}; }

/* Part-to-whole bar: segments are separated by a gap in the page, not a stroke. */
.pe-seg { display: flex; gap: 2px; height: 18px; border-radius: 5px; overflow: hidden; background: ${t.track}; }
.pe-seg-part { min-width: 3px; }
.pe-seg-key { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 7px; }
.pe-seg-key li { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: ${t.ink2}; }
.pe-dot { width: 9px; height: 9px; border-radius: 3px; flex: none; }
.pe-seg-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pe-seg-val { font-variant-numeric: tabular-nums; font-weight: 600; color: ${t.ink}; }
.pe-seg-share { font-variant-numeric: tabular-nums; color: ${t.muted}; width: 4ch; text-align: right; }

.pe-empty { font-size: 12.5px; color: ${t.muted}; padding: 12px 0; }
.pe-error {
  max-width: 1360px; margin: 0 auto; white-space: pre-wrap; color: ${t.down};
  font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
  background: ${t.surface}; border: 1px solid ${t.border}; border-radius: 10px; padding: 12px 14px;
}

@media (max-width: 1080px) {
  .pe-hero, .pe-stats, .pe-span-4, .pe-span-6 { grid-column: span 12; }
}
@media (max-width: 620px) {
  .pe { padding: 20px 14px 40px; }
  .pe-stats { grid-template-columns: 1fr; }
}
`;
