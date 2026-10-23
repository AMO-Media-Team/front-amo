/**
 * Plan de la pauta E2E del «Medio E2E» (módulo puro): ventanas de publicación
 * que ya empezaron, fechas de publicación y de corte que la BD acepta,
 * métricas coherentes por plataforma, URL de publicación únicas y qué hacer
 * con cada asignación al restablecer. Las escrituras están en
 * `fabricas-pauta.ts`.
 *
 * Las campañas de la pauta llevan su propio prefijo («Pauta E2E…»), distinto
 * del de las fábricas del anunciante («Campaña E2E…»): los specs del
 * anunciante borran sus campañas por prefijo y no deben tocar las que usa el
 * medio, ni al revés.
 */
import { addDays } from "date-fns"

import { inicioDelDia } from "../../src/lib/fechas"
import type { Database, Json } from "../../src/types/database.types"
import type { CalendarioOferta } from "./negocio-e2e"

type Enums = Database["public"]["Enums"]
export type CorteMetrica = Enums["corte_metrica"]
export type CorteFijo = Exclude<CorteMetrica, "PERSONALIZADO">
export type EstadoAsignacion = Enums["asignacion_estado"]
export type PlataformaPauta = Enums["plataforma"]

/** Campañas de los specs de la pauta del medio (`pauta-medio-*`): las borra `restablecerPautaMedio`. */
export const PREFIJO_PAUTA = "Pauta E2E"
/**
 * Campañas con asignaciones del Medio E2E que crea un spec del anunciante
 * (seguimiento, métricas): corren en paralelo con los de la pauta del medio,
 * así que `restablecerPautaMedio` no las toca; las borra su spec.
 */
export const PREFIJO_PAUTA_ANUNCIANTE = "Seguimiento E2E"

const MINUTO_MS = 60_000
const HORA_MS = 60 * MINUTO_MS
const DIA_MS = 24 * HORA_MS
/** Días de la ventana después de la fecha límite (como las ofertas del anunciante). */
const DIAS_VENTANA = 7
/** La BD admite fechas de publicación y de corte hasta 15 min en el futuro; aquí se usan 10. */
const TOLERANCIA_FUTURO_MS = 10 * MINUTO_MS

export const HORAS_CORTE: Readonly<Record<CorteFijo, number>> = {
  H24: 24,
  H72: 72,
  D7: 168,
}

export const CORTES_FIJOS: readonly CorteFijo[] = ["H24", "H72", "D7"]

export function esCorteFijo(corte: CorteMetrica): corte is CorteFijo {
  return corte !== "PERSONALIZADO"
}

// ── Ventana y fechas ─────────────────────────────────────────────────────────

/**
 * Días hacia atrás que debe abrir la ventana para publicar con la antigüedad
 * que pide el corte, con un día de margen: H24 → 2, H72 → 4, D7 → 8.
 */
export function diasAtrasParaCorte(corte: CorteFijo): number {
  return Math.ceil(HORAS_CORTE[corte] / 24) + 1
}

/** Lo que más pide una lista de cortes (0 si no hay cortes fijos). */
export function diasAtrasParaCortes(cortes: readonly CorteMetrica[]): number {
  return cortes
    .filter(esCorteFijo)
    .reduce((maximo, corte) => Math.max(maximo, diasAtrasParaCorte(corte)), 0)
}

/** Horas que debe tener la publicación para cargar todos los cortes (más un margen de una hora). */
export function horasParaCortes(cortes: readonly CorteMetrica[]): number {
  const fijos = cortes.filter(esCorteFijo)
  if (fijos.length === 0) return 0
  return Math.max(...fijos.map((corte) => HORAS_CORTE[corte])) + 1
}

/**
 * Calendario de una oferta cuya ventana de publicación ya empezó: desde las
 * 00:00 (Bogotá) de hace `diasAtras` días. La fecha límite, si no se da, queda
 * dos días después de la anticipación mínima (a la hora), y la ventana dura
 * una semana más desde el día siguiente a la límite, recortada al final de la
 * campaña. La campaña debe empezar ese mismo día o antes.
 */
