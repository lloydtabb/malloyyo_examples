// @ts-nocheck
// Over-represented baby names — names most concentrated in the selected state /
// year range vs. the nation, in two ranked columns (boys / girls). Full
// React/JS: pulls two flat queries (overrep_male / overrep_female) via useQuery
// and draws the ranking as inline CSS bars — no Malloy renderer / <Panel>. The
// `.malloy` file still owns every query and the given mapping (where: ~ $STATE …).
//
// The viz "kit" (theme tokens, palette, Card) is copied across dashboards on
// purpose: jsx components are sandboxed (only React + @malloyyo/dashboard
// import), so there is no shared local module to import.
import React from "react";
import { Controls, Given, Select, filters, useGiven, useQuery } from "@malloyyo/dashboard";

/* ============================ shared viz kit ============================ */
const SERIES = {
  light: { F: "#e87ba4", M: "#2a78d6" }, // Female magenta, Male blue
  dark: { F: "#d55181", M: "#3987e5" },
};
const INK = {
  light: { surface: "#fcfcfb", track: "#eceff3", muted: "#898781", text: "#0b0b0b", text2: "#52514e" },
  dark: { surface: "#1a1a19", track: "#26262b", muted: "#898781", text: "#ffffff", text2: "#c3c2b7" },
};
const THRESHOLDS = [10, 20, 50, 100, 200, 500, 1000];

function relLum(c) {
  if (!c) return null;
  c = c.trim();
  let r, g, b, m;
  if ((m = c.match(/^#([0-9a-f]{3})$/i))) { const h = m[1]; r = parseInt(h[0] + h[0], 16); g = parseInt(h[1] + h[1], 16); b = parseInt(h[2] + h[2], 16); }
  else if ((m = c.match(/^#([0-9a-f]{6})$/i))) { const h = m[1]; r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16); }
  else if ((m = c.match(/rgba?\(([^)]+)\)/i))) { const p = m[1].split(",").map((x) => parseFloat(x)); [r, g, b] = p; }
  else return null;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function useTheme() {
  const [dark, setDark] = React.useState(false);
  React.useLayoutEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.body || document.documentElement);
      const lum = relLum(cs.getPropertyValue("--dash-fg"));
      setDark(lum != null ? lum > 0.5 : window.matchMedia("(prefers-color-scheme: dark)").matches);
    };
    read();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", read);
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
    return () => { mq.removeEventListener("change", read); obs.disconnect(); };
  }, []);
  return { dark, ink: dark ? INK.dark : INK.light, series: dark ? SERIES.dark : SERIES.light };
}

const num = (x) => (x == null || x === "" ? 0 : +x);
const fmtIdx = (v) => (v >= 10 ? Math.round(v).toLocaleString() : v.toFixed(1));

// Drilling — clicking a name opens the same targets the model declares on the
// `name` dimension (`# drill { to=["name_explorer", "time-series"] }`). A custom
// component isn't rendered by <Panel>, so it drives the drill itself: post a
// {navigate} message to the trusted parent (the exact contract <Panel> uses),
// seeding NAME with the clicked value. Kept in sync with baby_names.malloy by
// hand — there's no runtime API to read a dimension's drill tag from here.
const DRILL_TARGETS = [
  { slug: "name_explorer", label: "Open in Name explorer" },
  { slug: "time-series", label: "See it on the map over time" },
];
function navigateTo(slug, name) {
  parent.postMessage({ type: "navigate", dashboard: slug, givens: { NAME: filters.oneOf(name) } }, "*");
}

// Cursor popup mirroring the runtime's DrillMenu, themed via --dash-* vars.
function DrillMenu({ menu, onClose }) {
  React.useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!menu) return null;
  const left = Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 9999) - 260);
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 2000 }} />
      <div style={{
        position: "fixed", left, top: menu.y, zIndex: 2001, minWidth: 210, padding: 4,
        background: "var(--dash-control-bg, #fff)", color: "var(--dash-fg, #171717)",
        border: "1px solid var(--dash-border, #e5e7eb)", borderRadius: "var(--dash-radius, 8px)",
        boxShadow: "0 8px 24px rgba(0,0,0,.16)", font: "14px system-ui, sans-serif",
      }}>
        <div style={{ padding: "6px 10px 4px", fontSize: 12, color: "var(--dash-muted, #888)" }}>
          Explore <strong style={{ color: "var(--dash-fg)" }}>{menu.name}</strong>
        </div>
        {DRILL_TARGETS.map((t) => (
          <button
            key={t.slug}
            onClick={() => { navigateTo(t.slug, menu.name); onClose(); }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--dash-controls-bg, #f3f4f6)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            style={{
              display: "block", width: "100%", textAlign: "left", border: "none",
              background: "transparent", color: "inherit", font: "inherit",
              padding: "7px 10px", borderRadius: 6, cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
    </>
  );
}

function Card({ ink, children, style }) {
  return (
    <div style={{
      background: ink.surface, border: "1px solid var(--dash-border)",
      borderRadius: "var(--dash-radius, 10px)", padding: 16, ...style,
    }}>{children}</div>
  );
}
/* ========================== end shared viz kit ========================= */

function RankRow({ ink, color, rank, row, max, onDrill }) {
  const pct = max > 0 ? Math.max((row.idx / max) * 100, 1.5) : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "22px 1fr auto", alignItems: "center", gap: 10, padding: "7px 0" }}>
      <div style={{ fontVariantNumeric: "tabular-nums", fontSize: 12, color: ink.muted, textAlign: "right" }}>{rank}</div>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
          <button
            type="button"
            onClick={(e) => onDrill(row.name, e)}
            title={`Explore ${row.name}`}
            className="orn-name"
            style={{
              font: "inherit", fontSize: 14, fontWeight: 600, color: ink.text,
              background: "transparent", border: "none", padding: 0, cursor: "pointer",
              textAlign: "left", textDecorationThickness: "1px", textUnderlineOffset: 2,
            }}
          >
            {row.name}
          </button>
          <span style={{ fontSize: 12, color: ink.muted }} title="Births in the selected state & years">
            {row.regional.toLocaleString()} births
          </span>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: ink.track, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4 }} />
        </div>
      </div>
      <div style={{ fontVariantNumeric: "tabular-nums", fontSize: 14, fontWeight: 600, color: ink.text2, minWidth: 46, textAlign: "right" }}
           title="Concentration vs. the nation (share in state ÷ share nationally)">
        {fmtIdx(row.idx)}&times;
      </div>
    </div>
  );
}

