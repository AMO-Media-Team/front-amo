import { Suspense } from "react"

import { EsqueletoTablaDatos } from "@/components/data-table/esqueleto-tabla"
import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { Esqueleto } from "@/components/feedback/esqueletos"
import { contar } from "@/features/operacion/formato"
import { formatearCOP } from "@/lib/format"

import { hoyBogota } from "../periodo"
import {
  listarLiquidaciones,
  pendientesLiquidacion,
  periodoSugerido,
  politicaSegSocial,
} from "../queries"
import type { MedioCorte } from "../tipos"
import {
  type AccesoLiquidaciones,
  estadoTablaLiquidaciones,
  estadoTablaPendientes,
  ID_TITULO_VISTA,
  VISTAS,
  type VistaLiquidaciones,
  type VistaPorEstado,
  vistaPendientes,
} from "../vistas"
import { DialogoGenerarCorte } from "./dialogo-generar-corte"
import { TablaBorradores } from "./tabla-borradores"
import { TablaLiquidaciones } from "./tabla-liquidaciones"
import { TablaPendientes } from "./tabla-pendientes"

type ParametrosBusqueda = Promise<Record<string, string | string[] | undefined>>

/** Resumen de lo pendiente y «Generar corte» (con `liquidaciones.generar`). */
async function CabeceraPendientes({ generar }: { generar: boolean }) {
  const [filas, sugerido] = await Promise.all([
    pendientesLiquidacion(),
    generar ? periodoSugerido() : null,
  ])
  const total = filas.reduce((suma, fila) => suma + fila.montoMedio, 0)
  const medios: MedioCorte[] = filas.map((fila) => ({
    medioId: fila.medioId,
    primeraVerificada: fila.primeraVerificada,
    ultimaLiquidacionFin: fila.ultimaLiquidacionFin,
  }))
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-pretty">
        {filas.length === 0 ? (
          "Ningún medio tiene asignaciones verificadas por liquidar."
        ) : (
          <>
            <span className="font-medium">
              {contar(filas.length, "medio", "medios")}
            </span>{" "}
            con verificadas por liquidar:{" "}
            <span className="font-medium cifras">{formatearCOP(total)}</span>{" "}
            <span className="text-muted-foreground">
              (estimado antes de retenciones).
            </span>
          </>
        )}
      </p>
      {sugerido ? (
        <DialogoGenerarCorte
          sugerido={sugerido}
          medios={medios}
          hoy={hoyBogota()}
        />
      ) : null}
    </div>
  )
}

async function ContenidoPendientes({
  searchParams,
  acceso,
}: {
  searchParams: ParametrosBusqueda
  acceso: AccesoLiquidaciones
}) {
  const [filas, estado, sugerido] = await Promise.all([
    pendientesLiquidacion(),
    estadoTablaPendientes.cargar(searchParams),
    acceso.generar ? periodoSugerido() : null,
  ])
  const pagina = vistaPendientes(filas, estado)
  return (
    <TablaPendientes
      filas={pagina.filas}
      total={pagina.total}
      ahora={new Date().getTime()}
      sugerido={
        sugerido ? { inicio: sugerido.inicio, fin: sugerido.fin } : null
      }
      hoy={hoyBogota()}
      verMedios={acceso.verMedios}
    />
  )
}

async function ContenidoPorEstado({
  vista,
  searchParams,
  acceso,
  actorId,
}: {
  vista: VistaPorEstado
  searchParams: ParametrosBusqueda
  acceso: AccesoLiquidaciones
  actorId: string
}) {
  const estado = await estadoTablaLiquidaciones.cargar(searchParams)
  const [pagina, politica] = await Promise.all([
    listarLiquidaciones(vista, estado, actorId),
    vista === "borrador" ? politicaSegSocial() : null,
  ])
  const ahora = new Date().getTime()
  if (vista === "borrador") {
    return (
      <TablaBorradores
        filas={pagina.filas}
        total={pagina.total}
        ahora={ahora}
        puedeAprobar={acceso.aprobar}
        superadmin={acceso.superadmin}
        politica={politica ?? "ALERTA"}
      />
    )
  }
  return (
    <TablaLiquidaciones
      vista={vista}
      filas={pagina.filas}
      total={pagina.total}
      ahora={ahora}
    />
  )
}

/**
 * La vista elegida en la URL con su título (destino del foco tras aprobar),
 * su resumen, su esqueleto mientras carga y su error aislado del resto.
 */
export function VistaLiquidacionesActiva({
  vista,
  searchParams,
  acceso,
  actorId,
}: {
  vista: VistaLiquidaciones
  searchParams: ParametrosBusqueda
  acceso: AccesoLiquidaciones
  actorId: string
}) {
  const { titulo, descripcion } = VISTAS[vista]
  const recurso = `las liquidaciones «${titulo.toLocaleLowerCase("es-CO")}»`
  return (
    <section aria-labelledby={ID_TITULO_VISTA} className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2
          id={ID_TITULO_VISTA}
          tabIndex={-1}
          className="text-lg font-semibold outline-none focus-visible:anillo-foco"
        >
          {titulo}
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">
          {descripcion}
        </p>
      </div>
      {vista === "pendientes" ? (
        <LimiteErrorTabla recurso="el resumen de lo pendiente">
          <Suspense fallback={<Esqueleto className="h-16 rounded-xl" />}>
            <CabeceraPendientes generar={acceso.generar} />
          </Suspense>
        </LimiteErrorTabla>
      ) : null}
      <LimiteErrorTabla recurso={recurso}>
        <Suspense
          key={vista}
          fallback={
            <EsqueletoTablaDatos
              columnas={6}
              filtros={vista === "pendientes" ? 2 : 1}
            />
          }
        >
          {vista === "pendientes" ? (
            <ContenidoPendientes searchParams={searchParams} acceso={acceso} />
          ) : (
            <ContenidoPorEstado
              vista={vista}
              searchParams={searchParams}
              acceso={acceso}
              actorId={actorId}
            />
          )}
        </Suspense>
      </LimiteErrorTabla>
    </section>
  )
}
