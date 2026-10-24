"use server"

/**
 * Server Actions de las liquidaciones (LIQ-001, LIQ-003, LIQ-004 factura del
 * medio, LIQ-007). Patrón:
 *
 * 1. DAL (`requerirPermiso`) antes que nada.
 * 2. zod: el MISMO esquema que el diálogo (los del periodo, con el día de hoy
 *    en Bogotá).
 * 3. El cambio va por los `*_srv` con actor y sesión o por `transicionar`: la
 *    BD revalida permiso, periodo cerrado, traslape, segregación (D17),
 *    seguridad social (D78), nota de ajuste (D38) y archivo cargado.
 * 4. `revalidatePath` de las vistas, la ficha y los pagos.
 *
 * Los errores esperados se devuelven como `ResultadoAccion`; nunca se lanzan.
 */
import "server-only"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { RUTA_PAGOS_MEDIOS } from "@/features/pagos-medios/rutas"
import type { SubidaPreparada, UrlFirmada } from "@/lib/archivos/tipos"
import { contextoDelActor } from "@/lib/auth/contexto-actor"
import { requerirPermiso } from "@/lib/auth/dal"
import { type ErrorBd, MENSAJE_INESPERADO } from "@/lib/errores-bd"
import { transicionar } from "@/lib/negocio/transicionar"
import {
  desdeErrorZod,
  exito,
  fallo,
  type ResultadoAccion,
  type ResultadoFallo,
} from "@/lib/result"
import { firmarDescarga } from "@/lib/storage/descargas"
import {
  archivoPerteneceA,
  carpetaSoporte,
  nuevaRuta,
} from "@/lib/storage/rutas"
import { confirmarObjeto, prepararSubidaFirmada } from "@/lib/storage/subidas"
import { argumentosRpc } from "@/lib/supabase/rpc"
import { crearClienteServidor } from "@/lib/supabase/server"

import {
  interpretarErrorLiquidacion,
  MENSAJES_LIQUIDACION,
  type OperacionLiquidacion,
  textoErrorCorte,
} from "./errores"
import { hoyBogota } from "./periodo"
import { rutaArchivoLiquidacion } from "./queries"
import { RUTA_LIQUIDACIONES, rutaLiquidacion } from "./rutas"
import {
  type EntradaAnular,
  type EntradaAprobar,
  type EntradaArchivoLiquidacion,
  type EntradaGenerarCorte,
  type EntradaGenerarLiquidacion,
  type EntradaPrepararFactura,
  type EntradaRegistrarFactura,
  esquemaAnular,
  esquemaAprobar,
  esquemaArchivoLiquidacion,
  esquemaGenerarCorte,
  esquemaGenerarLiquidacion,
  esquemaPrepararFactura,
  esquemaRegistrarFactura,
} from "./schemas"
import type { ResultadoAprobacion, ResultadoCorteMedio } from "./tipos"

/** Log de servidor sin datos personales: operación y código. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[liquidaciones] ${operacion} falló (${codigo})`)
}

function falloInesperado(operacion: string, error: unknown): ResultadoFallo {
  informar(operacion, error)
  return fallo(MENSAJE_INESPERADO)
}

function falloBd(
  operacion: OperacionLiquidacion,
  error: ErrorBd
): ResultadoFallo {
  const { mensaje, campo, esperado } = interpretarErrorLiquidacion(
    error,
    operacion
  )
  if (!esperado) informar(operacion, error)
  return campo ? fallo(mensaje, { [campo]: [mensaje] }) : fallo(mensaje)
}

/** Las vistas, las fichas tocadas y «Pagos a medios» muestran el cambio. */
function revalidar(liquidacionIds: readonly string[] = []): void {
  revalidatePath(RUTA_LIQUIDACIONES)
  for (const id of liquidacionIds) revalidatePath(rutaLiquidacion(id))
  revalidatePath(RUTA_PAGOS_MEDIOS)
}

// ── Generar (LIQ-001, D79) ───────────────────────────────────────────────────

const esquemaFilaCorte = z.object({
  medio_id: z.string(),
  medio: z.string().nullish(),
  liquidacion_id: z.string().nullish(),
  error: z.string().nullish(),
})

/**
 * Corte del periodo para todos los medios con verificadas hasta su último
 * día. Cada medio va en su propia subtransacción: el resultado dice, por
 * medio, la liquidación creada o por qué quedó por fuera.
 */
