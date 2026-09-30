// @ts-nocheck
// Director peaks — when a director made the film that dominated its release
// year, and how old they were.
//
// The whole page is ONE query: director_peaks_dash returns the three KPIs on a
// single row plus three nests (the histogram, the decade series, the ranked
// list) that arrive as real JS arrays. One round trip, one loading state, no
// waterfall between tiles.
//
// Charts are hand-built SVG rather than <VegaChart>, matching the timeline in
// genre_pairs.jsx: a few dozen bars needs no chart engine, and building them
// directly is what makes the mark specs (rounded data-ends, 2px surface gaps,
// 2px lines, recessive grid) exact rather than approximate.
//
// The viz "kit" (theme tokens, num/compact) is copied across dashboards on
// purpose: jsx components are sandboxed (only React + @malloyyo/dashboard
// import), so there is no shared local module to import.
import React from "react";
import { filters, useGiven, useQuery, useUrlState } from "@malloyyo/dashboard";

/* ============================ shared viz kit ============================ */
const INK = {
  light: { surface: "#fcfcfb", track: "#eceff3", muted: "#898781", text: "#0b0b0b", text2: "#52514e", accent: "#2a78d6" },
  dark: { surface: "#1a1a19", track: "#26262b", muted: "#898781", text: "#ffffff", text2: "#c3c2b7", accent: "#4f9bff" },
};

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
  return { dark, ink: dark ? INK.dark : INK.light };
}

// Query numerics arrive as STRINGS — always coerce before formatting or maths.
const num = (x) => (x == null || x === "" ? 0 : +x);
const compact = (n) =>
  n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(n);
/* ========================== end shared viz kit ========================= */

// A given holds a filter EXPRESSION ('Horror'), not a bare value. Unwrap for
// display, re-wrap with filters.oneOf when writing back.
const unwrap = (src) => {
  if (!src) return "";
  try { const v = filters.values(src); if (Array.isArray(v) && v.length) return String(v[0]); } catch (e) {}
  return String(src).replace(/^'|'$/g, "");
};

