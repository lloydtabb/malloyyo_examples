// @ts-nocheck
// People that worked together — pick a person, see everyone they make films
// with, and the films they share.
//
// The collaborator list is the navigation: clicking a collaborator makes THEM
// the subject. That turns a lookup into a walk — Tom Hanks → Spielberg →
// Kaminski → whoever — which is the thing this data is actually good for, and
// it costs one line because "who is the subject" is just the NAME given.
//
// Two queries rather than one: person_summary is small and settles fast, and
// collaborators is the expensive one. Splitting them lets the header paint
// while the shelves are still coming.
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

// A given holds a filter EXPRESSION ('Tom Hanks'), not a bare value. Unwrap for
// display, re-wrap with filters.oneOf when writing back.
const unwrap = (src) => {
  if (!src) return "";
  try { const v = filters.values(src); if (Array.isArray(v) && v.length) return String(v[0]); } catch (e) {}
  return String(src).replace(/^'|'$/g, "");
};

const prettyRole = (r) => String(r || "").replace(/_/g, " ");

// Debounce the typed term so a query fires per pause, not per keystroke.
function useDebounced(value, ms) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/* ------------------------------- chrome -------------------------------- */
function Card({ ink, title, sub, children, style }) {
  return (
    <section style={{
      background: ink.surface, border: "1px solid var(--dash-border)", borderRadius: 12,
      padding: "16px 18px 16px", minWidth: 0, ...style,
    }}>
      <h2 style={{ fontSize: 13.5, fontWeight: 660, margin: 0, color: ink.text, letterSpacing: "-.01em" }}>{title}</h2>
      {sub ? <p style={{ fontSize: 12, color: ink.muted, margin: "3px 0 0", lineHeight: 1.4 }}>{sub}</p> : null}
      {children}
    </section>
  );
}

function Tip({ ink, x, y, width, children }) {
  const w = 150;
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

function Stat({ ink, label, value, note }) {
  return (
    <div style={{
      background: ink.surface, border: "1px solid var(--dash-border)", borderRadius: 12,
      padding: "15px 18px 16px", minWidth: 0,
    }}>
      <div style={{ fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: ink.muted, fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 660, color: ink.text, lineHeight: 1.1, marginTop: 6, letterSpacing: "-.02em" }}>
        {value}
      </div>
      {note ? <div style={{ fontSize: 11.5, color: ink.muted, marginTop: 3 }}>{note}</div> : null}
    </div>
  );
}

// A person's name is already the "make them the subject" control, so IMDb gets
// its own small target rather than competing for the same click.
function ImdbLink({ ink, url, who, size = 13 }) {
  const [hot, setHot] = React.useState(false);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
       title={`${who} on IMDb`} aria-label={`${who} on IMDb`}
       onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
       style={{ display: "inline-flex", alignItems: "center", flex: "none", color: hot ? ink.accent : ink.muted }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 4h6v6" /><path d="M20 4 11 13" />
        <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
      </svg>
    </a>
  );
}

function RoleChips({ ink, roles, max = 4 }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {roles.slice(0, max).map((r) => (
        <span key={r.role} style={{
          fontSize: 10.5, lineHeight: 1.3, padding: "2px 7px", borderRadius: 5,
          background: ink.track, color: ink.text2, whiteSpace: "nowrap",
        }}>
          {prettyRole(r.role)}
          <span style={{ color: ink.muted, marginLeft: 4, fontVariantNumeric: "tabular-nums" }}>{r.title_count}</span>
        </span>
      ))}
    </div>
  );
}

