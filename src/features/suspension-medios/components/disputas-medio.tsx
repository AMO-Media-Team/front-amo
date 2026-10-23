import { ArrowRight, Scale } from "lucide-react"
import Link from "next/link"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { rutaDisputaInterna } from "@/features/disputas/rutas"
import { InsigniaEstado } from "@/features/operacion/components/distintivos"
import { ESTADOS_DISPUTA, MOTIVOS_DISPUTA } from "@/features/operacion/estados"
import { contar } from "@/features/operacion/formato"
import { rutaAsignacion } from "@/features/operacion/rutas"
import { TarjetaFicha } from "@/features/usuarios/components/tarjeta-ficha"
import { formatearNumero } from "@/lib/format"

import {
  resumirDisputas,
  textoAperturaDisputa,
  textoEfectoDisputa,
} from "../disputas"
import type { DisputaDelMedio } from "../tipos"

function Disputa({
  disputa,
  verAsignaciones,
}: {
  disputa: DisputaDelMedio
  verAsignaciones: boolean
}) {
  const idTitulo = `disputa-${disputa.id}`
  const oferta = disputa.asignacion.oferta ?? "Oferta sin título"
  return (
    <li>
      <article
        aria-labelledby={idTitulo}
        className="flex flex-col gap-2 rounded-lg border bg-card px-4 py-3"
      >
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 id={idTitulo} className="text-sm font-semibold text-pretty">
              {MOTIVOS_DISPUTA[disputa.motivo]} · {oferta}
            </h3>
            <p className="text-xs text-muted-foreground">
              {textoAperturaDisputa(disputa)}
            </p>
          </div>
          <InsigniaEstado catalogo={ESTADOS_DISPUTA} estado={disputa.estado} />
        </header>

        <p className="text-xs text-muted-foreground">
          {verAsignaciones ? (
            <Link
              href={rutaAsignacion(disputa.asignacion.id)}
              className="rounded-sm font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:underline focus-visible:anillo-foco"
            >
              Ver la asignación
              <span className="sr-only">{` de «${oferta}»`}</span>
            </Link>
          ) : (
            "Asignación"
          )}
          {disputa.asignacion.anunciante
            ? ` · ${disputa.asignacion.anunciante}`
            : ""}
        </p>

        <p className="line-clamp-3 text-sm text-pretty break-words">
          {disputa.descripcion}
        </p>

        <div className="flex flex-col gap-1 rounded-lg bg-muted/50 px-3 py-2 text-xs text-pretty">
          <p>{textoEfectoDisputa(disputa)}</p>
          {disputa.resolucion ? (
            <p className="break-words">
              <span className="font-medium">Resolución:</span>{" "}
              {disputa.resolucion}
            </p>
          ) : null}
        </div>

        <EnlaceBoton
          variant="outline"
          size="sm"
          className="w-fit"
          href={rutaDisputaInterna(disputa.id)}
        >
          Ver la disputa
          <span className="sr-only">{` sobre «${oferta}»`}</span>
          <ArrowRight data-icon="inline-end" aria-hidden />
        </EnlaceBoton>
      </article>
    </li>
  )
}

/**
 * Pestaña «Disputas» de la ficha del medio (ADM-002): las de sus asignaciones,
 * abiertas primero, con su estado, quién la abrió, qué pasó con la asignación
 * y el enlace a la disputa (el hilo y la resolución viven allí).
 */
export function DisputasMedio({
  disputas,
  verAsignaciones,
  cerradasMostradas,
}: {
  disputas: readonly DisputaDelMedio[]
  verAsignaciones: boolean
  /** Si hay más cerradas que las que se leyeron, cuántas se muestran (`null`: todas). */
  cerradasMostradas: number | null
}) {
  if (disputas.length === 0) {
    return (
      <EstadoVacio
        icono={Scale}
        titulo="Sin disputas"
        descripcion="Ninguna de sus asignaciones ha tenido una disputa."
      />
    )
  }
  const resumen = resumirDisputas(disputas)
  const abiertas = contar(
    resumen.abiertas,
    "abierta o en revisión",
    "abiertas o en revisión"
  )
  const descripcion =
    cerradasMostradas === null
      ? `${contar(resumen.total, "disputa", "disputas")}: ${abiertas}, ${contar(resumen.resueltas, "resuelta", "resueltas")}, ${contar(resumen.descartadas, "descartada", "descartadas")}.`
      : `${abiertas} y las ${formatearNumero(cerradasMostradas)} cerradas más recientes.`
  return (
    <TarjetaFicha
      titulo="Disputas de sus asignaciones"
      icono={Scale}
      descripcion={descripcion}
    >
      <ul aria-label="Disputas del medio" className="flex flex-col gap-3">
        {disputas.map((disputa) => (
          <Disputa
            key={disputa.id}
            disputa={disputa}
            verAsignaciones={verAsignaciones}
          />
        ))}
      </ul>
    </TarjetaFicha>
  )
}
