"use server"

/**
 * Server Actions de las facturas del anunciante (ANU-013): firmar, como el
 * USUARIO, la descarga del PDF de una factura, del soporte de un pago o de
 * una nota crédito. Patrón:
 *
 * 1. DAL (`requerirPermiso("facturas.ver_propias")`) antes que nada.
 * 2. zod: el cliente solo dice qué archivo (tipo e id de la fila).
 * 3. La fila se lee con la sesión (RLS: solo lo expedido de su empresa) y la
 *    ruta sale de ESA fila; además debe estar en la carpeta de su factura.
 * 4. Se firma con el cliente de sesión: la RLS de Storage
 *    (`soy_dueno_soporte`) decide; nada se firma como servicio.
 *
 * Los errores esperados se devuelven como `ResultadoAccion`; nunca se lanzan.
 */
import "server-only"

import type { UrlFirmada } from "@/lib/archivos/tipos"
import { requerirPermiso } from "@/lib/auth/dal"
import { desdeErrorZod, fallo, type ResultadoAccion } from "@/lib/result"
import { firmarDescarga, MENSAJES_DESCARGA } from "@/lib/storage/descargas"
import { crearClienteServidor } from "@/lib/supabase/server"

import { extensionDe, nombreArchivoFactura } from "./presentacion"
import { type EntradaArchivoFactura, esquemaArchivoFactura } from "./schemas"

const BUCKET_SOPORTES = "soportes"

/** Log de servidor sin datos personales: operación y código del fallo. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[facturas-anunciante] ${operacion} falló (${codigo})`)
}

type ClienteSesion = Awaited<ReturnType<typeof crearClienteServidor>>

interface ArchivoUbicado {
  ruta: string
  /** Nombre legible del archivo descargado. */
  nombre: string
}

/** El objeto debe vivir en la carpeta de SU factura (`factura/{id}/`, `pago/{id}/`). */
function enCarpeta(ruta: string, carpeta: string): boolean {
  return ruta.startsWith(`${carpeta}/`) && !ruta.includes("..")
}

async function ubicarFactura(
  supabase: ClienteSesion,
  id: string
): Promise<ArchivoUbicado | null> {
  const { data, error } = await supabase
    .from("facturas")
    .select("id, numero, archivo_path")
    .eq("id", id)
    .not("consecutivo", "is", null)
    .maybeSingle()
  if (error) throw error
  if (!data?.archivo_path || !data.numero) return null
  if (!enCarpeta(data.archivo_path, `factura/${data.id}`)) return null
  return {
    ruta: data.archivo_path,
    nombre: nombreArchivoFactura(
      { tipo: "factura", numero: data.numero },
      extensionDe(data.archivo_path)
    ),
  }
}

async function ubicarSoportePago(
  supabase: ClienteSesion,
  id: string
): Promise<ArchivoUbicado | null> {
  const { data, error } = await supabase
    .from("pagos_anunciante")
    .select(
      "id, factura_id, fecha_pago, soporte_path, factura:facturas ( numero )"
    )
    .eq("id", id)
    .maybeSingle()
  if (error) throw error
  if (!data?.soporte_path) return null
  if (!enCarpeta(data.soporte_path, `pago/${data.factura_id}`)) return null
  return {
    ruta: data.soporte_path,
    nombre: nombreArchivoFactura(
      {
        tipo: "pago",
        numero: data.factura?.numero ?? "factura",
        fecha: data.fecha_pago,
      },
      extensionDe(data.soporte_path)
    ),
  }
}

async function ubicarNotaCredito(
  supabase: ClienteSesion,
  id: string
): Promise<ArchivoUbicado | null> {
  const { data, error } = await supabase
    .from("notas_credito")
    .select("id, factura_id, numero, archivo_path")
    .eq("id", id)
    .maybeSingle()
  if (error) throw error
  if (!data?.archivo_path) return null
  if (!enCarpeta(data.archivo_path, `factura/${data.factura_id}`)) return null
  return {
    ruta: data.archivo_path,
    nombre: nombreArchivoFactura(
      { tipo: "nota_credito", numero: data.numero },
      extensionDe(data.archivo_path)
    ),
  }
}

/**
 * URL de corta duración de un archivo de la factura, firmada como usuario.
 * Con `descargar`, llega como adjunto con un nombre legible («Factura
 * FE1042.pdf»). Si el objeto no existe en Storage (p. ej. datos de
 * demostración), responde «No encontramos el archivo…».
 */
export async function firmarArchivoFactura(
  entrada: EntradaArchivoFactura
): Promise<ResultadoAccion<UrlFirmada>> {
  await requerirPermiso("facturas.ver_propias")
  const validacion = esquemaArchivoFactura.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { tipo, id, descargar } = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const archivo =
      tipo === "factura"
        ? await ubicarFactura(supabase, id)
        : tipo === "pago"
          ? await ubicarSoportePago(supabase, id)
          : await ubicarNotaCredito(supabase, id)
    if (!archivo) return fallo(MENSAJES_DESCARGA.noEncontrado)
    return await firmarDescarga({
      bucket: BUCKET_SOPORTES,
      ruta: archivo.ruta,
      firmante: { como: "usuario", cliente: supabase },
      descarga: descargar ? archivo.nombre : undefined,
    })
  } catch (error) {
    informar("firmarArchivoFactura", error)
    return fallo(MENSAJES_DESCARGA.inesperado)
  }
}
