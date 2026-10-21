"use client"

import { useMemo } from "react"

import { bbox } from "@turf/bbox"

import type { TemaMapa } from "@/lib/geo/escalas"
import type { Posicion } from "@/lib/geo/tipos"

import {
  type CapaGeometria,
  useGeometriaNivel,
  useMetricasMapa,
  usePuntosMapa,
} from "../consultas-cliente"
import { centroDelMayorPoligono } from "../centro-zona"
import { departamentoPorCodigo } from "../departamentos"
import { urlGeometria } from "../encuadre"
import { DEFINICIONES_METRICAS, type MetricaGeo } from "../metricas"
import type { CentroZona, RespuestaMapaGeo, RespuestaPuntosGeo } from "../tipos"
import type { EstadoExplorador } from "../use-estado-explorador"
import {
  type CirculosVista,
  circulosDeVista,
  construirVistaMapa,
  type VistaMapa,
  type ZonaDibujable,
} from "../vista-mapa"

export interface CalorExplorador {
  /** El usuario puede activar el modo (métrica con puntos reales y datos en el periodo). */
  readonly disponible: boolean
  /** El modo está activo en la URL. */
  readonly activo: boolean
  readonly respuesta: RespuestaPuntosGeo | undefined
  readonly cargando: boolean
  readonly error: Error | null
  readonly reintentar: () => void
}

export interface DatosExplorador {
  /** Polígonos que se dibujan (los del nivel anterior mientras llega el nuevo). */
  readonly capa: CapaGeometria | undefined
  /** La capa ya es la del nivel actual. */
  readonly capaVigente: boolean
  /** Los polígonos del nivel no se pudieron descargar (sin ellos no hay mapa ni ranking). */
  readonly errorCapa: Error | null
  readonly reintentarCapa: () => void
  readonly respuesta: RespuestaMapaGeo | undefined
  readonly vista: VistaMapa | null
  /** Métrica de los datos visibles (puede ir un paso atrás mientras carga la nueva). */
  readonly metricaVista: MetricaGeo | null
  readonly circulos: CirculosVista | null
  readonly cargando: boolean
  readonly error: Error | null
  readonly reintentar: () => void
  readonly calor: CalorExplorador
  nombreZona(codigo: string): string
  /** Punto representativo de la zona (para traerla a la vista al seleccionarla). */
  centroZona(codigo: string): Posicion | null
}

const SIN_CIRCULOS: CirculosVista = { circulos: [], radios: new Map() }

/** El archipiélago de San Andrés mide pocos píxeles en el mapa nacional. */
const ZONAS_DIMINUTAS_NACIONALES: readonly CentroZona[] = ["88"].flatMap(
  (codigo) => {
    const departamento = departamentoPorCodigo(codigo)
    return departamento ? [{ codigo, centro: departamento.centroide }] : []
  }
)

/** Consultas del explorador (geometría y métricas) y la vista que se pinta. */
export function useDatosExplorador(
  explorador: EstadoExplorador,
  tema: TemaMapa
): DatosExplorador {
  const { nivel: estado, consulta, por100k } = explorador
  const geometria = useGeometriaNivel(urlGeometria(estado))
  const metricas = useMetricasMapa(consulta)
  // En paralelo con el coroplético: un enlace con `calor=true` no espera al mapa.
  const puntos = usePuntosMapa(consulta, explorador.calor)
  const respuesta = metricas.data

  const capaVigente = !!geometria.data && !geometria.isPlaceholderData
  const coleccion = capaVigente ? geometria.data?.coleccion : undefined

  const universo = useMemo<ZonaDibujable[]>(
    () =>
      coleccion?.features.map(({ properties }) => ({
        codigo: properties.codigo,
        nombre: properties.nombre,
      })) ?? [],
    [coleccion]
  )

  const metricaVista = respuesta?.consulta.metrica ?? explorador.metrica

  const vista = useMemo(() => {
    if (!respuesta || !capaVigente) return null
    return construirVistaMapa({
      filas: respuesta.filas,
      universo,
      incluirSinDatos: respuesta.consulta.nivel !== "internacional",
      aditiva: DEFINICIONES_METRICAS[respuesta.consulta.metrica].aditiva,
      por100k,
      tema,
    })
  }, [respuesta, capaVigente, universo, por100k, tema])

  const circulos = useMemo(() => {
    if (!vista || !respuesta) return SIN_CIRCULOS
    const diminutas =
      respuesta.consulta.nivel === "nacional" ? ZONAS_DIMINUTAS_NACIONALES : []
    return circulosDeVista(vista, respuesta.sinPoligono, diminutas)
  }, [vista, respuesta])

  const nombres = useMemo(
    () => new Map(universo.map((zona) => [zona.codigo, zona.nombre])),
    [universo]
  )

  const centroZona = (codigo: string): Posicion | null => {
    const circulo = circulos.circulos.find((c) => c.codigo === codigo)
    if (circulo) return circulo.centro
    if (estado.nivel === "nacional") {
      return departamentoPorCodigo(codigo)?.centroide ?? null
    }
    const zona = coleccion?.features.find((f) => f.properties.codigo === codigo)
    if (!zona) return null
    // La envolvente de un país engaña (Alaska, ultramar): se usa la de su
    // territorio principal.
    if (estado.nivel === "internacional") {
      return centroDelMayorPoligono(zona.geometry)
    }
    const [oeste, sur, este, norte] = bbox(zona)
    return [(oeste + este) / 2, (sur + norte) / 2]
  }

  const conDatos = (vista?.ranking.conDatos ?? 0) > 0
  const calor: CalorExplorador = {
    disponible: explorador.admiteCalor && (conDatos || explorador.calor),
    activo: explorador.calor,
    respuesta: explorador.calor ? puntos.data : undefined,
    cargando: explorador.calor && puntos.isFetching,
    error: explorador.calor ? puntos.error : null,
    reintentar: () => void puntos.refetch(),
  }

  return {
    capa: geometria.data,
    capaVigente,
    errorCapa: geometria.error,
    reintentarCapa: () => void geometria.refetch(),
    respuesta,
    vista,
    metricaVista,
    circulos,
    cargando: metricas.isFetching || (!capaVigente && !geometria.error),
    error: metricas.error,
    reintentar: () => void metricas.refetch(),
    calor,
    nombreZona: (codigo) =>
      vista?.porCodigo.get(codigo)?.nombre ?? nombres.get(codigo) ?? codigo,
    centroZona,
  }
}
