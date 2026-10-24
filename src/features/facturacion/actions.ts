"use server"

/**
 * Server Actions de la facturación al anunciante y la cartera (LIQ-008).
 * Patrón:
 *
 * 1. DAL (`requerirPermiso`) antes que nada: `facturas.gestionar` para los
 *    borradores, la factura expedida y las notas crédito; `pagos.registrar`
 *    para los pagos; `facturas.ver` para descargar.
 * 2. zod: el MISMO esquema que el formulario.
 * 3. Escrituras por las RPC `*_srv` con actor y sesión (`contextoDelActor`):
 *    `generar_factura_srv`, `registrar_factura_expedida_srv`,
 *    `registrar_pago_anunciante_srv`, `registrar_nota_credito_srv`, y
 *    `transicionar` para anular un borrador. La BD revalida permiso, estado,
 *    resolución, CUFE/CUDE, montos, fechas y que el archivo esté cargado.
 * 4. Los PDF y soportes se suben directo a Storage con la sesión
 *    (`prepararArchivoFactura`: la política INSERT decide) y se comprueban como
 *    servicio (el equipo no lee el bucket `soportes`); las descargas se firman
 *    como servicio con la ruta de la fila leída con la sesión y dejan
 *    `URL_FIRMADA` en la bitácora.
 * 5. `revalidatePath` de la ficha, el listado y la cartera.
 *
 * Los errores esperados se devuelven como `ResultadoAccion`; nunca se lanzan.
 * Nada de los datos del anunciante sale en logs; la dirección revelada solo
 * viaja dentro del archivo de carga.
 */
import "server-only"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import {
  nombreDepartamento,
  nombreMunicipio,
} from "@/features/operacion/queries/comun"
import { contextoDelActor } from "@/lib/auth/contexto-actor"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"
import type { ClavePermiso } from "@/lib/auth/permisos"
import { registrarEvento } from "@/lib/auth/registro"
import type { SubidaPreparada, UrlFirmada } from "@/lib/archivos/tipos"
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
  perteneceA,
} from "@/lib/storage/rutas"
import {
  confirmarObjeto,
  MENSAJES_SUBIDA,
  prepararSubidaFirmada,
} from "@/lib/storage/subidas"
import { argumentosRpc } from "@/lib/supabase/rpc"
import { crearClienteServidor } from "@/lib/supabase/server"
import type { Json } from "@/types/database.types"

import {
  archivoCargaCsv,
  archivoCargaJson,
  type DatosArchivoCarga,
  itemsDeCarga,
  nombreArchivoCarga,
} from "./archivo-carga"
import { interpretarErrorFacturacion, MENSAJES_FACTURACION } from "./errores"
import { agruparPendientes, sigueFacturable } from "./presentacion"
import { lineasFactura, obtenerFactura, pendientesFacturacion } from "./queries"
import { RUTA_CARTERA, RUTA_FACTURAS, rutaFactura } from "./rutas"
import {
  type DestinoArchivo,
  type EntradaAnularBorrador,
  type EntradaConfirmarArchivo,
  type EntradaConsultaPendientes,
  type EntradaExportacionFacturas,
  type EntradaFactura,
  type EntradaFacturaExpedida,
  type EntradaFirmarArchivo,
  type EntradaGenerarFactura,
  type EntradaPrepararArchivo,
  type EntradaRegistrarNotaCredito,
  type EntradaRegistrarPago,
  esquemaAnularBorrador,
  esquemaConfirmarArchivo,
  esquemaConsultaPendientes,
  esquemaExportacionFacturas,
  esquemaFactura,
  esquemaFacturaExpedida,
  esquemaFirmarArchivo,
  esquemaGenerarFactura,
  esquemaPrepararArchivo,
  esquemaRegistrarNotaCredito,
  esquemaRegistrarPago,
} from "./schemas"
import type { EstadoFactura, GrupoPorFacturar } from "./tipos"

// ── Utilidades internas (no exportadas: no son acciones) ─────────────────────

/** Quién carga cada archivo (la política de Storage exige lo mismo). */
const PERMISO_ARCHIVO: Readonly<Record<DestinoArchivo, ClavePermiso>> = {
  factura: "facturas.gestionar",
  pago: "pagos.registrar",
}

