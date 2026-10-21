"use client"

import { Hand, MousePointerClick } from "lucide-react"
import { AnimatePresence, useReducedMotion } from "motion/react"
import * as m from "motion/react-m"
import { useSyncExternalStore } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { CLASE_PANEL } from "./lienzo"

const CLAVE = "amo.mapa.coachmark.v1"
const EVENTO = "amo:coachmark-mapa"

function leerVisto(): boolean {
  try {
    return window.localStorage.getItem(CLAVE) === "1"
  } catch {
    // Modo privado o almacenamiento bloqueado: se muestra y basta cerrarlo.
    return false
  }
}

function suscribir(notificar: () => void): () => void {
  window.addEventListener("storage", notificar)
  window.addEventListener(EVENTO, notificar)
  return () => {
    window.removeEventListener("storage", notificar)
    window.removeEventListener(EVENTO, notificar)
  }
}

let vistoEnMemoria = false

function marcarVisto(): void {
  vistoEnMemoria = true
  try {
    window.localStorage.setItem(CLAVE, "1")
  } catch {
    // Sin almacenamiento, el aviso no vuelve durante esta sesión.
  }
  window.dispatchEvent(new Event(EVENTO))
}

/** Si el coachmark ya se mostró (en el servidor se asume que sí: nada que pintar). */
function useCoachmarkVisto(): boolean {
  return useSyncExternalStore(
    suscribir,
    () => vistoEnMemoria || leerVisto(),
    () => true
  )
}

interface CoachmarkMapaProps {
  /** Solo cuando el mapa ya se ve. */
  habilitado: boolean
  tactil: boolean
  className?: string
}

/** Aviso de una sola vez: cómo seleccionar y explorar zonas. */
export function CoachmarkMapa({
  habilitado,
  tactil,
  className,
}: CoachmarkMapaProps) {
  const visto = useCoachmarkVisto()
  const reducido = useReducedMotion()
  const Icono = tactil ? Hand : MousePointerClick

  return (
    <AnimatePresence>
      {habilitado && !visto ? (
        <m.div
          role="dialog"
          aria-label="Cómo usar el mapa"
          initial={{
            opacity: 0,
            y: reducido ? 0 : 12,
            scale: reducido ? 1 : 0.98,
          }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: reducido ? 0 : 8 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: 0.6 }}
          className={cn(
            CLASE_PANEL,
            "flex w-[min(22rem,calc(100%-2rem))] items-start gap-3 p-3.5",
            className
          )}
        >
          <span className="relative grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
            <span
              aria-hidden
              className="absolute inset-0 rounded-xl ring-2 ring-primary/40 motion-safe:animate-pulso-anillo"
            />
            <Icono aria-hidden className="size-4.5" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-sm leading-snug">
              <span className="font-semibold">
                {tactil ? "Toca una zona" : "Haz clic en una zona"}
              </span>{" "}
              para ver su detalle. Usa{" "}
              <span className="font-semibold">Explorar</span>
              {tactil ? "" : " o doble clic"} para bajar de nivel.
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="self-start"
              onClick={marcarVisto}
            >
              Entendido
            </Button>
          </div>
        </m.div>
      ) : null}
    </AnimatePresence>
  )
}
