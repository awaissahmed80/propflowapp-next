"use client"

import { useEffect, useState } from "react"
import { ACTIONS, Joyride, STATUS } from "react-joyride"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"

// Guided tours with react-joyride: spotlight on each part of the page, a tooltip with an arrow,
// scrolling, keyboard (Esc, arrows) and focus handling. The tooltip is our own card so it matches
// the app. Steps point at elements marked data-tour="…"; steps without a target show in the middle;
// steps whose element isn't on the page are left out.
//   <Tour steps={[{ target: "apps", icon, title, text }, …]} onClose={(finished) => …} />

const selector = (target) => `[data-tour="${target}"]`

function TourTooltip({ step, index, size, isLastStep, backProps, primaryProps, skipProps, tooltipProps }) {
  return (
    <div {...tooltipProps} className="w-[min(22rem,calc(100vw-2rem))] rounded-xl border bg-popover p-4 text-popover-foreground shadow-2xl outline-none">
      <div className="flex items-start gap-3">
        {step.icon && (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg text-primary">
            <Icon name={step.icon} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {step.title && <p className="font-semibold">{step.title}</p>}
          <div className="mt-1 text-sm text-muted-foreground">{step.content}</div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {index + 1} of {size}
        </span>
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span className="block h-full rounded-full bg-primary transition-all" style={{ width: `${((index + 1) / size) * 100}%` }} />
        </span>
        {!isLastStep && (
          <Button size="sm" variant="ghost" {...skipProps}>
            Skip
          </Button>
        )}
        {index > 0 && (
          <Button size="sm" variant="outline" {...backProps}>
            Back
          </Button>
        )}
        <Button size="sm" {...primaryProps}>
          {isLastStep ? "Start using PropFlow" : "Next"}
        </Button>
      </div>
    </div>
  )
}

// The steps that can be shown on this page, with their targets turned into selectors
const buildSteps = (steps) =>
  steps
    .filter((s) => !s.target || document.querySelector(selector(s.target)))
    .map((s) => ({
      target: s.target ? selector(s.target) : "body",
      placement: s.target ? (s.placement ?? "auto") : "center",
      title: s.title,
      content: s.text,
      icon: s.icon,
    }))

export function Tour({ steps: allSteps, onClose }) {
  // Worked out once, after the page has rendered: its data-tour elements aren't in the DOM
  // while the tour itself first renders (and there's no DOM at all on the server)
  const [steps, setSteps] = useState(null)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setSteps(buildSteps(allSteps)))
    return () => cancelAnimationFrame(frame)
  }, [allSteps])

  if (!steps) return null
  return (
    <Joyride
      run
      continuous
      steps={steps}
      scrollToFirstStep
      tooltipComponent={TourTooltip}
      locale={{ back: "Back", close: "Close", last: "Start using PropFlow", next: "Next", skip: "Skip" }}
      options={{
        skipBeacon: true,
        showProgress: true,
        primaryColor: "var(--primary)",
        backgroundColor: "var(--popover)",
        arrowColor: "var(--popover)",
        textColor: "var(--popover-foreground)",
        overlayColor: "rgb(0 0 0 / 0.55)",
        spotlightPadding: 8,
        spotlightRadius: 12,
        scrollOffset: 96,
        zIndex: 100,
        overlayClickAction: false,
        dismissKeyAction: "close",
      }}
      onEvent={(data) => {
        if ([STATUS.FINISHED, STATUS.SKIPPED].includes(data.status)) onClose(data.status === STATUS.FINISHED)
        // Esc (or the close button) ends the tour rather than leaving a beacon behind
        else if (data.action === ACTIONS.CLOSE) onClose(false)
      }}
    />
  )
}

// The launcher tour
export const LAUNCHER_TOUR = [
  { icon: "hand-heart-line", title: "Welcome to PropFlow", text: "Your workspace is ready. Here's a one-minute look around; you can replay this any time from your account menu." },
  { target: "desk", icon: "user-smile-line", title: "My Desk", text: "Your own corner: to-dos from every app, requests waiting for your sign-off and what you did recently. It's always here when you come back." },
  { target: "apps", icon: "apps-2-line", title: "Your apps", text: "Everything your plan includes, grouped by department: Estate, CRM, Operations, Finance and more. Click one to open it." },
  { target: "spotlight", icon: "command-line", title: "Search everything", text: "Press ⌘K (Ctrl K on Windows) anywhere in PropFlow to search apps, and soon your leads, bookings and buyers too." },
  { target: "critical", icon: "alarm-warning-line", title: "What needs you now", text: "Overdue follow-ups, approvals waiting on you and holds about to run out, from every app." },
  { target: "getting-started", icon: "rocket-2-line", title: "Finish setting up", text: "How much of your workspace setup is done. Continue opens the next step." },
  { target: "inbox", icon: "notification-3-line", title: "Messages & notifications", text: "Chat with your team and see approvals, reminders and updates from your apps." },
  { target: "account", icon: "user-settings-line", title: "Your account", text: "Change the theme, switch workspace, revisit workspace setup, replay this tour, or sign out." },
  { icon: "rocket-2-line", title: "You're all set", text: "Next, invite your team once Users & Teams is available, and start adding your projects." },
]
