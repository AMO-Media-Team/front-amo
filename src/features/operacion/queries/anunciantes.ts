import "server-only"

import { cache } from "react"

import { serializarFecha } from "@/lib/fechas"
import type { Database, Json } from "@/types/database.types"

import { type FacturaParaCartera, resumirCartera } from "../calculos"
import { TIPOS_DOCUMENTO_ANUNCIANTE } from "../estados"
import type { EstadoTablaAnunciantes } from "../estado-tablas"
import {
  DIGITOS_MINIMOS_NIT,
  formatearNit,
  normalizarBusqueda,
  patronContiene,
} from "../formato"
import type {
  AnuncianteDetalle,
  AnuncianteFila,
  CarteraAnunciante,
  DesempenoCampana,
  DocumentoMetadatos,
  OpcionCatalogo,
  PaginaFilas,
  ResumenAnunciantes,
} from "../tipos"
import {
  catalogos,
  clienteSolicitud,
  configuracionOperacion,
  departamentoJuntoAMunicipio,
  enLotes,
  fallar,
  leerPagina,
  leerTodo,
  nombreMunicipio,
  nombrePais,
} from "./comun"

type FilaAnuncianteBd = Pick<
  Database["public"]["Tables"]["anunciantes"]["Row"],
  | "id"
  | "nombre_comercial"
  | "razon_social"
  | "nit"
  | "digito_verificacion"
  | "identificacion_extranjera"
  | "sector_id"
  | "pais_iso2"
  | "municipio_codigo"
  | "ciudad_extranjera"
  | "estado_verificacion"
  | "created_at"
>

const SELECCION_LISTADO = `
  id, nombre_comercial, razon_social, nit, digito_verificacion, identificacion_extranjera, sector_id,
  pais_iso2, municipio_codigo, ciudad_extranjera, estado_verificacion, created_at
` as const

const COLUMNAS_ORDEN: Readonly<
  Record<EstadoTablaAnunciantes["orden"]["campo"], string>
> = {
  nombre: "nombre_comercial",
  razon_social: "razon_social",
  estado: "estado_verificacion",
  pais: "pais_iso2",
  creado: "created_at",
}

/** Estados de factura con saldo por cobrar. */
const FACTURAS_CON_SALDO = ["EMITIDA", "PAGADA_PARCIAL", "VENCIDA"] as const

export interface PermisosAnunciantes {
  /** `facturas.ver`: cartera. */
  verCartera: boolean
}

/**
 * NIT con su dígito o, para una empresa de otro país, su identificación
 * tributaria. Es un dato público de la empresa (RUES, facturas): se muestra
 * completo a quien puede ver al anunciante, igual que lo entrega la BD.
 */
function identificacionDe(
  fila: Pick<
    FilaAnuncianteBd,
    "nit" | "digito_verificacion" | "identificacion_extranjera"
  >
): string | null {
  return (
    formatearNit(fila.nit, fila.digito_verificacion) ??
    fila.identificacion_extranjera
  )
}

function ciudadDe(
  fila: Pick<FilaAnuncianteBd, "municipio_codigo" | "ciudad_extranjera">
): string | null {
  return nombreMunicipio(fila.municipio_codigo) ?? fila.ciudad_extranjera
}

interface AgregadosAnunciante {
  campanas: number
  activas: number
  inversion: number
}

/** Campañas e inversión comprometida (Σ `presupuesto_comprometido`) por anunciante. */
async function campanasPorAnunciante(
  ids: readonly string[]
): Promise<Map<string, AgregadosAnunciante>> {
  const supabase = await clienteSolicitud()
  const agregados = new Map<string, AgregadosAnunciante>()
  for (const lote of enLotes(ids)) {
    const filas = await leerTodo("resumir las campañas", (desde, hasta) =>
      supabase
        .from("campanas")
        .select("id, anunciante_id, estado, presupuesto_comprometido")
        .in("anunciante_id", lote)
        .is("deleted_at", null)
        .order("id")
        .range(desde, hasta)
    )
    for (const fila of filas) {
      const actual = agregados.get(fila.anunciante_id) ?? {
        campanas: 0,
        activas: 0,
        inversion: 0,
      }
      actual.campanas += 1
      if (fila.estado === "ACTIVA") actual.activas += 1
      actual.inversion += fila.presupuesto_comprometido
      agregados.set(fila.anunciante_id, actual)
    }
  }
  return agregados
}