export function calendarioPauta({
  ahora,
  anticipacionHoras,
  diasAtras,
  fechaLimite,
  campana,
}: {
  ahora: Date
  anticipacionHoras: number
  diasAtras: number
  fechaLimite?: Date
  campana: { inicio: Date; fin: Date }
}): CalendarioOferta {
  if (!Number.isInteger(diasAtras) || diasAtras < 0) {
    throw new RangeError("diasAtras es un entero mayor o igual que 0.")
  }
  const ventanaInicio = inicioDelDia(addDays(ahora, -diasAtras))
  if (ventanaInicio < campana.inicio) {
    throw new RangeError(
      `La campaña empieza después de la ventana: créala con diasAtras ≥ ${diasAtras}.`
    )
  }
  const limite =
    fechaLimite ??
    new Date(
      Math.ceil(
        (ahora.getTime() + (anticipacionHoras + 48) * HORA_MS) / HORA_MS
      ) * HORA_MS
    )
  const base = Math.max(limite.getTime(), ahora.getTime())
  const ventanaFin = new Date(
    Math.min(
      inicioDelDia(new Date(base + DIA_MS)).getTime() + DIAS_VENTANA * DIA_MS,
      campana.fin.getTime()
    )
  )
  if (ventanaFin <= ahora || limite > ventanaFin) {
    throw new RangeError(
      "La campaña termina antes de que quepa la ventana de publicación: crea una campaña más larga."
    )
  }
  return { fechaLimite: limite, ventanaInicio, ventanaFin }
}

export interface Ventana {
  inicio: Date
  fin: Date
}

/**
 * Fecha de publicación de una evidencia: hace `haceHoras` horas (y un minuto,
 * para no caer nunca en el futuro). Debe quedar dentro de la ventana de la
 * oferta (`registrar_evidencia_srv`).
 */
export function fechaPublicacionE2E({
  ahora,
  haceHoras = 0,
  ventana,
}: {
  ahora: Date
  haceHoras?: number
  ventana: Ventana
}): Date {
  if (!Number.isFinite(haceHoras) || haceHoras < 0) {
    throw new RangeError("haceHoras es un número mayor o igual que 0.")
  }
  const fecha = new Date(ahora.getTime() - haceHoras * HORA_MS - MINUTO_MS)
  if (fecha < ventana.inicio) {
    throw new RangeError(
      `La ventana de la oferta empieza el ${ventana.inicio.toISOString()}: para publicar hace ${haceHoras} h crea la oferta con ventanaDesdeHoy y más días atrás.`
    )
  }
  if (fecha > ventana.fin) {
    throw new RangeError("La ventana de publicación de la oferta ya terminó.")
  }
  return fecha
}

/**
 * Fecha del corte: `fechaCorte` si se da; si no, ahora. Para un corte fijo
 * debe haber pasado su tiempo desde la publicación (con la tolerancia de la
 * BD, la hora exacta del corte sirve aunque falten unos minutos).
 */
export function fechaCorteE2E({
  ahora,
  fechaPublicacion,
  corte,
  fechaCorte,
}: {
  ahora: Date
  fechaPublicacion: Date
  corte: CorteMetrica
  fechaCorte?: Date
}): Date {
  const limiteFuturo = ahora.getTime() + TOLERANCIA_FUTURO_MS
  if (fechaCorte && fechaCorte.getTime() > limiteFuturo) {
    throw new RangeError("La fecha del corte no puede estar en el futuro.")
  }
  if (!esCorteFijo(corte)) {
    const fecha = fechaCorte ?? ahora
    if (fecha <= fechaPublicacion) {
      throw new RangeError(
        "El corte personalizado debe ser posterior a la publicación."
      )
    }
    return fecha
  }
  const minimo = fechaPublicacion.getTime() + HORAS_CORTE[corte] * HORA_MS
  if (fechaCorte) {
    if (fechaCorte.getTime() < minimo) {
      throw new RangeError(
        `Aún no se cumple el corte ${corte} desde la publicación.`
      )
    }
    return fechaCorte
  }
  if (minimo <= ahora.getTime()) return ahora
  if (minimo <= limiteFuturo) return new Date(minimo)
  throw new RangeError(
    `Aún no se cumple el corte ${corte}: publica la evidencia con haceHoras ≥ ${HORAS_CORTE[corte] + 1}.`
  )
}

