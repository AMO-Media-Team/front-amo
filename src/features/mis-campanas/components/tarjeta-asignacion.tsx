"use client"

import Link from "next/link"
import { useId } from "react"

import {
  InsigniaEstado,
  MarcaPlataforma,
} from "@/features/operacion/components/distintivos"
import { formatearHandle } from "@/features/operacion/formato"
import { formatearCOP } from "@/lib/format"
import { cn } from "@/lib/utils"

import { ESTADOS_PARA_MEDIO } from "../estados"
import { rutaAsignacionMedio } from "../rutas"
import type { TarjetaAsignacion } from "../tablero"
import { PasoSiguiente } from "./paso-siguiente"

/**
 * Una asignación en el tablero (MED-011): formato y plataforma, estado en voz
 * del medio, la oferta y la marca, lo que sigue con su cuenta regresiva y lo
 * que recibe. El título abre la ficha (toda la tarjeta es su área de toque);
 * el botón de la acción va directo a hacerla.
 */
export function TarjetaAsignacionMedio({
  tarjeta,
  ahoraServidor,
  puedeEjecutar,
  puedeDisputar,
  indice = 0,
}: {
  tarjeta: TarjetaAsignacion
  ahoraServidor: number
  puedeEjecutar: boolean
  /** `disputas.abrir`: el botón para reclamar una vencida. */
  puedeDisputar: boolean
  /** Posición en la lista: escalona la animación de entrada. */
  indice?: number
}) {
  const idTitulo = useId()
  const contexto = [
    tarjeta.marca,
    tarjeta.handle ? formatearHandle(tarjeta.handle) : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <article
      aria-labelledby={idTitulo}
      style={{ animationDelay: `${Math.min(indice, 8) * 40}ms` }}
      className={cn(
        "group relative flex h-full animate-aparecer-arriba flex-col gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-primary/40 has-[a[data-titulo]:focus-visible]:ring-3 has-[a[data-titulo]:focus-visible]:ring-ring/50",
        tarjeta.paso.tipo === "accion" && "border-primary/25"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <MarcaPlataforma plataforma={tarjeta.plataforma} />
          <span className="truncate">{tarjeta.formatoNombre}</span>
        </span>
        <InsigniaEstado catalogo={ESTADOS_PARA_MEDIO} estado={tarjeta.estado} />
      </div>

      <div className="flex min-w-0 flex-col gap-0.5">
        {contexto ? (
          <p className="truncate text-xs font-medium text-muted-foreground">
            {contexto}
          </p>
        ) : null}
        <h3
          id={idTitulo}
          className="text-base leading-snug font-semibold text-balance break-words"
        >
          <Link
            data-titulo
            href={rutaAsignacionMedio(tarjeta.id)}
            className="outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[''] hover:underline hover:underline-offset-4"
          >
            {tarjeta.ofertaTitulo}
          </Link>
        </h3>
      </div>

      <PasoSiguiente
        paso={tarjeta.paso}
        ahoraServidor={ahoraServidor}
        puedeEjecutar={puedeEjecutar}
        puedeDisputar={puedeDisputar}
        className="rounded-xl border bg-background/50 p-3"
      />

      <p className="mt-auto flex items-baseline justify-between gap-3 border-t pt-3 text-sm">
        <span className="text-xs text-muted-foreground">
          Recibes
          {tarjeta.publicaciones > 1
            ? ` por ${tarjeta.publicaciones} publicaciones`
            : ""}
        </span>
        <span className="font-semibold cifras">
          {tarjeta.montoMedio !== null ? formatearCOP(tarjeta.montoMedio) : "—"}
        </span>
      </p>
    </article>
  )
}
