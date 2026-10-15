"use client"

import { Earth, MapPinned } from "lucide-react"
import { useQueryStates } from "nuqs"
import {
  type CSSProperties,
  type ReactNode,
  useId,
  useMemo,
  useState,
  useTransition,
} from "react"

import { parseAsPagina } from "@/components/data-table/estado-url"
import { EstadoError } from "@/components/feedback/estado-error"
import { Esqueleto } from "@/components/feedback/esqueletos"
import {
  leyendaMundo,
  MapaMundi,
  type ZonaMundo,
} from "@/components/maps/mapa-mundi"
import { MiniMapaColombia } from "@/components/maps/mini-mapa-colombia"
import {
  estadoTablaAccesos,
  ID_REGISTRO_ACCESOS,
} from "@/features/accesos/estado-accesos"
import { COLOR_SIN_DATOS } from "@/lib/geo/escalas"
import { formatearNumero, formatearPorcentaje } from "@/lib/format"
import { cn } from "@/lib/utils"

import { useGeometriaNivel } from "../consultas-cliente"
import { urlGeometria } from "../encuadre"
import { CODIGO_COLOMBIA } from "../niveles"
import type { IngresosPorUbicacion } from "../tipos"

const parsersRegistro = {
  pais: estadoTablaAccesos.parsers.pais,
  pagina: parseAsPagina,
}

const URL_PAISES = urlGeometria({ nivel: "internacional", departamento: null })

type Ambito = "mundo" | "colombia"

const AMBITOS: readonly { clave: Ambito; etiqueta: string; detalle: string }[] =
  [
    { clave: "mundo", etiqueta: "Mundo", detalle: "por país" },
    { clave: "colombia", etiqueta: "Colombia", detalle: "por departamento" },
  ]

function ingresos(valor: number): string {
  return `${formatearNumero(valor)} ${valor === 1 ? "ingreso" : "ingresos"}`
}

/** Filtra el registro de accesos por país y baja hasta él (como los atajos de alertas). */
function useFiltrarRegistroPorPais() {
  const [, iniciar] = useTransition()
  const [, fijar] = useQueryStates(parsersRegistro, {
    shallow: false,
    scroll: false,
    startTransition: iniciar,
  })
  return (codigo: string) => {
    void fijar({ pais: [codigo], pagina: null })
    document
      .getElementById(ID_REGISTRO_ACCESOS)
      // Sin `behavior`: rige el `scroll-behavior` global (suave salvo movimiento reducido).
      ?.scrollIntoView({ block: "start" })
  }
}

function LeyendaMundo({ zonas }: { zonas: readonly ZonaMundo[] }) {
  const clases = leyendaMundo(zonas)
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.6875rem] text-muted-foreground">
      {clases.map((clase, indice) => (
        <span key={indice} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 rounded-[3px] bg-(--c-claro) dark:bg-(--c-oscuro)"
            style={
              {
                "--c-claro": clase.colorClaro,
                "--c-oscuro": clase.colorOscuro,
              } as CSSProperties
            }
          />
          <span className="cifras">
            {formatearNumero(clase.desde)}
            {clase.hasta === null ? "+" : ""}
          </span>
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-2.5 rounded-[3px] bg-(--c-claro) dark:bg-(--c-oscuro)"
          style={
            {
              "--c-claro": COLOR_SIN_DATOS.claro,
              "--c-oscuro": COLOR_SIN_DATOS.oscuro,
            } as CSSProperties
          }
        />
        Sin ingresos
      </span>
    </div>
  )
}

function SinUbicar({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-balance text-muted-foreground">
      {children}
    </p>
  )
}

function PanelMundo({ datos }: { datos: IngresosPorUbicacion }) {
  const geometria = useGeometriaNivel(URL_PAISES)
  const filtrar = useFiltrarRegistroPorPais()

  if (datos.paises.length === 0) {
    return <SinUbicar>Ningún ingreso del periodo trae país.</SinUbicar>
  }
  if (geometria.error) {
    return (
      <EstadoError
        compacto
        titulo="No pudimos dibujar el planisferio"
        descripcion={geometria.error.message}
        onReintentar={() => void geometria.refetch()}
        className="rounded-xl bg-foreground/4"
      />
    )
  }
  if (!geometria.data) {
    return <Esqueleto className="aspect-[1000/435] w-full rounded-xl" />
  }
  return (
    <div className="flex flex-col gap-3">
      <MapaMundi
        coleccion={geometria.data.coleccion}
        zonas={datos.paises}
        etiqueta="Ingresos exitosos por país"
        formatear={ingresos}
        onElegir={filtrar}
        describirAccion={(zona) =>
          `${zona.nombre}: ${ingresos(zona.valor)}. Ver sus accesos en el registro`
        }
        className="animate-aparecer-arriba"
      />
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <LeyendaMundo zonas={datos.paises} />
        <p className="text-xs text-muted-foreground">
          Elige un país para ver sus accesos en el registro.
        </p>
      </div>
    </div>
  )
}

function PanelColombia({ datos }: { datos: IngresosPorUbicacion }) {
  // Un departamento sin ingresos se dibuja neutro (como un país sin ingresos),
  // no con el color de la clase más baja.
  const valores = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(datos.departamentos).map(([codigo, valor]) => [
          codigo,
          valor > 0 ? valor : null,
        ])
      ),
    [datos.departamentos]
  )
  if (Object.values(valores).every((valor) => valor === null)) {
    return (
      <SinUbicar>
        Ningún ingreso del periodo se ubicó en un departamento de Colombia.
      </SinUbicar>
    )
  }
  return (
    <MiniMapaColombia
      valores={valores}
      metrica="accesos"
      etiqueta="Ingresos exitosos por departamento"
      etiquetaSinDatos="Sin ingresos"
      className="mx-auto w-full max-w-[17rem] animate-aparecer-arriba @4xl/ingresos:max-w-none"
    />
  )
}

