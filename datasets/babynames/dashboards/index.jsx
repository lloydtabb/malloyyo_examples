// Landing page for the published site (`malloyyo dashboard bundle`).
//
// Plain React — no Malloy, no DuckDB. The bundler compiles this in its own pass
// so the intro page stays small; the heavy runtime only loads when you open a
// dashboard. `dashboards` is injected by the build: {name, title, description, href}.

const REPO = "https://github.com/malloydata/malloyyo-babynames";
const MALLOYYO = "https://github.com/malloydata/malloyyo";
const MALLOY = "https://malloydata.dev";
const SSA = "https://www.ssa.gov/oact/babynames/limits.html";
const PARQUET =
  "https://storage.googleapis.com/malloyyo/baby_names/baby_names.parquet";

const S = `
.lp{max-width:820px;margin:0 auto;padding:44px 22px 80px}
.lp h1{font-size:30px;line-height:1.15;margin:0 0 10px;letter-spacing:-.02em;font-weight:680}
.lp .sub{color:var(--muted);font-size:17px;margin:0 0 30px;line-height:1.5}
.lp h2{font-size:13px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin:38px 0 14px;font-weight:600}
.lp p{margin:0 0 14px}
.lp a{color:var(--accent)}
.lp code{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--card);border:1px solid var(--line);border-radius:5px;padding:1px 5px}
.lp pre{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;overflow-x:auto;margin:0 0 14px}
.lp pre code{background:none;border:0;padding:0;font-size:12.5px;line-height:1.55}
.cards{list-style:none;padding:0;margin:0;display:grid;gap:10px}
.cards a{display:flex;flex-direction:column;gap:3px;padding:16px 18px;border:1px solid var(--line);border-radius:12px;background:var(--card);text-decoration:none;color:inherit}
.cards a:hover{border-color:var(--accent)}
.cards strong{font-size:15px}
.cards span{font-size:13px;color:var(--muted)}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:14px;margin:0 0 8px;padding:0;list-style:none}
.facts li{border:1px solid var(--line);background:var(--card);border-radius:10px;padding:12px 14px}
.facts b{display:block;font-size:19px;font-weight:660;letter-spacing:-.01em}
.facts span{font-size:12px;color:var(--muted)}
.note{color:var(--muted);font-size:13.5px;border-top:1px solid var(--line);margin-top:40px;padding-top:16px}
.powered{display:inline-flex;align-items:center;gap:9px;margin:34px 0 0;padding:10px 15px;border:1px solid var(--line);border-radius:999px;background:var(--card);text-decoration:none;color:var(--muted);font-size:14px}
.powered:hover{border-color:var(--accent)}
.powered b{color:var(--fg);font-weight:620}
.powered svg{display:block}
`;

// The Malloy mark. Attribution lives here on the landing page; the dashboard
// bar just has a home button.
const Mark = () => (
  <svg viewBox="0 0 240 240" width="22" height="22" aria-hidden="true">
    <g transform="translate(8, 44)" fillRule="nonzero" strokeWidth="10">
      <path d="M66.8164971,8.04981927 C70.8741349,0.502462438 80.0934949,-2.2220379 87.4085141,1.96447745 C94.5645112,6.05998159 97.2471437,15.2521193 93.5616777,22.7156028 L93.3065249,23.2105325 L28.3940308,143.950181 C24.3363931,151.497538 15.117033,154.222038 7.80201383,150.035523 C0.646016803,145.940018 -2.0366157,136.747881 1.64885028,129.284397 L1.90400302,128.789468 L66.8164971,8.04981927 Z" stroke="#1573A1" fill="#1573A1" />
      <path d="M192.878294,8.04981927 C196.98997,0.0579198953 207.437352,-1.75261923 213.470311,1.96447745 C219.503269,5.68157413 221.641451,12.7091374 223.25,15.6301759 L219.368321,23.2105325 L154.455827,143.950181 C150.39819,151.497538 141.17883,154.222038 133.86381,150.035523 C126.707813,145.940018 124.025181,136.747881 127.710647,129.284397 L127.9658,128.789468 L192.878294,8.04981927 Z" stroke="#FBBC04" fill="#FBBC04" transform="translate(174.655898, 76.056961) scale(-1, 1) translate(-174.655898, -76.056961)" />
      <path d="M129.943475,8.04981927 C134.001113,0.502462438 143.220473,-2.2220379 150.535492,1.96447745 C157.691489,6.05998159 160.374122,15.2521193 156.688656,22.7156028 L156.433503,23.2105325 L91.5210087,143.950181 C87.463371,151.497538 78.2440109,154.222038 70.9289918,150.035523 C63.7729947,145.940018 61.0903622,136.747881 64.7758282,129.284397 L65.0309809,128.789468 L129.943475,8.04981927 Z" stroke="#E37400" fill="#E37400" />
      <path d="M132.146094,8.04981927 C136.203731,0.502462438 145.423091,-2.2220379 152.738111,1.96447745 C159.894108,6.05998159 162.57674,15.2521193 158.891274,22.7156028 L158.636121,23.2105325 L93.7236274,143.950181 C89.6659896,151.497538 80.4466296,154.222038 73.1316104,150.035523 C65.9756133,145.940018 63.2929808,136.747881 66.9784468,129.284397 L67.2335996,128.789468 L132.146094,8.04981927 Z" stroke="#11B5CB" fill="#11B5CB" transform="translate(112.934861, 76.000000) scale(-1, 1) translate(-112.934861, -76.000000)" />
    </g>
  </svg>
);

