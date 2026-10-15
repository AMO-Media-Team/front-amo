import { type LucideIcon, Monitor, Moon, Sun } from "lucide-react"

import type { Tema } from "@/hooks/use-transicion-tema"

export interface OpcionTema {
  valor: Tema
  etiqueta: string
  icono: LucideIcon
}

export const OPCIONES_TEMA: readonly OpcionTema[] = [
  { valor: "light", etiqueta: "Claro", icono: Sun },
  { valor: "dark", etiqueta: "Oscuro", icono: Moon },
  { valor: "system", etiqueta: "Sistema", icono: Monitor },
]

export function esTema(valor: unknown): valor is Tema {
  return OPCIONES_TEMA.some((opcion) => opcion.valor === valor)
}

/**
 * Punto de origen del revelado circular. Solo los eventos de puntero traen
 * coordenadas útiles; con teclado el hook usa el centro de la pantalla.
 */
export function origenDelEvento(
  evento: Event | undefined
): { clientX: number; clientY: number } | undefined {
  return evento instanceof MouseEvent
    ? { clientX: evento.clientX, clientY: evento.clientY }
    : undefined
}