/**
 * Periodo de un corte personalizado: desde las 00:00 (Bogotá) del día de la
 * publicación hasta la fecha del corte (`fn_metricas_coherencia`).
 */
export function periodoPersonalizadoE2E(
  fechaPublicacion: Date,
  fechaCorte: Date
): { desde: Date; hasta: Date } {
  return { desde: inicioDelDia(fechaPublicacion), hasta: fechaCorte }
}

// ── Métricas ─────────────────────────────────────────────────────────────────

/** Columnas de valores de `metricas` que carga el medio. */
export interface ValoresMetrica {
  alcance: number | null
  impresiones: number | null
  reproducciones: number | null
  espectadores_unicos: number | null
  me_gusta: number | null
  comentarios: number | null
  compartidos: number | null
  guardados: number | null
  clics_enlace: number | null
  visitas_perfil: number | null
  tiempo_promedio_visualizacion_s: number | null
  porcentaje_reproduccion_completa: number | null
}

/** Cada corte acumula más que el anterior (la BD rechaza que un corte posterior baje más del 2 %). */
const FACTOR_CORTE: Readonly<Record<CorteMetrica, number>> = {
  H24: 1,
  H72: 1.4,
  D7: 1.8,
  PERSONALIZADO: 1.2,
}

const BASE_FEED = {
  alcance: 12_000,
  impresiones: 18_000,
  me_gusta: 600,
  comentarios: 45,
  compartidos: 30,
  guardados: 25,
  clics_enlace: 140,
  visitas_perfil: 90,
}

const BASE_TIKTOK = {
  reproducciones: 25_000,
  espectadores_unicos: 16_000,
  me_gusta: 1_500,
  comentarios: 80,
  compartidos: 60,
  guardados: 40,
  clics_enlace: 120,
  visitas_perfil: 200,
}

/**
 * Métricas coherentes para la plataforma y el corte: Instagram y Facebook con
 * alcance e impresiones (impresiones ≥ alcance), TikTok con reproducciones y
 * espectadores únicos, interacciones por debajo de las impresiones y cortes
 * crecientes. `ajustes` reemplaza los valores que se quieran probar.
 */
export function valoresMetricaE2E(
  plataforma: PlataformaPauta,
  corte: CorteMetrica,
  ajustes: Partial<ValoresMetrica> = {}
): ValoresMetrica {
  const factor = FACTOR_CORTE[corte]
  const escalar = (valor: number) => Math.round(valor * factor)
  const base: ValoresMetrica =
    plataforma === "TIKTOK"
      ? {
          alcance: null,
          impresiones: null,
          reproducciones: escalar(BASE_TIKTOK.reproducciones),
          espectadores_unicos: escalar(BASE_TIKTOK.espectadores_unicos),
          me_gusta: escalar(BASE_TIKTOK.me_gusta),
          comentarios: escalar(BASE_TIKTOK.comentarios),
          compartidos: escalar(BASE_TIKTOK.compartidos),
          guardados: escalar(BASE_TIKTOK.guardados),
          clics_enlace: escalar(BASE_TIKTOK.clics_enlace),
          visitas_perfil: escalar(BASE_TIKTOK.visitas_perfil),
          tiempo_promedio_visualizacion_s: 7.5,
          porcentaje_reproduccion_completa: 32,
        }
      : {
          alcance: escalar(BASE_FEED.alcance),
          impresiones: escalar(BASE_FEED.impresiones),
          reproducciones: null,
          espectadores_unicos: null,
          me_gusta: escalar(BASE_FEED.me_gusta),
          comentarios: escalar(BASE_FEED.comentarios),
          compartidos: escalar(BASE_FEED.compartidos),
          guardados: escalar(BASE_FEED.guardados),
          clics_enlace: escalar(BASE_FEED.clics_enlace),
          visitas_perfil: escalar(BASE_FEED.visitas_perfil),
          tiempo_promedio_visualizacion_s: null,
          porcentaje_reproduccion_completa: null,
        }
  return { ...base, ...ajustes }
}

