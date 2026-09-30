import React from "react";
import { useQuery } from "@malloyyo/dashboard";

const IMDB_DATA = "https://developer.imdb.com/non-commercial-datasets/";
const TMDB = "https://www.themoviedb.org/";

const A = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--dash-accent)", textDecoration: "none", fontWeight: 600 }}>
    {children}
  </a>
);

// TMDB's official long wordmark, downloaded from
// themoviedb.org/about/logos-attribution. Their terms require the logo shown
// alongside the credit line wherever their data or images are used, so it's
// inlined here (as on the landing page) rather than hotlinked. The gradient
// id is namespaced so it can't collide with anything else on the page.
const TmdbLogo = () => (
  <svg viewBox="0 0 489.04 35.4" width="132" height="9.6" role="img"
       aria-label="TMDB" style={{ display: "block", flex: "none" }}>
    <defs>
      <linearGradient id="tmdb-wordmark-about" y1="17.7" x2="489.04" y2="17.7" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#90cea1" />
        <stop offset="0.56" stopColor="#3cbec9" />
        <stop offset="1" stopColor="#00b3e5" />
      </linearGradient>
    </defs>
    <path fill="url(#tmdb-wordmark-about)" d="M293.5,0h8.9l8.75,23.2h.1L320.15,0h8.35L313.9,35.4h-6.25Zm46.6,0h7.8V35.4h-7.8Zm22.2,0h24.05V7.2H370.1v6.6h15.35V21H370.1v7.2h17.15v7.2H362.3Zm55,0H429a33.54,33.54,0,0,1,8.07,1A18.55,18.55,0,0,1,443.75,4a15.1,15.1,0,0,1,4.52,5.53A18.5,18.5,0,0,1,450,17.8a16.91,16.91,0,0,1-1.63,7.58,16.37,16.37,0,0,1-4.37,5.5,19.52,19.52,0,0,1-6.35,3.37A24.59,24.59,0,0,1,430,35.4H417.29Zm7.81,28.2h4a21.57,21.57,0,0,0,5-.55,10.87,10.87,0,0,0,4-1.83,8.69,8.69,0,0,0,2.67-3.34,11.92,11.92,0,0,0,1-5.08,9.87,9.87,0,0,0-1-4.52,9,9,0,0,0-2.62-3.18,11.68,11.68,0,0,0-3.88-1.88,17.43,17.43,0,0,0-4.67-.62h-4.6ZM461.24,0h13.2a34.42,34.42,0,0,1,4.63.32,12.9,12.9,0,0,1,4.17,1.3,7.88,7.88,0,0,1,3,2.73A8.34,8.34,0,0,1,487.39,9a7.42,7.42,0,0,1-1.67,5,9.28,9.28,0,0,1-4.43,2.82v.1a10,10,0,0,1,3.18,1,8.38,8.38,0,0,1,2.45,1.85,7.79,7.79,0,0,1,1.57,2.62,9.16,9.16,0,0,1,.55,3.2,8.52,8.52,0,0,1-1.2,4.68,9.42,9.42,0,0,1-3.1,3,13.38,13.38,0,0,1-4.27,1.65,23.11,23.11,0,0,1-4.73.5h-14.5ZM469,14.15h5.65a8.16,8.16,0,0,0,1.78-.2A4.78,4.78,0,0,0,478,13.3a3.34,3.34,0,0,0,1.13-1.2,3.63,3.63,0,0,0,.42-1.8,3.22,3.22,0,0,0-.47-1.82,3.33,3.33,0,0,0-1.23-1.13,5.77,5.77,0,0,0-1.7-.58,10.79,10.79,0,0,0-1.85-.17H469Zm0,14.65h7a8.91,8.91,0,0,0,1.83-.2,4.78,4.78,0,0,0,1.67-.7,4,4,0,0,0,1.23-1.3,3.71,3.71,0,0,0,.47-2,3.13,3.13,0,0,0-.62-2A4,4,0,0,0,479,21.45,7.83,7.83,0,0,0,477,20.9a15.12,15.12,0,0,0-2.05-.15H469Zm-265,6.53H271a17.66,17.66,0,0,0,17.66-17.66h0A17.67,17.67,0,0,0,271,0H204.06A17.67,17.67,0,0,0,186.4,17.67h0A17.66,17.66,0,0,0,204.06,35.33ZM10.1,6.9H0V0H28V6.9H17.9V35.4H10.1ZM39,0h7.8V13.2H61.9V0h7.8V35.4H61.9V20.1H46.75V35.4H39ZM80.2,0h24V7.2H88v6.6h15.35V21H88v7.2h17.15v7.2h-25Zm55,0H147l8.15,23.1h.1L163.45,0H175.2V35.4h-7.8V8.25h-.1L158,35.4h-5.95l-9-27.15H143V35.4h-7.8Z" />
  </svg>
);

