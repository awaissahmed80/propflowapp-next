import { AuthSlider } from "@/components/auth-slider"
import { Logo } from "@/components/logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { siteUrl } from "@/lib/sites"
import { LegalLink } from "@/modules/web/components/legal"
import { ContactSupportLink } from "@/modules/web/components/contact-support"

// Shared shell for sign-in, forgot password, sign-up and workspace selection
export default function AuthLayout({ children }) {
  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,1fr)_30rem] xl:grid-cols-[minmax(0,1fr)_36rem]">
      <div className="hidden p-3 lg:block">
        <AuthSlider className="sticky top-3 h-[calc(100svh-1.5rem)] rounded-2xl" />
      </div>

      <div className="flex min-h-svh flex-col px-4 py-6 sm:px-10">
        <header className="flex items-center justify-between">
          <a href={siteUrl("web")} aria-label="PropFlow home" className="lg:invisible">
            <Logo className="h-8" />
          </a>
          <ThemeToggle />
        </header>

        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm has-[[data-wide]]:max-w-lg">{children}</div>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} PropFlow</span>
          <nav className="flex gap-4">
            <LegalLink doc="privacy" className="font-normal text-inherit hover:text-foreground hover:no-underline">
              Privacy
            </LegalLink>
            <LegalLink doc="terms" className="font-normal text-inherit hover:text-foreground hover:no-underline">
              Terms
            </LegalLink>
            <ContactSupportLink className="hover:text-foreground">Contact support</ContactSupportLink>
          </nav>
        </footer>
      </div>
    </div>
  )
}
