import "server-only"

import { cache } from "react"

import { filasKpi, indicePorKpi, valorKpi } from "@/features/dashboard/kpi"
import { categoriasEdicion } from "@/features/gestion-medios/queries"
import { clienteSolicitud, fallar } from "@/features/operacion/queries/comun"
import { serializarFecha } from "@/lib/fechas"
import { listarPaises, obtenerPais } from "@/lib/geo/catalogo"
import { crearClienteAdmin } from "@/lib/supabase/admin"

import { ordenarAudiencia, sumaPorcentajes } from "./audiencia"
import { estadoCuentasAlta } from "./resumen"
import type { DocumentoRegistrado } from "./requisitos"
import type {
  ConsumoTope,
  CuentaSocialAlta,
  FilaAudienciaPerfil,
  MedioPropio,
  NivelVerificacion,
  OpcionPais,
  PagoEditable,
  PagoResumen,
  PerfilEditable,
  ResumenMiMedio,
} from "./tipos"

/**
 * Lecturas de «Mi medio». Todo con el cliente del USUARIO (JWT + RLS
 * «propio»): la BD solo le deja ver su medio. La única excepción es saber si
 * hay número de documento y cuenta CIFRADOS (columnas sin GRANT para
 * `authenticated`): se pregunta como servicio por su existencia, sin leer los
 * valores, para el medio que ya autorizó el DAL.
 */

const n = (valor: number | string | null | undefined): number | null => {
  if (valor === null || valor === undefined) return null
  const numero = typeof valor === "number" ? valor : Number(valor)
  return Number.isFinite(numero) ? numero : null
}

/** Hoy en Bogotá ('YYYY-MM-DD'): vigencias de documentos. */
export function hoyBogota(ahora: Date = new Date()): string {
  return serializarFecha(ahora)
}

/** Ficha propia; `null` si la cuenta no ve su medio (dado de baja o sin vínculo). */
export const medioPropio = cache(
  async (medioId: string): Promise<MedioPropio | null> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase
      .from("medios")
      .select(
        `id, nombre, tipo, municipio_codigo, descripcion_audiencia, estado,
         nivel_verificacion, enviado_verificacion_at, motivo_estado,
         verificado_at, updated_at`
      )
      .eq("id", medioId)
      .is("deleted_at", null)
      .maybeSingle()
    if (error) fallar("leer tu medio", error)
    if (!data) return null
    return {
      id: data.id,
      nombre: data.nombre,
      tipo: data.tipo,
      municipioCodigo: data.municipio_codigo,
      descripcionAudiencia: data.descripcion_audiencia,
      estado: data.estado,
      nivel: data.nivel_verificacion,
      enviadoVerificacionAt: data.enviado_verificacion_at,
      motivoEstado: data.motivo_estado,
      verificadoAt: data.verificado_at,
      actualizadoAt: data.updated_at,
    }
  }
)

export const nivelesVerificacion = cache(
  async (): Promise<NivelVerificacion[]> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase
      .from("niveles_verificacion")
      .select(
        "nivel, nombre, requisitos, documentos_requeridos, tope_anual, porcentaje_alerta, porcentaje_bloqueo"
      )
      .order("nivel")
    if (error) fallar("leer los niveles de verificación", error)
    return data.map((fila) => ({
      nivel: fila.nivel,
      nombre: fila.nombre,
      requisitos: fila.requisitos,
      documentosRequeridos: fila.documentos_requeridos,
      topeAnual: n(fila.tope_anual),
      porcentajeAlerta: n(fila.porcentaje_alerta) ?? 0.8,
      porcentajeBloqueo: n(fila.porcentaje_bloqueo) ?? 0.95,
    }))
  }
)

export const documentosDelMedio = cache(
  async (medioId: string): Promise<DocumentoRegistrado[]> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase
      .from("documentos_medio")
      .select(
        "tipo, estado_validacion, fecha_vencimiento, metodo, observaciones, created_at"
      )
      .eq("medio_id", medioId)
      .order("created_at", { ascending: false })
      .limit(200)
    if (error) fallar("leer tus documentos", error)
    return data.map((fila) => ({
      tipo: fila.tipo,
      estado: fila.estado_validacion,
      fechaVencimiento: fila.fecha_vencimiento,
      metodo: fila.metodo === "VIDEOLLAMADA" ? "VIDEOLLAMADA" : "ARCHIVO",
      observaciones: fila.observaciones,
      creadoAt: fila.created_at,
    }))
  }
)