/** Interacciones como las cuenta la BD (me gusta + comentarios + compartidos + guardados). */
export function interaccionesDe(valores: ValoresMetrica): number {
  return (
    (valores.me_gusta ?? 0) +
    (valores.comentarios ?? 0) +
    (valores.compartidos ?? 0) +
    (valores.guardados ?? 0)
  )
}

// ── Etapas de una asignación ─────────────────────────────────────────────────

/** Hasta dónde avanza `prepararAsignacion` (`fabricas-pauta.ts`), en el orden del flujo. */
export const ETAPAS_PAUTA = [
  "ACEPTADA",
  "CONTENIDO_ENTREGADO",
  "PUBLICADA",
  "EVIDENCIA_VALIDADA",
  "METRICAS_CARGADAS",
  "VERIFICADA",
] as const satisfies readonly EstadoAsignacion[]

export type EtapaPauta = (typeof ETAPAS_PAUTA)[number]

export function llegaA(hasta: EtapaPauta, etapa: EtapaPauta): boolean {
  return ETAPAS_PAUTA.indexOf(hasta) >= ETAPAS_PAUTA.indexOf(etapa)
}

// ── Contenido descargado ─────────────────────────────────────────────────────

export interface ArchivoEntregado {
  id: string
  archivoPath: string
  mime: string
  tamanoBytes: number
  orden: number
}

/** El creativo vigente que devuelve `registrar_descarga_srv`. */
export interface ContenidoEntregado {
  creativoId: string
  version: number
  tipo: string
  copySugerido: string | null
  hashtags: string[]
  menciones: string[]
  enlaceDestino: string | null
  archivos: ArchivoEntregado[]
}

type ObjetoJson = { [clave: string]: Json | undefined }

function esObjeto(valor: Json | undefined): valor is ObjetoJson {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
}

function texto(objeto: ObjetoJson, clave: string): string {
  const valor = objeto[clave]
  if (typeof valor !== "string") {
    throw new TypeError(`La descarga no trae «${clave}».`)
  }
  return valor
}

function textoOpcional(objeto: ObjetoJson, clave: string): string | null {
  const valor = objeto[clave]
  return typeof valor === "string" ? valor : null
}

function numero(objeto: ObjetoJson, clave: string): number {
  const valor = objeto[clave]
  if (typeof valor !== "number") {
    throw new TypeError(`La descarga no trae «${clave}».`)
  }
  return valor
}

function textos(valor: Json | undefined): string[] {
  return Array.isArray(valor)
    ? valor.filter((x): x is string => typeof x === "string")
    : []
}

/** Lee el jsonb de `registrar_descarga_srv` (falla si no tiene la forma esperada). */
export function leerContenidoEntregado(datos: Json): ContenidoEntregado {
  if (!esObjeto(datos)) throw new TypeError("La descarga no es un objeto.")
  const archivos = Array.isArray(datos.archivos) ? datos.archivos : []
  return {
    creativoId: texto(datos, "creativo_id"),
    version: numero(datos, "version"),
    tipo: texto(datos, "tipo"),
    copySugerido: textoOpcional(datos, "copy_sugerido"),
    hashtags: textos(datos.hashtags),
    menciones: textos(datos.menciones),
    enlaceDestino: textoOpcional(datos, "enlace_destino"),
    archivos: archivos.filter(esObjeto).map((archivo) => ({
      id: texto(archivo, "id"),
      archivoPath: texto(archivo, "archivo_path"),
      mime: texto(archivo, "mime"),
      tamanoBytes: numero(archivo, "tamano_bytes"),
      orden: numero(archivo, "orden"),
    })),
  }
}

