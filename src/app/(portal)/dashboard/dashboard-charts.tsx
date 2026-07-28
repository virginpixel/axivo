"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

/** Dashboard donut charts (SDS Doc 15 Ch4/7). */

export interface ChartSlice {
  name: string;
  value: number;
}

/**
 * Identity palette, in fixed order: a slice keeps its color no matter how many
 * others are present. Validated for lightness, chroma, colorblind separation
 * and contrast against the card surface.
 */
const CATEGORICAL = ["#3B4CC0", "#C2410C", "#0097AE", "#7C3AAD", "#3F8A2B", "#B4306E"];

/*
 * Deliberately NOT the semantic status colors. Tried that first: mapping slices
 * to the chip palette put green beside teal and amber beside green, pairs that
 * fail separation even for full-color vision. Status color stays where it has to
 * be read at a glance instead - the chips in tables and the figures on the stat
 * tiles - and a distribution ring encodes identity, with the legend carrying the
 * meaning.
 */

export function StatusDonut({
  data,
  ariaLabel,
  totalLabel,
}: {
  data: ChartSlice[];
  ariaLabel: string;
  /** Noun for the figure in the middle of the ring, e.g. "assets". */
  totalLabel?: string;
}) {
  const nonEmpty = data.filter((slice) => slice.value > 0);
  if (nonEmpty.length === 0) {
    return (
      <p className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        No data yet.
      </p>
    );
  }
  const total = nonEmpty.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <div className="relative h-56 w-full" role="img" aria-label={ariaLabel}>
      {/* The hole in a donut is free space; the total belongs in it. */}
      <div className="pointer-events-none absolute inset-x-0 top-[38%] -translate-y-1/2 text-center">
        <p className="font-display text-2xl font-semibold tabular-nums leading-none">{total}</p>
        {totalLabel ? <p className="label-caps mt-1 text-muted-foreground">{totalLabel}</p> : null}
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={nonEmpty}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="82%"
            paddingAngle={2}
            strokeWidth={0}
          >
            {nonEmpty.map((slice, index) => (
              <Cell key={slice.name} fill={CATEGORICAL[index % CATEGORICAL.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string) => [`${value}`, name]}
            cursor={false}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid hsl(230 18% 88%)",
              boxShadow: "0 10px 30px -12px hsl(230 30% 12% / 0.22)",
              padding: "6px 10px",
            }}
            itemStyle={{ color: "hsl(230 30% 12%)" }}
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => (
              <span className="text-xs text-muted-foreground">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
