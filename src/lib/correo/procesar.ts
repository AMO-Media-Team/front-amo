import "server-only"

import { z } from "zod"

import { envCliente } from "@/lib/env"
import { crearClienteAdmin } from "@/lib/supabase/admin"
import { argumentosRpc } from "@/lib/supabase/rpc"
import type { Database } from "@/types/database.types"

import { armarCorreo } from "./plantilla"
import {
  type AdaptadorCorreo,
  claveIdempotencia,
  fallido,
  type MensajeCorreo,
  reintentar,
  type ResultadoEnvio,
} from "./tipos"

/**
 * Despachador de la cola de correos (NOT-004). Lo llama el job `amo_correos`
 * por `POST /api/correos/procesar`:
 *
 * 1. `reclamar_correos_srv(correo.lote)` con el cliente de servicio (contexto
 *    confiable): toma un lote con turno de 5 min, sin pisar a otro despachador.
 * 2. Envía uno por uno, con una pausa entre envíos (límite de tasa del
 *    proveedor) y dentro de un presupuesto de tiempo menor que `maxDuration`.
 * 3. `registrar_envio_correo_srv` con el resultado: la base decide el
 *    reintento con espera creciente, el fallo definitivo y escribe
 *    `notificaciones.enviada_email_at`. El intento es la marca de turno.
 *
 * Lo que no alcanza a intentarse (tiempo o pausa pedida por el proveedor) se
 * registra como `APLAZADO`: vuelve a la cola sin gastar el intento, así un
 * proveedor lento o con límite de tasa no agota los reintentos de correos que
 * nunca se enviaron. Si ese registro falla, el correo vuelve cuando vence su
 * turno. Nada de correos, asuntos ni nombres en el log: solo conteos y códigos.
 */

export const LOTE_POR_DEFECTO = 20
const LOTE_MAXIMO = 100
/** Debajo de `maxDuration` (60 s) con margen para registrar el último envío. */
export const PRESUPUESTO_MS = 50_000
/** No se empieza un envío sin tiempo para su espera máxima (10 s) y su registro. */
const MARGEN_POR_ENVIO_MS = 12_000
/** ≤ 2 envíos por segundo: el límite por omisión de Resend. */
export const PAUSA_ENTRE_ENVIOS_MS = 600
/** Aplazados que se devuelven a la vez (no satura la conexión al final del lote). */
export const APLAZADOS_EN_PARALELO = 10

type ClienteAdmin = Awaited<ReturnType<typeof crearClienteAdmin>>
export type FilaCorreo =
  Database["public"]["Functions"]["reclamar_correos_srv"]["Returns"][number]

type ResultadoRegistro =
  "ENVIADO" | "REINTENTO" | "FALLIDO" | "IGNORADO" | "APLAZADO"

/**
 * Cada correo reclamado cae en un solo conteo: la suma de los demás es
 * `reclamados`.
 */
export interface ResumenCorreos {
  reclamados: number
  enviados: number
  reintentos: number
  fallidos: number
  /** La base no aceptó el resultado: otro despachador tomó el turno. */
  ignorados: number
  /** Sin intentar en esta corrida (tiempo o pausa): vuelven a la cola sin gastar el intento. */
  aplazados: number
  /** No se pudo registrar el resultado (vuelve a la cola al vencer el turno). */
  sinRegistro: number
}

export interface OpcionesProceso {
  adaptador: AdaptadorCorreo
  /** Inyectables en pruebas. */
  admin?: ClienteAdmin
  sitioUrl?: string
  presupuestoMs?: number
  pausaMs?: number
  reloj?: () => number
  esperar?: (ms: number) => Promise<void>
}

export class ErrorColaCorreos extends Error {
  constructor(
    readonly operacion: string,
    readonly codigo: string
  ) {
    super(`No se pudo ${operacion} la cola de correos (${codigo}).`)
    this.name = "ErrorColaCorreos"
  }
}

const esquemaDestinatario = z.email()

function esperarMs(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms))
}

function codigoDe(error: { code?: string | null } | null): string {
  return error?.code || "desconocido"
}

function informar(operacion: string, codigo: string): void {
  console.error(
    JSON.stringify({ nivel: "error", evento: "correo_cola", operacion, codigo })
  )
}

/** `correo.lote` de la configuración (1–100); el valor por omisión si falta. */
export function loteDe(valor: unknown): number {
  const numero = typeof valor === "string" ? Number(valor) : valor
  return typeof numero === "number" && Number.isInteger(numero)
    ? Math.min(Math.max(numero, 1), LOTE_MAXIMO)
    : LOTE_POR_DEFECTO
}

async function leerLote(admin: ClienteAdmin): Promise<number> {
  const { data, error } = await admin
    .from("configuracion")
    .select("valor")
    .eq("clave", "correo.lote")
    .maybeSingle()
  return error ? LOTE_POR_DEFECTO : loteDe(data?.valor)
}

