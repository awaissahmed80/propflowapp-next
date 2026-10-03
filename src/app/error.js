"use client"

import { ErrorPage } from "@/components/error-pages"

export default function Error({ error, reset }) {
  return <ErrorPage error={error} reset={reset} />
}
