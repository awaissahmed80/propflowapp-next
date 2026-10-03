import { Inter, Lora, Manrope, Playfair_Display, Poppins } from "next/font/google"

// Fonts a landing page can use (Page › Design). Loaded once; each exposes a CSS variable, and the
// page picks one with font-family.
const inter = Inter({ subsets: ["latin"], variable: "--lp-font-inter", display: "swap" })
const manrope = Manrope({ subsets: ["latin"], variable: "--lp-font-manrope", display: "swap" })
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--lp-font-poppins", display: "swap" })
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--lp-font-playfair", display: "swap" })
const lora = Lora({ subsets: ["latin"], variable: "--lp-font-lora", display: "swap" })

export const landingFontVars = [inter, manrope, poppins, playfair, lora].map((f) => f.variable).join(" ")
// Headings use the chosen font; body text stays readable (serif fonts only for headings)
export const fontStack = (key) =>
  ({
    inter: { heading: "var(--lp-font-inter)", body: "var(--lp-font-inter)" },
    manrope: { heading: "var(--lp-font-manrope)", body: "var(--lp-font-manrope)" },
    poppins: { heading: "var(--lp-font-poppins)", body: "var(--lp-font-poppins)" },
    playfair: { heading: "var(--lp-font-playfair)", body: "var(--lp-font-inter)" },
    lora: { heading: "var(--lp-font-lora)", body: "var(--lp-font-inter)" },
  })[key] ?? { heading: "var(--lp-font-inter)", body: "var(--lp-font-inter)" }