// ── URL de la publicación ────────────────────────────────────────────────────

export interface IdentificadorPost {
  /** Código alfanumérico (Instagram, Facebook Stories). */
  codigo: string
  /** Número largo (TikTok, Facebook, historias de Instagram). */
  digitos: string
}

/** Identificador distinto por llamada: la URL de un post es única en la plataforma. */
export function identificadorPost(
  ahora: number = Date.now(),
  azar: () => number = Math.random
): IdentificadorPost {
  const aleatorio = Math.floor(azar() * 1_000_000)
  return {
    codigo: `E2E${ahora.toString(36)}${aleatorio.toString(36)}`,
    digitos: `${ahora}${String(aleatorio).padStart(6, "0")}`,
  }
}

/**
 * URL de una publicación con la forma que exige `publicaciones_url_chk` para
 * la plataforma y el formato (reel, historia, video o publicación del feed).
 */
export function urlPostE2E({
  plataforma,
  formato,
  handle,
  id,
}: {
  plataforma: PlataformaPauta
  formato: string
  handle: string
  id: IdentificadorPost
}): string {
  const usuario = handle.replace(/^@/, "")
  switch (plataforma) {
    case "INSTAGRAM":
      if (formato === "REEL") {
        return `https://www.instagram.com/reel/${id.codigo}/`
      }
      if (formato === "HISTORIA") {
        return `https://www.instagram.com/stories/${usuario}/${id.digitos}/`
      }
      return `https://www.instagram.com/p/${id.codigo}/`
    case "FACEBOOK":
      if (formato === "REEL")
        return `https://www.facebook.com/reel/${id.digitos}`
      if (formato === "HISTORIA") {
        return `https://www.facebook.com/stories/${id.digitos}/${id.codigo}/`
      }
      if (formato === "VIDEO") {
        return `https://www.facebook.com/${usuario}/videos/${id.digitos}`
      }
      return `https://www.facebook.com/${usuario}/posts/${id.digitos}`
    case "TIKTOK":
      return `https://www.tiktok.com/@${usuario}/video/${id.digitos}`
  }
}

// ── Restablecer la pauta del medio ───────────────────────────────────────────

/** Estados de asignación que ocupan cupo (`private.estados_con_cupo()`). */
const ESTADOS_CON_CUPO: ReadonlySet<string> = new Set([
  "ACEPTADA",
  "CONTENIDO_ENTREGADO",
  "PUBLICADA",
  "EVIDENCIA_VALIDADA",
  "METRICAS_CARGADAS",
  "VERIFICADA",
  "LIQUIDADA",
  "PAGADA",
  "EN_DISPUTA",
])

/** Réplica de `private.consume_cupo(estado, previo)`. */
export function consumeCupo(estado: string, previo: string | null): boolean {
  return (
    ESTADOS_CON_CUPO.has(estado) &&
    !(estado === "EN_DISPUTA" && previo === "VENCIDA_SIN_PUBLICAR")
  )
}

/** Lo que se lee de cada asignación para decidir qué hacer con ella. */
export interface AsignacionALimpiar {
  id: string
  estado: EstadoAsignacion
  estadoPrevioDisputa: EstadoAsignacion | null
  contenidoDescargadoAt: string | null
  /**
   * Tiene descargas registradas: `descargas_contenido` es de solo inserción,
   * así que la BD no deja borrarla (ni su campaña).
   */
  conDescarga: boolean
  campanaId: string
  campanaNombre: string
  anuncianteId: string
  /** Fecha límite de aceptación de la oferta (ISO). */
  fechaLimiteAceptacion: string
}

