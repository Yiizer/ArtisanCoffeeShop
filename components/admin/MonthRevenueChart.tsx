"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatPesos } from "@/lib/format";
import type { DailyBreakdown } from "./types";

type ChartDatum = { date: string; day: string; revenueCents: number; orders: number };

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartDatum }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-roast/10 bg-foam px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-espresso">{d.date}</p>
      <p className="text-roast">{formatPesos(d.revenueCents)}</p>
      <p className="text-latte">{d.orders} {d.orders === 1 ? "order" : "orders"}</p>
    </div>
  );
}

export default function MonthRevenueChart({
  dailyBreakdown,
  onSelectDay,
}: {
  dailyBreakdown: DailyBreakdown[];
  onSelectDay: (date: string) => void;
}) {
  const data: ChartDatum[] = dailyBreakdown.map((d, index) => ({
    date: d.date,
    day:  String(Number(d.date.split("-")[2])),
    revenueCents: d.revenueCents,
    orders: d.orders,
    id: `${d.date}-${index}`, // Unique identifier for React keys
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#C4A882" strokeOpacity={0.3} vertical={false} />
          <XAxis 
            dataKey="day" 
            tick={{ fontSize: 11, fill: "#5C3D2E" }} 
            interval="preserveStartEnd"
            minTickGap={10}
          />
          <YAxis tickFormatter={(v: number) => `₱${Math.round(v / 100)}`} tick={{ fontSize: 11, fill: "#5C3D2E" }} width={56} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "#C4A88220" }} />
          <Bar
            dataKey="revenueCents"
            fill="#3D2314"
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
