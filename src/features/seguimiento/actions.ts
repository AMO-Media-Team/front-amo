"use server"

/**
 * Server Actions del seguimiento de campaña (ANU-011). Autorizan con el DAL,
 * validan con zod y leen con la SESIÓN: `seguimiento_campana`, la RLS de
 * `publicaciones` y la de `storage.objects` deciden qué ve el anunciante. Los
 * errores esperados se devuelven; nunca se lanzan.
 */
import "server-only"

import type { UrlFirmada } from "@/lib/archivos/tipos"
import { requerirPermiso } from "@/lib/auth/dal"
import { desdeErrorZod, fallo, exito, type ResultadoAccion } from "@/lib/result"
import { firmarDescarga } from "@/lib/storage/descargas"
import { crearClienteServidor } from "@/lib/supabase/server"

import { perfilPublicoMedio, seguimientoDeCampana } from "./queries"
import {
  type EntradaConsultaSeguimiento,
  type EntradaFirmaCaptura,
  type EntradaPerfilMedio,
  esquemaConsultaSeguimiento,
  esquemaFirmaCaptura,
  esquemaPerfilMedio,
} from "./schemas"
import type { PerfilMedio, SeguimientoCampana } from "./tipos"

const BUCKET_EVIDENCIAS = "evidencias"

/** Log de servidor sin datos personales: operación y código del fallo. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[seguimiento] ${operacion} falló (${codigo})`)
}

/**
 * Vuelve a consultar el seguimiento de una campaña: la pestaña lo pide cada
 * 60 segundos mientras está a la vista, y al tocar «Actualizar».
 */
export async function consultarSeguimiento(
  entrada: EntradaConsultaSeguimiento
): Promise<ResultadoAccion<SeguimientoCampana>> {
  await requerirPermiso("asignaciones.ver_propias")
  const validacion = esquemaConsultaSeguimiento.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  try {
    return exito(await seguimientoDeCampana(validacion.data.campanaId))
  } catch (error) {
    informar("consultarSeguimiento", error)
    return fallo(
      "No pudimos actualizar el seguimiento. Lo intentaremos de nuevo en un minuto."
    )
  }
}

/** Extensión del objeto para el nombre de la descarga ("webp", "jpg"…). */
function extensionDe(ruta: string): string {
  const coincidencia = /\.([a-z0-9]{2,5})$/i.exec(ruta)
  return coincidencia ? coincidencia[1].toLowerCase() : "webp"
}

/**
 * Firma, como el USUARIO, la captura (o su miniatura) de una publicación de
 * su campaña. La ruta sale de la fila que su sesión puede leer y solo se
 * firman las de la carpeta de la propia asignación (`asignacion/{id}/…`), que
 * la RLS de Storage le deja ver; las capturas de los datos de demostración no
 * son de ninguna asignación y no se ofrecen.
 */
export async function firmarCaptura(
  entrada: EntradaFirmaCaptura
): Promise<ResultadoAccion<UrlFirmada>> {
  await requerirPermiso("asignaciones.ver_propias")
  const validacion = esquemaFirmaCaptura.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { publicacionId, variante, descargar } = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("publicaciones")
      .select("id, numero, asignacion_id, captura_path, miniatura_path")
      .eq("id", publicacionId)
      .maybeSingle()
    if (error) {
      informar("firmarCaptura", error)
      return fallo("No pudimos abrir la captura. Inténtalo de nuevo.")
    }
    if (!data?.captura_path) {
      return fallo("No encontramos la captura de esta publicación.")
    }
    const ruta =
      variante === "miniatura" && data.miniatura_path
        ? data.miniatura_path
        : data.captura_path
    if (!ruta.startsWith(`asignacion/${data.asignacion_id}/`)) {
      return fallo("Esta captura no está disponible para tu cuenta.")
    }
    return await firmarDescarga({
      bucket: BUCKET_EVIDENCIAS,
      ruta,
      firmante: { como: "usuario", cliente: supabase },
      descarga: descargar
        ? `Captura publicacion ${data.numero}.${extensionDe(ruta)}`
        : undefined,
    })
  } catch (error) {
    informar("firmarCaptura", error)
    return fallo("No pudimos abrir la captura. Inténtalo de nuevo.")
  }
}

/**
 * Ficha pública de un medio participante: perfil, cumplimiento y cuentas
 * verificadas. Sin documentos, contacto, datos bancarios ni lo que recibe.
 */
export async function consultarPerfilMedio(
  entrada: EntradaPerfilMedio
): Promise<ResultadoAccion<PerfilMedio | null>> {
  await requerirPermiso("asignaciones.ver_propias")
  const validacion = esquemaPerfilMedio.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  try {
    return exito(await perfilPublicoMedio(validacion.data.medioId))
  } catch (error) {
    informar("consultarPerfilMedio", error)
    return fallo("No pudimos cargar el perfil del medio. Inténtalo de nuevo.")
  }
}