/* ------------------------------ the picker ----------------------------- */
// Typeahead over person_search. Both directions go through the filter helpers
// rather than string-building: the typed term is committed as
// filters.contains(term) into the PERSON_SEARCH given, and the chosen name as
// filters.oneOf(name) into NAME. A given's value is an EXPRESSION, so a raw
// name containing a comma would otherwise parse as two alternatives and match
// nothing.
function PersonPicker({ ink, current, givens, onPick }) {
  // The term lives in the URL (as ~q) rather than in useState, so a search in
  // progress is part of the shareable link like every other bit of view state.
  const [typed, setTyped] = useUrlState("q", "");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const boxRef = React.useRef(null);

  const term = useDebounced(String(typed || "").trim(), 180);

  // Show matches as soon as there are any — including on load, when the term
  // arrived in the URL rather than from the keyboard.
  React.useEffect(() => { if (term.length >= 2) setOpen(true); }, [term]);
  // Two characters before querying: one letter matches most of the 141k names
  // and the result is noise either way.
  const searchGivens = React.useMemo(
    () => ({ ...givens, PERSON_SEARCH: term.length >= 2 ? filters.contains(term.toLowerCase()) : "" }),
    [givens, term]
  );
  const searchQ = useQuery({ query: "person_search", givens: searchGivens });

  const list = React.useMemo(
    () => (term.length >= 2 ? (searchQ.rows || []).map((r) => r.name).filter(Boolean) : []),
    [searchQ.rows, term]
  );

  React.useEffect(() => {
    const away = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const commit = (name) => {
    if (!name) return;
    onPick(name);
    setTyped("");
    setOpen(false);
  };

  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, list.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); commit(list[active] || typed.trim()); }
    else if (e.key === "Escape") { setOpen(false); }
  };

  return (
    <div ref={boxRef} style={{ position: "relative", maxWidth: 380 }}>
      <div style={{ position: "relative" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={ink.muted} strokeWidth="2"
             style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          value={typed}
          placeholder={current ? `${current} — search for someone else` : "Search for a person"}
          onChange={(e) => { setTyped(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          style={{
            font: "inherit", fontSize: 13.5, width: "100%", boxSizing: "border-box",
            padding: "9px 12px 9px 32px", borderRadius: 9,
            border: "1px solid var(--dash-border)", background: ink.surface, color: ink.text,
            outline: "none",
          }}
        />
      </div>

      {open && term.length >= 2 && list.length === 0 && !searchQ.loading && (
        <div style={{
          position: "absolute", zIndex: 6, top: "calc(100% + 4px)", left: 0, right: 0,
          padding: "9px 11px", fontSize: 12.5, color: ink.muted,
          background: ink.surface, border: "1px solid var(--dash-border)", borderRadius: 9,
          boxShadow: "0 10px 26px rgba(0,0,0,.16)",
        }}>
          Nobody matching &ldquo;{term}&rdquo;.
        </div>
      )}

      {open && list.length > 0 && (
        <ul style={{
          position: "absolute", zIndex: 6, top: "calc(100% + 4px)", left: 0, right: 0,
          listStyle: "none", margin: 0, padding: 4,
          background: ink.surface, border: "1px solid var(--dash-border)", borderRadius: 9,
          boxShadow: "0 10px 26px rgba(0,0,0,.16)", maxHeight: 280, overflowY: "auto",
        }}>
          {list.map((name, i) => (
            <li key={name}>
              {/* onMouseDown, not onClick: the outside-mousedown handler that
                  dismisses this list fires first and unmounts the button
                  before mouseup, so a click handler never lands. */}
              <button type="button"
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); commit(name); }}
                style={{
                  font: "inherit", fontSize: 13, width: "100%", textAlign: "left", cursor: "pointer",
                  padding: "7px 9px", borderRadius: 6, border: "none",
                  background: i === active ? ink.track : "transparent",
                  color: ink.text,
                }}>
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ----------------------------- career strip ---------------------------- */
// Films per year across the person's whole span. Years with no film are real
// gaps, so the axis runs continuously from first to last rather than skipping
// the empty ones — a compressed axis would hide every hiatus.
function CareerStrip({ ink, career }) {
  const [ref, w] = useMeasure();
  const [hover, setHover] = React.useState(null);

  const years = React.useMemo(() => {
    if (!career.length) return [];
    const lo = career[0].release_year, hi = career[career.length - 1].release_year;
    const byYear = new Map(career.map((c) => [c.release_year, c.title_count]));
    return Array.from({ length: hi - lo + 1 }, (_, i) => ({ year: lo + i, count: byYear.get(lo + i) || 0 }));
  }, [career]);

  const H = 92, PAD = { l: 0, r: 0, t: 8, b: 18 };
  const ih = H - PAD.t - PAD.b;
  const max = years.reduce((m, y) => Math.max(m, y.count), 0) || 1;
  const step = years.length ? w / years.length : 0;
  const bw = Math.max(1, step - 2); // 2px surface gap between adjacent fills

  return (
    <div ref={ref} style={{ position: "relative", marginTop: 12 }}>
      {w > 0 && years.length > 0 && (
        <svg width={w} height={H} role="img" aria-label="Films per year" onMouseLeave={() => setHover(null)}>
          {years.map((y, i) => {
            const h = y.count ? Math.max((y.count / max) * ih, 3) : 0;
            const on = hover === i;
            return (
              <g key={y.year}>
                {h > 0 && (
                  <path d={topRounded(i * step + 1, PAD.t + ih - h, bw, h, 3)}
                        fill={ink.accent} opacity={hover == null || on ? 1 : 0.4} />
                )}
                <rect x={i * step} y={PAD.t} width={step} height={ih} fill="transparent"
                      onMouseEnter={() => setHover(i)} />
              </g>
            );
          })}
          <line x1={0} x2={w} y1={PAD.t + ih} y2={PAD.t + ih}
                stroke={ink.muted} strokeWidth="1" opacity=".45" shapeRendering="crispEdges" />
          {years.map((y, i) =>
            y.year % 10 === 0 ? (
              <text key={y.year} x={i * step + bw / 2} y={H - 5} textAnchor="middle"
                    fontSize="10" fill={ink.muted} style={{ fontVariantNumeric: "tabular-nums" }}>
                {y.year}
              </text>
            ) : null
          )}
        </svg>
      )}
      {hover != null && years[hover] && (
        <Tip ink={ink} width={w} x={hover * step + bw / 2} y={PAD.t + ih - (years[hover].count / max) * ih - 6}>
          <strong>{years[hover].year}</strong><br />
          {years[hover].count} {years[hover].count === 1 ? "film" : "films"}
        </Tip>
      )}
    </div>
  );
}

/* ------------------------------- shelves ------------------------------- */
function Poster({ ink, film }) {
  const [bad, setBad] = React.useState(false);
  const [hot, setHot] = React.useState(false);
  const frame = {
    width: 46, height: 69, borderRadius: 5, background: ink.track, flex: "none", display: "block",
    transition: "transform .12s ease, box-shadow .12s ease",
    transform: hot ? "translateY(-2px)" : "none",
    boxShadow: hot ? "0 6px 14px rgba(0,0,0,.22)" : "none",
  };
  return (
    <a href={film.movie_url || undefined} target="_blank" rel="noopener noreferrer"
       title={`${film.title} (${film.release_year}) · ${compact(film.votes)} votes · ${film.average_rating.toFixed(1)}`}
       onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
       style={{ flex: "none", display: "block" }}>
      {film.movie_thumb && !bad ? (
        <img src={film.movie_thumb} alt={`Poster for ${film.title}`} width={46} height={69} loading="lazy"
             onError={() => setBad(true)} style={{ ...frame, objectFit: "cover" }} />
      ) : (
        <div style={{ ...frame, display: "grid", placeItems: "center" }} aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ink.muted} strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2.5" />
            <path d="m4 16 4.5-4.5 3 3L15 11l5 5" />
          </svg>
        </div>
      )}
    </a>
  );
}

function CollaboratorRow({ ink, row, rank, onPick }) {
  return (
    <li style={{
      display: "grid", gridTemplateColumns: "24px minmax(0, 210px) 1fr", gap: 14,
      alignItems: "start", padding: "13px 0", borderTop: "1px solid var(--dash-border)",
    }}>
      <div style={{ fontSize: 11.5, color: ink.muted, textAlign: "right", paddingTop: 3, fontVariantNumeric: "tabular-nums" }}>
        {rank}
      </div>

      <div style={{ minWidth: 0 }}>
        {/* The name is the navigation — clicking makes this person the subject.
            IMDb sits beside it as a separate target. */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <button type="button" onClick={() => onPick(row.person)}
            title={`Show who ${row.person} works with`}
            style={{
              font: "inherit", fontSize: 13.5, fontWeight: 620, cursor: "pointer",
              border: "none", background: "none", padding: 0, textAlign: "left",
              color: ink.text, lineHeight: 1.25,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
              borderBottom: `1px solid ${ink.accent}44`,
            }}>
            {row.person}
          </button>
          <ImdbLink ink={ink} url={row.person_url} who={row.person} size={12} />
        </div>
        <div style={{ fontSize: 11.5, color: ink.muted, margin: "3px 0 6px", fontVariantNumeric: "tabular-nums" }}>
          {/* total_ratings is votes ÷ 1000 in the model — scale back before
              compacting, or the suffix gets applied twice. */}
          {row.shared_films} {row.shared_films === 1 ? "film" : "films"} together · {compact(Math.round(row.total_ratings * 1000))} ratings
        </div>
        <RoleChips ink={ink} roles={row.roles} max={3} />
      </div>

      {/* Scrolls rather than wraps: the shelf is a ranked strip, and wrapping
          would make a 12-film collaborator taller than a 2-film one. */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, minWidth: 0 }}>
        {row.films.map((f) => <Poster key={f.tconst} ink={ink} film={f} />)}
      </div>
    </li>
  );
}

/* ------------------------------- dashboard ----------------------------- */
export default function Dashboard({ dashboard, givens }) {
  const { ink } = useTheme();
  const gName = useGiven("NAME");
  const person = unwrap(gName.value);

  const summaryQ = useQuery({ query: "person_summary", givens });
  const collabQ = useQuery({ query: "collaborators", givens });

  const s = (summaryQ.rows || [])[0];

  const roles = React.useMemo(
    () => (s?.roles || []).map((r) => ({ role: r.role, title_count: num(r.title_count) })).filter((r) => r.role),
    [s]
  );

  // NAME matches on primaryName, which isn't unique. Usually one id; when it's
  // more, the headline numbers are a merge of several real people and the page
  // should say so rather than quietly presenting them as one career.
  const ids = React.useMemo(
    () => (s?.ids || [])
      .map((x) => ({ url: x.person_url, title_count: num(x.title_count) }))
      .filter((x) => x.url),
    [s]
  );

  const career = React.useMemo(
    () => (s?.career || [])
      .map((c) => ({ release_year: num(c.release_year), title_count: num(c.title_count) }))
      .filter((c) => c.release_year > 0)
      .sort((a, b) => a.release_year - b.release_year),
    [s]
  );

  const collaborators = React.useMemo(
    () => (collabQ.rows || []).map((r) => ({
      person: r.person,
      person_url: r.person_url || null,
      shared_films: num(r.shared_films),
      total_ratings: num(r.total_ratings),
      roles: (r.roles || []).map((x) => ({ role: x.role, title_count: num(x.title_count) })).filter((x) => x.role),
      films: (r.films || []).map((f) => ({
        tconst: f.tconst,
        title: f.title,
        release_year: num(f.release_year),
        movie_thumb: f.movie_thumb || null,
        movie_url: f.movie_url || null,
        votes: num(f.votes),
        average_rating: num(f.average_rating),
      })),
    })).filter((c) => c.person),
    [collabQ.rows]
  );

  // Keep the previous list on screen while a new person loads, so switching
  // subject dims the page rather than flashing it empty.
  const last = React.useRef([]);
  if (collaborators.length) last.current = collaborators;
  const shown = collaborators.length ? collaborators : collabQ.loading ? last.current : collaborators;
  const stale = collabQ.loading && collaborators.length === 0 && last.current.length > 0;

  const pick = (name) => gName.set(filters.oneOf(name));

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 24px 56px", color: "var(--dash-fg)" }}>
      <h1 style={{ fontSize: 23, fontWeight: 680, letterSpacing: "-.022em", margin: "0 0 4px" }}>
        {dashboard.title}
      </h1>
      <p style={{ color: ink.muted, fontSize: 13.5, lineHeight: 1.5, margin: "0 0 16px", maxWidth: 620 }}>
        Everyone <strong style={{ color: ink.text2 }}>{person || "—"}</strong>
        {ids.length === 1 ? (
          <span style={{ display: "inline-flex", verticalAlign: "-2px", marginLeft: 5 }}>
            <ImdbLink ink={ink} url={ids[0].url} who={person} size={13} />
          </span>
        ) : null}{" "}
        has been credited alongside, ranked by how many films they share. Click any collaborator to
        make them the subject and keep walking.
      </p>

      {ids.length > 1 && (
        <p style={{
          fontSize: 12.5, lineHeight: 1.5, margin: "0 0 16px", padding: "9px 12px",
          borderRadius: 9, background: ink.track, color: ink.text2, maxWidth: 620,
        }}>
          <strong>{ids.length} different people</strong> on IMDb share the name &ldquo;{person}&rdquo;, so
          the figures below merge them.{" "}
          {ids.map((x, i) => (
            <a key={x.url} href={x.url} target="_blank" rel="noopener noreferrer"
               style={{ color: ink.accent, marginRight: 8 }}>
              {x.url.split("/").pop()} ({x.title_count})
            </a>
          ))}
        </p>
      )}

      <div style={{ marginBottom: 18 }}>
        <PersonPicker ink={ink} current={person} givens={givens} onPick={pick} />
      </div>

      {summaryQ.error || collabQ.error ? (
        <div style={{ color: "var(--dash-danger)", fontSize: 13 }}>
          {String(summaryQ.error || collabQ.error)}
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 12 }}>
            <Stat ink={ink} label="Films" value={s ? num(s.title_count).toLocaleString() : "—"}
                  note="with 5,000+ ratings" />
            <Stat ink={ink} label="Total ratings" value={s ? compact(Math.round(num(s.total_ratings) * 1000)) : "—"}
                  note="across every film" />
            <Stat ink={ink} label="Mean rating" value={s ? num(s.average_rating).toFixed(1) : "—"}
                  note="unweighted, per film" />
            <div style={{
              background: ink.surface, border: "1px solid var(--dash-border)", borderRadius: 12,
              padding: "15px 18px 16px", minWidth: 0,
            }}>
              <div style={{ fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: ink.muted, fontWeight: 700, marginBottom: 9 }}>
                Roles
              </div>
              <RoleChips ink={ink} roles={roles} max={5} />
            </div>
          </div>

          {career.length > 1 && (
            <Card ink={ink} title="Career" sub={`Films per year, ${career[0].release_year}–${career[career.length - 1].release_year}`}
                  style={{ marginBottom: 12 }}>
              <CareerStrip ink={ink} career={career} />
            </Card>
          )}

          <Card ink={ink} title="Collaborators" sub="Ranked by films shared, then by total ratings">
            {collabQ.loading && shown.length === 0 ? (
              <div style={{ color: ink.muted, fontSize: 13, padding: "50px 0", textAlign: "center" }}>Loading&hellip;</div>
            ) : shown.length === 0 ? (
              <div style={{ color: ink.muted, fontSize: 13.5, padding: "50px 0", textAlign: "center" }}>
                No collaborators found for {person || "this person"}.
              </div>
            ) : (
              <ol style={{
                listStyle: "none", margin: "12px 0 0", padding: 0,
                opacity: stale ? 0.45 : 1, transition: "opacity .15s ease",
              }}>
                {/* Keyed on the IMDb id, not the name — the query groups by
                    person, and two different people can share a primaryName. */}
                {shown.map((c, i) => (
                  <CollaboratorRow key={c.person_url || c.person} ink={ink} row={c} rank={i + 1} onPick={pick} />
                ))}
              </ol>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
