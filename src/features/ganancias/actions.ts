"use server"

/**
 * Server Actions de «Ganancias» del medio (MED-015, D83). Patrón:
 *
 * 1. DAL (`requerirPermiso("liquidaciones.ver_propias")`) antes que nada.
 * 2. zod: el MISMO esquema que la interfaz.
 * 3. Lecturas con el cliente del USUARIO por las RPC del medio
 *    (`mis_liquidaciones_medio`): nunca las tablas.
 * 4. Los archivos se firman como USUARIO con la ruta de la fila que devolvió
 *    la RPC (nunca del cliente): Storage solo deja leer al medio dueño
 *    (`soy_dueno_soporte`).
 * 5. La factura del medio que factura se sube directo a Storage con su sesión
 *    (`liquidacion/{id}/factura/…`, política `puedo_subir_factura_medio`), se
 *    comprueba y se registra con `registrar_factura_medio_srv` (actor y
 *    sesión): la BD revalida dueño, estado, número y archivo.
 *
 * Los errores esperados se devuelven como `ResultadoAccion`; nunca se lanzan.
 */
import "server-only"

import { refresh } from "next/cache"

import { contextoDelActor } from "@/lib/auth/contexto-actor"
import { requerirPermiso } from "@/lib/auth/dal"
import type { SubidaPreparada, UrlFirmada } from "@/lib/archivos/tipos"
import { type ErrorBd, MENSAJE_INESPERADO } from "@/lib/errores-bd"
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
  perteneceA,
} from "@/lib/storage/rutas"
import { confirmarObjeto, prepararSubidaFirmada } from "@/lib/storage/subidas"
import { argumentosRpc } from "@/lib/supabase/rpc"
import { crearClienteServidor } from "@/lib/supabase/server"

import { aLiquidacion, rutaArchivo } from "./datos"
import { interpretarErrorGanancias, MENSAJES_GANANCIAS } from "./errores"
import { nombreArchivoLiquidacion } from "./presentacion"
import { misLiquidaciones } from "./queries"
import {
  type EntradaConfirmarFactura,
  type EntradaFirmarArchivo,
  type EntradaPaginaPagos,
  type EntradaPrepararFactura,
  type EntradaRegistrarFactura,
  esquemaConfirmarFactura,
  esquemaFirmarArchivo,
  esquemaPaginaPagos,
  esquemaPrepararFactura,
  esquemaRegistrarFactura,
} from "./schemas"
import type { PaginaLiquidaciones } from "./tipos"

const PERMISO = "liquidaciones.ver_propias"

// ── Utilidades internas (no exportadas: no son acciones) ─────────────────────

/** Log de servidor sin datos personales: operación y código. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[ganancias] ${operacion} falló (${codigo})`)
}

function falloBd(operacion: string, error: ErrorBd): ResultadoFallo {
  const { mensaje, campo, esperado } = interpretarErrorGanancias(error)
  if (!esperado) informar(operacion, error)
  return campo ? fallo(mensaje, { [campo]: [mensaje] }) : fallo(mensaje)
}

function falloInesperado(operacion: string, error: unknown): ResultadoFallo {
  informar(operacion, error)
  return fallo(MENSAJE_INESPERADO)
}

/** Carpeta de la factura del medio: `soportes/liquidacion/{id}/factura/`. */
function carpetaFactura(liquidacionId: string) {
  return carpetaSoporte("liquidacion", liquidacionId, "factura")
}

// ── Pagos ────────────────────────────────────────────────────────────────────

/** «Ver pagos anteriores»: la página que sigue a la última liquidación mostrada. */
export async function cargarPagos(
  entrada: EntradaPaginaPagos
): Promise<ResultadoAccion<PaginaLiquidaciones>> {
  await requerirPermiso(PERMISO)
  const validacion = esquemaPaginaPagos.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  try {
    return exito(await misLiquidaciones(validacion.data.antesId))
  } catch (error) {
    return falloInesperado("cargarPagos", error)
  }
}

/**
 * URL firmada (como usuario, para descargar con un nombre legible) del
 * soporte de pago, el documento soporte o la factura de una liquidación
 * propia. La ruta sale de la fila que devuelve la RPC con la sesión. La
 * anulada (la RPC la devuelve pedida por `id`) ya no tiene archivos.
 */
