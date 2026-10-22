"use client"

import { Clock, TimerOff } from "lucide-react"
import { useState } from "react"

import { formatearFechaHora } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  anuncioCambioUrgencia,
  calcularPlazo,
  type EntradaPlazo,
  milisegundosDe,
  NOMBRE_URGENCIA,
  type Plazo,
  type TextosPlazo,
  type UmbralesUrgencia,
  type UrgenciaPlazo,
} from "./plazo"
import { useAhora } from "./use-ahora"

const TONOS: Readonly<
  Record<UrgenciaPlazo, { insignia: string; texto: string; punto: string }>
> = {
  vencida: {
    insignia: "bg-destructive/12 text-destructive font-semibold",
    texto: "text-destructive font-semibold",
    punto: "bg-destructive",
  },
  critica: {
    insignia: "bg-destructive/12 text-destructive font-semibold",
    texto: "text-destructive font-semibold",
    punto: "bg-destructive",
  },
  pronto: {
    insignia: "bg-warning/10 text-warning font-medium",
    texto: "text-warning font-medium",
    punto: "bg-warning",
  },
  holgada: {
    insignia: "bg-muted text-muted-foreground",
    texto: "text-muted-foreground",
    punto: "bg-muted-foreground",
  },
}

function aIso(venceAt: EntradaPlazo): string | undefined {
  const limite = milisegundosDe(venceAt)
  return Number.isFinite(limite) ? new Date(limite).toISOString() : undefined
}

/**
 * Anuncio cortés solo cuando la urgencia cambia después de pintar (no al
 * montar ni en cada minuto). Estado derivado durante el render, sin efectos.
 */
function useAnuncioUrgencia(plazo: Plazo | null, etiqueta?: string): string {
  const urgencia = plazo?.urgencia ?? null
  const [previa, setPrevia] = useState(urgencia)
  const [anuncio, setAnuncio] = useState("")
  if (urgencia !== previa) {
    setPrevia(urgencia)
    if (previa !== null && plazo) {
      setAnuncio(anuncioCambioUrgencia(plazo, etiqueta))
    }
  }
  return anuncio
}

export interface CuentaRegresivaProps {
  /** Fecha límite (ISO, milisegundos o `Date`); sin ella dice «Sin fecha límite». */
  venceAt: EntradaPlazo
  /**
   * `Date.now()` del servidor al pintar. Si el componente se pinta en el
   * servidor, evita el desajuste de hidratación; sin él se muestra un
   * marcador hasta hidratar.
   */
  ahoraServidor?: number
  /** Qué vence («Publicación», «Aceptación»): da contexto al aviso y al `title`. */
  etiqueta?: string
  umbrales?: Partial<UmbralesUrgencia>
  textos?: Partial<TextosPlazo>
  /** `insignia` (fondo de color, por omisión) o `texto` (solo color de letra). */
  variante?: "insignia" | "texto"
  className?: string
}

/**
 * «Vence en 4 h 12 min» que se actualiza sola (cada 30 s) y se colorea por
 * urgencia; el color nunca es el único canal: el ícono cambia al vencer, el
 * `title` da la fecha exacta y un aviso cortés (`aria-live="polite"`) informa
 * cuando el plazo pasa a próximo, urgente o vencido. El punto que late en los
 * plazos urgentes se detiene con movimiento reducido.
 */
export function CuentaRegresiva({
  venceAt,
  ahoraServidor,
  etiqueta,
  umbrales,
  textos,
  variante = "insignia",
  className,
}: CuentaRegresivaProps) {
  const ahora = useAhora(ahoraServidor)
  const plazo = ahora
    ? calcularPlazo(venceAt, ahora, { umbrales, textos })
    : null
  const anuncio = useAnuncioUrgencia(plazo, etiqueta)
  const iso = aIso(venceAt)
  const tono = TONOS[plazo?.urgencia ?? "holgada"]
  const exacta = iso ? formatearFechaHora(iso) : null
  const titulo = [etiqueta, exacta ? `Fecha límite: ${exacta}` : null]
    .filter(Boolean)
    .join(" · ")

  return (
    <span className={cn("inline-flex", className)}>
      <time
        dateTime={iso}
        title={titulo || undefined}
        data-urgencia={plazo?.urgencia}
        className={cn(
          "inline-flex items-center gap-1.5 text-xs cifras",
          variante === "insignia" && "h-6 rounded-full px-2",
          variante === "insignia" ? tono.insignia : tono.texto
        )}
      >
        {plazo?.urgencia === "critica" ? (
          <span aria-hidden className="relative flex size-1.5 shrink-0">
            <span
              className={cn(
                "absolute inset-0 rounded-full opacity-70 motion-safe:animate-ping",
                tono.punto
              )}
            />
            <span
              className={cn("relative size-1.5 rounded-full", tono.punto)}
            />
          </span>
        ) : plazo?.urgencia === "vencida" ? (
          <TimerOff aria-hidden className="size-3.5 shrink-0" />
        ) : (
          <Clock aria-hidden className="size-3.5 shrink-0" />
        )}
        {plazo ? (
          <>
            {plazo.texto}
            {plazo.urgencia !== "holgada" ? (
              <>
                {" "}
                <span className="sr-only">
                  ({NOMBRE_URGENCIA[plazo.urgencia].toLowerCase()})
                </span>
              </>
            ) : null}
          </>
        ) : (
          // Antes de hidratar sin hora del servidor: ancho estable, sin cifras falsas.
          <span className="inline-block h-3 w-16 rounded bg-current/15">
            <span className="sr-only">Calculando el plazo…</span>
          </span>
        )}
      </time>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {anuncio}
      </span>
    </span>
  )
}