export async function generarCorte(
  entrada: EntradaGenerarCorte
): Promise<ResultadoAccion<ResultadoCorteMedio[]>> {
  const actor = await requerirPermiso("liquidaciones.generar")
  const validacion = esquemaGenerarCorte(hoyBogota()).safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { inicio, fin } = validacion.data

  try {
    const contexto = await contextoDelActor(actor)
    const { data, error } = await contexto.admin.rpc(
      "generar_liquidaciones_corte_srv",
      argumentosRpc<"generar_liquidaciones_corte_srv">({
        p_periodo_inicio: inicio,
        p_periodo_fin: fin,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
      })
    )
    if (error) return falloBd("corte", error)
    revalidar()
    const filas = z.array(esquemaFilaCorte).safeParse(data ?? [])
    if (!filas.success) {
      informar("generarCorte", new Error("RespuestaInesperada"))
      return fallo(MENSAJES_LIQUIDACION.respuestaCorte)
    }
    return exito(
      filas.data.map((fila) => ({
        medioId: fila.medio_id,
        medio: fila.medio ?? "Medio sin nombre",
        liquidacionId: fila.liquidacion_id ?? null,
        error: fila.liquidacion_id ? null : textoErrorCorte(fila.error),
      }))
    )
  } catch (error) {
    return falloInesperado("generarCorte", error)
  }
}

/** Liquida un medio en el periodo indicado (queda en borrador). */
export async function generarLiquidacion(
  entrada: EntradaGenerarLiquidacion
): Promise<ResultadoAccion<{ liquidacionId: string }>> {
  const actor = await requerirPermiso("liquidaciones.generar")
  const validacion = esquemaGenerarLiquidacion(hoyBogota()).safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { medioId, inicio, fin } = validacion.data

  try {
    const contexto = await contextoDelActor(actor)
    const { data, error } = await contexto.admin.rpc(
      "generar_liquidacion_srv",
      argumentosRpc<"generar_liquidacion_srv">({
        p_medio_id: medioId,
        p_periodo_inicio: inicio,
        p_periodo_fin: fin,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
      })
    )
    if (error) return falloBd("liquidar", error)
    revalidar()
    const liquidacionId = z.uuid().safeParse(data)
    if (!liquidacionId.success) {
      informar("generarLiquidacion", new Error("RespuestaInesperada"))
      return fallo(MENSAJES_LIQUIDACION.respuestaCorte)
    }
    return exito({ liquidacionId: liquidacionId.data })
  } catch (error) {
    return falloInesperado("generarLiquidacion", error)
  }
}

// ── Aprobar (LIQ-003, D17, D78) y anular (LIQ-007, D38) ─────────────────────

/**
 * Aprueba una o varias liquidaciones en borrador, una a una: la BD rechaza
 * las que generó quien aprueba (salvo SUPERADMIN) y, con la política
 * BLOQUEAR, las de un medio con la seguridad social pendiente. El resultado
 * va por liquidación.
 */
export async function aprobarLiquidaciones(
  entrada: EntradaAprobar
): Promise<ResultadoAccion<ResultadoAprobacion[]>> {
  const actor = await requerirPermiso("liquidaciones.aprobar")
  const validacion = esquemaAprobar.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const contexto = await contextoDelActor(actor)
    const resultados: ResultadoAprobacion[] = []
    // En serie: cada aprobación bloquea su liquidación y reevalúa la seguridad social.
    for (const liquidacionId of validacion.data.liquidacionIds) {
      const { error } = await transicionar(contexto, {
        entidad: "liquidaciones",
        id: liquidacionId,
        hacia: "APROBADA",
      })
      if (error) {
        const interpretado = interpretarErrorLiquidacion(error, "aprobar")
        if (!interpretado.esperado) informar("aprobarLiquidaciones", error)
        resultados.push({
          liquidacionId,
          ok: false,
          error: interpretado.mensaje,
        })
      } else {
        resultados.push({ liquidacionId, ok: true, error: null })
      }
    }
    revalidar(validacion.data.liquidacionIds)
    return exito(resultados)
  } catch (error) {
    return falloInesperado("aprobarLiquidaciones", error)
  }
}

/**
 * Anula un borrador o una aprobada con motivo: sus asignaciones vuelven a
 * verificadas y el documento soporte se anula con ella. Si el documento ya
 * se transmitió (CUDS) sin nota de ajuste, la BD lo impide.
 */
export async function anularLiquidacion(
  entrada: EntradaAnular
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("liquidaciones.aprobar")
  const validacion = esquemaAnular.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { liquidacionId, motivo } = validacion.data

  try {
    const contexto = await contextoDelActor(actor)
    const { error } = await transicionar(contexto, {
      entidad: "liquidaciones",
      id: liquidacionId,
      hacia: "ANULADA",
      motivo,
    })
    if (error) return falloBd("anular", error)
    revalidar([liquidacionId])
    return exito()
  } catch (error) {
    return falloInesperado("anularLiquidacion", error)
  }
}