/** Log de servidor sin datos personales: operación y código. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[facturacion] ${operacion} falló (${codigo})`)
}

function falloBd(operacion: string, error: ErrorBd): ResultadoFallo {
  const { mensaje, campo, esperado } = interpretarErrorFacturacion(error)
  if (!esperado) informar(operacion, error)
  return campo ? fallo(mensaje, { [campo]: [mensaje] }) : fallo(mensaje)
}

function falloInesperado(operacion: string, error: unknown): ResultadoFallo {
  informar(operacion, error)
  return fallo(MENSAJE_INESPERADO)
}

/** La ficha, el listado y la cartera muestran el cambio. */
function revalidar(facturaId: string | null): void {
  if (facturaId) revalidatePath(rutaFactura(facturaId))
  revalidatePath(RUTA_FACTURAS)
  revalidatePath(RUTA_CARTERA)
}

/** Estado y saldo vigentes de la factura (con la sesión), tras registrar algo. */
async function estadoVigente(
  facturaId: string
): Promise<{ estado: EstadoFactura; saldo: number } | null> {
  const supabase = await crearClienteServidor()
  const { data } = await supabase
    .from("facturas")
    .select("estado, saldo")
    .eq("id", facturaId)
    .maybeSingle()
  return data ? { estado: data.estado, saldo: data.saldo ?? 0 } : null
}

const falloArchivoAjeno = () =>
  fallo(MENSAJES_FACTURACION.archivoAjeno, {
    archivo: [MENSAJES_FACTURACION.archivoAjeno],
  })

// ── Lo por facturar y el borrador ───────────────────────────────────────────

/**
 * Lo verificado sin facturar hasta la fecha (o hasta hoy), agrupado por
 * anunciante con sus campañas: lo que ofrece «Nueva factura».
 */
export async function consultarPendientesFacturacion(
  entrada: EntradaConsultaPendientes
): Promise<ResultadoAccion<GrupoPorFacturar[]>> {
  await requerirPermiso("facturas.gestionar")
  const validacion = esquemaConsultaPendientes.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  try {
    const filas = await pendientesFacturacion(validacion.data.hasta)
    return exito(agruparPendientes(filas))
  } catch (error) {
    informar("consultarPendientesFacturacion", error)
    return fallo(
      "No pudimos leer lo pendiente por facturar. Intenta de nuevo en unos segundos."
    )
  }
}

/**
 * Genera el borrador por campaña o consolidado con lo verificado sin
 * facturar hasta la fecha de corte (arrastra lo anterior). Los importes salen
 * del esquema vigente (`facturacion.esquema`).
 */
export async function generarFactura(
  entrada: EntradaGenerarFactura
): Promise<ResultadoAccion<{ facturaId: string }>> {
  const actor = await requerirPermiso("facturas.gestionar")
  const validacion = esquemaGenerarFactura.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { anuncianteId, campanaId, desde, hasta } = validacion.data

  try {
    const contexto = await contextoDelActor(actor)
    const { data, error } = await contexto.admin.rpc(
      "generar_factura_srv",
      argumentosRpc<"generar_factura_srv">({
        p_anunciante_id: anuncianteId,
        p_campana_id: campanaId,
        p_periodo_desde: desde,
        p_periodo_hasta: hasta,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
      })
    )
    if (error) return falloBd("generarFactura", error)
    revalidar(null)
    return exito({ facturaId: data })
  } catch (error) {
    return falloInesperado("generarFactura", error)
  }
}

/**
 * Anula un borrador con su motivo (queda en la bitácora): sus asignaciones
 * quedan libres para otra factura. Una expedida no se anula así: se corrige
 * con una nota crédito.
 */
export async function anularBorradorFactura(
  entrada: EntradaAnularBorrador
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("facturas.gestionar")
  const validacion = esquemaAnularBorrador.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { facturaId, motivo } = validacion.data

  try {
    const vigente = await estadoVigente(facturaId)
    if (!vigente) return fallo(MENSAJES_FACTURACION.noEncontrada)
    if (vigente.estado !== "BORRADOR") {
      revalidar(facturaId)
      return fallo(MENSAJES_FACTURACION.soloBorrador)
    }
    const contexto = await contextoDelActor(actor)
    const { error } = await transicionar(contexto, {
      entidad: "facturas",
      id: facturaId,
      hacia: "ANULADA",
      motivo,
    })
    if (error) return falloBd("anularBorradorFactura", error)
    revalidar(facturaId)
    return exito()
  } catch (error) {
    return falloInesperado("anularBorradorFactura", error)
  }
}

