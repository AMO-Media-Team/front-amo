import "server-only"

import { ArrowRight, Handshake } from "lucide-react"
import Link from "next/link"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import { GRUPOS, GRUPOS_ASIGNACION } from "../estados"
import {
  actividadAsignaciones,
  LIMITE_RECIENTES,
} from "../queries/asignaciones-comun"
import { type DuenoAsignaciones, rutaAsignacionesDe } from "../rutas"
import type { ActividadAsignaciones as Actividad } from "../tipos"
import { CLASES_TONO } from "./distintivos"
import { TarjetaFicha } from "./ficha"
import { GraficoActividad } from "./grafico-actividad"
import { ListaAsignaciones } from "./lista-asignaciones"

const SUJETOS: Readonly<Record<DuenoAsignaciones, string>> = {
  medio: "del medio",
  anunciante: "del anunciante",
  campana: "de la campaña",
}

const VACIOS: Readonly<Record<DuenoAsignaciones, string>> = {
  medio:
    "Cuando el medio acepte cupos de una oferta, sus negocios aparecerán aquí.",
  anunciante:
    "Cuando los medios acepten cupos de sus ofertas, los negocios aparecerán aquí.",
  campana:
    "Cuando los medios acepten cupos de las ofertas de esta campaña, aparecerán aquí.",
}

/**
 * Pestaña de asignaciones de una ficha: conteo por grupo de estados (cada uno
 * abre el listado filtrado), la actividad de 12 meses y las más recientes.
 */
export async function SeccionActividad({
  dueno,
  id,
}: {
  dueno: DuenoAsignaciones
  id: string
}) {
  return (
    <ActividadAsignaciones
      dueno={dueno}
      id={id}
      actividad={await actividadAsignaciones(dueno, id)}
    />
  )
}

export function ActividadAsignaciones({
  dueno,
  id,
  actividad,
}: {
  dueno: DuenoAsignaciones
  id: string
  actividad: Actividad
}) {
  const { indicadores, serie, recientes } = actividad

  if (indicadores.total === 0) {
    return (
      <EstadoVacio
        icono={Handshake}
        titulo="Aún no hay asignaciones"
        descripcion={VACIOS[dueno]}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <nav
        aria-label="Asignaciones por grupo de estados"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2"
      >
        {GRUPOS_ASIGNACION.map((grupo, indice) => {
          const { etiqueta, descripcion, tono } = GRUPOS[grupo]
          const cantidad = indicadores.porGrupo[grupo]
          return (
            <Link
              key={grupo}
              href={rutaAsignacionesDe(dueno, id, { grupo })}
              title={descripcion}
              style={{ animationDelay: `${indice * 45}ms` }}
              className={cn(
                "group/grupo flex animate-aparecer-arriba flex-col gap-1 rounded-xl border bg-card px-3.5 py-3 transition-colors hover:border-primary/35 hover:bg-muted/40 focus-visible:anillo-foco motion-reduce:animate-none",
                cantidad === 0 && "text-muted-foreground"
              )}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-full",
                    CLASES_TONO[tono].punto
                  )}
                />
                {etiqueta}
              </span>
              <span className="font-heading text-xl font-semibold cifras">
                {formatearNumero(cantidad)}
              </span>
            </Link>
          )
        })}
      </nav>

      <GraficoActividad serie={serie} sujeto={SUJETOS[dueno]} />

      <TarjetaFicha
        titulo="Asignaciones recientes"
        descripcion={
          indicadores.total > LIMITE_RECIENTES
            ? `Las ${formatearNumero(LIMITE_RECIENTES)} más recientes de ${formatearNumero(indicadores.total)}.`
            : indicadores.total === 1
              ? "La única registrada."
              : `Las ${formatearNumero(indicadores.total)} registradas, de la más reciente a la más antigua.`
        }
        icono={Handshake}
        acciones={
          <EnlaceBoton
            variant="outline"
            size="sm"
            href={rutaAsignacionesDe(dueno, id)}
          >
            Ver todas
            <ArrowRight data-icon="inline-end" aria-hidden />
          </EnlaceBoton>
        }
      >
        <ListaAsignaciones asignaciones={recientes} perspectiva={dueno} />
      </TarjetaFicha>
    </div>
  )
}