export default function Dashboard({ dashboard }) {
  const { rows } = useQuery({ query: "about" });
  const count = rows && rows[0] ? Number(rows[0].title_count) : null;

  const h3 = { fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--dash-muted)", margin: "28px 0 8px" };
  const p = { margin: "0 0 12px", lineHeight: 1.65 };
  const code = { fontFamily: "ui-monospace, Menlo, monospace", background: "var(--dash-control-bg)", border: "1px solid var(--dash-border)", borderRadius: 6, padding: "1px 6px", fontSize: "0.9em" };

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: 24, color: "var(--dash-fg)" }}>
      <h1 style={{ marginBottom: 4 }}>{dashboard.title}</h1>
      <p style={{ ...p, color: "var(--dash-muted)" }}>
        Films from IMDb with more than 5,000 ratings &mdash; who made them, who appeared in them, and how they
        were rated.
      </p>

      <p style={p}>
        Created with <A href="https://github.com/malloydata/malloyyo">Malloyyo</A> by lloyd tabb. The source is on
        GitHub at <A href="https://github.com/lloydtabb/malloyyo-imdb">lloydtabb/malloyyo-imdb</A>.
      </p>

      <h3 style={h3}>How it works</h3>
      <p style={p}>
        The dataset{count != null && <> — <strong>{count.toLocaleString()}</strong> titles</>} comes from the{" "}
        <A href={IMDB_DATA}>IMDb non-commercial datasets</A>, cleaned and ranked into{" "}
        <span style={code}>titles</span>, <span style={code}>principals</span> and{" "}
        <span style={code}>names</span> Parquet files under <span style={code}>docs/</span>. Poster images are
        matched by IMDb id to <A href={TMDB}>TMDB</A> artwork. A Malloy semantic model
        (<span style={code}>imdb.malloy</span>) defines the sources and the query behind each dashboard.
      </p>
      <p style={p}>
        Every query runs <strong>entirely in your browser</strong>: DuckDB-WASM queries the Parquet files directly,
        so there is no server and no database to run.
      </p>
      <p style={p}>
        The dashboards are compiled to a static site with <span style={code}>malloyyo dashboard bundle</span> and
        hosted on <A href="https://pages.github.com">GitHub Pages</A>. A weekly GitHub Actions job re-downloads the
        IMDb data and refreshes the Parquet files, so the numbers stay current with no manual rebuild.
      </p>

      <h3 style={h3}>The dashboards</h3>
      <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
        <li><strong>Genre Combinations</strong> — pick a genre and see its strongest pairings, shelf by shelf.</li>
        <li><strong>People that worked together</strong> — everyone who's shared a credit with a given cast or crew member, and the films they made together.</li>
      </ul>

      <h3 style={h3}>Credits</h3>
      <p style={p}>
        Titles, cast, crew and ratings from the <A href={IMDB_DATA}>IMDb non-commercial datasets</A>.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 11, margin: "0 0 10px" }}>
        <A href={TMDB}>
          <TmdbLogo />
        </A>
      </div>
      <p style={p}>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
    </div>
  );
}
