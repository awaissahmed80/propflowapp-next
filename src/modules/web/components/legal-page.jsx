import { Logo } from "@/components/logo"
import { Icon } from "@/components/ui/icon"
import { LEGAL } from "../legal"
import { LegalDocument } from "./legal"

// /privacy-policy and /terms-and-conditions opened directly (from the site they open in a modal)
export function LegalPage({ doc: key }) {
  const doc = LEGAL[key]
  const other = LEGAL[key === "terms" ? "privacy" : "terms"]
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b px-4 sm:px-6">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between">
          <a href="/" aria-label="PropFlow home">
            <Logo className="h-7" />
          </a>
          <a href="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <Icon name="arrow-left-line" /> Back to PropFlow
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-3xl font-semibold tracking-tight">{doc.title}</h1>
        <LegalDocument doc={doc} className="mt-4" />
        <p className="mt-10 border-t pt-6 text-sm text-muted-foreground">
          See also our{" "}
          <a href={`/${other.slug}`} className="font-medium text-primary hover:underline">
            {other.title}
          </a>
          .
        </p>
      </main>
    </div>
  )
}
