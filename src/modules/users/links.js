import { urlCode } from "@/lib/url"

// A person's profile opens in a modal on Users: /users/people?member=mem-00001
export const memberHref = (code) => `/users/people?member=${urlCode(code)}`
