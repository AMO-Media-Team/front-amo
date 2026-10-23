/**
 * Presentación de una asignación para el medio (módulo puro, cliente y
 * servidor): validaciones y cortes en su voz, si todavía puede desistir, el
 * desglose de lo que recibe, el avance y la historia de la asignación. Es la
 * fuente de estos textos en «Mis campañas» y su ficha.
 */
import { MULTIPLICADORES } from "@/features/marketplace/presentacion"
import { CORTES, type PresentacionEstado } from "@/features/operacion/estados"
import { contar, formatearMultiplicador } from "@/features/operacion/formato"
import {
  calcularProgreso,
  type EventoLineaTiempo,
  type Progreso,
} from "@/features/operacion/linea-tiempo"
import {
  formatearCOP,
  formatearFechaHora,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"

import { ESTADOS_PARA_MEDIO } from "./estados"
import { HORAS_CORTE, PLAZO_CARGA_HORAS_POR_DEFECTO } from "./siguiente-accion"
import type {
  AsignacionMedio,
  Corte,
  EjecucionAsignacion,
  EstadoAsignacion,
  EstadoValidacion,
  MetricaMedio,
  PagoAsignacion,
  PublicacionMedio,
} from "./tipos"

const HORA_MS = 3_600_000

// ── Validaciones del equipo AMO, en voz del medio ────────────────────────────

export const VALIDACIONES_PARA_MEDIO: Readonly<
  Record<EstadoValidacion, PresentacionEstado>
> = {
  PENDIENTE: {
    etiqueta: "En revisión",
    tono: "aviso",
    descripcion: "El equipo AMO la está revisando.",
  },
  APROBADA: {
    etiqueta: "Aprobada",
    tono: "exito",
    descripcion: "El equipo AMO la revisó y está bien.",
  },
  RECHAZADA: {
    etiqueta: "Por corregir",
    tono: "peligro",
    descripcion: "El equipo AMO te pide corregirla.",
  },
}

// ── Desistir (MED-010) ───────────────────────────────────────────────────────

/** Motivos frecuentes al desistir (un toque llena el campo). */
export const SUGERENCIAS_DESISTIR: readonly string[] = [
  "Ya no tengo espacio para publicar en esas fechas.",
  "Acepté por error o con otra cuenta.",
  "El contenido no encaja con mi audiencia.",
  "Tuve un inconveniente y no podré cumplir.",
]

function instante(iso: string | null): number {
  const valor = iso ? new Date(iso).getTime() : Number.NaN
  return Number.isFinite(valor) ? valor : Number.NaN
}

/**
 * Espejo de la condición de la BD para desistir: aceptada, sin descargar el
 * contenido y antes de la fecha límite de aceptación de la oferta.
 */
export function puedeDesistir(
  asignacion: Pick<
    AsignacionMedio,
    "estado" | "contenidoDescargadoAt" | "fechaLimiteAceptacion"
  >,
  ahora: Date
): boolean {
  return (
    asignacion.estado === "ACEPTADA" &&
    !asignacion.contenidoDescargadoAt &&
    ahora.getTime() < instante(asignacion.fechaLimiteAceptacion)
  )
}

// ── Pago congelado ───────────────────────────────────────────────────────────

export interface LineaPago {
  clave: string
  etiqueta: string
  valor: string
  ayuda?: string
  /** Total que se resalta (lo que recibe). */
  destacada?: boolean
}

export interface DesglosePago {
  /** La configuración deja ver tarifa, bruto y comisión. */
  comisionVisible: boolean
  lineas: LineaPago[]
}

function ayudaMultiplicador(clave: "calidad" | "geografico" | "exclusividad") {
  return MULTIPLICADORES.find((multiplicador) => multiplicador.clave === clave)
}

/**
 * Lo que recibe el medio por la asignación, congelado al aceptar. El
 * multiplicador de calidad se ve siempre (PRC-003); tarifa, multiplicadores,
 * bruto y comisión solo si la comisión es visible para el medio; retenciones
 * y neto cuando ya se liquidó. La tarifa es por publicación y el bruto, por
 * todas las que pide la oferta (`publicaciones`): con más de una, el desglose
 * lleva la línea «× N» para que cuadre, como en la oferta.
 */
export function desglosePago(
  pago: PagoAsignacion,
  publicaciones = 1
): DesglosePago {
  const comisionVisible = pago.montoBruto !== null
  const lineas: LineaPago[] = []
  const calidad = ayudaMultiplicador("calidad")
  const varias = publicaciones > 1

  if (comisionVisible && pago.tarifaBase !== null) {
    lineas.push({
      clave: "tarifa",
      etiqueta: "Tarifa base",
      valor: formatearCOP(pago.tarifaBase),
      ayuda: varias
        ? "Por publicación, según tu franja de seguidores, la plataforma y el formato."
        : "Según tu franja de seguidores, la plataforma y el formato.",
    })
  }
  lineas.push({
    clave: "calidad",
    etiqueta: calidad?.etiqueta ?? "Calidad de tu cuenta",
    valor: formatearMultiplicador(pago.multiplicadorCalidad),
    ayuda: calidad?.ayuda,
  })
  if (comisionVisible) {
    const geografico = ayudaMultiplicador("geografico")
    if (pago.multiplicadorGeografico !== null) {
      lineas.push({
        clave: "geografico",
        etiqueta: geografico?.etiqueta ?? "Pertinencia geográfica",
        valor: formatearMultiplicador(pago.multiplicadorGeografico),
        ayuda: geografico?.ayuda,
      })
    }
    if (
      pago.multiplicadorExclusividad !== null &&
      pago.multiplicadorExclusividad !== 1
    ) {
      const exclusividad = ayudaMultiplicador("exclusividad")
      lineas.push({
        clave: "exclusividad",
        etiqueta: exclusividad?.etiqueta ?? "Exclusividad",
        valor: formatearMultiplicador(pago.multiplicadorExclusividad),
        ayuda: exclusividad?.ayuda,
      })
    }
    if (varias) {
      lineas.push({
        clave: "publicaciones",
        etiqueta: "Publicaciones",
        valor: `× ${formatearNumero(publicaciones)}`,
        ayuda: `La oferta pide ${contar(publicaciones, "publicación", "publicaciones")}.`,
      })
    }
    if (pago.montoBruto !== null) {
      lineas.push({
        clave: "bruto",
        etiqueta: "Valor bruto",
        valor: formatearCOP(pago.montoBruto),
        ayuda: "Lo que paga el anunciante por tu cupo.",
      })
    }
    if (pago.montoComision !== null) {
      lineas.push({
        clave: "comision",
        etiqueta:
          pago.porcentajeComision !== null
            ? `Comisión AMO (${formatearPorcentaje(pago.porcentajeComision, 0)})`
            : "Comisión AMO",
        valor: `− ${formatearCOP(pago.montoComision)}`,
      })
    }
  }
  lineas.push({
    clave: "medio",
    etiqueta: "Recibes",
    valor: formatearCOP(pago.montoMedio),
    ayuda: "Antes de retenciones.",
    destacada: pago.montoNeto === null,
  })
  if (pago.montoRetenciones !== null && pago.montoNeto !== null) {
    lineas.push(
      {
        clave: "retenciones",
        etiqueta: "Retenciones",
        valor: `− ${formatearCOP(pago.montoRetenciones)}`,
      },
      {
        clave: "neto",
        etiqueta: "Recibes después de retenciones",
        valor: formatearCOP(pago.montoNeto),
        destacada: true,
      }
    )
  }
  return { comisionVisible, lineas }
}

// ── Cortes de métricas de una publicación ────────────────────────────────────

/** Estados en que la asignación acepta métricas (`private.puedo_cargar_metricas`). */
export const ESTADOS_ADMITEN_METRICAS: readonly EstadoAsignacion[] = [
  "PUBLICADA",
  "EVIDENCIA_VALIDADA",
  "METRICAS_CARGADAS",
]

export function admiteMetricas(
  estado: EstadoAsignacion,
  publicacion: Pick<PublicacionMedio, "estado"> | null
): boolean {
  return (
    ESTADOS_ADMITEN_METRICAS.includes(estado) &&
    publicacion !== null &&
    publicacion.estado !== "RECHAZADA"
  )
}

/** Cortes que pide la oferta, en orden (el personalizado no es obligatorio). */
export function cortesObligatorios(cortes: readonly Corte[]): Corte[] {
  return [...new Set(cortes)]
    .filter((corte) => corte !== "PERSONALIZADO")
    .sort((a, b) => CORTES[a].orden - CORTES[b].orden)
}

export type SituacionCorte =
  /** Aún no hay evidencia de esta publicación. */
  | { tipo: "sin_publicacion" }
  /** La evidencia fue rechazada: primero se corrige. */
  | { tipo: "evidencia_por_corregir" }
  /** El corte no se ha cumplido: se habilita en `desde`. */
  | { tipo: "por_habilitar"; desde: string; vence: string }
  /** Se puede cargar; pasada `vence` queda atrasada (aún se acepta). */
  | { tipo: "por_cargar"; vence: string; atrasada: boolean }
  /** Ya la cargó: en revisión, aprobada o por corregir. */
  | { tipo: "cargada"; metrica: MetricaMedio; editable: boolean }
  /** La asignación ya no recibe métricas y este corte no se cargó. */
  | { tipo: "cerrada" }

export interface EntradaSituacionCorte {
  estado: EstadoAsignacion
  corte: Exclude<Corte, "PERSONALIZADO">
  publicacion: PublicacionMedio | null
  metricas: readonly MetricaMedio[]
  plazoCargaHoras?: number
}

/** Situación de un corte obligatorio de una publicación en el instante `ahora`. */
export function situacionCorte(
  {
    estado,
    corte,
    publicacion,
    metricas,
    plazoCargaHoras = PLAZO_CARGA_HORAS_POR_DEFECTO,
  }: EntradaSituacionCorte,
  ahora: Date
): SituacionCorte {
  const metrica = publicacion
    ? metricas.find(
        (fila) => fila.publicacionId === publicacion.id && fila.corte === corte
      )
    : undefined
  const admite = admiteMetricas(estado, publicacion)
  if (metrica) {
    return {
      tipo: "cargada",
      metrica,
      editable: admite && metrica.estado !== "APROBADA",
    }
  }
  if (!publicacion) {
    return ESTADOS_ADMITEN_METRICAS.includes(estado) ||
      estado === "ACEPTADA" ||
      estado === "CONTENIDO_ENTREGADO"
      ? { tipo: "sin_publicacion" }
      : { tipo: "cerrada" }
  }
  if (publicacion.estado === "RECHAZADA" && estado === "CONTENIDO_ENTREGADO") {
    return { tipo: "evidencia_por_corregir" }
  }
  if (!admite) return { tipo: "cerrada" }
  const publicada = instante(publicacion.fechaPublicacion)
  if (!Number.isFinite(publicada)) return { tipo: "cerrada" }
  const desde = publicada + HORAS_CORTE[corte] * HORA_MS
  const vence = desde + plazoCargaHoras * HORA_MS
  if (ahora.getTime() < desde) {
    return {
      tipo: "por_habilitar",
      desde: new Date(desde).toISOString(),
      vence: new Date(vence).toISOString(),
    }
  }
  return {
    tipo: "por_cargar",
    vence: new Date(vence).toISOString(),
    atrasada: ahora.getTime() > vence,
  }
}

/** «1 de 2 publicaciones con evidencia». */
export function resumenPublicaciones(
  esperadas: number,
  publicaciones: readonly Pick<PublicacionMedio, "numero">[]
): string {
  const cargadas = new Set(publicaciones.map((p) => p.numero)).size
  if (esperadas <= 1) {
    return cargadas > 0 ? "Evidencia cargada" : "Sin evidencia todavía"
  }
  return `${cargadas} de ${contar(esperadas, "publicación", "publicaciones")} con evidencia`
}

// ── Avance ───────────────────────────────────────────────────────────────────

/**
 * El avance por el camino feliz de la operación, con el desenlace (desistida,
 * vencida, cancelada o en disputa) nombrado en voz del medio.
 */
export function progresoMedio(asignacion: AsignacionMedio): Progreso {
  const progreso = calcularProgreso(asignacion)
  if (!progreso.desenlace) return progreso
  const presentacion = ESTADOS_PARA_MEDIO[progreso.desenlace.estado]
  return {
    ...progreso,
    desenlace: {
      ...progreso.desenlace,
      etiqueta: presentacion.etiqueta,
      tono: presentacion.tono,
    },
  }
}

// ── Historia de la asignación ────────────────────────────────────────────────

type MarcaHistoria = Exclude<
  EstadoAsignacion,
  "CONTENIDO_ENTREGADO" | "PUBLICADA"
>

const TITULOS_MARCA: Readonly<Record<MarcaHistoria, string>> = {
  ACEPTADA: "Aceptaste la oferta",
  EVIDENCIA_VALIDADA: "El equipo AMO validó tu publicación",
  METRICAS_CARGADAS: "Completaste las métricas de todos los cortes",
  VERIFICADA: "El equipo AMO verificó tu trabajo",
  LIQUIDADA: "Entró en una liquidación",
  PAGADA: "Recibiste el pago",
  RECHAZADA: "Desististe de la campaña",
  VENCIDA_SIN_PUBLICAR: "Venció el plazo para publicar",
  EN_DISPUTA: "Se abrió una disputa",
  CANCELADA: "El equipo AMO canceló tu participación",
}

const COLUMNAS_MARCA: readonly [MarcaHistoria, keyof AsignacionMedio][] = [
  ["ACEPTADA", "aceptadaAt"],
  ["EVIDENCIA_VALIDADA", "evidenciaValidadaAt"],
  ["METRICAS_CARGADAS", "metricasCargadasAt"],
  ["VERIFICADA", "verificadaAt"],
  ["LIQUIDADA", "liquidadaAt"],
  ["PAGADA", "pagadaAt"],
  ["RECHAZADA", "rechazadaAt"],
  ["VENCIDA_SIN_PUBLICAR", "vencidaAt"],
  ["EN_DISPUTA", "enDisputaAt"],
  ["CANCELADA", "canceladaAt"],
]

/** El motivo de la fila es el del último cambio que lo pide. */
const CON_MOTIVO: ReadonlySet<EstadoAsignacion> = new Set([
  "RECHAZADA",
  "CANCELADA",
  "VENCIDA_SIN_PUBLICAR",
  "EN_DISPUTA",
])

function evento(
  datos: Omit<EventoLineaTiempo, "actor" | "fuente">
): EventoLineaTiempo {
  return { ...datos, actor: null, fuente: "registro" }
}

/**
 * Lo que pasó en la asignación, del primer al último hecho, contado al
 * medio: aceptó, descargó cada versión, cargó cada evidencia y cada corte, y
 * lo que decidió el equipo AMO (con sus observaciones). La descarga y la
 * evidencia se cuentan por sus registros (versión y número), no por el cambio
 * de estado que provocaron, para no repetir el mismo hecho.
 */
export function lineaTiempoMedio(
  asignacion: AsignacionMedio,
  { publicaciones, metricas, descargas }: EjecucionAsignacion
): EventoLineaTiempo[] {
  const eventos: EventoLineaTiempo[] = []
  const variasPublicaciones = asignacion.publicaciones > 1
  const dePublicacion = (numero: number) =>
    variasPublicaciones ? ` (publicación ${numero})` : ""

  for (const [estado, columna] of COLUMNAS_MARCA) {
    const at = asignacion[columna]
    if (typeof at !== "string") continue
    // La validación ya se cuenta con la aprobación de cada publicación.
    if (
      estado === "EVIDENCIA_VALIDADA" &&
      publicaciones.some((p) => p.estado === "APROBADA" && p.validadaAt)
    ) {
      continue
    }
    eventos.push(
      evento({
        id: `estado-${estado}`,
        at,
        categoria: "estado",
        titulo: TITULOS_MARCA[estado],
        detalle:
          estado === "ACEPTADA"
            ? [
                asignacion.handle ? `Con @${asignacion.handle}` : null,
                asignacion.pago.montoMedio !== null
                  ? `recibes ${formatearCOP(asignacion.pago.montoMedio)}`
                  : null,
              ]
                .filter(Boolean)
                .join(", ") || null
            : CON_MOTIVO.has(estado) && asignacion.estado === estado
              ? asignacion.motivo
              : null,
        tono: estado === "ACEPTADA" ? "info" : ESTADOS_PARA_MEDIO[estado].tono,
        estado,
      })
    )
  }

  if (descargas.length > 0) {
    descargas.forEach((descarga, indice) => {
      eventos.push(
        evento({
          id: `descarga-${indice}-${descarga.at}`,
          at: descarga.at,
          categoria: "estado",
          titulo:
            descarga.version !== null
              ? `Descargaste la versión ${descarga.version} del contenido`
              : "Descargaste el contenido",
          detalle: null,
          tono: "info",
          estado: "CONTENIDO_ENTREGADO",
        })
      )
    })
  } else if (asignacion.contenidoDescargadoAt) {
    eventos.push(
      evento({
        id: "estado-CONTENIDO_ENTREGADO",
        at: asignacion.contenidoDescargadoAt,
        categoria: "estado",
        titulo: "Descargaste el contenido",
        detalle: null,
        tono: "info",
        estado: "CONTENIDO_ENTREGADO",
      })
    )
  }

  for (const publicacion of publicaciones) {
    eventos.push(
      evento({
        id: `publicacion-${publicacion.id}`,
        at: publicacion.creadaAt,
        categoria: "estado",
        titulo: `Cargaste la evidencia${dePublicacion(publicacion.numero)}`,
        detalle: `Publicada el ${formatearFechaHora(publicacion.fechaPublicacion)}.`,
        tono: "info",
        estado: "PUBLICADA",
      })
    )
    if (publicacion.validadaAt && publicacion.estado !== "PENDIENTE") {
      const aprobada = publicacion.estado === "APROBADA"
      eventos.push(
        evento({
          id: `publicacion-${publicacion.id}-validacion`,
          at: publicacion.validadaAt,
          categoria: aprobada ? "estado" : "evidencia",
          titulo: aprobada
            ? `El equipo AMO aprobó tu evidencia${dePublicacion(publicacion.numero)}`
            : `El equipo AMO pidió corregir la evidencia${dePublicacion(publicacion.numero)}`,
          detalle: aprobada ? null : publicacion.observaciones,
          tono: aprobada ? "exito" : "peligro",
          estado: aprobada ? "EVIDENCIA_VALIDADA" : null,
        })
      )
    }
  }

  const numeroDe = new Map(publicaciones.map((p) => [p.id, p.numero]))
  for (const metrica of metricas) {
    const corte = CORTES[metrica.corte].etiqueta.toLocaleLowerCase("es-CO")
    const numero = numeroDe.get(metrica.publicacionId)
    const sufijo = numero ? dePublicacion(numero) : ""
    eventos.push(
      evento({
        id: `metrica-${metrica.id}`,
        at: metrica.creadaAt,
        categoria: "metrica",
        titulo:
          metrica.corte === "PERSONALIZADO"
            ? `Cargaste un corte personalizado${sufijo}`
            : `Cargaste las métricas de ${corte}${sufijo}`,
        detalle: null,
        tono: "neutro",
        estado: null,
      })
    )
    if (metrica.validadaAt && metrica.estado !== "PENDIENTE") {
      const aprobada = metrica.estado === "APROBADA"
      const nombre =
        metrica.corte === "PERSONALIZADO"
          ? "el corte personalizado"
          : `las métricas de ${corte}`
      eventos.push(
        evento({
          id: `metrica-${metrica.id}-validacion`,
          at: metrica.validadaAt,
          categoria: "metrica",
          titulo: aprobada
            ? `El equipo AMO aprobó ${nombre}${sufijo}`
            : `El equipo AMO pidió corregir ${nombre}${sufijo}`,
          detalle: aprobada ? null : metrica.observaciones,
          tono: aprobada ? "exito" : "peligro",
          estado: null,
        })
      )
    }
  }

  return eventos.sort(
    (a, b) =>
      new Date(a.at).getTime() - new Date(b.at).getTime() ||
      a.id.localeCompare(b.id)
  )
}
