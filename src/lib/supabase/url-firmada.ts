import "server-only"

import { cache } from "react"

import { crearClienteServidor } from "./server"
import {
  CLAVE_VIGENCIA_URL_FIRMADA,
  segundosDeVigencia,
  VIGENCIA_URL_FIRMADA_POR_DEFECTO_S,
} from "./vigencia-url-firmada"

/**
 * Segundos que debe vivir una URL firmada, según la configuración vigente.
 * Se lee una vez por solicitud con la sesión del usuario (la clave es
 * pública). Si no se puede leer rige el valor por defecto: firmar un archivo
 * nunca debe fallar por esto.
 */
export const vigenciaUrlFirmada = cache(async (): Promise<number> => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from("configuracion")
    .select("valor")
    .eq("clave", CLAVE_VIGENCIA_URL_FIRMADA)
    .maybeSingle()
  return error
    ? VIGENCIA_URL_FIRMADA_POR_DEFECTO_S
    : segundosDeVigencia(data?.valor)
})
