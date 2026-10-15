/**
 * Transformaciones puras del panel general: filas de las RPC de analítica
 * (ya normalizadas por `queries.ts`) a las formas que piden los
 * gráficos, el mini-mapa y el motor de insights. Sin I/O ni React.
 */
import type {
  CeldaActividad,
  ElementoValor,
  EtapaEmbudo,
} from "@/components/charts/datos"
import type { FilaKpi } from "@/components/kpi/tipos"
import { NOMBRES_PLATAFORMA } from "@/features/dashboard/insights/textos"
import {
  type AccesoSospechoso,
  type ConfigInsights,
  type DesgloseVariacion,
  type EntradaInsights,
  type FilaDesglose,
  type FilaMezcla,
  type Insight,
  type KpiVariacion,
  type MediosEnRiesgo,
  type MetricasAtipicas,
  type Plataforma,
  type VencidasPeriodo,
} from "@/features/dashboard/insights/tipos"

import type { Granularidad } from "../periodo"
import { etiquetasPeriodos } from "../series"

// ── Tendencia de GMV ─────────────────────────────────────────────────────────

export interface PuntoGmv {
  periodo: string
  gmvComprometido: number
  gmvVerificado: number
  comision: number
  negocios: number
  aceptadas: number
}

export interface DatosTendenciaGmv {
  granularidad: Granularidad
  etiquetas: string[]
  gmvVerificado: number[]
  comision: number[]
  totalGmv: number
  totalComision: number
}

export function tendenciaGmv(
  puntos: readonly PuntoGmv[],
  granularidad: Granularidad
): DatosTendenciaGmv {
  const suma = (valores: readonly number[]) =>
    valores.reduce((total, valor) => total + valor, 0)
  const gmvVerificado = puntos.map((p) => p.gmvVerificado)
  const comision = puntos.map((p) => p.comision)
  return {
    granularidad,
    etiquetas: etiquetasPeriodos(
      puntos.map((p) => p.periodo),
      granularidad
    ),
    gmvVerificado,
    comision,
    totalGmv: suma(gmvVerificado),
    totalComision: suma(comision),
  }
}

/** Unidad de tiempo para los textos ("por día", "por semana"…). */
export const POR_GRANULARIDAD: Readonly<Record<Granularidad, string>> = {
  dia: "por día",
  semana: "por semana",
  mes: "por mes",
}

// ── Embudo ───────────────────────────────────────────────────────────────────

export const NOMBRES_ETAPA: Readonly<Record<string, string>> = {
  vistas: "Ofertas vistas",
  aceptadas: "Aceptadas",
  contenido_entregado: "Contenido descargado",
  publicadas: "Publicadas",
  evidencia_validada: "Evidencia validada",
  metricas_cargadas: "Métricas cargadas",
  verificadas: "Verificadas",
  pagadas: "Pagadas",
}

export interface FilaEtapa {
  etapa: string
  orden: number
  cantidad: number
}

export function etapasEmbudo(filas: readonly FilaEtapa[]): EtapaEmbudo[] {
  return [...filas]
    .sort((a, b) => a.orden - b.orden)
    .map((fila) => ({
      id: fila.etapa,
      nombre: NOMBRES_ETAPA[fila.etapa] ?? fila.etapa,
      cantidad: Math.max(0, fila.cantidad),
    }))
}

/**
 * Etapa de `embudo_asignaciones` que NO es de la cohorte: cuenta los pares
 * oferta × medio vistos en el periodo, no asignaciones aceptadas.
 */
export const ETAPA_VISTAS = "vistas"

export interface EmbudoPanel {
  /** Ofertas vistas por los medios en el periodo (`null` si la RPC no la trae). */
  vistas: number | null
  /** De aceptadas a pagadas: la cohorte que dibuja el embudo. */
  ejecucion: EtapaEmbudo[]
}

/**
 * Separa las ofertas vistas de la cohorte de aceptadas. Dibujadas juntas, las
 * vistas (decenas de veces más) dejan las demás etapas en barras mínimas e
 * iguales, y el «% del inicio» de cada etapa mezclaría dos cohortes. El
 * embudo parte del 100 % de las aceptadas; las vistas van como contexto.
 */