export interface ArchivoCarga {
  nombreBase: string
  json: string
  csv: string
  /** Sin `datos_sensibles.ver` el archivo va sin la dirección del anunciante. */
  sinDireccion: boolean
  /** Las bases suman el subtotal del borrador. */
  cuadra: boolean
}

function direccionRevelada(datos: Json | null): string | null {
  if (typeof datos !== "object" || datos === null || Array.isArray(datos)) {
    return null
  }
  const direccion = datos.direccion
  return typeof direccion === "string" && direccion.trim()
    ? direccion.trim()
    : null
}

/**
 * Archivo de carga del borrador para el software de facturación (JSON
 * `AMO-FV-1` y CSV): adquirente, ítems y totales. La dirección se revela con
 * `revelar_privado_srv` (queda `REVELAR_DATO`) solo con `datos_sensibles.ver`,
 * y la descarga deja `EXPORTAR` en la bitácora antes de entregarse.
 */
export async function generarArchivoCarga(
  entrada: EntradaFactura
): Promise<ResultadoAccion<ArchivoCarga>> {
  const actor = await requerirPermiso("facturas.gestionar")
  const validacion = esquemaFactura.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { facturaId } = validacion.data

  try {
    const [factura, lineas] = await Promise.all([
      obtenerFactura(facturaId),
      lineasFactura(facturaId),
    ])
    if (!factura?.anunciante) return fallo(MENSAJES_FACTURACION.noEncontrada)
    if (factura.estado !== "BORRADOR") {
      revalidar(facturaId)
      return fallo(MENSAJES_FACTURACION.yaNoEsBorrador)
    }
    if (lineas.length === 0) return fallo(MENSAJES_FACTURACION.sinLineas)
    if (lineas.some((linea) => !sigueFacturable(linea.estado))) {
      return fallo(MENSAJES_FACTURACION.borradorConLineasCaidas)
    }

    const contexto = await contextoDelActor(actor)
    const conDireccion = tieneAlgunPermiso(actor, ["datos_sensibles.ver"])
    let direccion: string | null = null
    if (conDireccion) {
      const { data, error } = await contexto.admin.rpc(
        "revelar_privado_srv",
        argumentosRpc<"revelar_privado_srv">({
          p_tabla: "anunciantes_privado",
          p_id: factura.anuncianteId,
          p_actor_id: contexto.actorId,
          p_session_id: contexto.sessionId,
          p_campos: ["direccion"],
        })
      )
      if (error) return falloBd("generarArchivoCarga", error)
      direccion = direccionRevelada(data)
    }

    const registrado = await registrarEvento({
      actorId: contexto.actorId,
      admin: contexto.admin,
      accion: "EXPORTAR",
      entidad: "facturas",
      entidadId: facturaId,
      metadatos: {
        archivo: "carga_factura",
        formato: "AMO-FV-1",
        con_direccion: conDireccion,
        items: lineas.length,
      },
    })
    if (!registrado) return fallo(MENSAJES_FACTURACION.sinRegistroExportacion)

    const { anunciante } = factura
    const datos: DatosArchivoCarga = {
      factura: {
        id: factura.id,
        esquema: factura.esquema,
        porcentajeIva: factura.porcentajeIva,
        periodoDesde: factura.periodoDesde,
        periodoHasta: factura.periodoHasta,
        campana: factura.campana?.nombre ?? null,
        subtotal: factura.subtotal,
        iva: factura.iva,
        valorTerceros: factura.valorTerceros,
        total: factura.total,
      },
      adquirente: {
        razonSocial: anunciante.razonSocial,
        nombreComercial: anunciante.nombreComercial,
        nit: anunciante.nit,
        digitoVerificacion: anunciante.digitoVerificacion,
        identificacionExtranjera: anunciante.identificacionExtranjera,
        paisIso2: anunciante.paisIso2,
        municipioCodigo: anunciante.municipioCodigo,
        municipio: nombreMunicipio(anunciante.municipioCodigo),
        departamento: nombreDepartamento(
          anunciante.municipioCodigo?.slice(0, 2) ?? null
        ),
        direccion,
        correoFacturacion: anunciante.facturacion.email,
        regimen: anunciante.facturacion.regimen,
        datosFacturacion: anunciante.datosFacturacion,
      },
      lineas,
      generadoAt: new Date().toISOString(),
    }
    return exito({
      nombreBase: nombreArchivoCarga(datos),
      json: archivoCargaJson(datos),
      csv: archivoCargaCsv(datos),
      sinDireccion: !conDireccion,
      cuadra: itemsDeCarga(datos).cuadra,
    })
  } catch (error) {
    return falloInesperado("generarArchivoCarga", error)
  }
}