/** Cómo se libera el cupo de una asignación antes de borrarla o dejarla cancelada. */
export interface Liberacion {
  id: string
  /** El medio desiste (aceptada sin descarga y a tiempo) o el equipo AMO la cancela. */
  via: "DESISTIR" | "CANCELAR"
}

export interface PlanLimpiezaPauta {
  /** Campañas de la pauta: se limpian enteras (`planCampanasPauta`). */
  campanas: string[]
  /** Asignaciones de otras campañas que ocupan cupo: se liberan por la máquina de estados. */
  liberar: Liberacion[]
  /** Las que se borran (ya sin cupo); las que tienen descargas solo quedan liberadas. */
  borrar: string[]
  /** Las que no se tocan, con el motivo. */
  conservar: { id: string; motivo: string }[]
}

const NO_SE_LIBERAN: ReadonlySet<EstadoAsignacion> = new Set([
  "LIQUIDADA",
  "PAGADA",
  "EN_DISPUTA",
])

/** Desistir si el medio aún puede (aceptada, sin descarga, antes de la fecha límite); si no, cancelar. */
export function viaLiberacion(
  asignacion: Pick<
    AsignacionALimpiar,
    "estado" | "contenidoDescargadoAt" | "fechaLimiteAceptacion"
  >,
  ahora: Date
): Liberacion["via"] {
  return asignacion.estado === "ACEPTADA" &&
    asignacion.contenidoDescargadoAt === null &&
    ahora.getTime() < Date.parse(asignacion.fechaLimiteAceptacion)
    ? "DESISTIR"
    : "CANCELAR"
}

/**
 * Qué hacer con cada asignación del medio para dejarlo sin la pauta de pruebas
 * anteriores. Las campañas de la pauta (de una empresa E2E y con el prefijo)
 * se limpian enteras; las de otra campaña E2E son de un spec del anunciante y
 * se conservan; las de campañas ajenas (p. ej. demo) liberan su cupo por la
 * máquina de estados antes de borrarse, para que los contadores de esa oferta
 * y esa campaña sigan cuadrando. Nada liquidado, pagado o en disputa se toca,
 * y lo que tiene descargas queda liberado pero no se borra.
 */
export function planLimpiezaPauta(
  asignaciones: readonly AsignacionALimpiar[],
  {
    anunciantesE2E,
    prefijo = PREFIJO_PAUTA,
    ahora,
  }: { anunciantesE2E: readonly string[]; prefijo?: string; ahora: Date }
): PlanLimpiezaPauta {
  const plan: PlanLimpiezaPauta = {
    campanas: [],
    liberar: [],
    borrar: [],
    conservar: [],
  }
  const campanas = new Set<string>()
  for (const asignacion of asignaciones) {
    if (anunciantesE2E.includes(asignacion.anuncianteId)) {
      if (asignacion.campanaNombre.startsWith(prefijo)) {
        campanas.add(asignacion.campanaId)
      } else {
        plan.conservar.push({
          id: asignacion.id,
          motivo: `campaña «${asignacion.campanaNombre}» de otro spec`,
        })
      }
      continue
    }
    if (NO_SE_LIBERAN.has(asignacion.estado)) {
      plan.conservar.push({
        id: asignacion.id,
        motivo: `${asignacion.estado}: no se libera sin afectar pagos o disputas`,
      })
      continue
    }
    const conCupo = consumeCupo(
      asignacion.estado,
      asignacion.estadoPrevioDisputa
    )
    if (conCupo) {
      plan.liberar.push({
        id: asignacion.id,
        via: viaLiberacion(asignacion, ahora),
      })
    }
    if (asignacion.conDescarga) {
      plan.conservar.push({
        id: asignacion.id,
        motivo: conCupo
          ? "tiene descargas: queda cancelada (la BD no deja borrarla)"
          : "tiene descargas: la BD no deja borrarla",
      })
    } else {
      plan.borrar.push(asignacion.id)
    }
  }
  plan.campanas = [...campanas]
  return plan
}