export function embudoPanel(etapas: readonly EtapaEmbudo[]): EmbudoPanel {
  return {
    vistas: etapas.find((etapa) => etapa.id === ETAPA_VISTAS)?.cantidad ?? null,
    ejecucion: etapas.filter((etapa) => etapa.id !== ETAPA_VISTAS),
  }
}

/**
 * Alto del embudo: siete etapas con su conversión escrita entre barras. Lo
 * comparten la tarjeta y su esqueleto.
 */
export const ALTO_EMBUDO = "min-h-80"

/** El embudo arranca en las aceptadas: sin ellas no hay nada que seguir. */
export function embudoVacio(etapas: readonly EtapaEmbudo[]): boolean {
  return etapas.every(
    (etapa) => etapa.id === ETAPA_VISTAS || etapa.cantidad === 0
  )
}

// ── Mezcla por plataforma y formato ─────────────────────────────────────────

export interface FilaMezclaPanel extends FilaMezcla {
  alcance: number
  participacion: number | null
}

/**
 * Alto de las donas por plataforma. La dona mide lo que deja el ancho (44 %
 * de la tarjeta): en una columna, más alto solo añade aire arriba y abajo;
 * en fila, la tarjeta se estira con sus vecinas. Tarjeta y esqueleto.
 */
export const ALTO_DONA = "min-h-48"

/** Orden fijo: el color sigue a la plataforma, no a su puesto en el periodo. */
export const ORDEN_PLATAFORMAS: readonly Plataforma[] = [
  "FACEBOOK",
  "INSTAGRAM",
  "TIKTOK",
]

function sumaPorPlataforma(
  filas: readonly FilaMezclaPanel[],
  valor: (fila: FilaMezclaPanel) => number
): Map<Plataforma, number> {
  const totales = new Map<Plataforma, number>()
  for (const fila of filas) {
    totales.set(
      fila.plataforma,
      (totales.get(fila.plataforma) ?? 0) + valor(fila)
    )
  }
  return totales
}

export function segmentosPlataforma(
  filas: readonly FilaMezclaPanel[]
): ElementoValor[] {
  const totales = sumaPorPlataforma(filas, (fila) => fila.gmv)
  return ORDEN_PLATAFORMAS.filter((p) => (totales.get(p) ?? 0) > 0).map(
    (plataforma) => ({
      id: plataforma,
      nombre: NOMBRES_PLATAFORMA[plataforma],
      valor: totales.get(plataforma) ?? 0,
    })
  )
}

/**
 * Sigla de cada red en los rótulos del ranking de formatos: el eje recorta a
 * 22 caracteres y "Post de feed · Instagram" no cabe (el gráfico explica las
 * siglas al pie).
 */
export const SIGLAS_PLATAFORMA: Readonly<Record<Plataforma, string>> = {
  FACEBOOK: "FB",
  INSTAGRAM: "IG",
  TIKTOK: "TikTok",
}

/** "Reel · IG": cada formato con su plataforma, por GMV verificado. */
export function rankingFormatos(
  filas: readonly FilaMezclaPanel[]
): ElementoValor[] {
  return filas
    .filter((fila) => fila.gmv > 0)
    .map((fila) => ({
      id: `${fila.plataforma}-${fila.formatoClave}`,
      nombre: `${fila.formatoNombre} · ${SIGLAS_PLATAFORMA[fila.plataforma]}`,
      valor: fila.gmv,
    }))
}

/** "FB: Facebook · IG: Instagram": las siglas que aparecen en el ranking. */
export function leyendaSiglas(filas: readonly FilaMezclaPanel[]): string {
  return ORDEN_PLATAFORMAS.filter(
    (plataforma) =>
      SIGLAS_PLATAFORMA[plataforma] !== NOMBRES_PLATAFORMA[plataforma] &&
      filas.some((fila) => fila.plataforma === plataforma && fila.gmv > 0)
  )
    .map(
      (plataforma) =>
        `${SIGLAS_PLATAFORMA[plataforma]}: ${NOMBRES_PLATAFORMA[plataforma]}`
    )
    .join(" · ")
}