/** ¿Hay número de documento y cuenta cifrados? Sin leer los valores. */
const cifradosRegistrados = cache(
  async (medioId: string): Promise<{ documento: boolean; cuenta: boolean }> => {
    const admin = await crearClienteAdmin()
    const existe = (
      columna: "numero_documento_cifrado" | "datos_pago_cifrados"
    ) =>
      admin
        .from("medios_privado")
        .select("medio_id", { count: "exact", head: true })
        .eq("medio_id", medioId)
        .not(columna, "is", null)
    const [documento, cuenta] = await Promise.all([
      existe("numero_documento_cifrado"),
      existe("datos_pago_cifrados"),
    ])
    if (documento.error) fallar("revisar tu documento", documento.error)
    if (cuenta.error) fallar("revisar tu cuenta de pago", cuenta.error)
    return {
      documento: (documento.count ?? 0) > 0,
      cuenta: (cuenta.count ?? 0) > 0,
    }
  }
)

export const pagoResumen = cache(
  async (medioId: string): Promise<PagoResumen> => {
    const supabase = await clienteSolicitud()
    const [{ data, error }, cifrados] = await Promise.all([
      supabase
        .from("medios_privado")
        .select(
          `titular_nombre, tipo_documento, numero_documento_resumen, metodo_pago,
           datos_pago_resumen, es_declarante, obligado_facturar, responsable_iva,
           updated_at`
        )
        .eq("medio_id", medioId)
        .maybeSingle(),
      cifradosRegistrados(medioId),
    ])
    if (error) fallar("leer tus datos de pago", error)
    return {
      titularNombre: data?.titular_nombre ?? null,
      tipoDocumento: data?.tipo_documento ?? null,
      numeroDocumentoResumen: cifrados.documento
        ? (data?.numero_documento_resumen ?? null)
        : null,
      // El método decide qué certificado se exige (como en la BD), aunque la
      // cuenta cifrada falte (datos demo cargados sin la llave).
      metodoPago: data?.metodo_pago ?? null,
      cuentaResumen: cifrados.cuenta
        ? (data?.datos_pago_resumen ?? null)
        : null,
      esDeclarante: data?.es_declarante ?? false,
      obligadoFacturar: data?.obligado_facturar ?? false,
      responsableIva: data?.responsable_iva ?? false,
      documentoRegistrado: cifrados.documento,
      cuentaRegistrada: cifrados.cuenta,
      actualizadoAt: data?.updated_at ?? null,
    }
  }
)

async function cuentasAlta(medioId: string): Promise<CuentaSocialAlta[]> {
  const supabase = await clienteSolicitud()
  const [cuentas, verificaciones] = await Promise.all([
    supabase
      .from("cuentas_sociales")
      .select("id, verificada")
      .eq("medio_id", medioId)
      .is("deleted_at", null),
    supabase
      .from("verificaciones_cuenta")
      .select(
        "cuenta_social_id, metodo, estado_validacion, captura_path, created_at"
      )
      .eq("medio_id", medioId)
      .order("created_at", { ascending: false })
      .limit(200),
  ])
  if (cuentas.error) fallar("leer tus cuentas sociales", cuentas.error)
  if (verificaciones.error) {
    fallar("leer la verificación de tus cuentas", verificaciones.error)
  }
  return estadoCuentasAlta(cuentas.data, verificaciones.data)
}

async function terminosPendientes(): Promise<number> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase.rpc("terminos_pendientes")
  if (error) fallar("revisar los términos pendientes", error)
  return data.length
}

async function conteos(
  medioId: string
): Promise<{ categorias: number; paisesAudiencia: number }> {
  const supabase = await clienteSolicitud()
  const [categorias, audiencia] = await Promise.all([
    supabase
      .from("medio_categorias")
      .select("categoria_id", { count: "exact", head: true })
      .eq("medio_id", medioId),
    supabase
      .from("medio_audiencia_paises")
      .select("pais_iso2", { count: "exact", head: true })
      .eq("medio_id", medioId),
  ])
  if (categorias.error) fallar("leer tus categorías", categorias.error)
  if (audiencia.error) fallar("leer tu audiencia", audiencia.error)
  return {
    categorias: categorias.count ?? 0,
    paisesAudiencia: audiencia.count ?? 0,
  }
}

/**
 * Lo que necesitan el resumen de «Mi medio» y el inicio del medio en alta
 * (todo en paralelo, una vez por solicitud). `null` sin medio visible.
 */