// SVG scales with its viewBox, which would scale the type with it. Measuring
// the container and drawing at real pixel size keeps every label at the size it
// was specified, at any width.
function useMeasure() {
  const ref = React.useRef(null);
  const [w, setW] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// A bar is anchored to the baseline, so only its data-end is rounded — rx on a
// <rect> would round the foot too and lift the bar off the axis.
function topRounded(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

/* ------------------------------- chrome -------------------------------- */
function Card({ ink, title, sub, children, style }) {
  return (
    <section style={{
      background: ink.surface, border: "1px solid var(--dash-border)", borderRadius: 12,
      padding: "16px 18px 14px", minWidth: 0, ...style,
    }}>
      <h2 style={{ fontSize: 13.5, fontWeight: 660, margin: 0, color: ink.text, letterSpacing: "-.01em" }}>{title}</h2>
      {sub ? <p style={{ fontSize: 12, color: ink.muted, margin: "3px 0 0", lineHeight: 1.4 }}>{sub}</p> : null}
      {children}
    </section>
  );
}

// Floating tooltip. Positioned against the card, then clamped so it can never
// hang off either edge.
function Tip({ ink, x, y, width, children }) {
  const w = 168;
  const left = Math.max(4, Math.min(x - w / 2, width - w - 4));
  return (
    <div style={{
      position: "absolute", left, top: y, width: w, pointerEvents: "none", zIndex: 3,
      transform: "translateY(-100%)",
      background: ink.text, color: ink.surface, borderRadius: 8, padding: "7px 9px",
      fontSize: 11.5, lineHeight: 1.4, boxShadow: "0 6px 18px rgba(0,0,0,.18)",
    }}>
      {children}
    </div>
  );
}

/* ------------------------------ stat tiles ----------------------------- */
// Hero figures use proportional (default) numerals — tabular-nums is for
// columns that must align vertically, which these don't.
function Stat({ ink, label, value, note }) {
  return (
    <div style={{
      background: ink.surface, border: "1px solid var(--dash-border)", borderRadius: 12,
      padding: "15px 18px 16px", minWidth: 0,
    }}>
      <div style={{ fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: ink.muted, fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 660, color: ink.text, lineHeight: 1.1, marginTop: 6, letterSpacing: "-.02em" }}>
        {value}
      </div>
      {note ? <div style={{ fontSize: 11.5, color: ink.muted, marginTop: 3 }}>{note}</div> : null}
    </div>
  );
}

/* ----------------------------- histogram ------------------------------- */
// One bar per five-year band. Single series, so no legend — the card title
// names it. The mean is drawn as a labelled rule so the headline KPI has a
// visible position in the distribution.
function AgeHistogram({ ink, bands, mean }) {
  const [ref, w] = useMeasure();
  const [hover, setHover] = React.useState(null);
  // Top padding is deep enough to hold the mean label ABOVE the plot — at the
  // mean the bars are at their tallest, so a label inside the plot collides.
  const H = 200, PAD = { l: 30, r: 10, t: 24, b: 24 };
  const iw = Math.max(0, w - PAD.l - PAD.r);
  const ih = H - PAD.t - PAD.b;
  const max = bands.reduce((m, b) => Math.max(m, b.directors), 0) || 1;
  const step = bands.length ? iw / bands.length : 0;
  const GAP = 2; // surface gap between adjacent fills
  const bw = Math.max(1, step - GAP);

  const xOf = (i) => PAD.l + i * step + GAP / 2;
  const yOf = (v) => PAD.t + ih - (v / max) * ih;
  // The mean lands between bands, so place it on the continuous age axis.
  const lo = bands.length ? bands[0].age_band : 0;
  const meanX = bands.length ? PAD.l + ((mean - lo) / (bands.length * 5)) * iw : 0;

  const ticks = [0, Math.round(max / 2), max];

  return (
    <div ref={ref} style={{ position: "relative", marginTop: 12 }}>
      {w > 0 && (
        <svg width={w} height={H} role="img" aria-label="Directors by age at peak, in five-year bands"
             onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={w - PAD.r} y1={yOf(t)} y2={yOf(t)}
                    stroke="var(--dash-border)" strokeWidth="1" shapeRendering="crispEdges" />
              <text x={PAD.l - 6} y={yOf(t) + 3.5} textAnchor="end"
                    fontSize="10" fill={ink.muted} style={{ fontVariantNumeric: "tabular-nums" }}>
                {t}
              </text>
            </g>
          ))}

          {bands.map((b, i) => {
            const h = Math.max(b.directors > 0 ? 2 : 0, (b.directors / max) * ih);
            const on = hover === i;
            return (
              <g key={b.age_band}>
                <path d={topRounded(xOf(i), PAD.t + ih - h, bw, h, 4)}
                      fill={ink.accent} opacity={hover == null || on ? 1 : 0.42} />
                {/* Hit target spans the full column height, not just the bar. */}
                <rect x={PAD.l + i * step} y={PAD.t} width={step} height={ih} fill="transparent"
                      onMouseEnter={() => setHover(i)} />
              </g>
            );
          })}

          <line x1={meanX} x2={meanX} y1={PAD.t - 4} y2={PAD.t + ih}
                stroke={ink.text2} strokeWidth="1.5" strokeDasharray="3 3" />
          <text x={Math.min(meanX + 5, w - PAD.r - 62)} y={PAD.t - 9}
                fontSize="10.5" fontWeight="650" fill={ink.text2}>
            mean {mean.toFixed(1)}
          </text>

          <line x1={PAD.l} x2={w - PAD.r} y1={PAD.t + ih} y2={PAD.t + ih}
                stroke={ink.muted} strokeWidth="1" opacity=".5" shapeRendering="crispEdges" />

          {bands.map((b, i) =>
            b.age_band % 10 === 0 ? (
              <text key={b.age_band} x={xOf(i) + bw / 2} y={H - 8} textAnchor="middle"
                    fontSize="10" fill={ink.muted} style={{ fontVariantNumeric: "tabular-nums" }}>
                {b.age_band}
              </text>
            ) : null
          )}
        </svg>
      )}

      {hover != null && bands[hover] && (
        <Tip ink={ink} width={w} x={xOf(hover) + bw / 2} y={yOf(bands[hover].directors) - 8}>
          <strong>{bands[hover].age_band}–{bands[hover].age_band + 4}</strong> years old<br />
          {bands[hover].directors.toLocaleString()} directors
        </Tip>
      )}
    </div>
  );
}

