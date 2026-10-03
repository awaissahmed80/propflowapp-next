"use client"

import Link from "next/link"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ErrorScreen } from "./error-screen"

// The 404 and "something went wrong" screens for the route files (not-found.js / error.js).
//   full: a whole page with the logo; otherwise it sits inside an app's frame
//   home: { href, label } the main way back · links: quick ways out (see ErrorScreen)

function BackButton() {
  const router = useRouter()
  return (
    <Button variant="outline" leftIcon="arrow-left-line" onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}>
      Go back
    </Button>
  )
}

export function NotFoundPage({ full = true, home = { href: "/", label: "Go home" }, links, text }) {
  return (
    <ErrorScreen
      full={full}
      homeHref={home.href}
      code="404"
      tag={{ icon: "compass-3-line", label: "Page not found" }}
      title="We couldn't find that page"
      text={text ?? "The link may be old or mistyped, or the page was moved. Check the address, or head back to where you were."}
      actions={
        <>
          <Button leftIcon="home-4-line" nativeButton={false} render={<Link href={home.href} />}>
            {home.label}
          </Button>
          <BackButton />
        </>
      }
      links={links}
    />
  )
}

export function ErrorPage({ error, reset, full = true, home = { href: "/", label: "Go home" } }) {
  useEffect(() => {
    // Shown in the browser console for whoever is debugging; the digest matches the server log
    console.error(error)
  }, [error])
  return (
    <ErrorScreen
      full={full}
      homeHref={home.href}
      code="500"
      tag={{ icon: "error-warning-line", label: "Something went wrong" }}
      title="That didn't load properly"
      text="Something on our side failed while opening this page. Your data is safe. Try again, and if it keeps happening let us know."
      actions={
        <>
          <Button leftIcon="refresh-line" onClick={() => reset()}>
            Try again
          </Button>
          <Button variant="outline" leftIcon="home-4-line" nativeButton={false} render={<Link href={home.href} />}>
            {home.label}
          </Button>
        </>
      }
      reference={error?.digest}
    />
  )
}