/** CPM por plataforma como cociente de sumas (las impresiones = GMV / CPM × 1.000). */
export function cpmPorPlataforma(
  filas: readonly FilaMezclaPanel[]
): Map<Plataforma, number | null> {
  const resultado = new Map<Plataforma, number | null>()
  for (const plataforma of ORDEN_PLATAFORMAS) {
    const conCpm = filas.filter(
      (f) => f.plataforma === plataforma && f.cpmEfectivo && f.gmv > 0
    )
    const gmv = conCpm.reduce((s, f) => s + f.gmv, 0)
    const impresiones = conCpm.reduce(
      (s, f) => s + (f.gmv / (f.cpmEfectivo ?? 1)) * 1000,
      0
    )
    resultado.set(
      plataforma,
      impresiones > 0 ? (gmv / impresiones) * 1000 : null
    )
  }
  return resultado
}

// ── Zonas (top departamentos y mini-mapa) ───────────────────────────────────

export interface FilaZona {
  codigo: string
  nombre: string
  valor: number
  participacion: number | null
}

export interface ZonaPanel extends FilaZona {
  valorAnterior: number
  /** Variación relativa; `null` sin base de comparación. */
  variacion: number | null
}

/**
 * Une las zonas del periodo con las del comparativo (dos consultas con el
 * MISMO comparativo de las tarjetas, no el "N días antes" de la RPC).
 */
export function combinarZonas(
  actual: readonly FilaZona[],
  anterior: readonly FilaZona[]
): ZonaPanel[] {
  const previas = new Map(anterior.map((zona) => [zona.codigo, zona.valor]))
  return [...actual]
    .sort((a, b) => b.valor - a.valor || a.nombre.localeCompare(b.nombre, "es"))
    .map((zona) => {
      const valorAnterior = previas.get(zona.codigo) ?? 0
      return {
        ...zona,
        valorAnterior,
        variacion:
          valorAnterior > 0
            ? (zona.valor - valorAnterior) / valorAnterior
            : null,
      }
    })
}

/** Valor por código DANE para el mini-mapa (sin fila = sin datos). */
export function valoresMapa(
  zonas: readonly FilaZona[]
): Record<string, number | null> {
  return Object.fromEntries(zonas.map((zona) => [zona.codigo, zona.valor]))
}

export function desgloseDeZonas(
  zonas: readonly FilaZona[],
  anteriores: readonly FilaZona[]
): FilaDesglose[] {
  return combinarZonas(zonas, anteriores)
    .map(({ codigo, nombre, valor, valorAnterior }) => ({
      clave: codigo,
      nombre,
      valor,
      valorAnterior,
    }))
    .concat(
      // Zonas que tuvieron valor antes y ninguno ahora también explican caídas.
      anteriores
        .filter((previa) => !zonas.some((z) => z.codigo === previa.codigo))
        .map((previa) => ({
          clave: previa.codigo,
          nombre: previa.nombre,
          valor: 0,
          valorAnterior: previa.valor,
        }))
    )
}

// ── Salud de medios ──────────────────────────────────────────────────────────

export const SEGMENTOS_SALUD = [
  "activos",
  "nuevos",
  "en_riesgo",
  "inactivos",
  "suspendidos",
] as const

export type SegmentoSalud = (typeof SEGMENTOS_SALUD)[number]

export interface FilaSalud {
  segmento: SegmentoSalud
  cantidad: number
  /** Fracción de los medios verificados o suspendidos. */
  porcentaje: number | null
  gmvEnJuego: number
}

export function esSegmentoSalud(valor: string): valor is SegmentoSalud {
  return (SEGMENTOS_SALUD as readonly string[]).includes(valor)
}

/** Los cinco segmentos en orden fijo, aunque la RPC omita alguno. */
export function segmentosSalud(filas: readonly FilaSalud[]): FilaSalud[] {
  return SEGMENTOS_SALUD.map(
    (segmento) =>
      filas.find((fila) => fila.segmento === segmento) ?? {
        segmento,
        cantidad: 0,
        porcentaje: null,
        gmvEnJuego: 0,
      }
  )
}

