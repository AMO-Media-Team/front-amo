/**
 * Transformaciones puras del panel del medio: progreso del tope anual por
 * nivel y el enlace para subir de nivel, el orden de las próximas acciones
 * (con su pantalla, de `mis-campanas/siguiente-accion`), los estados de los
 * negocios en curso y la serie de ganancias. Sin I/O ni React.
 */
import type { Route } from "next"

import { RUTAS_MI_MEDIO } from "@/features/mi-medio/alta"
import { ESTADOS_PARA_MEDIO } from "@/features/mis-campanas/estados"
import {
  disponibilidadAccion,
  interpretarAccion,
} from "@/features/mis-campanas/siguiente-accion"
import type {
  AccionMedio,
  Corte,
  FilaAccionMedio,
} from "@/features/mis-campanas/tipos"
import type { PresentacionEstado } from "@/features/operacion/estados"
import type { RangoFechas } from "@/lib/fechas"
import { ZONA } from "@/lib/fechas"

import { diaCalendario, etiquetasPeriodos } from "../series"
import { formatoFecha } from "@/lib/format"

// ── Título de la cifra principal ─────────────────────────────────────────────

const mesLargo = new Intl.DateTimeFormat("es-CO", {
  timeZone: ZONA,
  month: "long",
})

/** "Ganado este mes", "Ganado en septiembre" o "Ganado en el periodo". */
export function tituloGanado(rango: RangoFechas): string {
  switch (rango.preset) {
    case "esteMes":
      return "Ganado este mes"
    case "mesAnterior":
      return `Ganado en ${mesLargo.format(rango.desde)}`
    case "ultimos7":
      return "Ganado en los últimos 7 días"
    case "ultimos30":
      return "Ganado en los últimos 30 días"
    case "esteTrimestre":
      return "Ganado este trimestre"
    case "esteAno":
      return "Ganado este año"
    case "hoy":
      return "Ganado hoy"
    case "personalizado":
      return "Ganado en el periodo"
  }
}

// ── Dinero del medio ─────────────────────────────────────────────────────────

/** Desde aquí la cifra exacta ya no cabe en media columna a 390 px. */
export const UMBRAL_MONTO_COMPACTO = 100_000_000

/**
 * Lo que el medio cobra se muestra en pesos exactos ("$ 920.000", no
 * "$920 mil"): es su plata y la compara con sus pagos. Solo se abrevia desde
 * cien millones, donde los pesos sueltos ya no caben ni importan.
 */
export function formatoMonto(valor: number): "cop" | "copCompacto" {
  return Math.abs(valor) >= UMBRAL_MONTO_COMPACTO ? "copCompacto" : "cop"
}

// ── Tope anual del nivel (§7.1.1) ────────────────────────────────────────────

export type EstadoTope = "normal" | "alerta" | "bloqueo" | "sin-tope"

export interface EntradaTope {
  consumido: number
  tope: number | null
  /** Fracción desde la que se avisa "cerca del tope" (0,80). */
  alerta: number
  /** Fracción desde la que no se pueden aceptar ofertas (0,95). */
  bloqueo: number
}

/** Los que siembra la migración en `niveles_verificacion` (80 % y 95 %). */
export const UMBRALES_TOPE_POR_DEFECTO = { alerta: 0.8, bloqueo: 0.95 } as const

export interface ProgresoTope {
  estado: EstadoTope
  /** Consumido / tope, acotado a [0, 1] para dibujar la barra. */
  fraccion: number
  /** Consumido / tope sin acotar (puede pasar de 1). */
  porcentaje: number | null
  /** Lo que falta para el umbral de bloqueo (0 si ya lo alcanzó). */
  margenHastaBloqueo: number | null
}

export function progresoTope({
  consumido,
  tope,
  alerta,
  bloqueo,
}: EntradaTope): ProgresoTope {
  if (tope === null || !(tope > 0)) {
    return {
      estado: "sin-tope",
      fraccion: 0,
      porcentaje: null,
      margenHastaBloqueo: null,
    }
  }
  const porcentaje = consumido / tope
  const estado: EstadoTope =
    porcentaje >= bloqueo
      ? "bloqueo"
      : porcentaje >= alerta
        ? "alerta"
        : "normal"
  return {
    estado,
    fraccion: Math.min(1, Math.max(0, porcentaje)),
    porcentaje,
    margenHastaBloqueo: Math.max(0, tope * bloqueo - consumido),
  }
}

