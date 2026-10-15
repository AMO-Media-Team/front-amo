"use client"

import { Building, MapPin, Shapes, X } from "lucide-react"
import { useQueryStates } from "nuqs"
import { useTransition } from "react"

import { parseAsPagina } from "@/components/data-table/estado-url"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { SelectorPeriodo } from "@/features/auditoria/components/selector-periodo"
import { listarDepartamentosCliente } from "@/features/geo/departamentos"
import { cn } from "@/lib/utils"

import type { FiltroReporte } from "../catalogo"
import {
  AGRUPACIONES,
  type Agrupacion,
  ETIQUETAS_AGRUPACION,
  parsersFiltros,
} from "../filtros"
import type { OpcionCatalogo } from "../servidor"
import { FiltroOpcion, type OpcionUnica } from "./filtro-opcion"
import { SelectorCorte } from "./selector-corte"

const parsers = { ...parsersFiltros, pagina: parseAsPagina }

const DEPARTAMENTOS: readonly OpcionUnica[] = listarDepartamentosCliente().map(
  (departamento) => ({
    valor: departamento.codigo,
    etiqueta: departamento.nombre,
  })
)

function opcionesDe(catalogo: readonly OpcionCatalogo[]): OpcionUnica[] {
  return catalogo.map((opcion) => ({
    valor: opcion.id,
    etiqueta: opcion.nombre,
  }))
}

function SelectorAgrupacion({
  valor,
  onCambiar,
}: {
  valor: Agrupacion
  onCambiar: (valor: Agrupacion) => void
}) {
  return (
    <div
      role="group"
      aria-label="Detalle por"
      className="inline-flex h-8 items-center rounded-lg bg-muted p-[3px]"
    >
      <span className="px-2 text-[0.8125rem] text-muted-foreground max-sm:sr-only">
        Detalle por
      </span>
      {AGRUPACIONES.map((agrupacion) => {
        const activa = valor === agrupacion
        return (
          <button
            key={agrupacion}
            type="button"
            aria-pressed={activa}
            onClick={() => onCambiar(agrupacion)}
            className={cn(
              "inline-flex h-full items-center rounded-md px-2.5 text-[0.8125rem] font-medium text-muted-foreground transition-all hover:text-foreground focus-visible:anillo-foco",
              activa &&
                "bg-background text-foreground shadow-sm dark:bg-input/40"
            )}
          >
            {ETIQUETAS_AGRUPACION[agrupacion]}
          </button>
        )
      })}
    </div>
  )
}

interface BarraFiltrosReporteProps {
  /** Filtros que aplican a quien consulta (`filtrosPara` del catálogo). */
  filtros: readonly FiltroReporte[]
  /** Opciones del filtro; `null` = no se pudieron cargar (no se ofrece). */
  anunciantes: readonly OpcionCatalogo[] | null
  sectores: readonly OpcionCatalogo[] | null
}

/**
 * Filtros del reporte en la URL: el periodo (mismo selector y contrato que
 * Auditoría y Accesos) y, según el reporte, fecha de corte, departamento,
 * anunciante, sector y agrupación. Cada cambio vuelve a consultar en el
 * servidor, regresa a la primera página de la tabla y conserva lo anterior
 * en pantalla mientras llega lo nuevo.
 */
export function BarraFiltrosReporte({
  filtros,
  anunciantes,
  sectores,
}: BarraFiltrosReporteProps) {
  const usa = (filtro: FiltroReporte) => filtros.includes(filtro)
  const [cargando, iniciar] = useTransition()
  const [valores, fijar] = useQueryStates(parsers, {
    shallow: false,
    scroll: false,
    startTransition: iniciar,
  })

  function cambiar(
    cambios: Partial<
      Record<"departamento" | "anunciante" | "sector" | "corte", string | null>
    >
  ) {
    void fijar({ ...cambios, pagina: null })
  }

  const hayFiltros =
    (usa("departamento") && valores.departamento !== null) ||
    (usa("anunciante") && valores.anunciante !== null) ||
    (usa("sector") && valores.sector !== null) ||
    (usa("corte") && valores.corte !== null)

  return (
    <div
      role="group"
      aria-label="Filtros del reporte"
      className="flex flex-wrap items-center gap-2"
    >
      {usa("periodo") ? <SelectorPeriodo /> : null}
      {usa("corte") ? (
        <SelectorCorte
          valor={valores.corte}
          onCambiar={(corte) => cambiar({ corte })}
        />
      ) : null}
      {usa("departamento") ? (
        <FiltroOpcion
          titulo="Departamento"
          icono={MapPin}
          textoTodos="Todo el país"
          opciones={DEPARTAMENTOS}
          valor={valores.departamento}
          onCambiar={(departamento) => cambiar({ departamento })}
        />
      ) : null}
      {usa("anunciante") && anunciantes && anunciantes.length > 0 ? (
        <FiltroOpcion
          titulo="Anunciante"
          icono={Building}
          textoTodos="Todos los anunciantes"
          opciones={opcionesDe(anunciantes)}
          valor={valores.anunciante}
          onCambiar={(anunciante) => cambiar({ anunciante })}
        />
      ) : null}
      {usa("sector") && sectores && sectores.length > 0 ? (
        <FiltroOpcion
          titulo="Sector"
          icono={Shapes}
          textoTodos="Todos los sectores"
          opciones={opcionesDe(sectores)}
          valor={valores.sector}
          onCambiar={(sector) => cambiar({ sector })}
        />
      ) : null}
      {usa("agrupacion") ? (
        <SelectorAgrupacion
          valor={valores.agrupacion}
          onCambiar={(agrupacion) =>
            void fijar({
              agrupacion: agrupacion === "anunciante" ? null : agrupacion,
              pagina: null,
            })
          }
        />
      ) : null}
      {hayFiltros ? (
        <Button
          variant="ghost"
          onClick={() =>
            cambiar({
              departamento: null,
              anunciante: null,
              sector: null,
              corte: null,
            })
          }
          className="text-muted-foreground"
        >
          <X data-icon="inline-start" aria-hidden />
          Quitar filtros
        </Button>
      ) : null}
      {/* Siempre montada: un lector de pantalla solo anuncia los cambios de
          una región viva que ya existía. */}
      <span
        role="status"
        className={cn(
          "flex items-center gap-1.5 text-xs text-muted-foreground",
          !cargando && "sr-only"
        )}
      >
        {cargando ? (
          <>
            <Spinner className="size-3.5" aria-hidden />
            Actualizando…
          </>
        ) : null}
      </span>
    </div>
  )
}
