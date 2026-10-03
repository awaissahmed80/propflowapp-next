import { urlCode } from "@/lib/url"

// Projects by their code, lowercased: /estate/projects/ske
export const projectHref = (code) => `/project-portfolio/projects/${urlCode(code)}`
