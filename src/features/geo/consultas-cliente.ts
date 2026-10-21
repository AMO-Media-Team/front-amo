"use client"

/**
 * Consultas del explorador desde el navegador (React Query sobre
 * `GET /api/geo/metricas`). La API autoriza con el DAL y valida con zod.
 */
import {
  keepPreviousData,
  type QueryClient,
  skipToken,
  useQuery,
} from "@tanstack/react-query"
import type { FeatureCollection, Geometry } from "geojson"

import type {
  ConsultaMapaGeo,
  ErrorApiGeo,
  RespuestaDetalleGeo,
  RespuestaMapaGeo,
  RespuestaPuntosGeo,
} from "./tipos"

const RUTA_API = "/api/geo/metricas"

/**
 * La analítica cambia despacio (cron diario, cargas de métricas): cinco
 * minutos sin volver a pedir al ir y venir entre niveles, métricas y zonas.
 * El caché del navegador (`max-age=60`) cubre además las recargas.
 */
const VIGENCIA_DATOS_MS = 5 * 60_000

/** Error de la API con el estado HTTP y el mensaje listo para la interfaz. */
export class ErrorConsultaGeo extends Error {
  constructor(
    readonly estado: number,
    readonly motivo: ErrorApiGeo["error"]["motivo"],
    mensaje: string,
    readonly pista?: string
  ) {
    super(mensaje)
    this.name = "ErrorConsultaGeo"
  }
}

export type SolicitudGeo =
  | { readonly vista: "mapa" }
  | { readonly vista: "puntos" }
  | { readonly vista: "detalle"; readonly zona: string }

export function parametrosConsulta(
  consulta: ConsultaMapaGeo,
  solicitud: SolicitudGeo = { vista: "mapa" }
): URLSearchParams {
  const parametros = new URLSearchParams({
    nivel: consulta.nivel,
    metrica: consulta.metrica,
    desde: consulta.desde,
    hasta: consulta.hasta,
  })
  if (consulta.departamento) parametros.set("depto", consulta.departamento)
  if (solicitud.vista !== "mapa") parametros.set("vista", solicitud.vista)
  if (solicitud.vista === "detalle") parametros.set("zona", solicitud.zona)
  return parametros
}

function esErrorApi(cuerpo: unknown): cuerpo is ErrorApiGeo {
  return (
    typeof cuerpo === "object" &&
    cuerpo !== null &&
    "error" in cuerpo &&
    typeof (cuerpo as ErrorApiGeo).error?.mensaje === "string"
  )
}

/**
 * Error de una respuesta fallida, con el mensaje listo para la interfaz. Con
 * la sesión vencida responde el proxy antes que la ruta, con su propio cuerpo
 * (`{ error: "No autenticado" }`): un 401 siempre es "vuelve a ingresar".
 */
export function errorDeRespuesta(
  estado: number,
  cuerpo: unknown
): ErrorConsultaGeo {
  if (esErrorApi(cuerpo)) {
    const { motivo, mensaje, pista } = cuerpo.error
    return new ErrorConsultaGeo(estado, motivo, mensaje, pista)
  }
  if (estado === 401) {
    return new ErrorConsultaGeo(
      estado,
      "sin-sesion",
      "Tu sesión terminó. Vuelve a ingresar para seguir explorando el mapa."
    )
  }
  return new ErrorConsultaGeo(
    estado,
    "fallo",
    "No pudimos cargar el mapa. Intenta de nuevo en unos segundos."
  )
}

/** La sesión terminó: reintentar no sirve, hay que volver a ingresar. */
export function esSesionVencida(error: unknown): boolean {
  return error instanceof ErrorConsultaGeo && error.motivo === "sin-sesion"
}

async function pedir<T>(
  parametros: URLSearchParams,
  signal: AbortSignal
): Promise<T> {
  let respuesta: Response
  try {
    respuesta = await fetch(`${RUTA_API}?${parametros}`, {
      signal,
      headers: { Accept: "application/json" },
    })
  } catch (error) {
    if (signal.aborted) throw error
    throw new ErrorConsultaGeo(
      0,
      "fallo",
      "No hay conexión con el servidor. Revisa tu red e intenta de nuevo."
    )
  }
  const cuerpo: unknown = await respuesta.json().catch(() => null)
  if (!respuesta.ok) throw errorDeRespuesta(respuesta.status, cuerpo)
  return cuerpo as T
}

export const clavesGeo = {
  todo: ["geo"] as const,
  mapa: (c: ConsultaMapaGeo) =>
    [
      "geo",
      "mapa",
      c.nivel,
      c.metrica,
      c.desde,
      c.hasta,
      c.departamento,
    ] as const,
  puntos: (c: ConsultaMapaGeo) =>
    [
      "geo",
      "puntos",
      c.nivel,
      c.metrica,
      c.desde,
      c.hasta,
      c.departamento,
    ] as const,
  detalle: (c: ConsultaMapaGeo, zona: string) =>
    [
      "geo",
      "detalle",
      c.nivel,
      c.metrica,
      c.desde,
      c.hasta,
      c.departamento,
      zona,
    ] as const,
}

/** Errores definitivos (permisos, validación, RPC inexistente): no se reintentan. */
function reintentar(fallos: number, error: Error): boolean {
  const definitivo =
    error instanceof ErrorConsultaGeo &&
    error.estado >= 400 &&
    error.estado < 500
  const sinRpc = error instanceof ErrorConsultaGeo && error.estado === 503
  return !definitivo && !sinRpc && fallos < 2
}