// ── Factura del medio que factura (LIQ-004, D83) ─────────────────────────────

/**
 * Firma la subida del PDF de la factura del medio a
 * `soportes/liquidacion/{id}/factura/{uuid}.pdf`, con la sesión: la política
 * de Storage exige `liquidaciones.registrar_pago`.
 */
export async function prepararFacturaMedioInterna(
  entrada: EntradaPrepararFactura
): Promise<ResultadoAccion<SubidaPreparada>> {
  await requerirPermiso("liquidaciones.registrar_pago")
  const validacion = esquemaPrepararFactura.safeParse(entrada)
  if (!validacion.success) {
    return fallo(validacion.error.issues[0]?.message ?? MENSAJE_INESPERADO)
  }
  const { liquidacionId, archivo } = validacion.data

  try {
    const destino = nuevaRuta(
      carpetaSoporte("liquidacion", liquidacionId, "factura"),
      archivo.tipo
    )
    return await prepararSubidaFirmada({
      cliente: await crearClienteServidor(),
      ...destino,
    })
  } catch (error) {
    return falloInesperado("prepararFacturaMedioInterna", error)
  }
}

/**
 * Registra el número y el PDF ya subido de la factura del medio (Finanzas lo
 * hace por él). Idempotente por ruta: repetirlo deja los mismos datos. El
 * objeto se comprueba como servicio (el equipo no lee el bucket) y la BD
 * vuelve a comprobar que exista.
 */
export async function registrarFacturaMedioInterna(
  entrada: EntradaRegistrarFactura
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("liquidaciones.registrar_pago")
  const validacion = esquemaRegistrarFactura.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { liquidacionId, numero, archivo } = validacion.data
  if (
    !archivoPerteneceA(
      archivo,
      carpetaSoporte("liquidacion", liquidacionId, "factura")
    )
  ) {
    return fallo(MENSAJES_LIQUIDACION.archivoAjeno, {
      archivo: [MENSAJES_LIQUIDACION.archivoAjeno],
    })
  }

  try {
    const contexto = await contextoDelActor(actor)
    const objeto = await confirmarObjeto({
      cliente: contexto.admin,
      bucket: archivo.bucket,
      ruta: archivo.ruta,
      esperado: { tamano: archivo.tamano, tipo: archivo.tipo },
    })
    if (!objeto.ok) return fallo(objeto.error, { archivo: [objeto.error] })

    const { error } = await contexto.admin.rpc(
      "registrar_factura_medio_srv",
      argumentosRpc<"registrar_factura_medio_srv">({
        p_liquidacion_id: liquidacionId,
        p_numero: numero,
        p_archivo_path: archivo.ruta,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
      })
    )
    if (error) return falloBd("factura", error)
    revalidar([liquidacionId])
    return exito()
  } catch (error) {
    return falloInesperado("registrarFacturaMedioInterna", error)
  }
}

// ── Descargas (firma como servicio, con `URL_FIRMADA` en la bitácora) ────────

const NOMBRES_ARCHIVO = {
  soporte_pago: "Soporte de pago",
  factura_medio: "Factura del medio",
} as const

/**
 * URL de corta duración para descargar el soporte del pago o la factura del
 * medio. La ruta sale de la fila leída con la sesión; se firma como servicio
 * (el equipo no tiene lectura en `soportes`) y queda `URL_FIRMADA`.
 */
export async function descargarArchivoLiquidacion(
  entrada: EntradaArchivoLiquidacion
): Promise<ResultadoAccion<UrlFirmada>> {
  const actor = await requerirPermiso("liquidaciones.ver")
  const validacion = esquemaArchivoLiquidacion.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { liquidacionId, archivo } = validacion.data

  try {
    const { ruta, existe } = await rutaArchivoLiquidacion(
      liquidacionId,
      archivo
    )
    if (!existe) return fallo(MENSAJES_LIQUIDACION.noEncontrada)
    if (!ruta) return fallo(MENSAJES_LIQUIDACION.sinArchivo)
    const extension = ruta.slice(ruta.lastIndexOf(".") + 1) || "pdf"
    return await firmarDescarga({
      bucket: "soportes",
      ruta,
      firmante: {
        como: "servicio",
        contexto: await contextoDelActor(actor),
        entidad: "liquidaciones",
        entidadId: liquidacionId,
      },
      descarga: `${NOMBRES_ARCHIVO[archivo]} LIQ-${liquidacionId.slice(0, 8)}.${extension}`,
    })
  } catch (error) {
    return falloInesperado("descargarArchivoLiquidacion", error)
  }
}