interface CarteraResumida {
  saldo: number
  facturasVencidas: number
}

/**
 * Saldo por cobrar y facturas vencidas por anunciante, con la misma regla de
 * mora que la ficha (`resumirCartera`): así el listado y la ficha coinciden.
 */
async function carteraPorAnunciante(
  ids: readonly string[]
): Promise<Map<string, CarteraResumida>> {
  const supabase = await clienteSolicitud()
  const facturas = new Map<string, FacturaParaCartera[]>()
  for (const lote of enLotes(ids)) {
    const filas = await leerTodo("calcular la cartera", (desde, hasta) =>
      supabase
        .from("facturas")
        .select("id, anunciante_id, estado, total, pagado, fecha_vencimiento")
        .in("anunciante_id", lote)
        .in("estado", [...FACTURAS_CON_SALDO])
        .order("id")
        .range(desde, hasta)
    )
    for (const fila of filas) {
      const lista = facturas.get(fila.anunciante_id) ?? []
      lista.push({
        estado: fila.estado,
        total: fila.total,
        pagado: fila.pagado,
        fechaVencimiento: fila.fecha_vencimiento,
      })
      facturas.set(fila.anunciante_id, lista)
    }
  }
  return new Map(
    [...facturas].map(([anuncianteId, lista]) => {
      const { saldo, facturasVencidas } = resumirCartera(lista)
      return [anuncianteId, { saldo, facturasVencidas }]
    })
  )
}

export async function listarAnunciantes(
  estado: EstadoTablaAnunciantes,
  permisos: PermisosAnunciantes
): Promise<PaginaFilas<AnuncianteFila>> {
  const supabase = await clienteSolicitud()
  const { sectores } = await catalogos()
  const patron = patronContiene(normalizarBusqueda(estado.q))
  const digitos = estado.q.replace(/\D/g, "")
  const porNit = digitos.length >= DIGITOS_MINIMOS_NIT

  const pagina = await leerPagina(
    "listar los anunciantes",
    estado.pagina,
    estado.tamano,
    (desde, hasta) => {
      let consulta = supabase
        .from("anunciantes")
        .select(SELECCION_LISTADO, { count: "exact" })
        .is("deleted_at", null)
      if (patron && porNit) {
        consulta = consulta.or(
          `nombre_normalizado.ilike.${patron},nit.ilike.%${digitos}%`
        )
      } else if (patron) {
        consulta = consulta.ilike("nombre_normalizado", patron)
      }
      if (estado.estado.length > 0) {
        consulta = consulta.in("estado_verificacion", estado.estado)
      }
      if (estado.sector.length > 0)
        consulta = consulta.in("sector_id", estado.sector)
      if (estado.pais.length > 0)
        consulta = consulta.in("pais_iso2", estado.pais)
      return consulta
        .order(COLUMNAS_ORDEN[estado.orden.campo], {
          ascending: !estado.orden.descendente,
        })
        .order("id")
        .range(desde, hasta)
    }
  )

  const ids = pagina.filas.map((fila) => fila.id)
  const [campanas, cartera] = await Promise.all([
    campanasPorAnunciante(ids),
    permisos.verCartera ? carteraPorAnunciante(ids) : null,
  ])

  return {
    total: pagina.total,
    filas: pagina.filas.map((fila) => {
      const agregados = campanas.get(fila.id)
      return {
        id: fila.id,
        nombreComercial: fila.nombre_comercial,
        razonSocial: fila.razon_social,
        identificacion: identificacionDe(fila),
        sector: sectores.get(fila.sector_id) ?? null,
        paisIso2: fila.pais_iso2,
        pais: nombrePais(fila.pais_iso2) ?? fila.pais_iso2,
        ciudad: ciudadDe(fila),
        estado: fila.estado_verificacion,
        campanas: agregados?.campanas ?? 0,
        campanasActivas: agregados?.activas ?? 0,
        inversion: agregados?.inversion ?? 0,
        cartera: cartera ? (cartera.get(fila.id)?.saldo ?? 0) : null,
        facturasVencidas: cartera
          ? (cartera.get(fila.id)?.facturasVencidas ?? 0)
          : null,
        creadoAt: fila.created_at,
      }
    }),
  }
}

