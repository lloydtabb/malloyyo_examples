import React from "react";
import { Controls, Search, Select, TimeRange, VegaChart, filters } from "@malloyyo/dashboard";

// Category × calendar-month seasonality heatmap.
//
// The Malloy query `seasonality_matrix` returns one row per (category, month)
// with `seasonal_share` = that month's sales as a fraction of the category's
// OWN annual total. Normalizing per-category means a small category's rhythm
// is as legible as a giant's — the color is share, not dollars.
//
// Baseline "flat" share is 1/12 ≈ 0.0833. The diverging color scale is pinned
// to that midpoint, so a cell reads at a glance as OVER-indexed (warm) or
// UNDER-indexed (cool) for its category — the seasonal fingerprint.
const BASELINE = 1 / 12;

const spec = {
  mark: { type: "rect", tooltip: true },
  width: { step: 46 },
  height: { step: 22 },
  encoding: {
    x: {
      field: "month_name",
      type: "ordinal",
      sort: { field: "month_num" },
      title: null,
      axis: { orient: "top", labelAngle: 0, labelFontSize: 11, ticks: false, domain: false },
    },
    y: {
      field: "category",
      type: "nominal",
      // biggest categories on top
      sort: { field: "category_total", op: "max", order: "descending" },
      title: null,
      axis: { labelFontSize: 11, ticks: false, domain: false },
    },
    color: {
      field: "seasonal_share",
      type: "quantitative",
      title: "Share of annual",
      scale: { scheme: "redyellowblue", reverse: true, domainMid: BASELINE },
      legend: { format: ".0%", gradientLength: 160 },
    },
    tooltip: [
      { field: "category", title: "Category" },
      { field: "month_name", title: "Month" },
      { field: "seasonal_share", title: "Share of annual", format: ".1%" },
      { field: "month_sales", title: "Sales", format: "$,.0f" },
    ],
  },
  config: { view: { stroke: null }, axis: { grid: false } },
};

export default function Dashboard({ dashboard, givens }) {
  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: 24 }}>
      <h1 style={{ marginBottom: 4 }}>{dashboard.title}</h1>
      <p style={{ color: "var(--dash-muted)", marginTop: 0, maxWidth: 620 }}>
        Each row is normalized to its own annual sales, so every category's
        seasonal rhythm is comparable. <strong>Warm</strong> months over-index
        (a category sells more than its even 1/12 share); <strong>cool</strong>
        months under-index. Reslice by brand, department, or time period.
      </p>

      <Controls>
        <Search given="BRAND" />
        <Select given="DEPARTMENT" />
        <TimeRange
          given="PERIOD"
          presets={[
            { value: "", text: "All time" },
            { value: filters.lastN(1, "year"), text: "Last year" },
            { value: filters.lastN(1, "quarter"), text: "Last quarter" },
            { value: filters.lastN(1, "month"), text: "Last month" },
          ]}
        />
      </Controls>

      <VegaChart spec={spec} query="seasonality" givens={givens} />
    </div>
  );
}
