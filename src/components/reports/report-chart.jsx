"use client"

import { vizColor } from "@/lib/chart-colors"
import { formatPkr } from "@/lib/format"
import { BarChart, LineChart } from "@/components/ui/chart"

const number = (n) => new Intl.NumberFormat("en-PK").format(n)

// Report charts. bar: one series in brand blue, no legend (the card title names it);
// stacked: one horizontal bar per category split by the given series (e.g. unit statuses);
// bars: side-by-side columns per category for each series (e.g. income vs expenses by month);
// line: a line per series over the categories (e.g. a closing balance by month).
// Horizontal once there are more than six categories so long labels stay readable.
export function ReportChart({ chart }) {
  if (!chart?.data?.length) return null
  const height = Math.max(160, chart.data.length * 30 + 70)
  if (chart.kind === "stacked") {
    return <BarChart data={chart.data} xKey={chart.categoryKey} horizontal stacked categoryWidth={180} valueFormatter={number} series={chart.series} className="w-full" style={{ height }} />
  }
  if (chart.kind === "bars") {
    return <BarChart data={chart.data} xKey={chart.categoryKey} valueFormatter={chart.money ? formatPkr : number} series={chart.series} className="w-full" />
  }
  if (chart.kind === "line") {
    return <LineChart data={chart.data} xKey={chart.categoryKey} valueFormatter={chart.money ? formatPkr : number} series={chart.series} className="w-full" />
  }
  const horizontal = chart.data.length > 6
  return (
    <BarChart
      data={chart.data}
      xKey={chart.categoryKey}
      horizontal={horizontal}
      categoryWidth={170}
      valueFormatter={chart.money ? formatPkr : number}
      series={[{ key: chart.valueKey, label: chart.valueLabel, color: vizColor("blue") }]}
      showLegend={false}
      style={horizontal ? { height } : undefined}
    />
  )
}