export function mensajeDeFila(
  fila: FilaCorreo,
  sitioUrl: string
): MensajeCorreo {
  const correo = armarCorreo(
    {
      nombre: fila.nombre,
      asunto: fila.asunto,
      cuerpo: fila.cuerpo,
      datos: fila.datos,
      titulo: fila.titulo,
      mensaje: fila.mensaje,
      url: fila.url,
      entidad: fila.entidad,
      entidadId: fila.entidad_id,
    },
    sitioUrl
  )
  return {
    para: fila.destinatario,
    ...correo,
    claveIdempotencia: claveIdempotencia(fila.correo_id),
  }
}

async function enviarFila(
  fila: FilaCorreo,
  adaptador: AdaptadorCorreo,
  sitioUrl: string
): Promise<ResultadoEnvio> {
  if (!esquemaDestinatario.safeParse(fila.destinatario).success) {
    return fallido("destinatario_invalido")
  }
  let mensaje: MensajeCorreo
  try {
    mensaje = mensajeDeFila(fila, sitioUrl)
  } catch {
    return fallido("armado_invalido")
  }
  try {
    return await adaptador.enviar(mensaje)
  } catch {
    // Un adaptador que lanza no deja el lote a medias: el correo se reintenta.
    return reintentar("adaptador_excepcion")
  }
}

const RESULTADO_BD: Record<ResultadoEnvio["estado"], string> = {
  enviado: "ENVIADO",
  reintentar: "REINTENTO",
  fallido: "FALLIDO",
}

/** Un correo reclamado que no se alcanzó a intentar. */
const APLAZADO = { estado: "aplazado" } as const

async function registrar(
  admin: ClienteAdmin,
  fila: FilaCorreo,
  resultado: ResultadoEnvio | typeof APLAZADO
): Promise<ResultadoRegistro | null> {
  try {
    const { data, error } = await admin.rpc(
      "registrar_envio_correo_srv",
      argumentosRpc<"registrar_envio_correo_srv">({
        p_id: fila.correo_id,
        // El intento es la marca de turno: solo quien reclamó lo registra.
        p_intento: fila.intento,
        p_resultado:
          resultado.estado === "aplazado"
            ? "APLAZADO"
            : RESULTADO_BD[resultado.estado],
        p_proveedor_id:
          resultado.estado === "enviado" ? resultado.proveedorId : null,
        p_error:
          resultado.estado === "enviado" || resultado.estado === "aplazado"
            ? null
            : resultado.error,
      })
    )
    if (error) {
      informar("registrar", codigoDe(error))
      return null
    }
    return data as ResultadoRegistro
  } catch {
    informar("registrar", "excepcion")
    return null
  }
}

function contar(resumen: ResumenCorreos, registro: ResultadoRegistro | null) {
  if (registro === "ENVIADO") resumen.enviados += 1
  else if (registro === "REINTENTO") resumen.reintentos += 1
  else if (registro === "FALLIDO") resumen.fallidos += 1
  else if (registro === "IGNORADO") resumen.ignorados += 1
  else if (registro === "APLAZADO") resumen.aplazados += 1
  else resumen.sinRegistro += 1
}

/**
 * Devuelve a la cola, sin gastar el intento, lo que no se alcanzó a intentar
 * (de a `APLAZADOS_EN_PARALELO`: al final del presupuesto queda poco tiempo).
 */
async function aplazar(
  admin: ClienteAdmin,
  filas: readonly FilaCorreo[],
  resumen: ResumenCorreos
): Promise<void> {
  for (let desde = 0; desde < filas.length; desde += APLAZADOS_EN_PARALELO) {
    const tanda = filas.slice(desde, desde + APLAZADOS_EN_PARALELO)
    const registros = await Promise.all(
      tanda.map((fila) => registrar(admin, fila, APLAZADO))
    )
    for (const registro of registros) contar(resumen, registro)
  }
}

export async function procesarColaCorreos({
  adaptador,
  admin,
  sitioUrl = envCliente.NEXT_PUBLIC_SITE_URL,
  presupuestoMs = PRESUPUESTO_MS,
  pausaMs = PAUSA_ENTRE_ENVIOS_MS,
  reloj = Date.now,
  esperar = esperarMs,
}: OpcionesProceso): Promise<ResumenCorreos> {
  const inicio = reloj()
  const cliente = admin ?? (await crearClienteAdmin())
  const lote = await leerLote(cliente)
  const { data, error } = await cliente.rpc("reclamar_correos_srv", {
    p_limite: lote,
  })
  if (error) throw new ErrorColaCorreos("reclamar", codigoDe(error))

  const filas = data ?? []
  const resumen: ResumenCorreos = {
    reclamados: filas.length,
    enviados: 0,
    reintentos: 0,
    fallidos: 0,
    ignorados: 0,
    aplazados: 0,
    sinRegistro: 0,
  }
  let pausado = false
  for (const [indice, fila] of filas.entries()) {
    const sinTiempo = reloj() - inicio + MARGEN_POR_ENVIO_MS > presupuestoMs
    if (pausado || sinTiempo) {
      await aplazar(cliente, filas.slice(indice), resumen)
      break
    }
    if (indice > 0) await esperar(pausaMs)
    const resultado = await enviarFila(fila, adaptador, sitioUrl)
    contar(resumen, await registrar(cliente, fila, resultado))
    pausado = resultado.estado === "reintentar" && resultado.pausar === true
  }
  return resumen
}