/* ---------------------------- decade series ---------------------------- */
// Mean age at peak over time — change-over-time, so a line. Crosshair on hover
// rather than per-mark targets: the reader is asking "what about this decade",
// and the nearest-x lookup answers that anywhere in the plot.
function DecadeLine({ ink, decades }) {
  const [ref, w] = useMeasure();
  const [hover, setHover] = React.useState(null);
  const H = 200, PAD = { l: 30, r: 12, t: 24, b: 24 };
  const iw = Math.max(0, w - PAD.l - PAD.r);
  const ih = H - PAD.t - PAD.b;

  // Snap to even years around the data rather than to 5s: the whole series
  // spans about eight years, and a 5-step domain wastes half the plot on
  // empty range.
  const vals = decades.map((d) => d.mean_age);
  const lo = Math.floor((Math.min(...vals, 99) - 1) / 2) * 2;
  const hi = Math.ceil((Math.max(...vals, 0) + 1) / 2) * 2;
  const xOf = (i) => PAD.l + (decades.length > 1 ? (i / (decades.length - 1)) * iw : iw / 2);
  const yOf = (v) => PAD.t + ih - ((v - lo) / (hi - lo || 1)) * ih;

  const path = decades.map((d, i) => `${i ? "L" : "M"}${xOf(i)},${yOf(d.mean_age)}`).join(" ");
  const ticks = [lo, (lo + hi) / 2, hi];

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const rel = e.clientX - r.left - PAD.l;
    const i = Math.round((rel / (iw || 1)) * (decades.length - 1));
    setHover(Math.max(0, Math.min(decades.length - 1, i)));
  };

  return (
    <div ref={ref} style={{ position: "relative", marginTop: 12 }}>
      {w > 0 && decades.length > 0 && (
        <svg width={w} height={H} role="img" aria-label="Mean age at peak by decade"
             onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={w - PAD.r} y1={yOf(t)} y2={yOf(t)}
                    stroke="var(--dash-border)" strokeWidth="1" shapeRendering="crispEdges" />
              <text x={PAD.l - 6} y={yOf(t) + 3.5} textAnchor="end"
                    fontSize="10" fill={ink.muted} style={{ fontVariantNumeric: "tabular-nums" }}>
                {t}
              </text>
            </g>
          ))}

          {hover != null && (
            <line x1={xOf(hover)} x2={xOf(hover)} y1={PAD.t} y2={PAD.t + ih}
                  stroke={ink.muted} strokeWidth="1" strokeDasharray="3 3" />
          )}

          <path d={path} fill="none" stroke={ink.accent} strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" />

          {decades.map((d, i) => (
            <circle key={d.decade} cx={xOf(i)} cy={yOf(d.mean_age)} r={hover === i ? 5.5 : 4}
                    fill={ink.accent} stroke={ink.surface} strokeWidth="2" />
          ))}

          {/* Full four-digit years: a "10s" tick is ambiguous between 1910
              and 2010 on a series that starts in the 1930s. */}
          {decades.map((d, i) =>
            i % 2 === 0 || i === decades.length - 1 ? (
              <text key={d.decade} x={xOf(i)} y={H - 8} textAnchor="middle"
                    fontSize="10" fill={ink.muted} style={{ fontVariantNumeric: "tabular-nums" }}>
                {d.decade}
              </text>
            ) : null
          )}
        </svg>
      )}

      {hover != null && decades[hover] && (
        <Tip ink={ink} width={w} x={xOf(hover)} y={yOf(decades[hover].mean_age) - 10}>
          <strong>{decades[hover].decade}s</strong><br />
          mean age {decades[hover].mean_age.toFixed(1)}<br />
          {decades[hover].directors.toLocaleString()} directors
        </Tip>
      )}
    </div>
  );
}

