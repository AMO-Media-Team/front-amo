/**
 * Entorno real del motor de subidas en el navegador: transportes contra el
 * Supabase del proyecto, conexión según `navigator.onLine` y procesamiento de
 * `@/lib/archivos`. Separado del motor para poder probarlo sin red.
 */
import { comprimirImagen, generarMiniatura } from "@/lib/archivos/compresion"
import { leerDimensiones, leerDuracionVideo } from "@/lib/archivos/medios"
import { ErrorSubida, errorCancelada } from "@/lib/archivos/reintentos"
import { sha256Hex } from "@/lib/archivos/sha256"
import { endpointTus, urlSubidaFirmada } from "@/lib/archivos/subida"
import { validarArchivo } from "@/lib/archivos/validar"
import { obtenerClienteNavegador } from "@/lib/supabase/client"
import {
  SUPABASE_CLAVE_PUBLICABLE,
  SUPABASE_URL,
} from "@/lib/supabase/configuracion"

import type { EntornoSubida } from "./motor-subida"
import { subirConUrlFirmada } from "./transporte-firmado"
import { crearSubidaTus } from "./transporte-tus"

/** JWT vigente: `getSession` lo renueva si está por vencer. Sin sesión, 401. */
async function tokenDeSesion(): Promise<string> {
  const { data, error } = await obtenerClienteNavegador().auth.getSession()
  if (error || !data.session) throw new ErrorSubida(401)
  return data.session.access_token
}

function esperar(ms: number, senal: AbortSignal): Promise<void> {
  return new Promise((resolver, rechazar) => {
    if (senal.aborted) {
      rechazar(errorCancelada())
      return
    }
    const temporizador = setTimeout(() => {
      senal.removeEventListener("abort", alAbortar)
      resolver()
    }, ms)
    const alAbortar = () => {
      clearTimeout(temporizador)
      rechazar(errorCancelada())
    }
    senal.addEventListener("abort", alAbortar, { once: true })
  })
}

function alCambiarConexion(oyente: (enLinea: boolean) => void): () => void {
  const enLinea = () => oyente(true)
  const sinLinea = () => oyente(false)
  window.addEventListener("online", enLinea)
  window.addEventListener("offline", sinLinea)
  return () => {
    window.removeEventListener("online", enLinea)
    window.removeEventListener("offline", sinLinea)
  }
}

export const ENTORNO_NAVEGADOR: EntornoSubida = {
  subirFirmada: ({ bucket, destino, archivo, senal, alProgresar }) =>
    subirConUrlFirmada({
      url: urlSubidaFirmada(SUPABASE_URL, bucket, destino.ruta, destino.token),
      archivo,
      clavePublica: SUPABASE_CLAVE_PUBLICABLE,
      senal,
      alProgresar,
    }),
  crearTus: ({ bucket, ruta, archivo }) =>
    crearSubidaTus({
      endpoint: endpointTus(SUPABASE_URL),
      archivo,
      bucket,
      ruta,
      clavePublica: SUPABASE_CLAVE_PUBLICABLE,
      obtenerToken: tokenDeSesion,
    }),
  enLinea: () => navigator.onLine,
  alCambiarConexion,
  esperar,
  ahora: () => Date.now(),
  aleatorio: () => Math.random(),
  validarArchivo: (archivo, reglas) => validarArchivo(archivo, reglas),
  comprimirImagen,
  generarMiniatura,
  sha256Hex: (archivo, senal) => sha256Hex(archivo, { senal }),
  leerDimensiones,
  leerDuracionVideo,
}
