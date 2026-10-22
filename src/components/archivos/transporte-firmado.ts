/**
 * Subida a la URL firmada que preparó el servidor (archivos de hasta 6 MB).
 * Es el mismo PUT multipart que hace `uploadToSignedUrl` de supabase-js, pero
 * con `XMLHttpRequest`: así hay progreso real y cancelación, que `fetch` y
 * supabase-js no ofrecen para subidas.
 */
import {
  ErrorSubida,
  errorCancelada,
  estadoEfectivo,
} from "@/lib/archivos/reintentos"
import { CACHE_CONTROL_SEGUNDOS } from "@/lib/archivos/subida"

/** Sin avance en este tiempo, la conexión se da por colgada y se reintenta. */
export const INACTIVIDAD_MAXIMA_MS = 60_000

export const MENSAJE_ESTANCADA =
  "La subida se quedó detenida. Revisa tu conexión."

export type AlProgresar = (enviados: number, total: number) => void

export interface OpcionesSubidaFirmada {
  /** `urlSubidaFirmada(...)`. */
  url: string
  archivo: File
  clavePublica: string
  senal: AbortSignal
  alProgresar: AlProgresar
  inactividadMs?: number
}

/** Ya existe: un intento anterior llegó a Storage aunque su respuesta se perdió. */
const YA_EXISTE = 409

/**
 * Vigía de inactividad: llama a `alVencer` si `rearmar` no se invoca en `ms`.
 * Lo comparten los dos transportes.
 */
export function crearVigia(ms: number, alVencer: () => void) {
  let temporizador: ReturnType<typeof setTimeout> | undefined
  return {
    rearmar() {
      clearTimeout(temporizador)
      temporizador = setTimeout(alVencer, ms)
    },
    detener() {
      clearTimeout(temporizador)
    },
  }
}

export function subirConUrlFirmada({
  url,
  archivo,
  clavePublica,
  senal,
  alProgresar,
  inactividadMs = INACTIVIDAD_MAXIMA_MS,
}: OpcionesSubidaFirmada): Promise<void> {
  return new Promise((resolver, rechazar) => {
    if (senal.aborted) {
      rechazar(errorCancelada())
      return
    }
    const xhr = new XMLHttpRequest()
    let estancada = false
    const vigia = crearVigia(inactividadMs, () => {
      estancada = true
      xhr.abort()
    })
    const alAbortar = () => xhr.abort()
    const terminar = () => {
      vigia.detener()
      senal.removeEventListener("abort", alAbortar)
    }

    xhr.upload.onprogress = (evento) => {
      vigia.rearmar()
      alProgresar(
        evento.loaded,
        evento.lengthComputable ? evento.total : archivo.size
      )
    }
    xhr.onload = () => {
      terminar()
      const estado = estadoEfectivo(xhr.status, xhr.responseText)
      if ((estado >= 200 && estado < 300) || estado === YA_EXISTE) {
        alProgresar(archivo.size, archivo.size)
        resolver()
      } else {
        rechazar(new ErrorSubida(estado))
      }
    }
    xhr.onerror = () => {
      terminar()
      rechazar(new ErrorSubida(null))
    }
    xhr.onabort = () => {
      terminar()
      rechazar(
        estancada ? new ErrorSubida(null, MENSAJE_ESTANCADA) : errorCancelada()
      )
    }

    xhr.open("PUT", url)
    xhr.setRequestHeader("apikey", clavePublica)
    xhr.setRequestHeader("x-upsert", "false")
    const cuerpo = new FormData()
    cuerpo.append("cacheControl", CACHE_CONTROL_SEGUNDOS)
    // Clave vacía, como supabase-js: Storage toma la primera parte con archivo.
    cuerpo.append("", archivo)
    senal.addEventListener("abort", alAbortar, { once: true })
    vigia.rearmar()
    xhr.send(cuerpo)
  })
}