export async function firmarArchivoLiquidacion(
  entrada: EntradaFirmarArchivo
): Promise<ResultadoAccion<UrlFirmada>> {
  await requerirPermiso(PERMISO)
  const validacion = esquemaFirmarArchivo.safeParse(entrada)
  if (!validacion.success) return fallo(MENSAJES_GANANCIAS.noEncontrada)
  const { liquidacionId, archivo } = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase.rpc(
      "mis_liquidaciones_medio",
      argumentosRpc<"mis_liquidaciones_medio">({
        p_limite: 1,
        p_antes_id: null,
        p_id: liquidacionId,
      })
    )
    if (error) return falloBd("leer la liquidación del archivo", error)
    const fila = data.at(0)
    if (!fila) return fallo(MENSAJES_GANANCIAS.noEncontrada)
    if (fila.estado === "ANULADA") return fallo(MENSAJES_GANANCIAS.anulada)
    const ruta = rutaArchivo(fila, archivo)
    if (!ruta) return fallo(MENSAJES_GANANCIAS.sinArchivo)
    return await firmarDescarga({
      bucket: "soportes",
      ruta,
      firmante: { como: "usuario", cliente: supabase },
      descarga: nombreArchivoLiquidacion(archivo, aLiquidacion(fila), ruta),
    })
  } catch (error) {
    return falloInesperado("firmarArchivoLiquidacion", error)
  }
}

// ── Factura del medio (D83) ──────────────────────────────────────────────────

/**
 * Firma la subida directa del PDF de la factura a
 * `soportes/liquidacion/{id}/factura/{uuid}.pdf`. Con la sesión: la política
 * de Storage exige que la liquidación sea suya, que no lleve documento
 * soporte y que no se haya pagado.
 */
export async function prepararFacturaMedio(
  entrada: EntradaPrepararFactura
): Promise<ResultadoAccion<SubidaPreparada>> {
  const usuario = await requerirPermiso(PERMISO)
  const validacion = esquemaPrepararFactura.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  if (!usuario.medioId) return fallo(MENSAJES_GANANCIAS.sinMedio)
  const { liquidacionId, descripcion } = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const destino = nuevaRuta(carpetaFactura(liquidacionId), descripcion.tipo)
    return await prepararSubidaFirmada({ cliente: supabase, ...destino })
  } catch (error) {
    return falloInesperado("prepararFacturaMedio", error)
  }
}

/**
 * Confirma que el PDF quedó en la carpeta de la factura con el peso y el tipo
 * declarados (idempotente por ruta). No registra nada: eso lo hace
 * `registrarFacturaMedio`, que lo vuelve a comprobar.
 */
export async function confirmarFacturaMedio(
  entrada: EntradaConfirmarFactura
): Promise<ResultadoAccion> {
  await requerirPermiso(PERMISO)
  const validacion = esquemaConfirmarFactura.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { liquidacionId, archivo } = validacion.data
  if (!archivoPerteneceA(archivo, carpetaFactura(liquidacionId))) {
    return fallo(MENSAJES_GANANCIAS.archivoAjeno)
  }

  try {
    const supabase = await crearClienteServidor()
    const objeto = await confirmarObjeto({
      cliente: supabase,
      bucket: archivo.bucket,
      ruta: archivo.ruta,
      esperado: { tamano: archivo.tamano, tipo: archivo.tipo },
    })
    return objeto.ok ? exito() : fallo(objeto.error)
  } catch (error) {
    return falloInesperado("confirmarFacturaMedio", error)
  }
}

/**
 * Registra el número y el PDF de la factura del medio para su liquidación en
 * revisión o aprobada (se puede reemplazar mientras no se pague). Finanzas la
 * ve en la ficha de la liquidación y ya puede pagarla.
 */
export async function registrarFacturaMedio(
  entrada: EntradaRegistrarFactura
): Promise<ResultadoAccion> {
  const usuario = await requerirPermiso(PERMISO)
  const validacion = esquemaRegistrarFactura.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  if (!usuario.medioId) return fallo(MENSAJES_GANANCIAS.sinMedio)
  const { liquidacionId, numero, archivoPath } = validacion.data
  if (!perteneceA(archivoPath, carpetaFactura(liquidacionId))) {
    return fallo(MENSAJES_GANANCIAS.archivoAjeno, {
      archivo: [MENSAJES_GANANCIAS.archivoAjeno],
    })
  }

  try {
    const contexto = await contextoDelActor(usuario)
    const { error } = await contexto.admin.rpc("registrar_factura_medio_srv", {
      p_liquidacion_id: liquidacionId,
      p_numero: numero,
      p_archivo_path: archivoPath,
      p_actor_id: contexto.actorId,
      p_session_id: contexto.sessionId,
    })
    if (error) return falloBd("registrar la factura del medio", error)
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("registrarFacturaMedio", error)
  }
}
