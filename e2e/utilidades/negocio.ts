/**
 * Fábricas de campañas y ofertas para las pruebas E2E
 * (`scripts/bootstrap/fabricas-negocio.ts`): API de servicio a nombre de la
 * persona de la empresa y cambios de estado por la máquina de estados con
 * actor y sesión reales (sin SQL directo; nunca en producción).
 *
 * Cada campaña y oferta lleva un nombre único por llamada («Campaña E2E
 * <sufijo>», «Oferta E2E <formato> <sufijo>»), así que los specs se pueden
 * repetir sin chocar. Lo creado queda en la empresa de prueba: un spec que
 * quiera dejarla limpia llama a `borrarCampanasE2E()` en su `afterAll`.
 */
import {
  type ArchivoCreado,
  borrarNegocioDeAnunciante,
  crearCampana,
  crearOferta,
  type EstadoOfertaE2E,
  type SegmentacionOferta,
} from "../../scripts/bootstrap/fabricas-negocio"
import {
  type FormatoE2E,
  PREFIJO_CAMPANA,
} from "../../scripts/bootstrap/negocio-e2e"
import type { CorteMetrica } from "../../scripts/bootstrap/pauta-e2e"
import {
  clienteComoSuperadmin,
  MEDIO_E2E_ID,
} from "../../scripts/bootstrap/provision-e2e"
import { crearClienteServicio } from "../../scripts/bootstrap/supabase"
import type { Database } from "../../src/types/database.types"
import {
  ANUNCIANTE_E2E,
  ANUNCIANTE_NUEVO_E2E,
  anuncianteDe,
  type CuentaAnunciante,
  usuarioAnunciante,
} from "./anunciantes"
import { entorno } from "./cuentas"

export type {
  ArchivoCreado,
  CorteMetrica,
  EstadoOfertaE2E,
  FormatoE2E,
  SegmentacionOferta,
}

export type PlataformaE2E = "INSTAGRAM" | "FACEBOOK" | "TIKTOK"

export interface CampanaE2E {
  id: string
  nombre: string
  anuncianteId: string
  estado: "BORRADOR" | "ACTIVA"
  presupuesto: number
  /** `YYYY-MM-DD` en Bogotá. */
  fechaInicio: string
  fechaFin: string
}

export interface OfertaE2E {
  id: string
  titulo: string
  campanaId: string
  estado: EstadoOfertaE2E
  formato: { plataforma: PlataformaE2E; clave: string }
  fechaLimite: Date
  ventanaInicio: Date
  ventanaFin: Date
  presupuesto: number
  /** Versión vigente del creativo (`null` si se pidió sin creativo). */
  creativoId: string | null
  /** Archivos del creativo tal como se subieron (ruta, SHA-256 y medidas). */
  archivos: ArchivoCreado[]
}

/** Ficha de la oferta del anunciante. */
export function rutaOfertaAnunciante(
  oferta: Pick<OfertaE2E, "id" | "campanaId">
): string {
  return `/campanas/${oferta.campanaId}/ofertas/${oferta.id}`
}

/** Ficha interna de la oferta (moderación). */
export function rutaOfertaInterna(oferta: Pick<OfertaE2E, "id">): string {
  return `/operacion/ofertas/${oferta.id}`
}

function cuentaDeAnunciante(anuncianteId: string): CuentaAnunciante {
  if (anuncianteId === ANUNCIANTE_E2E.id) return "ANUNCIANTE"
  if (anuncianteId === ANUNCIANTE_NUEVO_E2E.id) return "ANUNCIANTE_NUEVO"
  throw new Error(
    `La campaña es de otra empresa (${anuncianteId}): las fábricas solo usan las empresas E2E.`
  )
}

/**
 * Campaña de la empresa (por omisión el «Anunciante E2E») desde hoy y por 30
 * días, con 20.000.000 de presupuesto. ACTIVA por omisión: la activa la
 * empresa con su sesión; con «Anunciante Nuevo E2E» (sin verificar) solo
 * puede quedar en BORRADOR.
 */
export async function crearCampanaE2E(
  opciones: {
    estado?: "BORRADOR" | "ACTIVA"
    presupuesto?: number
    cuenta?: CuentaAnunciante
    nombre?: string
    dias?: number
    /**
     * Empezó hace estos días: para una oferta cuya ventana ya abrió
     * (`ventanaDesdeHoy: { diasAtras }`, con el mismo número o menos).
     */
    diasAtras?: number
  } = {}
): Promise<CampanaE2E> {
  const cuenta = opciones.cuenta ?? "ANUNCIANTE"
  return crearCampana(entorno, await usuarioAnunciante(cuenta), {
    anuncianteId: anuncianteDe(cuenta).id,
    estado: opciones.estado,
    presupuesto: opciones.presupuesto,
    nombre: opciones.nombre,
    dias: opciones.dias,
    diasAtras: opciones.diasAtras,
  })
}

