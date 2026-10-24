import { ArrowUpRight, ChevronRight, Scale } from "lucide-react"
import Link from "next/link"

import { rutaDisputaInterna } from "@/features/disputas/rutas"
import { InsigniaEstado } from "@/features/operacion/components/distintivos"
import { ESTADOS_ASIGNACION } from "@/features/operacion/estados"
import { rutaAsignacion } from "@/features/operacion/rutas"
import { formatearCOP } from "@/lib/format"
import { cn } from "@/lib/utils"

import { situacionEnCurso } from "../en-curso"
import type { AsignacionEnCurso } from "../tipos"

const ENLACE =
  "rounded-sm underline-offset-4 outline-none hover:underline focus-visible:underline focus-visible:anillo-foco"

/**
 * Asignaciones en curso de un medio (ADM-002 c2): cada una con su estado, en
 * qué punto va y el enlace a su ficha, donde se cancela con su causa. Las que
 * están en disputa enlazan además a la disputa (se deciden al resolverla).
 * En el diálogo de suspensión los enlaces abren otra pestaña para no perder
 * el motivo escrito; en la ficha, la misma.
 */
export function ListaEnCurso({
  asignaciones,
  enOtraPestana = false,
  verDisputas,
  etiqueta = "Asignaciones en curso",
  className,
}: {
  asignaciones: readonly AsignacionEnCurso[]
  enOtraPestana?: boolean
  /** Con `disputas.ver`, la disputa abierta enlaza a su ficha. */
  verDisputas: boolean
  etiqueta?: string
  className?: string
}) {
  const destino = enOtraPestana
    ? ({ target: "_blank", rel: "noopener noreferrer" } as const)
    : {}
  const IconoEnlace = enOtraPestana ? ArrowUpRight : ChevronRight

  return (
    <ul aria-label={etiqueta} className={cn("flex flex-col gap-2", className)}>
      {asignaciones.map((asignacion) => (
        <li
          key={asignacion.id}
          className="flex flex-col gap-1.5 rounded-lg border bg-card px-3 py-2.5"
        >
          <span className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <Link
              href={rutaAsignacion(asignacion.id)}
              {...destino}
              className={cn(
                "inline-flex min-w-0 items-start gap-1 text-sm font-medium text-pretty break-words",
                ENLACE
              )}
            >
              <span className="min-w-0">{asignacion.oferta}</span>
              <IconoEnlace
                aria-hidden
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
              />
              {enOtraPestana ? (
                <span className="sr-only"> (se abre en otra pestaña)</span>
              ) : null}
            </Link>
            <InsigniaEstado
              catalogo={ESTADOS_ASIGNACION}
              estado={asignacion.estado}
              className="h-5 px-2 text-[0.6875rem]"
            />
          </span>
          <span className="text-xs text-muted-foreground">
            {asignacion.anunciante}
            {asignacion.montoBruto !== null
              ? ` · ${formatearCOP(asignacion.montoBruto)}`
              : ""}
          </span>
          <span className="text-xs text-pretty">
            {situacionEnCurso(asignacion)}
          </span>
          {asignacion.disputaAbiertaId && verDisputas ? (
            <Link
              href={rutaDisputaInterna(asignacion.disputaAbiertaId)}
              {...destino}
              className={cn(
                "inline-flex w-fit items-center gap-1 text-xs font-medium text-primary",
                ENLACE
              )}
            >
              <Scale aria-hidden className="size-3.5" />
              Ver la disputa
              <span className="sr-only">
                {` de «${asignacion.oferta}»`}
                {enOtraPestana ? " (se abre en otra pestaña)" : ""}
              </span>
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
