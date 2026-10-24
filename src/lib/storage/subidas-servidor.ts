import "server-only"

/**
 * Subida desde el servidor (docs/modelo-datos.md §8): archivos que genera la
 * plataforma —el PDF y el archivo para el proveedor del documento soporte, el
 * CSV de la dispersión— y que ninguna persona sube desde el navegador. La
 * Server Action autoriza con el DAL, construye la ruta con `rutas.ts` y llama
 * aquí con el cliente de servicio (`crearClienteAdmin({ actorId })`, sin RLS).
 * Nunca sobrescribe: cada archivo es un objeto nuevo. Después, el `*_srv`
 * correspondiente comprueba que el objeto exista antes de guardarlo en su fila.
 */
import { BUCKETS } from "@/lib/archivos/buckets"
import { fallo, exito, type ResultadoAccion } from "@/lib/result"

import { type ClienteStorage, informarStorage } from "./cliente"
import { asegurarRutaSegura, type RutaStorage } from "./rutas"

export const MENSAJES_SUBIDA_SERVIDOR = {
  muyGrande: "El archivo generado supera el tamaño permitido.",
  noSubido: "No pudimos guardar el archivo. Inténtalo de nuevo.",
} as const

export interface OpcionesSubirComoServicio {
  /** Cliente de servicio, creado después de autorizar con el DAL. */
  cliente: ClienteStorage
  destino: RutaStorage
  contenido: Uint8Array | Blob | string
  /** MIME admitido por el bucket (`nuevaRuta` ya lo comprobó). */
  tipo: string
}

function bytesDe(contenido: Uint8Array | Blob | string): number {
  if (typeof contenido === "string")
    return new TextEncoder().encode(contenido).byteLength
  return contenido instanceof Blob ? contenido.size : contenido.byteLength
}

export async function subirComoServicio({
  cliente,
  destino,
  contenido,
  tipo,
}: OpcionesSubirComoServicio): Promise<ResultadoAccion<RutaStorage>> {
  const ruta = asegurarRutaSegura(destino.ruta)
  if (bytesDe(contenido) > BUCKETS[destino.bucket].maxBytes) {
    return fallo(MENSAJES_SUBIDA_SERVIDOR.muyGrande)
  }
  const cuerpo =
    typeof contenido === "string"
      ? new Blob([contenido], { type: tipo })
      : contenido
  const { error } = await cliente.storage
    .from(destino.bucket)
    .upload(ruta, cuerpo, { contentType: tipo, upsert: false })
  if (error) {
    informarStorage("subirComoServicio", error)
    return fallo(MENSAJES_SUBIDA_SERVIDOR.noSubido)
  }
  return exito({ bucket: destino.bucket, ruta })
}
