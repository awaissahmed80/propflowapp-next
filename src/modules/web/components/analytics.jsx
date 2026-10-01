"use client"

import { useState, useSyncExternalStore } from "react"
import Script from "next/script"
import { Button } from "@/components/ui/button"
import { CONSENT_COOKIE } from "../track"
import { LegalLink } from "./legal"

const readConsent = () => document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=(granted|denied)`))?.[1] ?? null

function saveConsent(value) {
  document.cookie = `${CONSENT_COOKIE}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
  window.gtag?.("consent", "update", { analytics_storage: value })
}

// Google Analytics 4 on the website (console Settings → Website analytics). With askConsent on,
// analytics cookies wait until the visitor accepts (Google Consent Mode); until then GA only
// gets cookieless pings. Ads storage is always denied: we don't run ads from here.
export function Analytics({ id, askConsent }) {
  // The saved answer lives in a cookie (read after hydration; "unknown" on the server)
  const saved = useSyncExternalStore(
    () => () => {},
    readConsent,
    () => "unknown",
  )
  const [answered, setAnswered] = useState(false)
  const ask = askConsent && saved === null && !answered

  const boot = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;
var c=(document.cookie.match(/(?:^|; )${CONSENT_COOKIE}=(granted|denied)/)||[])[1];
gtag('consent','default',{analytics_storage:${askConsent ? "c==='granted'?'granted':'denied'" : "c==='denied'?'denied':'granted'"},ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
gtag('js',new Date());gtag('config',${JSON.stringify(id)});`
  return (
    <>
      <Script id="ga-init" strategy="afterInteractive">
        {boot}
      </Script>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`} strategy="afterInteractive" />
      {ask && (
        <div role="dialog" aria-label="Cookies" className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-xl flex-col gap-3 rounded-xl border bg-card p-4 text-sm shadow-lg sm:flex-row sm:items-center">
          <p className="flex-1 text-muted-foreground">
            We use analytics cookies to see how visitors use this site, never to show ads. See our <LegalLink doc="privacy" />.
          </p>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                saveConsent("denied")
                setAnswered(true)
              }}
            >
              Decline
            </Button>
            <Button
              size="sm"
              onClick={() => {
                saveConsent("granted")
                setAnswered(true)
              }}
            >
              Accept
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