/** Una campaña de la pauta con sus asignaciones (de cualquier medio). */
export interface CampanaALimpiar {
  id: string
  estado: Enums["campana_estado"]
  asignaciones: readonly Pick<
    AsignacionALimpiar,
    "id" | "estado" | "estadoPrevioDisputa" | "conDescarga"
  >[]
}

export interface PlanCampanasPauta {
  /** Sin descargas: se borran enteras (asignaciones, ofertas, creativos, archivos). */
  borrar: string[]
  /**
   * Con descargas (la BD no las deja borrar): sus asignaciones con cupo se
   * cancelan, la campaña se cancela (si sigue activa) y se archiva.
   */
  retener: string[]
  /** Asignaciones de las campañas retenidas que ocupan cupo: el equipo AMO las cancela. */
  cancelar: string[]
  /** Asignaciones sin descargas de las campañas retenidas: se borran tras cancelar. */
  borrarAsignaciones: string[]
  /** Campañas retenidas que siguen activas: se cancelan antes de archivarlas. */
  cancelarCampanas: string[]
  conservar: { id: string; motivo: string }[]
}

/**
 * Cómo limpiar las campañas de la pauta: borrarlas enteras si ninguna
 * asignación tiene descargas; si alguna tiene, cancelar (liberando cupos),
 * cancelar la campaña y archivarla, para que ni sus ofertas ni sus campañas
 * vuelvan a aparecer.
 */
export function planCampanasPauta(
  campanas: readonly CampanaALimpiar[]
): PlanCampanasPauta {
  const plan: PlanCampanasPauta = {
    borrar: [],
    retener: [],
    cancelar: [],
    borrarAsignaciones: [],
    cancelarCampanas: [],
    conservar: [],
  }
  for (const campana of campanas) {
    if (!campana.asignaciones.some((asignacion) => asignacion.conDescarga)) {
      plan.borrar.push(campana.id)
      continue
    }
    plan.retener.push(campana.id)
    if (campana.estado === "ACTIVA") plan.cancelarCampanas.push(campana.id)
    for (const asignacion of campana.asignaciones) {
      if (NO_SE_LIBERAN.has(asignacion.estado)) {
        plan.conservar.push({
          id: asignacion.id,
          motivo: `${asignacion.estado}: no se libera sin afectar pagos o disputas`,
        })
        continue
      }
      if (consumeCupo(asignacion.estado, asignacion.estadoPrevioDisputa)) {
        plan.cancelar.push(asignacion.id)
      }
      if (!asignacion.conDescarga) plan.borrarAsignaciones.push(asignacion.id)
    }
  }
  return plan
}

/** Resumen legible del restablecimiento para el registro de `pnpm bootstrap:e2e`. */
export function describirLimpieza({
  plan,
  campanasBorradas,
  campanasArchivadas,
}: {
  plan: PlanLimpiezaPauta
  campanasBorradas: number
  campanasArchivadas: number
}): string {
  const partes = [
    campanasBorradas > 0 &&
      `${campanasBorradas} campaña(s) de la pauta borradas`,
    campanasArchivadas > 0 &&
      `${campanasArchivadas} campaña(s) con descargas canceladas y archivadas`,
    plan.liberar.length > 0 &&
      `${plan.liberar.length} asignación(es) de otras campañas liberadas`,
    plan.borrar.length > 0 &&
      `${plan.borrar.length} asignación(es) de otras campañas borradas`,
    plan.conservar.length > 0 && `${plan.conservar.length} conservada(s)`,
  ].filter((parte): parte is string => typeof parte === "string")
  return partes.length > 0
    ? partes.join("; ")
    : "sin pauta de pruebas anteriores"
}