// ── Archivos (subida directa a Storage) ──────────────────────────────────────

/**
 * Destino firmado para subir el PDF de la factura o de una nota crédito
 * (`soportes/factura/{id}/`) o el soporte de un pago (`soportes/pago/{id}/`).
 * Se firma con la sesión: Storage evalúa ya su política INSERT.
 */
export async function prepararArchivoFactura(
  entrada: EntradaPrepararArchivo
): Promise<ResultadoAccion<SubidaPreparada>> {
  const actor = await requerirPermiso(["facturas.gestionar", "pagos.registrar"])
  const validacion = esquemaPrepararArchivo.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { facturaId, destino, descripcion } = validacion.data
  if (!tieneAlgunPermiso(actor, [PERMISO_ARCHIVO[destino]])) {
    return fallo(MENSAJES_FACTURACION.sinPermisoArchivo)
  }

  try {
    const ruta = nuevaRuta(carpetaSoporte(destino, facturaId), descripcion.tipo)
    return await prepararSubidaFirmada({
      cliente: await crearClienteServidor(),
      ...ruta,
    })
  } catch (error) {
    return falloInesperado("prepararArchivoFactura", error)
  }
}

/**
 * Comprueba que el archivo quedó en la carpeta de la factura con el peso y el
 * tipo declarados (idempotente por ruta). No guarda nada: lo registra la
 * acción del formulario, que vuelve a comprobar la carpeta, y la BD exige que
 * el objeto exista.
 */
export async function confirmarArchivoFactura(
  entrada: EntradaConfirmarArchivo
): Promise<ResultadoAccion<{ ruta: string }>> {
  const actor = await requerirPermiso(["facturas.gestionar", "pagos.registrar"])
  const validacion = esquemaConfirmarArchivo.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { facturaId, destino, archivo } = validacion.data
  if (!tieneAlgunPermiso(actor, [PERMISO_ARCHIVO[destino]])) {
    return fallo(MENSAJES_FACTURACION.sinPermisoArchivo)
  }
  if (!archivoPerteneceA(archivo, carpetaSoporte(destino, facturaId))) {
    return fallo(MENSAJES_SUBIDA.noCoincide)
  }

  try {
    const contexto = await contextoDelActor(actor)
    const objeto = await confirmarObjeto({
      cliente: contexto.admin,
      bucket: archivo.bucket,
      ruta: archivo.ruta,
      esperado: { tamano: archivo.tamano, tipo: archivo.tipo },
    })
    return objeto.ok ? exito({ ruta: archivo.ruta }) : fallo(objeto.error)
  } catch (error) {
    return falloInesperado("confirmarArchivoFactura", error)
  }
}

// ── Factura expedida ─────────────────────────────────────────────────────────

const esquemaRespuestaExpedida = z.object({
  numero: z.string(),
  fecha_vencimiento: z.string().nullish(),
})

/**
 * Registra la factura que se expidió en el software de AMO: número dentro de
 * la resolución de facturación vigente, CUFE, fechas, el total (igual al del
 * borrador) y el PDF ya cargado. La BD avisa al anunciante.
 */
export async function registrarFacturaExpedida(
  entrada: EntradaFacturaExpedida
): Promise<
  ResultadoAccion<{ numero: string; fechaVencimiento: string | null }>