/**
 * «Cómo subir de nivel» en «Mi medio › Nivel»: la sección del camino al
 * siguiente nivel (`#subir-de-nivel` en `vista-nivel.tsx`).
 */
export const RUTA_SUBIR_DE_NIVEL =
  `${RUTAS_MI_MEDIO.nivel}#subir-de-nivel` as Route

/**
 * El aviso del tope enlaza a «Cómo subir de nivel» cuando ya importa: cerca
 * del tope (alerta) o en el bloqueo. Un nivel sin tope no tiene a dónde subir
 * por esa razón.
 */
export function enlazaSubirNivel(progreso: Pick<ProgresoTope, "estado">) {
  return progreso.estado === "alerta" || progreso.estado === "bloqueo"
}

// ── Reputación ───────────────────────────────────────────────────────────────

/** Meta de cumplimiento (docs/kpis.md §1.10): desde aquí la tasa se resalta. */
export const META_CUMPLIMIENTO = 0.9

// ── Próximas acciones (DSH-006) ──────────────────────────────────────────────

/**
 * Fila de `proximas_acciones_medio`. `numero` y `corte` dicen a qué
 * publicación y a qué corte va la acción, y `metricaId` qué métrica se
 * corrige (opcionales para los datos de ejemplo de antes de la fase 3).
 */
export interface AccionPendiente {
  asignacionId: string
  ofertaTitulo: string
  /** `DESCARGAR`, `DESCARGAR_NUEVA_VERSION`, `PUBLICAR`, `CARGAR_METRICA_H72`… */
  accion: string
  venceAt: string | null
  numero?: number | null
  corte?: Corte | null
  metricaId?: string | null
}

function aFila(accion: AccionPendiente): FilaAccionMedio {
  return {
    asignacionId: accion.asignacionId,
    ofertaTitulo: accion.ofertaTitulo,
    accion: accion.accion,
    venceAt: accion.venceAt,
    numero: accion.numero ?? null,
    corte: accion.corte ?? null,
    metricaId: accion.metricaId ?? null,
  }
}

function instante(iso: string | null): number {
  const valor = iso ? new Date(iso).getTime() : Number.NaN
  return Number.isFinite(valor) ? valor : Number.POSITIVE_INFINITY
}

export interface OpcionesAccionesInicio {
  /** Instante del servidor al pintar: decide qué se puede hacer ya. */
  ahora: Date
  /** `metricas.plazo_carga_horas`: un corte se habilita ese tiempo antes de vencer. */
  plazoCargaHoras?: number
  /**
   * Publicaciones que pide cada asignación (`mis_asignaciones_medio`): con
   * más de una, la acción dice a cuál va.
   */
  publicacionesPorAsignacion?: ReadonlyMap<string, number>
}

/**
 * Las próximas acciones listas para el inicio, cada una con su pantalla
 * (botón directo): primero lo que ya se puede hacer, del plazo más cercano al
 * más lejano (lo vencido va arriba: es lo más urgente), y después los cortes
 * de métricas que aún no se habilitan, por la hora en que se habilitan. Los
 * códigos que esta versión de la app no conoce se omiten (no habría a dónde
 * llevar al medio).
 */
export function accionesDelInicio(
  filas: readonly AccionPendiente[],
  { ahora, plazoCargaHoras, publicacionesPorAsignacion }: OpcionesAccionesInicio
): AccionMedio[] {
  const acciones = filas.flatMap((fila) => {
    const publicaciones = publicacionesPorAsignacion?.get(fila.asignacionId)
    const accion = interpretarAccion(aFila(fila), {
      plazoCargaHoras,
      variasPublicaciones:
        publicaciones === undefined ? undefined : publicaciones > 1,
    })
    return accion ? [accion] : []
  })
  const bloqueada = (accion: AccionMedio) =>
    disponibilidadAccion(accion, ahora) === "bloqueada"
  const orden = (accion: AccionMedio) =>
    bloqueada(accion)
      ? instante(accion.disponibleDesde)
      : instante(accion.venceAt)
  return acciones
    .map((accion, indice) => ({ accion, indice }))
    .sort(
      (a, b) =>
        Number(bloqueada(a.accion)) - Number(bloqueada(b.accion)) ||
        orden(a.accion) - orden(b.accion) ||
        a.indice - b.indice
    )
    .map(({ accion }) => accion)
}

