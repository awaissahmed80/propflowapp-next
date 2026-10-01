"use client"

import * as React from "react"
import { cn } from "cn"
import * as RechartsPrimitive from "recharts"

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = {
  light: "",
  dark: ".dark"
}

const INITIAL_DIMENSION = {
  width: 320,
  height: 200
}

const ChartContext = React.createContext(null)

function useChart() {
  const context = React.useContext(ChartContext)

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }

  return context
}

function ChartContainer({
  id,
  className,
  children,
  config,
  initialDimension = INITIAL_DIMENSION,
  ...props
}) {
  const uniqueId = React.useId()
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
          className
        )}
        {...props}>
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer initialDimension={initialDimension}>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

const ChartStyle = ({
  id,
  config
}) => {
  const colorConfig = Object.entries(config).filter(([, config]) => config.theme ?? config.color)

  if (!colorConfig.length) {
    return null
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
.map(([key, itemConfig]) => {
const color =
  itemConfig.theme?.[theme] ??
  itemConfig.color
return color ? `  --color-${key}: ${color};` : null
})
.join("\n")}
}
`)
          .join("\n"),
      }} />
  );
}

const ChartTooltip = RechartsPrimitive.Tooltip

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = "dot",
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  color,
  nameKey,
  labelKey,
  valueFormatter
}) {
  const { config } = useChart()

  const tooltipLabel = React.useMemo(() => {
    if (hideLabel || !payload?.length) {
      return null
    }

    const [item] = payload
    const key = `${labelKey ?? item?.dataKey ?? item?.name ?? "value"}`
    const itemConfig = getPayloadConfigFromPayload(config, item, key)
    const value =
      !labelKey && typeof label === "string"
        ? (config[label]?.label ?? label)
        : itemConfig?.label

    if (labelFormatter) {
      return (
        <div className={cn("font-medium", labelClassName)}>
          {labelFormatter(value, payload)}
        </div>
      );
    }

    if (!value) {
      return null
    }

    return <div className={cn("font-medium", labelClassName)}>{value}</div>;
  }, [
    label,
    labelFormatter,
    payload,
    hideLabel,
    labelClassName,
    config,
    labelKey,
  ])

  if (!active || !payload?.length) {
    return null
  }

  const nestLabel = payload.length === 1 && indicator !== "dot"

  return (
    <div
      className={cn(
        "grid min-w-32 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
        className
      )}>
      {!nestLabel ? tooltipLabel : null}
      <div className="grid gap-1.5">
        {payload
          .filter((item) => item.type !== "none")
          .map((item, index) => {
            const key = `${nameKey ?? item.name ?? item.dataKey ?? "value"}`
            const itemConfig = getPayloadConfigFromPayload(config, item, key)
            const indicatorColor = color ?? item.payload?.fill ?? item.color

            return (
              <div
                key={index}
                className={cn(
                  "flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground",
                  indicator === "dot" && "items-center"
                )}>
                {formatter && item?.value !== undefined && item.name ? (
                  formatter(item.value, item.name, item, index, item.payload)
                ) : (
                  <>
                    {itemConfig?.icon ? (
                      <itemConfig.icon />
                    ) : (
                      !hideIndicator && (
                        <div
                          className={cn("shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)", {
                            "h-2.5 w-2.5": indicator === "dot",
                            "w-1": indicator === "line",
                            "w-0 border-[1.5px] border-dashed bg-transparent":
                              indicator === "dashed",
                            "my-0.5": nestLabel && indicator === "dashed",
                          })}
                          style={
                            {
                              "--color-bg": indicatorColor,
                              "--color-border": indicatorColor
                            }
                          } />
                      )
                    )}
                    <div
                      className={cn(
                        "flex flex-1 justify-between leading-none",
                        nestLabel ? "items-end" : "items-center"
                      )}>
                      <div className="grid gap-1.5">
                        {nestLabel ? tooltipLabel : null}
                        <span className="text-muted-foreground">
                          {itemConfig?.label ?? item.name}
                        </span>
                      </div>
                      {item.value != null && (
                        <span className="font-mono font-medium text-foreground tabular-nums">
                          {valueFormatter
                            ? valueFormatter(item.value)
                            : typeof item.value === "number"
                              ? item.value.toLocaleString()
                              : String(item.value)}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

const ChartLegend = RechartsPrimitive.Legend

function ChartLegendContent({
  className,
  hideIcon = false,
  payload,
  verticalAlign = "bottom",
  nameKey
}) {
  const { config } = useChart()

  if (!payload?.length) {
    return null
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-4",
        verticalAlign === "top" ? "pb-3" : "pt-3",
        className
      )}>
      {payload
        .filter((item) => item.type !== "none")
        .map((item, index) => {
          const key = `${nameKey ?? item.dataKey ?? "value"}`
          const itemConfig = getPayloadConfigFromPayload(config, item, key)

          return (
            <div
              key={index}
              className={cn(
                "flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground"
              )}>
              {itemConfig?.icon && !hideIcon ? (
                <itemConfig.icon />
              ) : (
                <div
                  className="h-2 w-2 shrink-0 rounded-[2px]"
                  style={{
                    backgroundColor: item.color,
                  }} />
              )}
              {itemConfig?.label}
            </div>
          );
        })}
    </div>
  );
}

function getPayloadConfigFromPayload(
  config,
  payload,
  key
) {
  if (typeof payload !== "object" || payload === null) {
    return undefined
  }

  const payloadPayload =
    "payload" in payload &&
    typeof payload.payload === "object" &&
    payload.payload !== null
      ? payload.payload
      : undefined

  let configLabelKey = key

  if (
    key in payload &&
    typeof payload[key] === "string"
  ) {
    configLabelKey = payload[key]
  } else if (
    payloadPayload &&
    key in payloadPayload &&
    typeof payloadPayload[key] === "string"
  ) {
    configLabelKey = payloadPayload[key]
  }

  return configLabelKey in config ? config[configLabelKey] : config[key]
}


// ---------- Prop-driven chart wrappers ----------
// series: [{ key, label, color? }]  (colour defaults to the categorical PALETTE in order)
// Solid fills only (no gradients).

// Categorical palette: brand blue first, then distinct hues so categories stay tellable apart
const PALETTE = [
  "var(--chart-1)",
  "oklch(0.7 0.15 160)",
  "oklch(0.78 0.15 75)",
  "oklch(0.64 0.2 25)",
  "oklch(0.62 0.2 300)",
  "oklch(0.72 0.12 210)",
  "oklch(0.68 0.16 345)",
]

function toConfig(series) {
  return Object.fromEntries(series.map((s, i) => [s.key, { label: s.label, color: s.color ?? PALETTE[i % PALETTE.length] }]))
}

const axisProps = { tickLine: false, axisLine: false, tickMargin: 8 }

function BarChart({
  data,
  xKey,
  series,
  stacked = false,
  horizontal = false,
  valueFormatter,
  axisFormatter = valueFormatter,
  showLegend = series.length > 1,
  categoryWidth = 110,
  className,
  style,
}) {
  return (
    <ChartContainer config={toConfig(series)} className={cn("aspect-auto h-64 w-full", className)} style={style}>
      <RechartsPrimitive.BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: 4, right: 12 }}>
        <RechartsPrimitive.CartesianGrid vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <RechartsPrimitive.XAxis type="number" {...axisProps} tickFormatter={axisFormatter} />
            <RechartsPrimitive.YAxis type="category" dataKey={xKey} {...axisProps} width={categoryWidth} />
          </>
        ) : (
          <>
            <RechartsPrimitive.XAxis dataKey={xKey} {...axisProps} />
            <RechartsPrimitive.YAxis {...axisProps} width={56} tickFormatter={axisFormatter} />
          </>
        )}
        <ChartTooltip cursor={{ fillOpacity: 0.4 }} content={<ChartTooltipContent valueFormatter={valueFormatter} />} />
        {showLegend && <ChartLegend itemSorter={null} content={<ChartLegendContent />} />}
        {series.map((s, i) => (
          <RechartsPrimitive.Bar
            key={s.key}
            dataKey={s.key}
            stackId={stacked ? "stack" : undefined}
            fill={`var(--color-${s.key})`}
            // 2px surface gap between stacked segments
            stroke={stacked ? "var(--background)" : undefined}
            strokeWidth={stacked ? 2 : 0}
            radius={stacked ? (i === series.length - 1 ? (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]) : 0) : 4}
            maxBarSize={44}
          />
        ))}
      </RechartsPrimitive.BarChart>
    </ChartContainer>
  )
}

function LineChart({ data, xKey, series, valueFormatter, axisFormatter = valueFormatter, area = false, showLegend = series.length > 1, className }) {
  const Chart = area ? RechartsPrimitive.AreaChart : RechartsPrimitive.LineChart
  return (
    <ChartContainer config={toConfig(series)} className={cn("aspect-auto h-64 w-full", className)}>
      <Chart data={data} margin={{ left: 4, right: 12, top: 8 }}>
        <RechartsPrimitive.CartesianGrid vertical={false} />
        <RechartsPrimitive.XAxis dataKey={xKey} {...axisProps} />
        <RechartsPrimitive.YAxis {...axisProps} width={56} tickFormatter={axisFormatter} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" valueFormatter={valueFormatter} />} />
        {showLegend && <ChartLegend itemSorter={null} content={<ChartLegendContent />} />}
        {series.map((s) =>
          area ? (
            <RechartsPrimitive.Area
              key={s.key}
              dataKey={s.key}
              type="monotone"
              stroke={`var(--color-${s.key})`}
              fill={`var(--color-${s.key})`}
              fillOpacity={0.15}
              strokeWidth={2}
            />
          ) : (
            <RechartsPrimitive.Line key={s.key} dataKey={s.key} type="monotone" stroke={`var(--color-${s.key})`} strokeWidth={2} dot={{ r: 3 }} />
          )
        )}
      </Chart>
    </ChartContainer>
  )
}

const AreaChart = (props) => <LineChart {...props} area />

// data: [{ name, value, color? }]; centre shows the total (or `centerLabel`)
function DonutChart({ data, valueFormatter, centerLabel = "Total", className }) {
  const config = Object.fromEntries(
    data.map((d, i) => [d.key ?? d.name, { label: d.name, color: d.color ?? PALETTE[i % PALETTE.length] }])
  )
  const total = data.reduce((sum, d) => sum + d.value, 0)
  return (
    <div className={cn("flex flex-col items-center gap-4 sm:flex-row", className)}>
      <ChartContainer config={config} className="aspect-square h-48 shrink-0">
        <RechartsPrimitive.PieChart>
          <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="name" valueFormatter={valueFormatter} />} />
          <RechartsPrimitive.Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" strokeWidth={2} paddingAngle={1}>
            {data.map((d, i) => (
              <RechartsPrimitive.Cell key={d.name} fill={d.color ?? PALETTE[i % PALETTE.length]} stroke="var(--background)" />
            ))}
            <RechartsPrimitive.Label
              content={({ viewBox }) =>
                viewBox?.cx ? (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={viewBox.cx} y={viewBox.cy - 6} className="fill-foreground text-lg font-semibold">
                      {valueFormatter ? valueFormatter(total) : total.toLocaleString()}
                    </tspan>
                    <tspan x={viewBox.cx} y={viewBox.cy + 14} className="fill-muted-foreground text-xs">
                      {centerLabel}
                    </tspan>
                  </text>
                ) : null
              }
            />
          </RechartsPrimitive.Pie>
        </RechartsPrimitive.PieChart>
      </ChartContainer>
      <ul className="w-full min-w-0 flex-1 space-y-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: d.color ?? PALETTE[i % PALETTE.length] }} />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.name}</span>
            <span className="font-medium tabular-nums">{valueFormatter ? valueFormatter(d.value) : d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export {
  BarChart,
  LineChart,
  AreaChart,
  DonutChart,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
}
