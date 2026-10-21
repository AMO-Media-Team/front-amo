import { ChevronRight } from "lucide-react"
import Link from "next/link"

import {
  formatearCOP,
  formatearCOPCompacto,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"

import { cn } from "@/lib/utils"

import { proporcion } from "../calculos"
import { ESTADOS_CAMPANA } from "../estados"
import { formatearVigencia } from "../formato"
import { rutaCampana } from "../rutas"
import type { CampanaFila, DesempenoCampana } from "../tipos"
import { BarraLlenado, InsigniaEstado, MarcaPlataforma } from "./distintivos"

function Cifra({
  etiqueta,
  valor,
  completo,
  className,
}: {
  etiqueta: string
  valor: string
  completo?: string
  /** Ancho fijo en escritorio: las cifras quedan en columna entre filas. */
  className: string
}) {
  return (
    <span
      className={cn("flex flex-col sm:items-end", className)}
      title={completo}
    >
      <span className="text-[0.6875rem] text-muted-foreground">{etiqueta}</span>
      <span className="text-sm font-medium cifras">{valor}</span>
    </span>
  )
}

/**
 * Campañas de un anunciante (ficha): estado, vigencia, plataformas, uso del
 * presupuesto y, con `reportes.ver`, su desempeño verificado. Cada fila abre
 * la ficha de la campaña.
 */
export function ListaCampanas({
  campanas,
  desempeno,
}: {
  campanas: readonly CampanaFila[]
  /** `null` sin permiso de reportes. */
  desempeno: ReadonlyMap<string, DesempenoCampana> | null
}) {
  return (
    <ul className="-mx-2 flex flex-col">
      {campanas.map((campana, indice) => {
        const uso = proporcion(
          campana.presupuestoComprometido,
          campana.presupuestoTotal
        )
        const resultado = desempeno?.get(campana.id)
        return (
          <li
            key={campana.id}
            style={{ animationDelay: `${Math.min(indice, 12) * 35}ms` }}
            className="animate-aparecer-arriba border-b last:border-b-0 motion-reduce:animate-none"
          >
            <Link
              href={rutaCampana(campana.id)}
              className="group/fila grid gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/60 focus-visible:anillo-foco sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{campana.nombre}</span>
                  <InsigniaEstado
                    catalogo={ESTADOS_CAMPANA}
                    estado={campana.estado}
                    className="h-5 px-2 text-[0.6875rem]"
                  />
                </span>
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>{campana.marca}</span>
                  <span aria-hidden>·</span>
                  <span className="cifras">
                    {formatearVigencia(campana.fechaInicio, campana.fechaFin)}
                  </span>
                  {campana.plataformas.length > 0 ? (
                    <span className="flex items-center gap-1">
                      {campana.plataformas.map((plataforma) => (
                        <MarcaPlataforma
                          key={plataforma}
                          plataforma={plataforma}
                        />
                      ))}
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:flex-nowrap">
                <span
                  className="flex w-48 flex-col gap-1"
                  title={`${formatearCOP(campana.presupuestoComprometido)} comprometidos de ${formatearCOP(campana.presupuestoTotal)}`}
                >
                  <span className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">Presupuesto</span>
                    <span className="cifras whitespace-nowrap">
                      {formatearCOPCompacto(campana.presupuestoComprometido)} /{" "}
                      {formatearCOPCompacto(campana.presupuestoTotal)}
                    </span>
                  </span>
                  <BarraLlenado fraccion={uso} tono="info" />
                </span>
                <Cifra
                  etiqueta="Cupos"
                  className="sm:w-16"
                  valor={`${formatearNumero(campana.cuposOcupados)} / ${formatearNumero(campana.cuposTotales)}`}
                />
                {desempeno ? (
                  <>
                    <Cifra
                      etiqueta="GMV verificado"
                      className="sm:w-24"
                      valor={formatearCOPCompacto(
                        resultado?.gmvVerificado ?? 0
                      )}
                      completo={formatearCOP(resultado?.gmvVerificado ?? 0)}
                    />
                    <Cifra
                      etiqueta="Engagement"
                      className="sm:w-20"
                      valor={
                        resultado?.engagement == null
                          ? "—"
                          : formatearPorcentaje(resultado.engagement, 1)
                      }
                    />
                  </>
                ) : null}
                <ChevronRight
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover/fila:translate-x-0.5 max-sm:hidden"
                />
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