/**
 * Clave estable de una acción en la lista (una asignación tiene varias, y una
 * publicación puede tener varios cortes personalizados por corregir).
 */
export function claveAccion(
  accion: Pick<
    AccionMedio,
    "asignacionId" | "codigo" | "numero" | "corte" | "metricaId"
  >
): string {
  return [
    accion.asignacionId,
    accion.codigo,
    accion.numero ?? "",
    accion.corte ?? "",
    accion.metricaId ?? "",
  ].join(":")
}

// ── Asignaciones en curso ────────────────────────────────────────────────────

/** Fila de `mis_asignaciones_medio` con lo que muestra el panel. */
export interface AsignacionEnCurso {
  id: string
  ofertaId: string
  estado: string
  plataforma: string
  /** Valor para el medio (antes de retenciones). */
  montoMedio: number | null
}

/** Asignación en curso con su oferta (la RPC ya trae el título y la marca). */
export interface NegocioEnCurso extends AsignacionEnCurso {
  titulo: string | null
  marca: string | null
  /** Cuenta con la que aceptó, sin `@`. */
  handle?: string | null
  /** Publicaciones que pide la oferta. */
  publicaciones?: number
  /** En disputa: el estado que tenía al abrirla (sigue su recorrido, D72). */
  estadoPrevioDisputa?: string | null
}

/** Los pasos del recorrido de una asignación en curso (la barra de avance). */
export const ESTADOS_EN_CURSO = [
  "ACEPTADA",
  "CONTENIDO_ENTREGADO",
  "PUBLICADA",
  "EVIDENCIA_VALIDADA",
  "METRICAS_CARGADAS",
] as const

export type EstadoEnCurso = (typeof ESTADOS_EN_CURSO)[number]

/**
 * Lo que se consulta como «en curso»: los pasos del recorrido y las que están
 * en disputa (el medio las sigue cumpliendo: carga sus cortes mientras tanto).
 */
export const ESTADOS_CONSULTA_EN_CURSO = [
  ...ESTADOS_EN_CURSO,
  "EN_DISPUTA",
] as const

/**
 * ¿Es un negocio en curso? Una disputa sí, salvo el reclamo de una vencida:
 * esa campaña no sigue mientras no se le dé la razón al medio.
 */
export function esNegocioEnCurso(
  estado: string,
  estadoPrevioDisputa: string | null = null
): boolean {
  if (estado === "EN_DISPUTA") {
    return (ESTADOS_EN_CURSO as readonly string[]).includes(
      estadoPrevioDisputa ?? ""
    )
  }
  return (ESTADOS_EN_CURSO as readonly string[]).includes(estado)
}

/** El estado en voz del medio (la misma de «Mis campañas»). */
export function etiquetaEstado(estado: string): string {
  return (
    (ESTADOS_PARA_MEDIO as Readonly<Record<string, PresentacionEstado>>)[estado]
      ?.etiqueta ?? estado
  )
}

/**
 * Paso del recorrido (1–5) para la barra de avance de cada asignación; en
 * disputa, el del estado que tenía al abrirla.
 */
export function pasoEstado(
  estado: string,
  estadoPrevioDisputa: string | null = null
): number {
  const efectivo =
    estado === "EN_DISPUTA" && estadoPrevioDisputa
      ? estadoPrevioDisputa
      : estado
  return (ESTADOS_EN_CURSO as readonly string[]).indexOf(efectivo) + 1
}

/** Publicaciones que pide cada asignación, para nombrar la de cada acción. */
export function publicacionesPorAsignacion(
  negocios: readonly Pick<NegocioEnCurso, "id" | "publicaciones">[]
): Map<string, number> {
  return new Map(
    negocios.flatMap((negocio) =>
      negocio.publicaciones === undefined
        ? []
        : [[negocio.id, negocio.publicaciones] as const]
    )
  )
}

// ── Ganancias ────────────────────────────────────────────────────────────────

export const GRANULARIDADES_GANANCIAS = ["semana", "mes"] as const

export type GranularidadGanancias = (typeof GRANULARIDADES_GANANCIAS)[number]