export const resumenMiMedio = cache(
  async (medioId: string): Promise<ResumenMiMedio | null> => {
    const [medio, niveles, documentos, pago, cuentas, terminos, totales] =
      await Promise.all([
        medioPropio(medioId),
        nivelesVerificacion(),
        documentosDelMedio(medioId),
        pagoResumen(medioId),
        cuentasAlta(medioId),
        terminosPendientes(),
        conteos(medioId),
      ])
    if (!medio) return null
    return {
      medio,
      niveles,
      documentos,
      pago,
      cuentas,
      terminosPendientes: terminos,
      categorias: totales.categorias,
      paisesAudiencia: totales.paisesAudiencia,
      hoy: hoyBogota(),
    }
  }
)

let paisesOrdenados: OpcionPais[] | undefined

/** Países para el origen de la audiencia: Colombia primero y luego por nombre. */
function opcionesPaises(): OpcionPais[] {
  if (paisesOrdenados) return paisesOrdenados
  const paises = listarPaises()
    .map((pais) => ({ codigo: pais.iso2, nombre: pais.nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
  const colombia = paises.findIndex((pais) => pais.codigo === "CO")
  if (colombia > 0) paises.unshift(...paises.splice(colombia, 1))
  paisesOrdenados = paises
  return paises
}

const nombrePais = (iso2: string) => obtenerPais(iso2)?.nombre ?? iso2

/** Valores y opciones del formulario del perfil. */
export async function perfilEditable(
  medioId: string
): Promise<PerfilEditable | null> {
  const supabase = await clienteSolicitud()
  const [medio, categorias, audiencia] = await Promise.all([
    medioPropio(medioId),
    categoriasEdicion(medioId),
    supabase
      .from("medio_audiencia_paises")
      .select("pais_iso2, porcentaje, fuente")
      .eq("medio_id", medioId),
  ])
  if (audiencia.error) fallar("leer tu audiencia", audiencia.error)
  if (!medio) return null
  const filas = audiencia.data.map((fila) => ({
    paisIso2: fila.pais_iso2,
    porcentaje: n(fila.porcentaje) ?? 0,
    nombre: nombrePais(fila.pais_iso2),
    declarada: fila.fuente === "DECLARADA",
  }))
  const declaradas = ordenarAudiencia(filas.filter((f) => f.declarada))
  const verificadas = ordenarAudiencia(filas.filter((f) => !f.declarada))
  const soloPorcentaje = ({
    paisIso2,
    porcentaje,
  }: FilaAudienciaPerfil): FilaAudienciaPerfil => ({ paisIso2, porcentaje })
  return {
    medio,
    categoriaIds: categorias.categoriaIds,
    categorias: categorias.opciones,
    audiencia: declaradas.map(soloPorcentaje),
    audienciaVerificada: verificadas.map(
      ({ paisIso2, porcentaje, nombre }) => ({
        paisIso2,
        porcentaje,
        nombre,
      })
    ),
    audienciaFija: {
      paises: verificadas.map((fila) => fila.paisIso2),
      porcentaje: sumaPorcentajes(verificadas.map((fila) => fila.porcentaje)),
    },
    paises: opcionesPaises(),
  }
}

/** Valores del formulario de pago y lo que ya está guardado. */
export async function pagoEditable(
  medioId: string
): Promise<PagoEditable | null> {
  const [medio, resumen] = await Promise.all([
    medioPropio(medioId),
    pagoResumen(medioId),
  ])
  if (!medio) return null
  return {
    resumen,
    guardado: {
      tipoDocumento: resumen.tipoDocumento,
      documentoRegistrado: resumen.documentoRegistrado,
      cuentaRegistrada: resumen.cuentaRegistrada,
    },
    verificado: medio.verificadoAt !== null,
  }
}

/**
 * Tope anual del nivel y lo consumido este año (`kpis_medio`, que exige
 * `inicio.medio`). `null` si no se pudo consultar: la página lo explica sin
 * caerse.
 */
export const consumoTope = cache(async (): Promise<ConsumoTope | null> => {
  const hoy = hoyBogota()
  const anio = Number(hoy.slice(0, 4))
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase.rpc("kpis_medio", {
    p_desde: `${anio}-01-01`,
    p_hasta: hoy,
  })
  if (error) {
    console.error(
      `[mi-medio] consumo del tope falló (${error.code ?? "sin código"})`
    )
    return null
  }
  const indice = indicePorKpi(filasKpi(data))
  return {
    tope: valorKpi(indice, "tope_anual"),
    consumido: valorKpi(indice, "consumido_tope") ?? 0,
    anio,
  }
})
