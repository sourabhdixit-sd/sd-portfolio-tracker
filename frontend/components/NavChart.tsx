"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { NavPoint } from "@/lib/api";

interface NavChartProps {
  data: NavPoint[];
  fundName: string;
}

function formatXAxisDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

function formatTooltipDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface TooltipPayload {
  value: number;
  payload: NavPoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0];
  return (
    <div className="bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm shadow-lg">
      <p className="text-slate-400 text-xs mb-1">
        {formatTooltipDate(point.payload.date)}
      </p>
      <p className="text-slate-100 font-semibold">
        NAV:{" "}
        <span className="text-blue-400">
          ₹{point.value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
        </span>
      </p>
    </div>
  );
}

// Show a tick only every ~30 data points to avoid crowding
function getTickIndices(data: NavPoint[]): string[] {
  if (data.length === 0) return [];
  const step = Math.max(1, Math.floor(data.length / 8));
  const ticks: string[] = [];
  for (let i = 0; i < data.length; i += step) {
    ticks.push(data[i].date);
  }
  // Always include the last point
  const last = data[data.length - 1].date;
  if (!ticks.includes(last)) ticks.push(last);
  return ticks;
}

export default function NavChart({ data, fundName }: NavChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[250px] bg-slate-800 rounded-lg border border-slate-700">
        <p className="text-slate-500 text-sm">No NAV history available for {fundName}</p>
      </div>
    );
  }

  const ticks = getTickIndices(data);

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
      <p className="text-sm font-medium text-slate-300 mb-3">{fundName} — NAV History</p>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="date"
            ticks={ticks}
            tickFormatter={formatXAxisDate}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={{ stroke: "#475569" }}
            tickLine={{ stroke: "#475569" }}
          />
          <YAxis
            tickFormatter={(v: number) =>
              `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
            }
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={{ stroke: "#475569" }}
            tickLine={{ stroke: "#475569" }}
            width={72}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="nav_value"
            stroke="#3b82f6"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 4, fill: "#3b82f6", stroke: "#1e40af" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