/** Conmutador de mapa para tarjetas estrechas (con espacio, se ven los dos). */
function SelectorAmbito({
  valor,
  onCambiar,
  className,
}: {
  valor: Ambito
  onCambiar: (ambito: Ambito) => void
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label="Mapa visible"
      className={cn(
        "inline-flex h-8 shrink-0 items-center rounded-lg bg-muted p-[3px]",
        className
      )}
    >
      {AMBITOS.map(({ clave, etiqueta }) => {
        const activo = valor === clave
        return (
          <button
            key={clave}
            type="button"
            aria-pressed={activo}
            onClick={() => onCambiar(clave)}
            className={cn(
              "inline-flex h-full items-center gap-1.5 rounded-md border border-transparent px-2.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:anillo-foco [&_svg]:size-4",
              activo
                ? "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30"
                : "text-foreground/70 hover:text-foreground dark:text-muted-foreground"
            )}
          >
            {clave === "mundo" ? <Earth aria-hidden /> : null}
            {etiqueta}
          </button>
        )
      })}
    </div>
  )
}

function resumen(datos: IngresosPorUbicacion): string {
  const colombia =
    datos.paises.find((zona) => zona.codigo === CODIGO_COLOMBIA)?.valor ?? 0
  const partes = [
    `${ingresos(datos.total)} ${datos.total === 1 ? "exitoso" : "exitosos"}`,
    `${formatearNumero(datos.paises.length)} ${datos.paises.length === 1 ? "país" : "países"}`,
  ]
  if (datos.total > 0) {
    partes.push(
      `${formatearPorcentaje(colombia / datos.total, 0)} desde Colombia`
    )
  }
  return partes.join(" · ")
}

/**
 * Proporción entre los dos mapas para que midan lo mismo de alto: el
 * planisferio es apaisado (1000 × 435) y Colombia, vertical (1000 × 1370).
 */
const COLUMNAS_MAPAS =
  "@4xl/ingresos:grid-cols-[minmax(0,1fr)_minmax(0,0.3175fr)]"

/**
 * Mapa de los ingresos del periodo (página de Accesos): planisferio por país
 * y Colombia por departamento, en SVG (sin Mapbox: la página no paga el peso
 * del explorador). Con espacio se ven los dos, uno junto al otro; en tarjetas
 * estrechas, uno a la vez con un conmutador. Elegir un país filtra el registro.
 */
export function TarjetaMapaIngresos({
  datos,
}: {
  datos: IngresosPorUbicacion
}) {
  const idTitulo = useId()
  const [ambito, setAmbito] = useState<Ambito>("mundo")
  return (
    <section
      aria-labelledby={idTitulo}
      className="@container/ingresos flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 transition-colors duration-300 hover:border-foreground/15 sm:p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary [&_svg]:size-4">
            <MapPinned aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3
              id={idTitulo}
              className="font-heading text-[0.9375rem] leading-snug font-semibold"
            >
              Mapa de ingresos
            </h3>
            <p className="text-[0.8125rem] cifras text-muted-foreground">
              {resumen(datos)}
            </p>
          </div>
        </div>
        <SelectorAmbito
          valor={ambito}
          onCambiar={setAmbito}
          className="@4xl/ingresos:hidden"
        />
      </header>

      <div className={cn("grid items-start gap-x-8 gap-y-4", COLUMNAS_MAPAS)}>
        {AMBITOS.map(({ clave, etiqueta, detalle }) => (
          <section
            key={clave}
            aria-label={`${etiqueta}, ${detalle}`}
            className={cn(
              "min-w-0 flex-col gap-3",
              // En tarjetas estrechas solo se ve el mapa elegido.
              ambito === clave ? "flex" : "hidden @4xl/ingresos:flex"
            )}
          >
            <p
              aria-hidden
              className="hidden items-baseline gap-1.5 text-[0.6875rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase @4xl/ingresos:flex"
            >
              {etiqueta}
              <span className="font-normal tracking-normal normal-case">
                · {detalle}
              </span>
            </p>
            {clave === "mundo" ? (
              <PanelMundo datos={datos} />
            ) : (
              <PanelColombia datos={datos} />
            )}
          </section>
        ))}
      </div>

      {datos.estimado ? (
        <p className="text-xs text-muted-foreground">
          Cifras estimadas a partir de una muestra del periodo.
        </p>
      ) : null}
    </section>
  )
}
