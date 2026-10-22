/**
 * Subida reanudable TUS para archivos de más de 6 MB (creativos en video):
 * bloques de 6 MB contra `/storage/v1/upload/resumable`, con el JWT de la
 * sesión del navegador (la RLS de `storage.objects` decide, igual que con la
 * URL firmada). Una misma instancia se reanuda desde el último bloque
 * confirmado tras un corte; los reintentos y la pausa sin conexión los
 * gestiona el motor (`motor-subida.ts`), no tus-js-client.
 * `tus-js-client` se carga solo cuando hace falta.
 */
import type { DetailedError, Upload } from "tus-js-client"

import type { BucketStorage } from "@/lib/archivos/buckets"
import {
  ErrorSubida,
  errorCancelada,
  estadoEfectivo,
} from "@/lib/archivos/reintentos"
import { BLOQUE_TUS_BYTES, metadatosTus } from "@/lib/archivos/subida"

import {
  type AlProgresar,
  crearVigia,
  INACTIVIDAD_MAXIMA_MS,
  MENSAJE_ESTANCADA,
} from "./transporte-firmado"

export interface OpcionesSubidaTus {
  endpoint: string
  archivo: File
  bucket: BucketStorage
  ruta: string
  clavePublica: string
  /** JWT vigente de la sesión (se pide en cada solicitud: puede renovarse). */
  obtenerToken: () => Promise<string>
  inactividadMs?: number
}

export interface SubidaReanudable {
  /** Inicia o reanuda; resuelve cuando Storage tiene el objeto completo. */
  subir(senal: AbortSignal, alProgresar: AlProgresar): Promise<void>
  /** Cancelación definitiva: libera la subida a medias en el servidor. */
  descartar(): Promise<void>
}

interface Manejadores {
  progreso: AlProgresar
  exito: () => void
  error: (error: Error) => void
}

function esDetallado(error: Error): error is DetailedError {
  return "originalResponse" in error
}

/**
 * Fallo de tus-js-client como `ErrorSubida`: con el estado HTTP efectivo si
 * hubo respuesta, o el error propio que lanzó `obtenerToken` (sesión vencida).
 */
export function errorDeTus(error: Error): ErrorSubida {
  if (error instanceof ErrorSubida) return error
  if (!esDetallado(error)) return new ErrorSubida(null)
  if (error.causingError instanceof ErrorSubida) return error.causingError
  const respuesta = error.originalResponse
  return new ErrorSubida(
    respuesta
      ? estadoEfectivo(respuesta.getStatus(), respuesta.getBody())
      : null
  )
}

export function crearSubidaTus(opciones: OpcionesSubidaTus): SubidaReanudable {
  let subida: Upload | null = null
  let manejadores: Manejadores | null = null

  async function instancia(): Promise<Upload> {
    if (subida) return subida
    const { Upload } = await import("tus-js-client")
    subida = new Upload(opciones.archivo, {
      endpoint: opciones.endpoint,
      chunkSize: BLOQUE_TUS_BYTES,
      retryDelays: null,
      uploadDataDuringCreation: true,
      storeFingerprintForResuming: false,
      removeFingerprintOnSuccess: true,
      headers: { apikey: opciones.clavePublica, "x-upsert": "false" },
      metadata: metadatosTus(
        opciones.bucket,
        opciones.ruta,
        opciones.archivo.type
      ),
      onBeforeRequest: async (solicitud) => {
        solicitud.setHeader(
          "authorization",
          `Bearer ${await opciones.obtenerToken()}`
        )
      },
      onProgress: (enviados, total) => manejadores?.progreso(enviados, total),
      onSuccess: () => manejadores?.exito(),
      onError: (error) => manejadores?.error(error),
    })
    return subida
  }

  return {
    async subir(senal, alProgresar) {
      senal.throwIfAborted()
      const upload = await instancia()
      senal.throwIfAborted()
      await new Promise<void>((resolver, rechazar) => {
        const terminar = () => {
          vigia.detener()
          senal.removeEventListener("abort", alAbortar)
          manejadores = null
        }
        const detener = (motivo: Error) => {
          terminar()
          void upload.abort(false).catch(() => undefined)
          rechazar(motivo)
        }
        const vigia = crearVigia(
          opciones.inactividadMs ?? INACTIVIDAD_MAXIMA_MS,
          () => detener(new ErrorSubida(null, MENSAJE_ESTANCADA))
        )
        const alAbortar = () => detener(errorCancelada())
        manejadores = {
          progreso: (enviados, total) => {
            vigia.rearmar()
            alProgresar(enviados, total)
          },
          exito: () => {
            terminar()
            resolver()
          },
          error: (error) => {
            terminar()
            rechazar(errorDeTus(error))
          },
        }
        senal.addEventListener("abort", alAbortar, { once: true })
        vigia.rearmar()
        upload.start()
      })
    },
    async descartar() {
      manejadores = null
      await subida?.abort(true).catch(() => undefined)
    },
  }
}
