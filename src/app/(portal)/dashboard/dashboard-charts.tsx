"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

/** Dashboard donut charts (SDS Doc 15 Ch4/7). */

export interface ChartSlice {
  name: string;
  value: number;
}

const PALETTE = [
  "hsl(224 76% 48%)",
  "hsl(142 71% 35%)",
  "hsl(38 92% 45%)",
  "hsl(0 72% 51%)",
  "hsl(199 89% 40%)",
  "hsl(262 60% 55%)",
  "hsl(215 16% 55%)",
];

export function StatusDonut({ data, ariaLabel }: { data: ChartSlice[]; ariaLabel: string }) {
  const nonEmpty = data.filter((slice) => slice.value > 0);
  if (nonEmpty.length === 0) {
    return (
      <p className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        No data yet.
      </p>
    );
  }
  return (
    <div className="h-56 w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={nonEmpty}
            dataKey="value"
            nameKey="name"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={2}
            strokeWidth={0}
          >
            {nonEmpty.map((slice, index) => (
              <Cell key={slice.name} fill={PALETTE[index % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string) => [`${value}`, name]}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => <span className="text-xs">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