/**
 * Oferta de la campaña en el estado pedido, con su creativo y archivos reales
 * que cumplen el formato (Post de feed de Instagram por omisión: una imagen
 * PNG 1:1; un reel o un video: MP4 9:16 de 3 s; un carrusel: dos imágenes),
 * sin segmentación y con 2 cupos en F1. EN_REVISION la envía la empresa;
 * PUBLICADA, además, la publica un moderador.
 *
 * `fechaLimite` pasada con EN_REVISION o PUBLICADA: la oferta queda en ese
 * estado con la fecha límite vencida. Para eso espera a que el cron de
 * estados no corra en los próximos 45 s y a que la límite pase: la llamada
 * puede tardar hasta ~1 minuto (súbele el tiempo a la prueba, p. ej.
 * `test.setTimeout(120_000)`), y la prueba tiene al menos ~30 s para usarla
 * antes de que el cron la devuelva (EN_REVISION) o la venza (PUBLICADA).
 *
 * Para la pauta del medio usa `crearOfertaPautaE2E` (`pauta.ts`): campaña
 * propia, ventana abierta y dirigida al «Medio E2E».
 */
export async function crearOfertaE2E(opciones: {
  campanaId: string
  formato?: { plataforma: PlataformaE2E; clave: string }
  estado: "BORRADOR" | "EN_REVISION" | "PUBLICADA"
  fechaLimite?: Date
  presupuesto?: number
  cupos?: number
  titulo?: string
  /** `false`: borrador sin creativo (por omisión lleva uno). */
  conCreativo?: boolean
  /**
   * La ventana de publicación ya abrió: hoy desde las 00:00 (Bogotá) o hace
   * `diasAtras` días (para publicar con fecha pasada y cargar cortes; la
   * campaña debe haber empezado antes: `crearCampanaE2E({ diasAtras })`).
   */
  ventanaDesdeHoy?: boolean | { diasAtras: number }
  /**
   * `"MEDIO_E2E"`: dirigida al municipio y las categorías del «Medio E2E»
   * (le llega como a un medio real de la zona); o una segmentación explícita.
   * Sin ella, la ven todos los medios elegibles.
   */
  segmentacion?: "MEDIO_E2E" | SegmentacionOferta
  /** Cortes de métricas que pide (por omisión, los de la configuración: H24, H72 y D7). */
  cortes?: CorteMetrica[]
  publicacionesPorMedio?: number
  permiteMultiplesCupos?: boolean
  permanenciaMinimaDias?: number
  exclusividadDias?: number
}): Promise<OfertaE2E> {
  const { data, error } = await crearClienteServicio(entorno)
    .from("campanas")
    .select("anunciante_id")
    .eq("id", opciones.campanaId)
    .single()
  if (error) {
    throw new Error(
      `No se encontró la campaña ${opciones.campanaId}: ${error.message}`
    )
  }
  const usuario = await usuarioAnunciante(
    cuentaDeAnunciante(data.anunciante_id)
  )
  const oferta = await crearOferta(entorno, usuario, {
    ...opciones,
    segmentacion:
      opciones.segmentacion === "MEDIO_E2E"
        ? { paraMedio: MEDIO_E2E_ID }
        : opciones.segmentacion,
  })
  return {
    ...oferta,
    formato: oferta.formato as OfertaE2E["formato"],
  }
}

type EstadoOferta = Database["public"]["Enums"]["oferta_estado"]

export interface EstadoOfertaDePrueba {
  estado: EstadoOferta
  comentarioModeracion: string | null
  /** Versiones del creativo, de la más antigua a la más reciente. */
  versiones: { version: number; vigente: boolean; activada: boolean }[]
}

/** Estado actual de la oferta en la base (para comprobar el efecto de una acción). */
export async function leerEstadoOferta(
  oferta: Pick<OfertaE2E, "id">
): Promise<EstadoOfertaDePrueba> {
  const servicio = crearClienteServicio(entorno)
  const [fila, versiones] = await Promise.all([
    servicio
      .from("ofertas")
      .select("estado, comentario_moderacion")
      .eq("id", oferta.id)
      .single(),
    servicio
      .from("creativos")
      .select("version, vigente, activado_at")
      .eq("oferta_id", oferta.id)
      .order("version"),
  ])
  if (fila.error || versiones.error) {
    throw new Error(
      `No se pudo leer la oferta ${oferta.id}: ${(fila.error ?? versiones.error)?.message}`
    )
  }
  return {
    estado: fila.data.estado,
    comentarioModeracion: fila.data.comentario_moderacion,
    versiones: versiones.data.map((version) => ({
      version: version.version,
      vigente: version.vigente,
      activada: version.activado_at !== null,
    })),
  }
}

/**
 * Borra las campañas de prueba de la empresa (por omisión las de las fábricas,
 * «Campaña E2E…»; con `prefijo`, las que empiezan así) con sus ofertas,
 * creativos, archivos y avisos. Va en el `afterAll` de un spec. Devuelve
 * cuántas campañas borró.
 */
export async function borrarCampanasE2E(
  opciones: { cuenta?: CuentaAnunciante; prefijo?: string } = {}
): Promise<number> {
  const servicio = await clienteComoSuperadmin(entorno)
  return borrarNegocioDeAnunciante(
    servicio,
    anuncianteDe(opciones.cuenta ?? "ANUNCIANTE").id,
    { prefijo: opciones.prefijo ?? PREFIJO_CAMPANA }
  )
}
