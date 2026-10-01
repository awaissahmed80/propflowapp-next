"use client"

import { vizColor } from "@/lib/chart-colors"
import { BarChart } from "@/components/ui/chart"

export function SignupsChart({ data }) {
  return <BarChart data={data} xKey="month" showLegend={false} series={[{ key: "signups", label: "Workspaces", color: vizColor("blue") }]} style={{ height: 220 }} />
}

export function PlanMixChart({ data }) {
  return (
    <BarChart data={data} xKey="plan" horizontal categoryWidth={96} showLegend={false} series={[{ key: "count", label: "Workspaces", color: vizColor("blue") }]} style={{ height: 220 }} />
  )
}
