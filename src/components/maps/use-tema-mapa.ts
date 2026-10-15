"use client"

import { useTheme } from "next-themes"

import type { TemaMapa } from "@/lib/geo/escalas"

/** Tema del mapa según next-themes; el oscuro es el principal de la marca. */
export function useTemaMapa(): TemaMapa {
  const { resolvedTheme } = useTheme()
  return resolvedTheme === "light" ? "claro" : "oscuro"
}
