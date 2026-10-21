import { ChevronRight } from "lucide-react"
import Link from "next/link"

import { formatearCOP, formatearFecha } from "@/lib/format"

import { ESTADOS_ASIGNACION } from "../estados"
import { type DuenoAsignaciones, rutaAsignacion } from "../rutas"
import type { AsignacionResumen } from "../tipos"
import { InsigniaEstado, MarcaPlataforma } from "./distintivos"

/** Contraparte que importa según desde dónde se mira la asignación. */
function titulos(
  asignacion: AsignacionResumen,
  perspectiva: DuenoAsignaciones
): { principal: string; secundario: string | null } {
  const sinNombre = "Sin nombre visible"
  switch (perspectiva) {
    case "medio":
      return {
        principal: asignacion.campana ?? asignacion.oferta ?? sinNombre,
        secundario: asignacion.anunciante,
      }
    case "anunciante":
      return {
        principal: asignacion.medio ?? sinNombre,
        secundario: asignacion.campana,
      }
    case "campana":
      return {
        principal: asignacion.medio ?? sinNombre,
        secundario: asignacion.oferta,
      }
  }
}

/**
 * Asignaciones más recientes de una ficha. Cada fila enlaza a la ficha de la
 * asignación; el estado y el monto quedan a la derecha (debajo en móvil).
 */
export function ListaAsignaciones({
  asignaciones,
  perspectiva,
}: {
  asignaciones: readonly AsignacionResumen[]
  perspectiva: DuenoAsignaciones
}) {
  return (
    <ul className="-mx-2 flex flex-col">
      {asignaciones.map((asignacion, indice) => {
        const { principal, secundario } = titulos(asignacion, perspectiva)
        return (
          <li
            key={asignacion.id}
            style={{ animationDelay: `${indice * 35}ms` }}
            className="animate-aparecer-arriba motion-reduce:animate-none"
          >
            <Link
              href={rutaAsignacion(asignacion.id)}
              className="group/fila flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60 focus-visible:anillo-foco"
            >
              <MarcaPlataforma plataforma={asignacion.plataforma} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-4">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {principal}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[
                      secundario,
                      asignacion.franja ? `Franja ${asignacion.franja}` : null,
                      formatearFecha(
                        asignacion.aceptadaAt ?? asignacion.creadaAt
                      ),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3 sm:justify-end">
                  <InsigniaEstado
                    catalogo={ESTADOS_ASIGNACION}
                    estado={asignacion.estado}
                    className="h-5 px-2 text-[0.6875rem]"
                  />
                  <span className="w-24 text-right text-sm font-medium cifras max-sm:w-auto">
                    {formatearCOP(asignacion.montoBruto)}
                  </span>
                </span>
              </span>
              <ChevronRight
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover/fila:translate-x-0.5"
              />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