function mismoAmbito(a: ConsultaMapaGeo, b: ConsultaMapaGeo): boolean {
  return a.nivel === b.nivel && a.departamento === b.departamento
}

export function useMetricasMapa(consulta: ConsultaMapaGeo | null) {
  return useQuery({
    queryKey: consulta ? clavesGeo.mapa(consulta) : ["geo", "mapa"],
    queryFn: consulta
      ? ({ signal }) =>
          pedir<RespuestaMapaGeo>(parametrosConsulta(consulta), signal)
      : skipToken,
    // Al cambiar de métrica o periodo se conserva el mapa anterior mientras
    // carga; al cambiar de nivel no (serían otras zonas).
    placeholderData: (previo) =>
      previo && consulta && mismoAmbito(previo.consulta, consulta)
        ? previo
        : undefined,
    staleTime: VIGENCIA_DATOS_MS,
    retry: reintentar,
  })
}

/**
 * Puntos del modo calor: solo se piden con el modo activo, aparte del
 * coroplético (que no espera la lectura de coordenadas).
 */
export function usePuntosMapa(
  consulta: ConsultaMapaGeo | null,
  activo: boolean
) {
  return useQuery({
    queryKey: consulta ? clavesGeo.puntos(consulta) : ["geo", "puntos"],
    queryFn:
      consulta && activo
        ? ({ signal }) =>
            pedir<RespuestaPuntosGeo>(
              parametrosConsulta(consulta, { vista: "puntos" }),
              signal
            )
        : skipToken,
    // Al cambiar el periodo se conservan los puntos anteriores; con otra
    // métrica u otro ámbito, no (serían otros datos).
    placeholderData: (previo) =>
      previo &&
      consulta &&
      previo.consulta.metrica === consulta.metrica &&
      mismoAmbito(previo.consulta, consulta)
        ? previo
        : undefined,
    staleTime: VIGENCIA_DATOS_MS,
    retry: reintentar,
  })
}

export function useDetalleZona(
  consulta: ConsultaMapaGeo | null,
  zona: string | null
) {
  return useQuery({
    queryKey:
      consulta && zona ? clavesGeo.detalle(consulta, zona) : ["geo", "detalle"],
    queryFn:
      consulta && zona
        ? ({ signal }) =>
            pedir<RespuestaDetalleGeo>(
              parametrosConsulta(consulta, { vista: "detalle", zona }),
              signal
            )
        : skipToken,
    placeholderData: (previo) =>
      previo && previo.consulta.zona === zona ? previo : undefined,
    staleTime: VIGENCIA_DATOS_MS,
    retry: reintentar,
  })
}

// ── Geometrías (GeoJSON estáticos) ───────────────────────────────────────────

export interface PropiedadesZona {
  readonly codigo: string
  readonly nombre: string
}

export type GeometriaNivel = FeatureCollection<Geometry, PropiedadesZona>

/** GeoJSON con la URL de la que salió (identifica la capa en el mapa). */
export interface CapaGeometria {
  readonly url: string
  readonly coleccion: GeometriaNivel
}

const MENSAJE_GEOMETRIA =
  "No pudimos descargar los límites de las zonas. Revisa tu conexión e intenta de nuevo."

async function pedirGeometria(
  url: string,
  signal?: AbortSignal
): Promise<CapaGeometria> {
  try {
    const respuesta = await fetch(url, { signal })
    if (!respuesta.ok) {
      throw new ErrorConsultaGeo(respuesta.status, "fallo", MENSAJE_GEOMETRIA)
    }
    return { url, coleccion: (await respuesta.json()) as GeometriaNivel }
  } catch (error) {
    if (signal?.aborted || error instanceof ErrorConsultaGeo) throw error
    // Red caída o JSON corrupto: el mensaje del navegador llega en inglés.
    throw new ErrorConsultaGeo(0, "fallo", MENSAJE_GEOMETRIA)
  }
}

const opcionesGeometria = (url: string) => ({
  queryKey: ["geo", "geometria", url] as const,
  queryFn: ({ signal }: { signal?: AbortSignal }) =>
    pedirGeometria(url, signal),
  // Archivos versionados con el código: no cambian durante la sesión.
  staleTime: Infinity,
  gcTime: 30 * 60_000,
  retry: reintentar,
})

/**
 * Polígonos del nivel; el mismo objeto alimenta a Mapbox y al ranking.
 * Mientras llega un nivel nuevo se conserva el anterior (`isPlaceholderData`)
 * para que el mapa no quede vacío durante el vuelo de la cámara.
 */
export function useGeometriaNivel(url: string) {
  return useQuery({
    ...opcionesGeometria(url),
    placeholderData: keepPreviousData,
  })
}

/** Adelanta la descarga (p. ej. los municipios del departamento seleccionado). */
export function precargarGeometria(cliente: QueryClient, url: string): void {
  void cliente.prefetchQuery(opcionesGeometria(url))
}

/** Adelanta las métricas de un nivel (explorar se siente instantáneo). */
export function precargarMetricasMapa(
  cliente: QueryClient,
  consulta: ConsultaMapaGeo
): void {
  void cliente.prefetchQuery({
    queryKey: clavesGeo.mapa(consulta),
    queryFn: ({ signal }) =>
      pedir<RespuestaMapaGeo>(parametrosConsulta(consulta), signal),
    staleTime: VIGENCIA_DATOS_MS,
  })
}