/** Hasta un trimestre se mira por semanas; más largo, por meses. */
export function granularidadGananciasPorDefecto(
  dias: number
): GranularidadGanancias {
  return dias <= 92 ? "semana" : "mes"
}

/** Barras mínimas para que el gráfico muestre una tendencia y no un punto. */
export const MINIMO_PERIODOS_GANANCIAS = 12

const MS_DIA = 86_400_000

function aTextoDia(fecha: Date): string {
  return fecha.toISOString().slice(0, 10)
}

/**
 * Ventana del gráfico de ganancias: el periodo elegido, ampliado hacia atrás
 * hasta completar 12 semanas (desde un lunes) o 12 meses (desde el día 1).
 * "Este mes" por meses sería una sola barra; así siempre hay contexto.
 * Fechas de calendario ('YYYY-MM-DD'), calculadas en UTC puro.
 */
export function ventanaGanancias(
  desde: string,
  hasta: string,
  granularidad: GranularidadGanancias
): { desde: string; hasta: string } {
  const fin = diaCalendario(hasta)
  if (!fin) return { desde, hasta }
  const atras = MINIMO_PERIODOS_GANANCIAS - 1
  const inicioMinimo =
    granularidad === "semana"
      ? new Date(
          fin.getTime() - (((fin.getUTCDay() + 6) % 7) + atras * 7) * MS_DIA
        )
      : new Date(Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth() - atras, 1))
  const minimo = aTextoDia(inicioMinimo)
  return { desde: desde < minimo ? desde : minimo, hasta }
}

export interface PuntoGanancias {
  periodo: string
  ganado: number
  pagado: number
  asignaciones: number
}

export interface SerieGanancias {
  granularidad: GranularidadGanancias
  /** Primer y último periodo del eje ('YYYY-MM-DD'), para describirlo. */
  desde: string | null
  hasta: string | null
  etiquetas: string[]
  ganado: number[]
  pagado: number[]
  totalGanado: number
  totalPagado: number
  /** Negocios verificados en la ventana. */
  asignaciones: number
}

const suma = (valores: readonly number[]) =>
  valores.reduce((total, valor) => total + valor, 0)

export function serieGanancias(
  puntos: readonly PuntoGanancias[],
  granularidad: GranularidadGanancias
): SerieGanancias {
  const ganado = puntos.map((p) => p.ganado)
  const pagado = puntos.map((p) => p.pagado)
  return {
    granularidad,
    desde: puntos.at(0)?.periodo ?? null,
    hasta: puntos.at(-1)?.periodo ?? null,
    etiquetas: etiquetasPeriodos(
      puntos.map((p) => p.periodo),
      granularidad
    ),
    ganado,
    pagado,
    totalGanado: suma(ganado),
    totalPagado: suma(pagado),
    asignaciones: suma(puntos.map((p) => p.asignaciones)),
  }
}

const diaYMes = formatoFecha({
  timeZone: "UTC",
  day: "numeric",
  month: "short",
})
const mesYAnio = formatoFecha({
  timeZone: "UTC",
  month: "short",
  year: "numeric",
})

/** "12 semanas desde el 7 jul" o "12 meses desde oct 2025". */
export function textoVentana(serie: SerieGanancias): string {
  const cantidad = serie.etiquetas.length
  const inicio = serie.desde ? diaCalendario(serie.desde) : null
  if (cantidad === 0 || !inicio) return ""
  if (serie.granularidad === "semana") {
    const unidad = cantidad === 1 ? "semana" : "semanas"
    const dia = diaYMes.format(inicio).replace(/\s+de\s+/g, " ")
    return `${cantidad} ${unidad} desde el ${dia}`
  }
  const unidad = cantidad === 1 ? "mes" : "meses"
  const mes = mesYAnio.format(inicio).replace(/\s+de\s+/g, " ")
  return `${cantidad} ${unidad} desde ${mes}`
}

// ── Tope anual desde `kpis_medio` ────────────────────────────────────────────

/** Año calendario del tope: el de la fecha final del periodo (como la RPC). */
export function anioDelTope(hasta: string): number {
  return Number(hasta.slice(0, 4))
}

/** "Nivel 2 · Persona natural con RUT" (o solo "Nivel 2" sin nombre). */
export function etiquetaNivel(nivel: number, nombre: string | null): string {
  return nombre ? `Nivel ${nivel} · ${nombre}` : `Nivel ${nivel}`
}