> {
  const actor = await requerirPermiso("facturas.gestionar")
  const validacion = esquemaFacturaExpedida.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const datos = validacion.data
  if (
    !perteneceA(datos.archivoPath, carpetaSoporte("factura", datos.facturaId))
  ) {
    return falloArchivoAjeno()
  }

  try {
    const contexto = await contextoDelActor(actor)
    const { data, error } = await contexto.admin.rpc(
      "registrar_factura_expedida_srv",
      argumentosRpc<"registrar_factura_expedida_srv">({
        p_factura_id: datos.facturaId,
        p_prefijo: datos.prefijo,
        p_consecutivo: datos.consecutivo,
        p_cufe: datos.cufe,
        p_fecha_emision: datos.fechaEmision,
        p_fecha_vencimiento: datos.fechaVencimiento,
        p_total: datos.total,
        p_archivo_path: datos.archivoPath,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
      })
    )
    if (error) {
      if (error.message?.startsWith("AMO_TRANSICION_INVALIDA")) {
        revalidar(datos.facturaId)
      }
      return falloBd("registrarFacturaExpedida", error)
    }
    revalidar(datos.facturaId)
    const respuesta = esquemaRespuestaExpedida.safeParse(data)
    return exito({
      numero: respuesta.success
        ? respuesta.data.numero
        : `${datos.prefijo}${datos.consecutivo}`,
      fechaVencimiento: respuesta.success
        ? (respuesta.data.fecha_vencimiento ?? null)
        : datos.fechaVencimiento,
    })
  } catch (error) {
    return falloInesperado("registrarFacturaExpedida", error)
  }
}

// ── Pagos y notas crédito ────────────────────────────────────────────────────

export interface FacturaTrasCambio {
  estado: EstadoFactura | null
  saldo: number | null
}

/**
 * Pago parcial o total con su soporte y las retenciones que practicó el
 * anunciante (cuentan para el saldo). La BD pasa la factura a PAGADA_PARCIAL
 * o PAGADA.
 */
export async function registrarPagoFactura(
  entrada: EntradaRegistrarPago
): Promise<ResultadoAccion<FacturaTrasCambio>> {
  const actor = await requerirPermiso("pagos.registrar")
  const validacion = esquemaRegistrarPago.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const datos = validacion.data
  if (!perteneceA(datos.soportePath, carpetaSoporte("pago", datos.facturaId))) {
    return falloArchivoAjeno()
  }

  try {
    const contexto = await contextoDelActor(actor)
    const { error } = await contexto.admin.rpc(
      "registrar_pago_anunciante_srv",
      argumentosRpc<"registrar_pago_anunciante_srv">({
        p_factura_id: datos.facturaId,
        p_fecha: datos.fecha,
        p_monto: datos.monto,
        p_medio_pago: datos.medioPago,
        p_referencia: datos.referencia,
        p_soporte_path: datos.soportePath,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
        p_retenciones: datos.retenciones,
      })
    )
    if (error) {
      if (error.message?.startsWith("AMO_TRANSICION_INVALIDA")) {
        revalidar(datos.facturaId)
      }
      return falloBd("registrarPagoFactura", error)
    }
    revalidar(datos.facturaId)
    const vigente = await estadoVigente(datos.facturaId)
    return exito({
      estado: vigente?.estado ?? null,
      saldo: vigente?.saldo ?? null,
    })
  } catch (error) {
    return falloInesperado("registrarPagoFactura", error)
  }
}

/**
 * Nota crédito emitida en el software de AMO (D38 del RF): rebaja el saldo y
 * libera las asignaciones indicadas, o anula la factura si cubre todo su saldo
 * y no tiene pagos. La BD avisa al anunciante.
 */
export async function registrarNotaCredito(
  entrada: EntradaRegistrarNotaCredito
): Promise<ResultadoAccion<FacturaTrasCambio>> {
  const actor = await requerirPermiso("facturas.gestionar")
  const validacion = esquemaRegistrarNotaCredito.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const datos = validacion.data
  if (
    !perteneceA(datos.archivoPath, carpetaSoporte("factura", datos.facturaId))
  ) {
    return falloArchivoAjeno()
  }

  try {
    const contexto = await contextoDelActor(actor)
    const { error } = await contexto.admin.rpc(
      "registrar_nota_credito_srv",
      argumentosRpc<"registrar_nota_credito_srv">({
        p_factura_id: datos.facturaId,
        p_numero: datos.numero,
        p_cude: datos.cude,
        p_fecha_emision: datos.fechaEmision,
        p_valor: datos.valor,
        p_motivo: datos.motivo,
        p_archivo_path: datos.archivoPath,
        p_asignacion_ids: datos.asignacionIds,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
      })
    )
    if (error) {
      if (error.message?.startsWith("AMO_TRANSICION_INVALIDA")) {
        revalidar(datos.facturaId)
      }
      return falloBd("registrarNotaCredito", error)
    }
    revalidar(datos.facturaId)
    const vigente = await estadoVigente(datos.facturaId)
    return exito({
      estado: vigente?.estado ?? null,
      saldo: vigente?.saldo ?? null,
    })
  } catch (error) {
    return falloInesperado("registrarNotaCredito", error)
  }
}