/** Base del porcentaje (medios verificados o suspendidos), deducida de una fila. */
export function baseSalud(filas: readonly FilaSalud[]): number | null {
  const conBase = filas.find(
    (fila) => fila.cantidad > 0 && fila.porcentaje && fila.porcentaje > 0
  )
  return conBase?.porcentaje
    ? Math.round(conBase.cantidad / conBase.porcentaje)
    : null
}

/** Medio en riesgo tal como lo resume la regla 3 (top por GMV de 90 días). */
export interface MedioRiesgoResumen {
  id: string
  nombre: string
  departamento: string | null
  gmv90d: number
}

/** Fila de `medios_en_riesgo` tal como la muestra la tarjeta de salud. */
export interface MedioEnRiesgo extends MedioRiesgoResumen {
  ultimaAceptacionAt: string | null
  /** Asignaciones aún abiertas del medio. */
  abiertas: number
}

/** Regla 3: segmento `en_riesgo` de la salud + los medios de mayor GMV en juego. */
export function mediosEnRiesgoEntrada(
  salud: readonly FilaSalud[],
  medios: readonly MedioRiesgoResumen[],
  gmvVerificado90d: number | null
): MediosEnRiesgo | undefined {
  const segmento = salud.find((fila) => fila.segmento === "en_riesgo")
  if (!segmento) return undefined
  return {
    cantidad: segmento.cantidad,
    gmvEnJuego: segmento.gmvEnJuego,
    gmvVerificado90d,
    top: medios.map(({ id, nombre, departamento, gmv90d }) => ({
      id,
      nombre,
      departamento,
      gmv90d,
    })),
  }
}

// ── Mapa de calor ────────────────────────────────────────────────────────────

/** Fuentes de `actividad_heatmap` que muestra el panel (`accesos` exige `accesos.ver`). */
export type FuenteActividad = "asignaciones" | "publicaciones" | "accesos"

/**
 * Alto del mapa de calor (7 filas × 24 columnas): el que deja las celdas casi
 * cuadradas en cada ancho. Lo comparten la tarjeta y su esqueleto.
 */
export const ALTO_MAPA_CALOR = "min-h-60 sm:min-h-72"

export interface FilaCalor {
  dia_semana: number
  hora: number
  cantidad: number
}

export function celdasCalor(filas: readonly FilaCalor[]): CeldaActividad[] {
  return filas.map((fila) => ({
    diaSemana: fila.dia_semana,
    hora: fila.hora,
    cantidad: fila.cantidad,
  }))
}

export function totalCalor(celdas: readonly CeldaActividad[]): number {
  return celdas.reduce((total, celda) => total + celda.cantidad, 0)
}

/** Celda con más actividad (la primera en orden lunes 0 h → domingo 23 h si empatan). */
export function picoActividad(
  celdas: readonly CeldaActividad[]
): CeldaActividad | null {
  return celdas.reduce<CeldaActividad | null>(
    (pico, celda) =>
      celda.cantidad > 0 && (!pico || celda.cantidad > pico.cantidad)
        ? celda
        : pico,
    null
  )
}

// ── Cumplimiento (regla 2) ───────────────────────────────────────────────────

export interface FilaCumplimientoMedio {
  medioId: string
  medio: string
  departamento: string | null
  vencidas: number
}

export function vencidasDelPeriodo(
  filas: readonly FilaCumplimientoMedio[]
): VencidasPeriodo {
  const porDepartamento = new Map<string, number>()
  for (const fila of filas) {
    if (!fila.departamento || fila.vencidas === 0) continue
    porDepartamento.set(
      fila.departamento,
      (porDepartamento.get(fila.departamento) ?? 0) + fila.vencidas
    )
  }
  return {
    total: filas.reduce((total, fila) => total + fila.vencidas, 0),
    porDepartamento: [...porDepartamento].map(([nombre, cantidad]) => ({
      clave: nombre,
      nombre,
      cantidad,
    })),
    porMedio: filas
      .filter((fila) => fila.vencidas > 0)
      .map((fila) => ({
        clave: fila.medioId,
        nombre: fila.medio,
        cantidad: fila.vencidas,
      })),
  }
}