/** Todos los anunciantes visibles (indicadores, filtros y selectores). */
const anunciantesVisibles = cache(async () => {
  const supabase = await clienteSolicitud()
  return leerTodo("leer los anunciantes", (desde, hasta) =>
    supabase
      .from("anunciantes")
      .select("id, nombre_comercial, estado_verificacion, pais_iso2")
      .is("deleted_at", null)
      .order("nombre_comercial")
      .order("id")
      .range(desde, hasta)
  )
})

export async function resumenAnunciantes(): Promise<ResumenAnunciantes> {
  const filas = await anunciantesVisibles()
  const contar = (estado: string) =>
    filas.filter((fila) => fila.estado_verificacion === estado).length
  const paises = new Set(filas.map((fila) => fila.pais_iso2))
  return {
    total: filas.length,
    verificados: contar("VERIFICADO"),
    pendientes: contar("PENDIENTE"),
    suspendidos: contar("SUSPENDIDO"),
    rechazados: contar("RECHAZADO"),
    internacionales: filas.filter((fila) => fila.pais_iso2 !== "CO").length,
    paises: paises.size,
  }
}

/** Opciones de los filtros "Anunciante" de otros listados (nombre comercial). */
export async function opcionesAnunciantes(): Promise<OpcionCatalogo[]> {
  return (await anunciantesVisibles()).map((fila) => ({
    id: fila.id,
    nombre: fila.nombre_comercial,
  }))
}

/** Países con al menos un anunciante (filtro del listado), por nombre. */
export async function paisesDeAnunciantes(): Promise<
  { iso2: string; nombre: string }[]