// ── Descargas ────────────────────────────────────────────────────────────────

function extension(ruta: string): string {
  const punto = ruta.lastIndexOf(".")
  return punto > ruta.lastIndexOf("/") ? ruta.slice(punto) : ""
}

/**
 * URL de corta duración del PDF de la factura, de una nota crédito o del
 * soporte de un pago. La ruta sale de la fila leída con la sesión (RLS de
 * `facturas.ver`) y se firma como servicio: el equipo no lee el bucket
 * `soportes` y la firma deja `URL_FIRMADA` en la bitácora.
 */
export async function firmarArchivoFactura(
  entrada: EntradaFirmarArchivo
): Promise<ResultadoAccion<UrlFirmada>> {
  const actor = await requerirPermiso("facturas.ver")
  const validacion = esquemaFirmarArchivo.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const pedido = validacion.data

  try {
    const supabase = await crearClienteServidor()
    let ruta: string | null = null
    let nombre = "Archivo"
    let entidad = "facturas"
    let entidadId = pedido.facturaId
    if (pedido.tipo === "factura") {
      const { data, error } = await supabase
        .from("facturas")
        .select("archivo_path, numero")
        .eq("id", pedido.facturaId)
        .maybeSingle()
      if (error) return falloBd("firmarArchivoFactura", error)
      ruta = data?.archivo_path ?? null
      nombre = `Factura ${data?.numero ?? "AMO"}`
    } else if (pedido.tipo === "pago") {
      const { data, error } = await supabase
        .from("pagos_anunciante")
        .select("soporte_path, fecha_pago")
        .eq("id", pedido.pagoId)
        .eq("factura_id", pedido.facturaId)
        .maybeSingle()
      if (error) return falloBd("firmarArchivoFactura", error)
      ruta = data?.soporte_path ?? null
      nombre = `Soporte de pago ${data?.fecha_pago ?? ""}`.trim()
      entidad = "pagos_anunciante"
      entidadId = pedido.pagoId
    } else {
      const { data, error } = await supabase
        .from("notas_credito")
        .select("archivo_path, numero")
        .eq("id", pedido.notaId)
        .eq("factura_id", pedido.facturaId)
        .maybeSingle()
      if (error) return falloBd("firmarArchivoFactura", error)
      ruta = data?.archivo_path ?? null
      nombre = `Nota credito ${data?.numero ?? ""}`.trim()
      entidad = "notas_credito"
      entidadId = pedido.notaId
    }
    if (!ruta) return fallo(MENSAJES_FACTURACION.sinArchivo)

    const contexto = await contextoDelActor(actor)
    return await firmarDescarga({
      bucket: "soportes",
      ruta,
      firmante: { como: "servicio", contexto, entidad, entidadId },
      descarga: pedido.descargar ? `${nombre}${extension(ruta)}` : undefined,
    })
  } catch (error) {
    return falloInesperado("firmarArchivoFactura", error)
  }
}

// ── Exportación del listado ──────────────────────────────────────────────────

/** Deja `EXPORTAR` en la bitácora al descargar el listado (CSV o Excel). */
export async function registrarExportacionFacturas(
  entrada: EntradaExportacionFacturas
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("facturas.ver")
  const validacion = esquemaExportacionFacturas.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const contexto = await contextoDelActor(actor)
    const registrado = await registrarEvento({
      actorId: contexto.actorId,
      admin: contexto.admin,
      accion: "EXPORTAR",
      entidad: "facturas",
      entidadId: null,
      metadatos: validacion.data,
    })
    return registrado
      ? exito()
      : fallo("No se pudo registrar la exportación en la bitácora.")
  } catch (error) {
    return falloInesperado("registrarExportacionFacturas", error)
  }
}