export default function Landing({ dashboards = [] }) {
  return (
    <main className="lp">
      <style>{S}</style>

      <h1>Baby names, 1910&ndash;2021</h1>
      <p className="sub">
        Every name the U.S. Social Security Administration recorded on a birth
        certificate, by state and year. An example project for{" "}
        <a href={MALLOYYO} target="_blank" rel="noopener noreferrer">Malloyyo</a>{" "}
        &mdash; the dashboards below run entirely in your browser.
      </p>

      <ul className="facts">
        <li><b>6.3M</b><span>rows</span></li>
        <li><b>32,403</b><span>distinct names</span></li>
        <li><b>51</b><span>states + DC</span></li>
        <li><b>15 MB</b><span>one parquet file</span></li>
      </ul>

      <h2>Dashboards</h2>
      <ul className="cards">
        {dashboards.map((d) => (
          <li key={d.name}>
            <a href={d.href}>
              <strong>{d.title || d.name}</strong>
              {d.description ? <span>{d.description}</span> : null}
            </a>
          </li>
        ))}
      </ul>

      <h2>Where the data comes from</h2>
      <p>
        The SSA publishes{" "}
        <a href={SSA} target="_blank" rel="noopener noreferrer">
          national and state-level name counts
        </a>{" "}
        drawn from Social Security card applications. A name only appears for a
        given state and year if it was used at least five times, so rare names
        are missing from smaller states &mdash; which is why several of these
        dashboards measure <em>per-capita</em> rates rather than raw counts.
      </p>
      <p>
        It has been flattened into a single{" "}
        <a href={PARQUET} target="_blank" rel="noopener noreferrer">15 MB Parquet file</a>{" "}
        on public Google Cloud Storage. That file is the entire backend. There is
        no server, no API key, and no database: the page downloads it once and
        runs SQL against it locally with DuckDB compiled to WebAssembly.
      </p>

      <h2>A little about Malloy</h2>
      <p>
        <a href={MALLOY} target="_blank" rel="noopener noreferrer">Malloy</a> is a
        language for describing data. Rather than writing a fresh SQL query each
        time, you define a <em>source</em> once &mdash; its dimensions, its
        measures, how it joins to other things &mdash; and then ask questions
        against that definition. Aggregates stay correct across joins, and
        results come back shaped like the question instead of flattened into a
        rectangle.
      </p>
      <pre><code>{`run: baby_names -> {
  where: name ~ f'Emma'
  group_by: state
  aggregate: per_100k is total_babies / all(total_babies) * 100000
  order_by: per_100k desc
}`}</code></pre>
      <p>
        Every dashboard here is one of those queries plus a small React component
        to draw it. The filter controls are <code>given:</code> declarations in
        the model, so the same definition backs the UI, the URL, and the SQL.
      </p>

      <h2>Run it yourself</h2>
      <p>
        The model, the dashboards, and this page are all in{" "}
        <a href={REPO} target="_blank" rel="noopener noreferrer">the source repo</a>.
        The published site is generated from it with one command:
      </p>
      <pre><code>{`malloyyo dashboard bundle --out docs`}</code></pre>

      <a className="powered" href={MALLOYYO} target="_blank" rel="noopener noreferrer">
        <Mark />
        <span>Powered by <b>Malloyyo</b></span>
      </a>

      <p className="note">
        Name data courtesy of the U.S. Social Security Administration. Counts are
        limited to names with at least five occurrences in a state and year, so
        totals are close to but not exactly complete birth counts.
      </p>
    </main>
  );
}