> {
  const iso2 = [
    ...new Set((await anunciantesVisibles()).map((f) => f.pais_iso2)),
  ]
  return iso2
    .map((codigo) => ({ iso2: codigo, nombre: nombrePais(codigo) ?? codigo }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
}

// ── Ficha ────────────────────────────────────────────────────────────────────

function textoDe(valor: Json | undefined): string | null {
  return typeof valor === "string" && valor.trim() ? valor : null
}

function booleanoDe(valor: Json | undefined): boolean | null {
  return typeof valor === "boolean" ? valor : null
}

function facturacionDe(valor: Json): AnuncianteDetalle["facturacion"] {
  const datos =
    valor && typeof valor === "object" && !Array.isArray(valor) ? valor : {}
  return {
    email: textoDe(datos.email_facturacion),
    regimen: textoDe(datos.regimen),
    granContribuyente: booleanoDe(datos.es_gran_contribuyente),
    autorretenedor: booleanoDe(datos.es_autorretenedor),
  }
}

export const obtenerAnunciante = cache(
  async (id: string): Promise<AnuncianteDetalle | null> => {
    const supabase = await clienteSolicitud()
    const [{ data: fila, error }, { sectores }, configuracion] =
      await Promise.all([
        supabase
          .from("anunciantes")
          .select(
            `id, nombre_comercial, razon_social, nit, digito_verificacion, identificacion_extranjera, sector_id,
           pais_iso2, municipio_codigo, ciudad_extranjera, estado_verificacion, motivo_estado, verificado_at,
           suspendido_at, rechazado_at, created_at, es_demo, logo_path, datos_facturacion, deleted_at,
           verificador:perfiles!anunciantes_verificado_por_fkey ( nombre, email )`
          )
          .eq("id", id)
          .maybeSingle(),
        catalogos(),
        configuracionOperacion(),
      ])
    if (error) fallar("leer el anunciante", error)
    if (!fila || fila.deleted_at) return null

    // Logos: lectura permitida a todo usuario activo (§8, regla de firma 1).
    const logo = fila.logo_path
      ? await supabase.storage
          .from("avatares")
          .createSignedUrl(
            fila.logo_path,
            configuracion.vigenciaUrlFirmadaSegundos
          )
      : null

    return {
      id: fila.id,
      nombreComercial: fila.nombre_comercial,
      razonSocial: fila.razon_social,
      identificacion: identificacionDe(fila),
      tipoIdentificacion: fila.nit ? "NIT" : "Identificación tributaria",
      sector: sectores.get(fila.sector_id) ?? null,
      paisIso2: fila.pais_iso2,
      pais: nombrePais(fila.pais_iso2) ?? fila.pais_iso2,
      ciudad: ciudadDe(fila),
      departamento: departamentoJuntoAMunicipio(
        fila.municipio_codigo?.slice(0, 2) ?? null
      ),
      estado: fila.estado_verificacion,
      motivoEstado: fila.motivo_estado,
      verificadoAt: fila.verificado_at,
      verificadoPor:
        fila.verificador?.nombre ?? fila.verificador?.email ?? null,
      suspendidoAt: fila.suspendido_at,
      rechazadoAt: fila.rechazado_at,
      creadoAt: fila.created_at,
      esDemo: fila.es_demo,
      logoUrl: logo && !logo.error ? logo.data.signedUrl : null,
      facturacion: facturacionDe(fila.datos_facturacion),
    }
  }
)

/** Ventana máxima que aceptan las RPC de analítica (10 años). */
const DIAS_HISTORIAL = 3650

/**
 * Desempeño por campaña de todo el historial (`reporte_desempeno_campanas`,
 * exige `reportes.ver`). `null` si el rol no puede consultarlo.
 */
export const desempenoDeCampanas = cache(
  async (
    anuncianteId: string,
    ahora: Date = new Date()
  ): Promise<Map<string, DesempenoCampana> | null> => {
    const supabase = await clienteSolicitud()
    const hasta = serializarFecha(ahora)
    const desde = serializarFecha(
      new Date(ahora.getTime() - DIAS_HISTORIAL * 86_400_000)
    )
    const { data, error } = await supabase.rpc("reporte_desempeno_campanas", {
      p_desde: desde,
      p_hasta: hasta,
      p_anunciante_id: anuncianteId,
    })
    if (error?.message === "AMO_NO_AUTORIZADO") return null
    if (error) fallar("calcular el desempeño de las campañas", error)
    return new Map(
      data.map((fila) => [
        fila.campana_id,
        {
          campanaId: fila.campana_id,
          gmvComprometido: fila.gmv_comprometido ?? 0,
          gmvVerificado: fila.gmv_verificado ?? 0,
          alcance: fila.alcance ?? 0,
          impresiones: fila.impresiones ?? 0,
          interacciones: fila.interacciones ?? 0,
          clics: fila.clics ?? 0,
          cpmEfectivo: fila.cpm_efectivo,
          costoPorInteraccion: fila.costo_por_interaccion,
          engagement: fila.engagement,
          tasaCumplimiento: fila.tasa_cumplimiento,
          tasaLlenado: fila.tasa_llenado,
          nVerificadas: fila.n_verificadas ?? 0,
        },
      ])
    )
  }
)

/** Facturas y cartera del anunciante (RLS: `facturas.ver`). */
export const carteraDelAnunciante = cache(
  async (anuncianteId: string): Promise<CarteraAnunciante> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase
      .from("facturas")
      .select(
        "id, numero, estado, fecha_emision, fecha_vencimiento, total, pagado, saldo, campana:campanas ( nombre )"
      )
      .eq("anunciante_id", anuncianteId)
      .order("fecha_emision", { ascending: false, nullsFirst: true })
      .limit(500)
    if (error) fallar("leer las facturas", error)
    return {
      resumen: resumirCartera(
        data.map((fila) => ({
          estado: fila.estado,
          total: fila.total,
          pagado: fila.pagado,
          fechaVencimiento: fila.fecha_vencimiento,
        }))
      ),
      facturas: data.map((fila) => ({
        id: fila.id,
        numero: fila.numero,
        estado: fila.estado,
        fechaEmision: fila.fecha_emision,
        fechaVencimiento: fila.fecha_vencimiento,
        total: fila.total,
        pagado: fila.pagado,
        saldo: fila.saldo,
        campana: fila.campana?.nombre ?? null,
      })),
    }
  }
)

/** Metadatos de los documentos del anunciante (RLS: `anunciantes.verificar`). */
export async function documentosDelAnunciante(
  anuncianteId: string
): Promise<DocumentoMetadatos[]> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("documentos_anunciante")
    .select(
      "id, tipo, estado_validacion, fecha_vencimiento, validado_at, observaciones, created_at"
    )
    .eq("anunciante_id", anuncianteId)
    .order("created_at", { ascending: false })
  if (error) fallar("leer los documentos del anunciante", error)
  return data.map((fila) => ({
    id: fila.id,
    tipo: TIPOS_DOCUMENTO_ANUNCIANTE[fila.tipo],
    estado: fila.estado_validacion,
    venceAt: fila.fecha_vencimiento,
    validadoAt: fila.validado_at,
    subidoAt: fila.created_at,
    observaciones: fila.observaciones,
  }))
}
