/**
 * Plan de las fábricas de campañas y ofertas E2E (módulo puro): nombres
 * únicos, fechas en Bogotá, presupuesto disponible, el creativo que cumple
 * cada formato y la espera que evita el cron de estados. Las escrituras están
 * en `fabricas-negocio.ts`.
 */
import { addDays } from "date-fns"

import {
  inicioDelDia,
  parsearFecha,
  serializarFecha,
} from "../../src/lib/fechas"
import type { Database, Json } from "../../src/types/database.types"
import { medidasParaRelacion } from "./archivos-e2e"

type Enums = Database["public"]["Enums"]
export type PlataformaE2E = Enums["plataforma"]
export type EstadoOferta = Enums["oferta_estado"]
export type TipoCreativo = Enums["creativo_tipo"]

export const PREFIJO_CAMPANA = "Campaña E2E"
export const PREFIJO_OFERTA = "Oferta E2E"

const HORA_MS = 3_600_000
const DIA_MS = 24 * HORA_MS
/** Días de la campaña por omisión: caben la anticipación y una semana de publicación. */
export const DIAS_CAMPANA = 30
/** Días de la ventana de publicación de una oferta. */
const DIAS_VENTANA = 7
/** Lado mayor de las imágenes (como un post real) y de los videos (livianos: I_PCM). */
const LADO_IMAGEN = 1080
const LADO_VIDEO = 640
const SEGUNDOS_VIDEO = 3

/** Sufijo corto y distinto por llamada (base 36: hora + azar). */
export function sufijoUnico(
  ahora: number = Date.now(),
  azar: () => number = Math.random
): string {
  return `${ahora.toString(36)}${Math.floor(azar() * 36 ** 3)
    .toString(36)
    .padStart(3, "0")}`
}

export interface FormatoE2E {
  plataforma: PlataformaE2E
  /** `formatos.clave`: POST_FEED, CARRUSEL, REEL, HISTORIA o VIDEO. */
  clave: string
}

export const FORMATO_POR_OMISION: FormatoE2E = {
  plataforma: "INSTAGRAM",
  clave: "POST_FEED",
}

// ── Campaña ──────────────────────────────────────────────────────────────────

export interface FechasCampana {
  /** `YYYY-MM-DD` en Bogotá. */
  fechaInicio: string
  fechaFin: string
}

/**
 * Desde hoy (Bogotá) y por `dias` días de calendario. Con `diasAtras`, la
 * campaña empezó hace esos días (el fin no cambia): así cabe una oferta cuya
 * ventana de publicación ya abrió, para publicar con fecha pasada y cargar
 * cortes de métricas (la BD no exige que el inicio sea futuro).
 */
export function fechasCampana(
  ahora: Date,
  dias = DIAS_CAMPANA,
  diasAtras = 0
): FechasCampana {
  if (!Number.isInteger(dias) || dias < 1) {
    throw new RangeError("La campaña dura al menos un día.")
  }
  if (!Number.isInteger(diasAtras) || diasAtras < 0) {
    throw new RangeError("diasAtras es un entero mayor o igual que 0.")
  }
  const hoy = inicioDelDia(ahora)
  return {
    fechaInicio: serializarFecha(addDays(hoy, -diasAtras)),
    fechaFin: serializarFecha(addDays(hoy, dias)),
  }
}

/**
 * Instantes que limitan la ventana de publicación (`validar_envio_oferta`):
 * desde las 00:00 del primer día hasta las 00:00 del día siguiente al último.
 */
export function limitesCampana(fechas: FechasCampana): {
  inicio: Date
  fin: Date
} {
  const inicio = parsearFecha(fechas.fechaInicio)
  const ultimo = parsearFecha(fechas.fechaFin)
  if (!inicio || !ultimo) throw new RangeError("Fechas de campaña inválidas.")
  return { inicio, fin: new Date(ultimo.getTime() + DIA_MS) }
}

// ── Oferta ───────────────────────────────────────────────────────────────────

export interface CalendarioOferta {
  fechaLimite: Date
  ventanaInicio: Date
  ventanaFin: Date
}

/**
 * Fecha límite de aceptación y ventana de publicación. Sin `fechaLimite`, la
 * límite queda dos días después de la anticipación mínima (redondeada a la
 * hora) y la ventana empieza el día siguiente a las 00:00 y dura una semana,
 * recortada al final de la campaña. Una `fechaLimite` pasada se respeta (la
 * ventana se arma desde hoy): sirve para las ofertas vencidas.
 */
export function calendarioOferta({
  ahora,
  anticipacionHoras,
  fechaLimite,
  campana,
}: {
  ahora: Date
  anticipacionHoras: number
  fechaLimite?: Date
  campana: { inicio: Date; fin: Date }
}): CalendarioOferta {
  const limite =
    fechaLimite ??
    new Date(
      Math.ceil(
        (ahora.getTime() + (anticipacionHoras + 48) * HORA_MS) / HORA_MS
      ) * HORA_MS
    )
  const base = Math.max(
    limite.getTime(),
    ahora.getTime(),
    campana.inicio.getTime()
  )
  const ventanaInicio = inicioDelDia(new Date(base + DIA_MS))
  const ventanaFin = new Date(
    Math.min(
      ventanaInicio.getTime() + DIAS_VENTANA * DIA_MS,
      campana.fin.getTime()
    )
  )
  if (ventanaFin <= ventanaInicio || limite > ventanaFin) {
    throw new RangeError(
      "La campaña termina antes de que quepa la ventana de publicación: crea una campaña más larga."
    )
  }
  return { fechaLimite: limite, ventanaInicio, ventanaFin }
}

