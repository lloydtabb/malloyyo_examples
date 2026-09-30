# Malloyyo examples

Four example datasets in one repo. Point a Malloyyo instance at it and you get
all four — no credentials, no setup, nothing to download.

| dataset | what it is | scoped by |
|---|---|---|
| `ecommerce` | orders, products, inventory and users for a fictional retailer | — |
| `imdb` | movies, the people who made them, and who works with whom | — |
| `babynames` | every US baby name by year and state, from the Social Security Administration | — |
| `multi_tenant` | the same baby names, narrowed to whoever is signed in | `MALLOYYO_EMAIL` |

`multi_tenant` is the odd one out on purpose: it shows a dataset whose rows
depend on who is asking, which is why it has to be its own dataset rather than
another source inside one of the others.

## The layout

```
malloy-config.json        connections — shared by every dataset here
datasets/
  ecommerce/
    index.malloy          what this dataset publishes
    ecommerce.malloy      the semantic model
    gs.malloy             where the data lives
    dashboards/           its dashboards
  imdb/
  babynames/
  multi_tenant/
```

A directory under `datasets/` **is** a dataset, named after the directory. Each
one publishes exactly what its own `index.malloy` exports; a source defined next
door is not hidden from it, it is genuinely absent.

The alternative layout — a single `index.malloy` at the repo root — publishes one
dataset and is the right shape for most repos. A repo has one or the other, never
both.

## The data

Every source reads Parquet from public Google Cloud Storage:

```malloy
source: baby_names_table is duckdb.table(
  'https://storage.googleapis.com/malloyyo/baby_names/baby_names.parquet'
)
```

DuckDB reads those files directly over HTTPS, so there is nothing to load and no
warehouse to connect. That is what makes this repo installable as-is — an earlier
version of these examples read from MotherDuck, which was faster but needed a
token, so it could not be the default.

Each dataset keeps its storage in its own `gs.malloy`. Pointing one at a
warehouse is a one-file change: redefine the same `*_table` source names against
another connection and add that connection to `malloy-config.json`.

## Running one locally

```bash
malloyyo dashboard dev -C datasets/babynames
```

`multi_tenant` asks who you are, and on a laptop nobody is signed in — so supply
it yourself:

```bash
MALLOYYO_EMAIL=you@example.com malloyyo dashboard dev -C datasets/multi_tenant
```

Without it the dashboard refuses to run rather than rendering empty, because an
empty identity is exactly the value that would filter nothing.

## Adding it to an instance

Add `lloydtabb/malloyyo_examples` as a model repo. All four datasets are created
together — if any one of them fails to compile, none are created, so you never
get an instance that is quietly missing one.
