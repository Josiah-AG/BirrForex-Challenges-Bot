"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface BalanceChartProps {
  // Client mode: fetches own data via auth token
  authToken?: string;
  // Admin mode: fetches for a specific registration
  registrationId?: number;
  challengeId?: number;
  adminSecretPath?: string;
  // Display
  isCent?: boolean;
  height?: number;
}

interface DataPoint {
  time: string;
  gross: number;
  adjusted: number;
  label?: string;
}

export default function BalanceChart({
  authToken,
  registrationId,
  challengeId,
  adminSecretPath,
  isCent = false,
  height = 140,
}: BalanceChartProps) {
  const [data, setData] = useState<DataPoint[]>([]);
  const [startingBalance, setStartingBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";
        let url: string;
        let headers: Record<string, string> = {};

        if (registrationId && challengeId && adminSecretPath) {
          // Admin mode
          url = `${apiUrl}/api/admin/${adminSecretPath}/challenge/${challengeId}/balance-history?registration_id=${registrationId}`;
        } else if (authToken) {
          // Client mode
          url = `${apiUrl}/api/me/balance-history`;
          headers = { Authorization: `Bearer ${authToken}` };
        } else {
          setLoading(false);
          return;
        }

        const res = await fetch(url, { headers });
        if (!res.ok) { setLoading(false); return; }
        const json = await res.json();

        setStartingBalance(json.startingBalance || 0);

        // Format data points with readable time labels
        const series = (json.series || []).map((p: any, i: number) => {
          const d = new Date(p.time);
          const eatTime = new Date(d.getTime() + 3 * 60 * 60 * 1000);
          const label = i === 0
            ? "Start"
            : `${eatTime.getUTCDate()}/${eatTime.getUTCMonth() + 1} ${String(eatTime.getUTCHours()).padStart(2, "0")}:${String(eatTime.getUTCMinutes()).padStart(2, "0")}`;
          return { ...p, label };
        });

        setData(series);
      } catch {
        // silent fail
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [authToken, registrationId, challengeId, adminSecretPath]);

  if (loading) {
    return (
      <div className="w-full rounded-xl bg-white/5 border border-white/10 p-4" style={{ height }}>
        <div className="flex items-center justify-center h-full">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (data.length < 2) {
    return (
      <div className="w-full rounded-xl bg-white/5 border border-white/10 p-4" style={{ height }}>
        <div className="flex items-center justify-center h-full">
          <p className="text-xs text-gray-500">No trade data for chart</p>
        </div>
      </div>
    );
  }

  const currency = isCent ? "¢" : "$";
  const formatBalance = (v: number) => `${currency}${v.toFixed(v >= 1000 ? 0 : 2)}`;

  // Determine Y-axis domain
  const allValues = data.flatMap((d) => [d.gross, d.adjusted]);
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const padding = (maxVal - minVal) * 0.1 || 5;

  return (
    <div className="w-full rounded-xl bg-white/5 border border-white/10 p-3 pb-1">
      <div className="flex items-center justify-between mb-1 px-1">
        <p className="text-[10px] text-gray-400 font-medium">Account Growth</p>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-3 h-[2px] bg-blue-400 rounded-full inline-block" />
            <span className="text-[9px] text-gray-500">Qualified</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-[2px] bg-red-400/50 rounded-full inline-block border-dashed" style={{ borderTop: "1px dashed rgba(248,113,113,0.5)", height: 0 }} />
            <span className="text-[9px] text-gray-500">Gross</span>
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={height - 30}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: "#6b7280" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[Math.floor(minVal - padding), Math.ceil(maxVal + padding)]}
            tick={{ fontSize: 9, fill: "#6b7280" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${currency}${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
            width={45}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(17,24,39,0.95)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              padding: "6px 10px",
              fontSize: "11px",
            }}
            labelStyle={{ color: "#9ca3af", fontSize: "10px" }}
            formatter={(value: any, name: any) => [
              formatBalance(Number(value)),
              name === "adjusted" ? "Qualified" : "Gross",
            ]}
          />
          <ReferenceLine
            y={startingBalance}
            stroke="rgba(255,255,255,0.1)"
            strokeDasharray="3 3"
          />
          {/* Gross balance — dim red dashed line */}
          <Line
            type="monotone"
            dataKey="gross"
            stroke="rgba(248,113,113,0.4)"
            strokeWidth={1}
            strokeDasharray="4 3"
            dot={false}
            activeDot={{ r: 3, fill: "#f87171" }}
          />
          {/* Adjusted (qualified) balance — solid blue line */}
          <Line
            type="monotone"
            dataKey="adjusted"
            stroke="#60a5fa"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#3b82f6" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