// ── Acciones de los hallazgos ────────────────────────────────────────────────

/**
 * Deja la acción de cada hallazgo solo si su destino es una sección que la
 * persona puede abrir (`secciones`: las rutas de su menú). El hallazgo se
 * conserva: informa aunque no haya a dónde ir. Un rol personalizado con el
 * panel pero sin el mapa o los reportes no debe recibir enlaces que acaban
 * en un 403.
 */
export function conAccionesAccesibles(
  insights: readonly Insight[],
  secciones: readonly string[]
): Insight[] {
  return insights.map((insight) => {
    if (!insight.accion) return insight
    const destino = insight.accion.href.split(/[?#]/)[0]
    const accesible = secciones.some(
      (seccion) => destino === seccion || destino.startsWith(`${seccion}/`)
    )
    return accesible ? insight : { ...insight, accion: undefined }
  })
}

// ── Entrada del motor de insights ────────────────────────────────────────────

function desglosePorPlataforma(
  actual: readonly FilaMezclaPanel[],
  anterior: readonly FilaMezclaPanel[],
  valor: (fila: FilaMezclaPanel) => number
): FilaDesglose[] {
  const ahora = sumaPorPlataforma(actual, valor)
  const antes = sumaPorPlataforma(anterior, valor)
  return ORDEN_PLATAFORMAS.filter((p) => ahora.has(p) || antes.has(p)).map(
    (plataforma) => ({
      clave: plataforma,
      nombre: NOMBRES_PLATAFORMA[plataforma],
      valor: ahora.get(plataforma) ?? 0,
      valorAnterior: antes.get(plataforma) ?? 0,
    })
  )
}

export interface DatosInsightsAdmin {
  periodo: { desde: string; hasta: string }
  ahora: Date
  kpis: readonly FilaKpi[]
  config: ConfigInsights
  /** `top_zonas` de GMV por departamento, en el periodo y en el comparativo. */
  zonasGmv?: { actual: readonly FilaZona[]; anterior: readonly FilaZona[] }
  /** `mezcla_plataformas` en el periodo y en el comparativo. */
  mezcla?: {
    actual: readonly FilaMezclaPanel[]
    anterior: readonly FilaMezclaPanel[]
  }
  vencidas?: VencidasPeriodo
  mediosEnRiesgo?: MediosEnRiesgo
  metricasAtipicas?: MetricasAtipicas
  accesosSospechosos?: readonly AccesoSospechoso[]
}

/**
 * Arma la entrada del motor con lo que se pudo consultar: cada regla se
 * desactiva sola si le falta su dato (permiso ausente o consulta fallida).
 * Los desgloses usan la fuente cuyo ancla coincide con la del KPI: zonas por
 * fecha de aceptación (GMV comprometido) y plataformas por verificación.
 */
export function entradaInsightsAdmin(
  datos: DatosInsightsAdmin
): EntradaInsights {
  const desgloses: Partial<Record<KpiVariacion, DesgloseVariacion>> = {}
  if (datos.zonasGmv) {
    desgloses.gmv_comprometido = {
      departamento: desgloseDeZonas(
        datos.zonasGmv.actual,
        datos.zonasGmv.anterior
      ),
    }
  }
  if (datos.mezcla) {
    const { actual, anterior } = datos.mezcla
    desgloses.gmv_verificado = {
      plataforma: desglosePorPlataforma(actual, anterior, (f) => f.gmv),
    }
    desgloses.negocios_cerrados = {
      plataforma: desglosePorPlataforma(
        actual,
        anterior,
        (f) => f.asignaciones
      ),
    }
    desgloses.alcance_total = {
      plataforma: desglosePorPlataforma(actual, anterior, (f) => f.alcance),
    }
  }
  return {
    periodo: datos.periodo,
    ahora: datos.ahora,
    kpis: datos.kpis,
    config: datos.config,
    desgloses,
    vencidas: datos.vencidas,
    mediosEnRiesgo: datos.mediosEnRiesgo,
    mezclaPlataformas: datos.mezcla?.actual,
    metricasAtipicas: datos.metricasAtipicas,
    accesosSospechosos: datos.accesosSospechosos,
  }
}