/** Lo que cuenta `private.comprometido_en_ofertas` de cada oferta de la campaña. */
export interface OfertaComprometida {
  estado: EstadoOferta
  presupuesto_maximo: number
  presupuesto_comprometido: number
  deleted_at: string | null
}

const RESERVAN_MAXIMO: ReadonlySet<EstadoOferta> = new Set([
  "EN_REVISION",
  "PUBLICADA",
  "CUPOS_COMPLETOS",
  "EN_EJECUCION",
])
const RESERVAN_COMPROMETIDO: ReadonlySet<EstadoOferta> = new Set([
  "VENCIDA",
  "CERRADA",
])

/**
 * Presupuesto que le queda a la campaña para una oferta, con la misma regla
 * que `public.disponible_campana`: las ofertas en revisión o publicadas
 * reservan su máximo; las vencidas o cerradas, lo comprometido; borradores,
 * devueltas y canceladas no reservan.
 */
export function disponibleCampana(
  presupuestoTotal: number,
  ofertas: readonly OfertaComprometida[]
): number {
  return ofertas
    .filter((oferta) => oferta.deleted_at === null)
    .reduce((disponible, oferta) => {
      if (RESERVAN_MAXIMO.has(oferta.estado)) {
        return disponible - Number(oferta.presupuesto_maximo)
      }
      if (RESERVAN_COMPROMETIDO.has(oferta.estado)) {
        return disponible - Number(oferta.presupuesto_comprometido)
      }
      return disponible
    }, presupuestoTotal)
}

// ── Creativo ─────────────────────────────────────────────────────────────────

export interface RequisitosFormato {
  mime: string[]
  relacionesAspecto: string[]
  duracionMaximaSegundos: number | null
  maxArchivos: number
}

/** `formatos.requisitos` (jsonb) con valores por omisión seguros. */
export function leerRequisitos(requisitos: Json): RequisitosFormato {
  const objeto =
    requisitos && typeof requisitos === "object" && !Array.isArray(requisitos)
      ? requisitos
      : {}
  const lista = (valor: Json | undefined) =>
    Array.isArray(valor)
      ? valor.filter((x): x is string => typeof x === "string")
      : []
  const numero = (valor: Json | undefined) =>
    typeof valor === "number" && Number.isFinite(valor) ? valor : null
  return {
    mime: lista(objeto.mime),
    relacionesAspecto: lista(objeto.relaciones_aspecto),
    duracionMaximaSegundos: numero(objeto.duracion_max_s),
    maxArchivos: numero(objeto.max_archivos) ?? 1,
  }
}

export interface ArchivoPlaneado {
  clase: "imagen" | "video"
  ancho: number
  alto: number
  /** Solo videos. */
  segundos: number | null
}

export interface PlanCreativo {
  tipo: TipoCreativo
  archivos: ArchivoPlaneado[]
}

/**
 * El creativo más simple que cumple el formato: un carrusel lleva dos
 * imágenes; un formato que solo admite video (reel, video), un video de 3 s;
 * los demás, una imagen PNG. Todos con la primera relación de aspecto que
 * admite el formato.
 */
export function planCreativo(
  clave: string,
  requisitos: RequisitosFormato
): PlanCreativo {
  const relacion = requisitos.relacionesAspecto[0] ?? "1:1"
  const admiteImagen = requisitos.mime.some((mime) => mime.startsWith("image/"))
  const admiteVideo = requisitos.mime.some((mime) => mime.startsWith("video/"))
  const imagen = (): ArchivoPlaneado => ({
    clase: "imagen",
    ...medidasParaRelacion(relacion, LADO_IMAGEN),
    segundos: null,
  })
  if (clave === "CARRUSEL") {
    return { tipo: "CARRUSEL", archivos: [imagen(), imagen()] }
  }
  if (!admiteImagen && admiteVideo) {
    const segundos = Math.min(
      SEGUNDOS_VIDEO,
      requisitos.duracionMaximaSegundos ?? SEGUNDOS_VIDEO
    )
    return {
      tipo: "VIDEO",
      archivos: [
        {
          clase: "video",
          ...medidasParaRelacion(relacion, LADO_VIDEO, { pares: true }),
          segundos,
        },
      ],
    }
  }
  if (!admiteImagen) {
    throw new RangeError(`El formato ${clave} no admite imágenes ni videos.`)
  }
  return { tipo: "IMAGEN", archivos: [imagen()] }
}

// ── Cron de estados ──────────────────────────────────────────────────────────

/**
 * `amo_actualizar_estados` corre a los minutos 5, 20, 35 y 50 de cada hora
 * (`5-59/15 * * * *`): devuelve las ofertas en revisión con la fecha límite
 * vencida y vence las publicadas. Una prueba que necesita una oferta así la
 * crea lejos de esa hora para que el cron no se la cambie mientras la usa.
 */
const PERIODO_CRON_MS = 15 * 60_000
const DESFASE_CRON_MS = 5 * 60_000
/** Lo que se deja correr al cron antes de seguir. */
export const DURACION_CRON_MS = 15_000
/** Tiempo mínimo hasta la siguiente corrida para crear una oferta vencida. */
export const GUARDA_CRON_MS = 45_000

/** Milisegundos que conviene esperar antes de vencer una oferta (0 si no hace falta). */
export function esperaPorCron(ahora: number): number {
  const anterior =
    Math.floor((ahora - DESFASE_CRON_MS) / PERIODO_CRON_MS) * PERIODO_CRON_MS +
    DESFASE_CRON_MS
  const siguiente = anterior + PERIODO_CRON_MS
  if (ahora - anterior < DURACION_CRON_MS) {
    return anterior + DURACION_CRON_MS - ahora
  }
  if (siguiente - ahora < GUARDA_CRON_MS) {
    return siguiente + DURACION_CRON_MS - ahora
  }
  return 0
}