/* ------------------------------ the list ------------------------------- */
function Poster({ ink, src, alt, w = 44, h = 66 }) {
  const [bad, setBad] = React.useState(false);
  const frame = { width: w, height: h, borderRadius: 5, background: ink.track, flex: "none", display: "block" };
  if (!src || bad) {
    return (
      <div style={{ ...frame, display: "grid", placeItems: "center" }} aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ink.muted} strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2.5" />
          <path d="m4 16 4.5-4.5 3 3L15 11l5 5" />
        </svg>
      </div>
    );
  }
  return <img src={src} alt={alt} width={w} height={h} loading="lazy"
              onError={() => setBad(true)} style={{ ...frame, objectFit: "cover" }} />;
}

// One director's films, fetched only once their row is open. The component
// isn't mounted until then, so the query it owns never runs for the 199 rows
// nobody expands — which is what keeps the page load to a single query.
function DirectorFilms({ ink, nconst, director, givens }) {
  // Spread the page's CURRENT givens, not just the director: the query applies
  // the year floor and genre too, and passing only DIRECTOR_ID would silently
  // fall back to their defaults — so a genre-scoped row would expand to a
  // filmography that doesn't match the numbers on the row.
  const filmGivens = React.useMemo(
    () => ({ ...givens, DIRECTOR_ID: filters.oneOf(nconst) }),
    [givens, nconst]
  );
  const q = useQuery({ query: "director_films", givens: filmGivens });

  const films = React.useMemo(
    () => (q.rows || []).map((f) => ({
      tconst: f.tconst,
      title: f.title,
      release_year: num(f.release_year),
      movie_thumb: f.movie_thumb || null,
      movie_url: f.movie_url || null,
      votes: num(f.votes),
      share: num(f.share),
      average_rating: num(f.average_rating),
    })),
    [q.rows]
  );

  return (
    <div style={{ padding: "2px 0 16px 82px" }}>
      {q.error ? (
        <div style={{ color: "var(--dash-danger)", fontSize: 12.5 }}>{String(q.error)}</div>
      ) : q.loading ? (
        <div style={{ color: ink.muted, fontSize: 12.5, padding: "12px 0" }}>Loading films&hellip;</div>
      ) : films.length === 0 ? (
        <div style={{ color: ink.muted, fontSize: 12.5, padding: "12px 0" }}>No films for {director}.</div>
      ) : (
        <>
          <div style={{ fontSize: 11.5, color: ink.muted, margin: "0 0 10px" }}>
            {films.length} {films.length === 1 ? "film" : "films"}, ordered by share of release year — same
            weighting as the ranking, so the peak film leads.
          </div>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(58px, 1fr))" }}>
            {films.map((f) => (
              <a key={f.tconst} href={f.movie_url || undefined} target="_blank" rel="noopener noreferrer"
                 onClick={(e) => e.stopPropagation()}
                 title={`${f.title} (${f.release_year}) · ${(f.share * 100).toFixed(2)}% of ${f.release_year} · ${compact(f.votes)} votes · ${f.average_rating.toFixed(1)}`}
                 style={{ textDecoration: "none", color: "inherit", minWidth: 0 }}>
                <Poster ink={ink} src={f.movie_thumb} alt={`Poster for ${f.title}`} w={58} h={87} />
                <div style={{
                  fontSize: 10.5, color: ink.text2, lineHeight: 1.25, marginTop: 5,
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                }}>
                  {f.title}
                </div>
                <div style={{ fontSize: 10, color: ink.muted, marginTop: 1, fontVariantNumeric: "tabular-nums" }}>
                  {f.release_year} · {(f.share * 100).toFixed(1)}%
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DirectorRow({ ink, row, rank, maxCareer, open, onToggle, givens }) {
  const bar = maxCareer > 0 ? Math.max(row.career / maxCareer, 0.02) : 0;
  // Links inside the row stop propagation so opening IMDb doesn't also toggle.
  const stop = (e) => e.stopPropagation();
  return (
    <li style={{ borderTop: "1px solid var(--dash-border)" }}>
    <div role="button" tabIndex={0} aria-expanded={open}
      aria-label={`${open ? "Hide" : "Show"} films by ${row.director}`}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
      style={{
      display: "grid", gridTemplateColumns: "26px 44px minmax(0,1.15fr) minmax(0,1.5fr) 54px minmax(64px,.85fr) 26px",
      gap: 12, alignItems: "center", padding: "9px 0", cursor: "pointer",
      background: open ? ink.track : "transparent",
      transition: "background .12s ease",
    }}>
      <div style={{ fontSize: 11.5, color: ink.muted, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {rank}
      </div>

      <a href={row.peak_url || undefined} target="_blank" rel="noopener noreferrer" onClick={stop}
         title={`${row.peak_title} (${row.peak_year}) on IMDb`} style={{ display: "block" }}>
        <Poster ink={ink} src={row.peak_thumb} alt={`Poster for ${row.peak_title}`} />
      </a>

      <div style={{ minWidth: 0 }}>
        <a href={row.director_url || undefined} target="_blank" rel="noopener noreferrer" onClick={stop}
           title={`${row.director} on IMDb`}
           style={{
             display: "block", fontSize: 13.5, fontWeight: 620, color: ink.text, lineHeight: 1.25,
             textDecoration: "none", borderBottom: `1px solid ${ink.accent}44`,
             overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "fit-content",
           }}>
          {row.director}
        </a>
        <div style={{ fontSize: 11, color: ink.muted, marginTop: 1, fontVariantNumeric: "tabular-nums" }}>
          b. {row.birth_year} · {row.films} films
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: ink.text2, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.peak_title}
        </div>
        <div style={{ fontSize: 11, color: ink.muted, marginTop: 1, fontVariantNumeric: "tabular-nums" }}>
          {row.peak_year} · {(row.share_of_year * 100).toFixed(1)}% of the year
        </div>
      </div>

      {/* Age is the point of the dashboard, so it gets a figure of its own. */}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 19, fontWeight: 660, color: ink.text, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {row.age_at_peak}
        </div>
        <div style={{ fontSize: 9.5, color: ink.muted, letterSpacing: ".05em", textTransform: "uppercase", marginTop: 2 }}>
          yrs
        </div>
      </div>

      {/* Career share as a bar: the ranking key, shown rather than just sorted by. */}
      <div style={{ minWidth: 0 }}>
        <div style={{ height: 6, borderRadius: 3, background: ink.track, overflow: "hidden" }}>
          <div style={{ width: `${bar * 100}%`, height: "100%", borderRadius: 3, background: ink.accent }} />
        </div>
        <div style={{ fontSize: 10.5, color: ink.muted, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
          {row.career.toFixed(2)}
        </div>
      </div>

      {/* The affordance for the whole row, so it reads as a control rather
          than as decoration: a filled disc, accent-coloured once open. */}
      <div aria-hidden="true" style={{
        width: 26, height: 26, borderRadius: "50%",
        display: "grid", placeItems: "center",
        background: open ? ink.accent : ink.track,
        border: `1px solid ${open ? ink.accent : "var(--dash-border)"}`,
        transition: "background .12s ease, border-color .12s ease",
      }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
             stroke={open ? "#fff" : ink.text2} strokeWidth="3"
             strokeLinecap="round" strokeLinejoin="round"
             style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .18s ease" }}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </div>

    {open && <DirectorFilms ink={ink} nconst={row.nconst} director={row.director} givens={givens} />}
    </li>
  );
}

/* ------------------------------- controls ------------------------------ */
// Both givens are filter<number> thresholds. filters.atLeast builds the
// expression; never hand-concatenate one.
function Segmented({ ink, label, hint, options, current, onPick }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 7 }}>
        <span style={{ fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: ink.muted, fontWeight: 700 }}>
          {label}
        </span>
        <span style={{ fontSize: 11.5, color: ink.muted }}>{hint}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {options.map((o) => {
          const on = o.value === current;
          return (
            <button key={o.text} type="button" onClick={() => onPick(o.value)} aria-pressed={on}
              style={{
                font: "inherit", fontSize: 12.5, cursor: "pointer", lineHeight: 1.15,
                padding: "5px 10px", borderRadius: 7,
                border: `1px solid ${on ? ink.accent : "var(--dash-border)"}`,
                background: on ? ink.accent : ink.surface,
                color: on ? "#fff" : ink.text2,
                fontWeight: on ? 650 : 500,
                transition: "background .12s ease, border-color .12s ease",
              }}>
              {o.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// A native <select>: 22 genres is too many for a chip row, and the OS menu
// gives keyboard and touch behaviour for free. Empty value = every genre,
// because an empty filter expression matches every row.
function Dropdown({ ink, label, hint, options, current, onPick }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 7 }}>
        <span style={{ fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: ink.muted, fontWeight: 700 }}>
          {label}
        </span>
        <span style={{ fontSize: 11.5, color: ink.muted }}>{hint}</span>
      </div>
      <div style={{ position: "relative", maxWidth: 220 }}>
        <select
          value={current}
          onChange={(e) => onPick(e.target.value)}
          style={{
            font: "inherit", fontSize: 12.5, width: "100%", boxSizing: "border-box",
            appearance: "none", cursor: "pointer",
            padding: "6px 28px 6px 10px", borderRadius: 7,
            border: `1px solid ${current ? ink.accent : "var(--dash-border)"}`,
            background: ink.surface, color: current ? ink.text : ink.text2,
            fontWeight: current ? 650 : 500, outline: "none",
          }}>
          <option value="">All genres</option>
          {options.map((o) => (
            <option key={o.genre} value={o.genre}>
              {o.genre} ({o.title_count.toLocaleString()})
            </option>
          ))}
        </select>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={ink.muted} strokeWidth="2.5"
             strokeLinecap="round" strokeLinejoin="round"
             style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </div>
  );
}

const YEAR_FLOORS = [
  { value: 0, text: "All years" },
  { value: 5, text: "5+" },
  { value: 20, text: "20+" },
  { value: 50, text: "50+" },
];
const FILM_FLOORS = [
  { value: 1, text: "Any" },
  { value: 3, text: "3+" },
  { value: 5, text: "5+" },
  { value: 10, text: "10+" },
];

// Read a threshold expression ('>= 20') back to its number.
const readThreshold = (src, fallback) => {
  if (!src) return fallback;
  try {
    const t = filters.threshold(String(src));
    if (t && t.value != null) return +t.value;
  } catch (e) {}
  const m = String(src).match(/-?\d+(\.\d+)?/);
  return m ? +m[0] : fallback;
};

/* ------------------------------- dashboard ----------------------------- */
export default function Dashboard({ dashboard, givens }) {
  const { ink } = useTheme();
  const gYear = useGiven("MIN_YEAR_TITLES");
  const gFilms = useGiven("MIN_FILMS");
  const gGenre = useGiven("GENRE");

  const yearFloor = readThreshold(gYear.value, 20);
  const filmFloor = readThreshold(gFilms.value, 3);
  const genre = unwrap(gGenre.value);

  const q = useQuery({ query: "director_peaks_dash", givens });
  const row = (q.rows || [])[0];

  const genresQ = useQuery({ query: "genre_options", givens });
  const genreOptions = React.useMemo(
    () => (genresQ.rows || [])
      .map((r) => ({ genre: r.genre, title_count: num(r.title_count) }))
      .filter((o) => o.genre),
    [genresQ.rows]
  );

  const bands = React.useMemo(
    () => (row?.age_distribution || [])
      .map((b) => ({ age_band: num(b.age_band), directors: num(b.directors) }))
      .sort((a, b) => a.age_band - b.age_band),
    [row]
  );

  const decades = React.useMemo(
    () => (row?.age_by_decade || [])
      .map((d) => ({ decade: num(d.peak_decade), mean_age: num(d.mean_peak_age), directors: num(d.directors) }))
      .filter((d) => d.decade > 0)
      .sort((a, b) => a.decade - b.decade),
    [row]
  );

  const list = React.useMemo(
    () => (row?.top_directors || []).map((r) => ({
      nconst: r.nconst,
      director: r.director,
      director_url: r.director_url || null,
      birth_year: num(r.birth_year),
      peak_title: r.peak_title,
      peak_year: num(r.peak_year),
      peak_thumb: r.peak_thumb || null,
      peak_url: r.peak_url || null,
      age_at_peak: num(r.age_at_peak),
      share_of_year: num(r.share_of_year),
      films: num(r.films),
      career: num(r.career),
    })),
    [row]
  );

  const maxCareer = list.reduce((m, r) => Math.max(m, r.career), 0);
  const meanAge = num(row?.avg_age);

  // Which row is expanded, in the URL so an opened filmography is shareable.
  // One at a time: two open panels push the rest of a 200-row list off screen.
  const [openId, setOpenId] = useUrlState("open", "");

  // Keep the last good result on screen while a new one loads, so changing a
  // control dims the page rather than flashing it empty.
  const last = React.useRef(null);
  if (row) last.current = row;
  const stale = q.loading && !row && last.current;

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 24px 56px", color: "var(--dash-fg)" }}>
      <h1 style={{ fontSize: 23, fontWeight: 680, letterSpacing: "-.022em", margin: "0 0 4px" }}>
        {dashboard.title}
      </h1>
      <p style={{ color: ink.muted, fontSize: 13.5, lineHeight: 1.5, margin: "0 0 20px", maxWidth: 640 }}>
        Raw vote counts favour recent films, so a director&rsquo;s &ldquo;biggest&rdquo; film is measured here
        as its <strong style={{ color: ink.text2 }}>share of every vote cast for its release year</strong>.
        That puts 1976 and 2013 on the same footing &mdash; and moves most peaks a decade earlier.
      </p>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 20,
        background: ink.surface, border: "1px solid var(--dash-border)", borderRadius: 12,
        padding: "14px 18px 16px", marginBottom: 16,
      }}>
        <Segmented ink={ink} label="Films in release year" hint="drops thin years"
          options={YEAR_FLOORS} current={yearFloor}
          onPick={(v) => gYear.set(filters.atLeast(v))} />
        <Segmented ink={ink} label="Films by director" hint="needs a body of work"
          options={FILM_FLOORS} current={filmFloor}
          onPick={(v) => gFilms.set(filters.atLeast(v))} />
        <Dropdown ink={ink} label="Genre" hint="scopes the peak"
          options={genreOptions} current={genre}
          onPick={(v) => gGenre.set(v ? filters.oneOf(v) : "")} />
      </div>

      {q.error ? (
        <div style={{ color: "var(--dash-danger)", fontSize: 13 }}>{String(q.error)}</div>
      ) : !row && q.loading ? (
        <div style={{ color: ink.muted, fontSize: 13, padding: "60px 0", textAlign: "center" }}>Loading&hellip;</div>
      ) : !row ? (
        <div style={{ color: ink.muted, fontSize: 13.5, padding: "60px 0", textAlign: "center" }}>
          No directors match these thresholds.
        </div>
      ) : (
        <div style={{ opacity: stale ? 0.45 : 1, transition: "opacity .15s ease" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 12 }}>
            <Stat ink={ink} label="Directors" value={num(row.director_count).toLocaleString()}
                  note={`${filmFloor}+ ${genre ? `${genre.toLowerCase()} ` : ""}films, born on record`} />
            <Stat ink={ink} label="Mean age at peak" value={meanAge.toFixed(1)} note="years old" />
            <Stat ink={ink} label="Mean peak year" value={Math.round(num(row.avg_peak_year))}
                  note="when the peak film came out" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginBottom: 12 }}>
            <Card ink={ink} title="Age at peak" sub="Directors per five-year band">
              <AgeHistogram ink={ink} bands={bands} mean={meanAge} />
            </Card>
            <Card ink={ink} title="Peak age over time" sub="Mean age at peak, by the decade of the peak film">
              <DecadeLine ink={ink} decades={decades} />
            </Card>
          </div>

          <Card ink={ink} title={genre ? `${genre} directors by career share` : "Directors by career share"}
                sub={`Career share sums every ${genre ? `${genre.toLowerCase()} ` : ""}film's share of its release year — a career measured in whole years of attention. Top ${list.length}; click a row for the filmography.`}>
            <ol style={{ listStyle: "none", margin: "12px 0 0", padding: 0 }}>
              {list.map((r, i) => (
                <DirectorRow key={r.nconst || r.director} ink={ink} row={r} rank={i + 1} maxCareer={maxCareer}
                  givens={givens}
                  open={openId === r.nconst}
                  onToggle={() => setOpenId(openId === r.nconst ? "" : r.nconst)} />
              ))}
            </ol>
          </Card>
        </div>
      )}
    </div>
  );
}
