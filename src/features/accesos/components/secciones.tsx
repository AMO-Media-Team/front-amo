import "server-only"

import { Building2, Earth, MapPinned, MapPinOff } from "lucide-react"
import type { ReactNode } from "react"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { cargarPeriodo, etiquetaRango } from "@/features/auditoria/periodo"
import { MapaIngresos } from "@/features/geo/components/mapa-ingresos"
import { rutaExplorador } from "@/features/geo/rutas"
import { tieneAlgunPermiso } from "@/lib/auth/dal"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { serializarRango } from "@/lib/fechas"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  estadoTablaAccesos,
  filtrosDeEstado,
  ID_REGISTRO_ACCESOS,
} from "../estado-accesos"
import {
  actividadAccesos,
  alertasSospechosas,
  eventosDeSesion,
  listarAccesos,
  paisesDelPeriodo,
  rankingsAccesos,
  resumenAccesos,
  totalSospechosos,
} from "../queries"
import type { RankingsAccesos } from "../tipos"
import { ActividadAccesos } from "./actividad-accesos"
import { PanelSeguridad } from "./panel-seguridad"
import { MetricasAccesos } from "./metricas-accesos"
import { RankingUbicaciones } from "./ranking-ubicaciones"
import { TablaAccesos } from "./tabla-accesos"

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/**
 * Secciones de la página de Accesos (Server Components). Cada una va en su
 * `<Suspense>` y su límite de error; la muestra del periodo se lee una sola
 * vez por solicitud (`React.cache` en las consultas) y la comparten todas.
 */

export async function SeccionMetricasAccesos({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { rango } = await cargarPeriodo(searchParams)
  return <MetricasAccesos resumen={await resumenAccesos(rango)} />
}

/** Alertas de seguridad (sospechosos) junto al mapa de calor día × hora. */
export async function SeccionSeguridadAccesos({
  searchParams,
  usuario,
}: {
  searchParams: SearchParams
  usuario: UsuarioSesion
}) {
  const { rango } = await cargarPeriodo(searchParams)
  const [sospechosos, alertas, actividad, sesion] = await Promise.all([
    totalSospechosos(rango),
    alertasSospechosas(rango, usuario),
    actividadAccesos(rango),
    eventosDeSesion(rango),
  ])
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <PanelSeguridad
        alertas={alertas}
        total={sospechosos}
        conteos={sesion.conteos}
        enlazarUsuarios={tieneAlgunPermiso(usuario, ["usuarios.ver"])}
      />
      <ActividadAccesos actividad={actividad} className="lg:col-span-2" />
    </div>
  )
}

function notaSinUbicacion(rankings: RankingsAccesos): string | null {
  if (rankings.sinUbicacion === 0 || rankings.sinUbicacion === rankings.total)
    return null
  const n = rankings.sinUbicacion
  return `${formatearNumero(n)} ${n === 1 ? "ingreso" : "ingresos"} sin ubicación (red local o VPN) no ${n === 1 ? "se cuenta" : "se cuentan"}.`
}

/** Ningún ingreso trae ubicación: un solo aviso en lugar de dos rankings vacíos. */
function SinUbicacion() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card/40 px-6 py-8 text-center sm:flex-row sm:text-left">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
        <MapPinOff className="size-5" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{VACIO_UBICACION.titulo}</p>
        <p className="max-w-2xl text-[0.8125rem] text-muted-foreground">
          {VACIO_UBICACION.descripcion}
        </p>
      </div>
    </div>
  )
}

const VACIO_UBICACION = {
  titulo: "Sin ubicación en los ingresos",
  descripcion:
    "Los ingresos de este periodo no traen país ni ciudad: pasa en redes locales o de desarrollo. En producción, la ubicación llega con cada conexión.",
}

/**
 * Distribución de "Origen de los ingresos".
 *
 * Ranura del mapa de accesos (`MapaIngresos`, módulo geo): planisferio por
 * país y Colombia por departamento, en SVG, a todo el ancho; debajo, los
 * rankings comparten la fila. Sin mapa, quedan solo los rankings y el
 * encabezado enlaza al explorador.
 */
