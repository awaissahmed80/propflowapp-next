"use client"

import { vizColor } from "@/lib/chart-colors"
import { AreaChart, BarChart } from "@/components/ui/chart"

export function SignupsChart({ data }) {
  return <BarChart data={data} xKey="month" showLegend={false} series={[{ key: "signups", label: "Workspaces", color: vizColor("blue") }]} style={{ height: 220 }} />
}

export function PlanMixChart({ data }) {
  return <BarChart data={data} xKey="plan" horizontal categoryWidth={96} showLegend={false} series={[{ key: "count", label: "Workspaces", color: vizColor("blue") }]} style={{ height: 220 }} />
}

// Website visitors per day (Google Analytics). One series: the card title names it, so no legend.
export function VisitorsChart({ data }) {
  return (
    <AreaChart
      data={data}
      xKey="day"
      showLegend={false}
      wholeNumbers
      valueFormatter={(v) => new Intl.NumberFormat("en-PK").format(v)}
      axisFormatter={(v) => new Intl.NumberFormat("en-PK", { notation: "compact" }).format(v)}
      series={[{ key: "visitors", label: "Visitors", color: vizColor("blue") }]}
      className="h-56"
    />
  )
}
