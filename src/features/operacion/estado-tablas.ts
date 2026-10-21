/**
 * Estado en la URL de los listados de operación (módulo puro, compartido por
 * las páginas y las tablas): búsqueda, filtros facetados, orden y página.
 * Las claves de los filtros son también las de los enlaces que llegan desde
 * otros módulos (`/operacion/medios?segmento=en_riesgo`,
 * `/operacion/asignaciones?alerta=metricas`, `?medio=<id>`, `?campana=<id>`).
 */
import { createParser, parseAsArrayOf } from "nuqs/server"

import {
  definirEstadoTabla,
  type EstadoTabla,
  filtroDeIds,
  filtroDeOpciones,
} from "@/components/data-table/estado-url"
import { DEPARTAMENTOS } from "@/lib/geo/diccionarios/departamentos"
import { Constants } from "@/types/database.types"

const ENUMS = Constants.public.Enums

/** Del diccionario de departamentos (9 KB): este módulo también llega al navegador. */
export const CODIGOS_DEPARTAMENTO = DEPARTAMENTOS.map(
  (departamento) => departamento.codigo
)

export const NIVELES_VERIFICACION = ["0", "1", "2", "3"] as const

/** Señales de riesgo que otros módulos enlazan (insights del panel). */
export const SEGMENTOS_MEDIO = ["en_riesgo"] as const

/** Alertas de integridad de métricas pendientes de validar. */
export const ALERTAS_ASIGNACION = ["metricas"] as const

/** País ISO 3166-1 alfa-2 en mayúsculas; cualquier otro texto se ignora. */
const parseAsPais = createParser<string>({
  parse: (valor) => {
    const codigo = valor.trim().toUpperCase()
    return /^[A-Z]{2}$/.test(codigo) ? codigo : null
  },
  serialize: (valor) => valor,
})

function filtroDePaises() {
  return parseAsArrayOf(parseAsPais, ",").withDefault([])
}

// ── Medios ───────────────────────────────────────────────────────────────────

export const CAMPOS_ORDEN_MEDIOS = [
  "nombre",
  "estado",
  "nivel",
  "cumplimiento",
  "calificacion",
  "creado",
] as const

export const estadoTablaMedios = definirEstadoTabla({
  camposOrden: CAMPOS_ORDEN_MEDIOS,
  ordenPorDefecto: { campo: "nombre", descendente: false },
  filtros: {
    estado: filtroDeOpciones(ENUMS.medio_estado),
    nivel: filtroDeOpciones(NIVELES_VERIFICACION),
    departamento: filtroDeOpciones(CODIGOS_DEPARTAMENTO),
    plataforma: filtroDeOpciones(ENUMS.plataforma),
    categoria: filtroDeIds(),
    tipo: filtroDeOpciones(ENUMS.medio_tipo),
    segmento: filtroDeOpciones(SEGMENTOS_MEDIO),
  },
})

export type EstadoTablaMedios = EstadoTabla<typeof estadoTablaMedios>

// ── Anunciantes ──────────────────────────────────────────────────────────────

export const CAMPOS_ORDEN_ANUNCIANTES = [
  "nombre",
  "razon_social",
  "estado",
  "pais",
  "creado",
] as const

export const estadoTablaAnunciantes = definirEstadoTabla({
  camposOrden: CAMPOS_ORDEN_ANUNCIANTES,
  ordenPorDefecto: { campo: "nombre", descendente: false },
  filtros: {
    estado: filtroDeOpciones(ENUMS.anunciante_estado),
    sector: filtroDeIds(),
    pais: filtroDePaises(),
  },
})

export type EstadoTablaAnunciantes = EstadoTabla<typeof estadoTablaAnunciantes>

// ── Campañas ─────────────────────────────────────────────────────────────────

export const CAMPOS_ORDEN_CAMPANAS = [
  "nombre",
  "inicio",
  "fin",
  "presupuesto",
  "comprometido",
  "estado",
  "creado",
] as const

export const estadoTablaCampanas = definirEstadoTabla({
  camposOrden: CAMPOS_ORDEN_CAMPANAS,
  ordenPorDefecto: { campo: "inicio", descendente: true },
  filtros: {
    estado: filtroDeOpciones(ENUMS.campana_estado),
    anunciante: filtroDeIds(),
    plataforma: filtroDeOpciones(ENUMS.plataforma),
  },
})

export type EstadoTablaCampanas = EstadoTabla<typeof estadoTablaCampanas>

// ── Asignaciones ─────────────────────────────────────────────────────────────

export const CAMPOS_ORDEN_ASIGNACIONES = [
  "creado",
  "monto",
  "limite",
  "estado",
] as const

export const estadoTablaAsignaciones = definirEstadoTabla({
  camposOrden: CAMPOS_ORDEN_ASIGNACIONES,
  ordenPorDefecto: { campo: "creado", descendente: true },
  filtros: {
    estado: filtroDeOpciones(ENUMS.asignacion_estado),
    plataforma: filtroDeOpciones(ENUMS.plataforma),
    campana: filtroDeIds(),
    medio: filtroDeIds(),
    anunciante: filtroDeIds(),
    alerta: filtroDeOpciones(ALERTAS_ASIGNACION),
  },
})

export type EstadoTablaAsignaciones = EstadoTabla<
  typeof estadoTablaAsignaciones
>