function RankColumn({ ink, color, label, q, onDrill }) {
  const rows = React.useMemo(
    () => (q.rows || []).map((r) => ({ name: r.name, regional: num(r.regional), natl: num(r.natl), idx: num(r.overrep_index) })),
    [q.rows]
  );
  const max = rows.reduce((m, r) => Math.max(m, r.idx), 0);
  return (
    <Card ink={ink}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: "inline-block" }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: ink.text }}>{label}</span>
        <span style={{ fontSize: 12, color: ink.muted }}>· top {rows.length}</span>
      </div>
      {q.error ? (
        <div style={{ color: "var(--dash-danger)", fontSize: 13 }}>{String(q.error)}</div>
      ) : q.loading && rows.length === 0 ? (
        <div style={{ color: ink.muted, fontSize: 13 }}>Loading&hellip;</div>
      ) : rows.length === 0 ? (
        <div style={{ color: ink.muted, fontSize: 13 }}>No names clear the threshold here.</div>
      ) : (
        <div>{rows.map((r, i) => <RankRow key={r.name + i} ink={ink} color={color} rank={i + 1} row={r} max={max} onDrill={onDrill} />)}</div>
      )}
    </Card>
  );
}

export default function Dashboard({ dashboard, givens }) {
  const { ink, series } = useTheme();
  const male = useQuery({ query: "overrep_male", givens });
  const female = useQuery({ query: "overrep_female", givens });
  const state = useGiven("STATE");
  const years = filters.numberRange(givens.YEAR_RANGE ?? "");
  const [menu, setMenu] = React.useState(null);
  const onDrill = React.useCallback((name, e) => setMenu({ name, x: e.clientX, y: e.clientY }), []);

  return (
    <div style={{ maxWidth: 940, margin: "0 auto", padding: 24, color: "var(--dash-fg)" }}>
      <style>{`.orn-name:hover{ text-decoration: underline; color: var(--dash-accent, #2563eb) !important; }`}</style>
      <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>{dashboard.title}</h1>
      <p style={{ color: "var(--dash-muted)", margin: "0 0 20px", lineHeight: 1.5 }}>
        Each name&rsquo;s share of births in <strong>{state.value || "the state"}</strong>
        {years && (<>{" "}over <strong>{years.lo}&ndash;{years.hi}</strong></>)}{" "}
        compared with its share nationally. The <strong>&times; index</strong> is how many
        times more concentrated the name is in the state than in the country as a whole;
        ranked most over-represented first. <em>Click any name to explore it.</em>
      </p>

      <Controls>
        <Given name="STATE" />
        <Given name="YEAR_RANGE" />
        <Select given="MIN_SAMPLE" options={THRESHOLDS.map((n) => ({ value: filters.greaterThan(n), text: `> ${n}` }))} />
      </Controls>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", marginTop: 8 }}>
        <RankColumn ink={ink} color={series.M} label="Boys" q={male} onDrill={onDrill} />
        <RankColumn ink={ink} color={series.F} label="Girls" q={female} onDrill={onDrill} />
      </div>

      <DrillMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}