function DisposicionOrigen({
  mapa,
  paises,
  ciudades,
}: {
  mapa?: ReactNode
  paises: ReactNode
  ciudades: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4">
      {mapa ? <div className="min-w-0">{mapa}</div> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {paises}
        {ciudades}
      </div>
    </div>
  )
}

function EncabezadoSeccion({
  id,
  titulo,
  descripcion,
  accion,
  className,
}: {
  id: string
  titulo: string
  descripcion: ReactNode
  accion?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-4 gap-y-2",
        className
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h2
          id={id}
          className="font-heading text-lg leading-tight font-semibold"
        >
          {titulo}
        </h2>
        <p className="text-sm text-muted-foreground">{descripcion}</p>
      </div>
      {accion}
    </div>
  )
}

export async function SeccionOrigenAccesos({
  searchParams,
  usuario,
}: {
  searchParams: SearchParams
  usuario: UsuarioSesion
}) {
  const { rango } = await cargarPeriodo(searchParams)
  const rankings = await rankingsAccesos(rango)
  const nota = notaSinUbicacion(rankings)
  const enlaceMapa = tieneAlgunPermiso(usuario, ["analitica.mapa"])
    ? rutaExplorador({
        nivel: "internacional",
        metrica: "accesos",
        periodo: serializarRango(rango),
      })
    : null

  return (
    <section
      aria-labelledby="titulo-origen-accesos"
      className="flex flex-col gap-4"
    >
      <EncabezadoSeccion
        id="titulo-origen-accesos"
        titulo="Origen de los ingresos"
        descripcion={`Desde dónde se conectan las personas · ${formatearNumero(rankings.total)} ${rankings.total === 1 ? "ingreso exitoso" : "ingresos exitosos"}`}
        accion={
          enlaceMapa ? (
            <EnlaceBoton variant="outline" size="sm" href={enlaceMapa}>
              <MapPinned data-icon="inline-start" aria-hidden />
              Ver en el mapa
            </EnlaceBoton>
          ) : null
        }
      />
      {rankings.paises.length === 0 && rankings.ciudades.length === 0 ? (
        <SinUbicacion />
      ) : (
        <DisposicionOrigen
          mapa={<MapaIngresos rango={rango} usuario={usuario} />}
          paises={
            <RankingUbicaciones
              titulo="Países"
              descripcion="Ingresos exitosos por país de conexión"
              icono={<Earth aria-hidden />}
              elementos={rankings.paises}
              vacio={VACIO_UBICACION}
              nota={nota}
            />
          }
          ciudades={
            <RankingUbicaciones
              titulo="Ciudades"
              descripcion="Municipio en Colombia o ciudad reportada en el exterior"
              icono={<Building2 aria-hidden />}
              elementos={rankings.ciudades}
              vacio={VACIO_UBICACION}
              nota={nota}
            />
          }
        />
      )}
    </section>
  )
}

export async function SeccionRegistroAccesos({
  searchParams,
  usuario,
}: {
  searchParams: SearchParams
  usuario: UsuarioSesion
}) {
  const [estado, { rango }] = await Promise.all([
    estadoTablaAccesos.cargar(searchParams),
    cargarPeriodo(searchParams),
  ])
  const [pagina, paises] = await Promise.all([
    listarAccesos(estado, filtrosDeEstado(estado), rango, usuario),
    paisesDelPeriodo(rango),
  ])
  return (
    <section
      id={ID_REGISTRO_ACCESOS}
      aria-labelledby="titulo-registro-accesos"
      className="flex scroll-mt-20 flex-col gap-4"
    >
      <EncabezadoSeccion
        id="titulo-registro-accesos"
        titulo="Registro de accesos"
        descripcion={
          <span aria-live="polite">
            <span className="font-medium cifras text-foreground">
              {formatearNumero(pagina.total)}
            </span>{" "}
            {pagina.total === 1 ? "evento" : "eventos"} · {etiquetaRango(rango)}
          </span>
        }
      />
      <TablaAccesos
        filas={pagina.filas}
        total={pagina.total}
        paises={paises}
        enlazarUsuarios={tieneAlgunPermiso(usuario, ["usuarios.ver"])}
      />
    </section>
  )
}
