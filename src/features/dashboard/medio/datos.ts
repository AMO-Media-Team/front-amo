/**
 * Transformaciones puras del panel del medio: progreso del tope anual por
 * nivel, cuenta regresiva de las próximas acciones, etiquetas de acciones y
 * estados, y la serie de ganancias. Sin I/O ni React.
 */
import type { RangoFechas } from "@/lib/fechas"
import { ZONA } from "@/lib/fechas"

import { diaCalendario, etiquetasPeriodos } from "../series"

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

// ── Reputación ───────────────────────────────────────────────────────────────

/** Meta de cumplimiento (docs/kpis.md §1.10): desde aquí la tasa se resalta. */
export const META_CUMPLIMIENTO = 0.9

// ── Próximas acciones ────────────────────────────────────────────────────────

/** Fila de `proximas_acciones_medio`. */
export interface AccionPendiente {
  asignacionId: string
  ofertaTitulo: string
  accion: string
  venceAt: string | null
}

const ACCIONES: Readonly<Record<string, string>> = {
  DESCARGAR: "Descargar el contenido",
  PUBLICAR: "Publicar la pauta",
  CORREGIR_EVIDENCIA: "Corregir la evidencia",
  CARGAR_METRICA_H24: "Cargar métricas de 24 h",
  CARGAR_METRICA_H72: "Cargar métricas de 72 h",
  CARGAR_METRICA_D7: "Cargar métricas de 7 días",
  CORREGIR_METRICAS: "Corregir las métricas",
}

export function etiquetaAccion(accion: string): string {
  return (
    ACCIONES[accion] ??
    accion.charAt(0) + accion.slice(1).toLowerCase().replace(/_/g, " ")
  )
}

export type Urgencia = "vencida" | "critica" | "pronto" | "holgada"

export interface CuentaRegresiva {
  urgencia: Urgencia
  /** "Vence en 2 h 15 min", "Venció hace 3 h", "Vence en 4 días". */
  texto: string
  /** Para lectores de pantalla y `title`. */
  minutosRestantes: number | null
}

const MINUTO = 60_000
const HORAS_CRITICA = 6
const HORAS_PRONTO = 24

function duracion(minutos: number): string {
  const total = Math.max(0, Math.round(minutos))
  const dias = Math.floor(total / (60 * 24))
  const horas = Math.floor((total % (60 * 24)) / 60)
  const mins = total % 60
  if (dias >= 2) return `${dias} días`
  if (dias === 1) return horas > 0 ? `1 día ${horas} h` : "1 día"
  if (horas > 0) return mins > 0 ? `${horas} h ${mins} min` : `${horas} h`
  return `${Math.max(1, mins)} min`
}

/** Cuenta regresiva hasta `venceAt`, con la urgencia que colorea la acción. */
export function cuentaRegresiva(
  venceAt: string | null,
  ahora: Date
): CuentaRegresiva {
  const limite = venceAt ? new Date(venceAt).getTime() : Number.NaN
  if (!Number.isFinite(limite)) {
    return {
      urgencia: "holgada",
      texto: "Sin fecha límite",
      minutosRestantes: null,
    }
  }
  const minutos = (limite - ahora.getTime()) / MINUTO
  if (minutos <= 0) {
    return {
      urgencia: "vencida",
      texto: `Venció hace ${duracion(-minutos)}`,
      minutosRestantes: Math.round(minutos),
    }
  }
  const horas = minutos / 60
  return {
    urgencia:
      horas < HORAS_CRITICA
        ? "critica"
        : horas < HORAS_PRONTO
          ? "pronto"
          : "holgada",
    texto: `Vence en ${duracion(minutos)}`,
    minutosRestantes: Math.round(minutos),
  }
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

/** Lo que identifica a una oferta para el medio (`ofertas_para_medio`). */
export interface OfertaDelNegocio {
  id: string
  titulo: string
  marca: string | null
}

/** Asignación en curso con el nombre de su oferta (si se pudo consultar). */
export interface NegocioEnCurso extends AsignacionEnCurso {
  titulo: string | null
  marca: string | null
}

/**
 * Une cada asignación con su oferta. Sin oferta (permiso ausente o consulta
 * fallida) el negocio se muestra por su estado, sin nombre.
 */
export function negociosEnCurso(
  asignaciones: readonly AsignacionEnCurso[],
  ofertas: readonly OfertaDelNegocio[]
): NegocioEnCurso[] {
  const porId = new Map(ofertas.map((oferta) => [oferta.id, oferta]))
  return asignaciones.map((asignacion) => {
    const oferta = porId.get(asignacion.ofertaId)
    return {
      ...asignacion,
      titulo: oferta?.titulo.trim() || null,
      marca: oferta?.marca?.trim() || null,
    }
  })
}

/** Ofertas distintas de las asignaciones, en su orden de aparición. */
export function ofertasDistintas(
  asignaciones: readonly AsignacionEnCurso[]
): string[] {
  return [...new Set(asignaciones.map((asignacion) => asignacion.ofertaId))]
}

export const ESTADOS_EN_CURSO = [
  "ACEPTADA",
  "CONTENIDO_ENTREGADO",
  "PUBLICADA",
  "EVIDENCIA_VALIDADA",
  "METRICAS_CARGADAS",
] as const

export type EstadoEnCurso = (typeof ESTADOS_EN_CURSO)[number]

const ESTADOS: Readonly<Record<EstadoEnCurso, string>> = {
  ACEPTADA: "Por descargar",
  CONTENIDO_ENTREGADO: "Por publicar",
  PUBLICADA: "Evidencia en revisión",
  EVIDENCIA_VALIDADA: "Por cargar métricas",
  METRICAS_CARGADAS: "Métricas en revisión",
}

export function etiquetaEstado(estado: string): string {
  return (ESTADOS as Readonly<Record<string, string>>)[estado] ?? estado
}

/** Paso del recorrido (1–5) para la barra de avance de cada asignación. */
export function pasoEstado(estado: string): number {
  return (ESTADOS_EN_CURSO as readonly string[]).indexOf(estado) + 1
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

const diaYMes = new Intl.DateTimeFormat("es-CO", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
})
const mesYAnio = new Intl.DateTimeFormat("es-CO", {
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
