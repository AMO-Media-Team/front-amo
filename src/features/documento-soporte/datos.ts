/**
 * Lo que lleva el documento soporte (LIQ-004), en un modelo único del que salen el PDF y el archivo para el
 * proveedor tecnológico (módulo puro). Se arma con dos lecturas del servidor:
 *
 * - `datos_documento_soporte(p_documento_id)`: documento, resolución, liquidación, medio, adquiriente (la
 *   configuración tributaria de AMO), líneas por publicación y retenciones agrupadas. Llega como `jsonb`
 *   y se valida aquí con zod (los `numeric` llegan como número).
 * - `revelar_privado_srv('medios_privado', …)`: titular, tipo y número de documento (cifrado) y dirección
 *   del medio. Queda `REVELAR_DATO` en la bitácora; el número se descifra en el servidor y solo viaja
 *   dentro de los archivos que se generan.
 */
import { z } from "zod"

import type { TipoDocumentoIdentidad } from "@/features/mi-medio/datos-pago"
import { obtenerDepartamento, obtenerMunicipio } from "@/lib/geo/catalogo"
import type { Database } from "@/types/database.types"

import type { EstadoDocumentoSoporte } from "./tipos"

type Enums = Database["public"]["Enums"]
export type Plataforma = Enums["plataforma"]
export type TipoRetencion = Enums["retencion_tipo"]

const ESTADOS: readonly EstadoDocumentoSoporte[] = [
  "BORRADOR",
  "EMITIDO",
  "ANULADO",
]
const PLATAFORMAS: readonly Plataforma[] = ["INSTAGRAM", "FACEBOOK", "TIKTOK"]
const TIPOS_RETENCION: readonly TipoRetencion[] = [
  "RETEFUENTE",
  "RETEICA",
  "RETEIVA",
]
const TIPOS_DOCUMENTO: readonly TipoDocumentoIdentidad[] = [
  "CC",
  "CE",
  "PPT",
  "PASAPORTE",
  "NIT",
]

/** `AAAA-MM-DD` de una columna `date`. */
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
/** `numeric` llega como número; se acepta también como texto por si PostgREST lo serializa así. */
const monto = z.union([z.number(), z.string()]).pipe(z.coerce.number())
const textoNulo = z
  .string()
  .nullish()
  .transform((valor) => valor ?? null)

const esquemaDocumento = z.object({
  id: z.uuid(),
  estado: z.enum(ESTADOS),
  prefijo: textoNulo,
  consecutivo: z
    .number()
    .int()
    .nullish()
    .transform((valor) => valor ?? null),
  numero: textoNulo,
  fecha_emision: dia.nullish().transform((valor) => valor ?? null),
  valor_total: monto,
  cuds: textoNulo,
  archivo_path: textoNulo,
  archivo_proveedor_path: textoNulo,
})

const esquemaResolucion = z.object({
  numero_resolucion: z.string(),
  fecha_resolucion: dia,
  prefijo: z.string(),
  rango_desde: z.number().int(),
  rango_hasta: z.number().int(),
  vigente_desde: dia,
  vigente_hasta: dia.nullish().transform((valor) => valor ?? null),
})

const esquemaLinea = z.object({
  asignacion_id: z.uuid(),
  oferta: z.string(),
  marca: textoNulo,
  plataforma: z.enum(PLATAFORMAS),
  formato: z.string(),
  publicada_at: textoNulo,
  verificada_at: textoNulo,
  valor: monto,
})

const esquemaRetencion = z.object({
  tipo: z.enum(TIPOS_RETENCION),
  concepto: textoNulo,
  tarifa: monto,
  municipio_codigo: textoNulo,
  base: monto,
  valor: monto,
})

/** Respuesta de `datos_documento_soporte`. */
export const esquemaDatosDocumentoSoporte = z.object({
  documento: esquemaDocumento,
  resolucion: esquemaResolucion.nullish().transform((valor) => valor ?? null),
  liquidacion: z.object({
    id: z.uuid(),
    periodo_inicio: dia,
    periodo_fin: dia,
    monto_medio: monto,
    monto_retenciones: monto,
    monto_neto: monto,
    cantidad_asignaciones: z.number().int(),
  }),
  medio: z.object({
    id: z.uuid(),
    nombre: z.string(),
    municipio_codigo: textoNulo,
  }),
  adquiriente: z.object({
    razon_social: textoNulo,
    nit: textoNulo,
    dv: textoNulo,
    direccion: textoNulo,
    municipio_codigo: textoNulo,
  }),
  lineas: z.array(esquemaLinea),
  retenciones: z.array(esquemaRetencion),
})

export type DatosDocumentoSoporteBd = z.infer<
  typeof esquemaDatosDocumentoSoporte
>

/** Campos de `medios_privado` que el documento necesita (los pide `revelar_privado_srv`). */
export const CAMPOS_VENDEDOR = [
  "titular_nombre",
  "tipo_documento",
  "numero_documento_cifrado",
  "direccion",
] as const

/** Respuesta de `revelar_privado_srv` con `CAMPOS_VENDEDOR` (`null` si el medio no tiene la fila). */
export const esquemaVendedorRevelado = z
  .object({
    titular_nombre: textoNulo,
    tipo_documento: z
      .enum(TIPOS_DOCUMENTO)
      .nullish()
      .transform((valor) => valor ?? null),
    numero_documento_cifrado: textoNulo,
    direccion: textoNulo,
  })
  .nullable()

export type VendedorRevelado = z.infer<typeof esquemaVendedorRevelado>

/** El vendedor ya descifrado (el número solo existe en memoria del servidor). */
export interface VendedorDocumento {
  titular: string | null
  tipoDocumento: TipoDocumentoIdentidad | null
  /** Normalizado (solo dígitos o letras, sin separadores). */
  numeroDocumento: string | null
  direccion: string | null
}

export interface UbicacionDocumento {
  codigo: string | null
  /** «Santa Marta, Magdalena»; «Bogotá, D.C.» sin repetir el departamento. */
  nombre: string | null
}

export interface LineaModelo {
  asignacionId: string
  oferta: string
  marca: string | null
  plataforma: Plataforma
  formato: string
  publicadaAt: string | null
  valor: number
}

export interface RetencionModelo {
  tipo: TipoRetencion
  concepto: string | null
  /** Fracción: 0,06 = 6 %. */
  tarifa: number
  base: number
  valor: number
  municipio: UbicacionDocumento
}

/** Todo lo que lleva el documento, del que salen el PDF y el archivo genérico. */
export interface ModeloDocumentoSoporte {
  documento: {
    id: string
    prefijo: string
    consecutivo: number
    numero: string
    fechaEmision: string
    cuds: string | null
    valorTotal: number
  }
  resolucion: {
    numero: string
    fecha: string
    prefijo: string
    rangoDesde: number
    rangoHasta: number
    vigenteDesde: string
    vigenteHasta: string | null
  } | null
  liquidacion: {
    id: string
    periodoInicio: string
    periodoFin: string
    montoRetenciones: number
    montoNeto: number
  }
  vendedor: VendedorDocumento & {
    medioId: string
    nombreMedio: string
    municipio: UbicacionDocumento
  }
  adquiriente: {
    razonSocial: string | null
    nit: string | null
    dv: string | null
    direccion: string | null
    municipio: UbicacionDocumento
  }
  lineas: LineaModelo[]
  retenciones: RetencionModelo[]
}

/** Bogotá, D.C. es municipio y departamento a la vez. */
const DISTRITO_CAPITAL = "11"

export function ubicacion(codigo: string | null): UbicacionDocumento {
  if (!codigo) return { codigo: null, nombre: null }
  const municipio = obtenerMunicipio(codigo)
  if (!municipio) return { codigo, nombre: null }
  const departamento =
    municipio.departamentoCodigo === DISTRITO_CAPITAL
      ? null
      : obtenerDepartamento(municipio.departamentoCodigo)
  return {
    codigo,
    nombre: departamento
      ? `${municipio.nombre}, ${departamento.nombre}`
      : municipio.nombre,
  }
}

/** Texto vacío o solo espacios = dato ausente (la configuración vacía llega como `""`). */
function presente(valor: string | null): string | null {
  const limpio = valor?.trim()
  return limpio ? limpio : null
}

export class DocumentoNoEmitido extends Error {
  constructor() {
    super("El documento soporte no está emitido.")
    this.name = "DocumentoNoEmitido"
  }
}

/**
 * Une lo que devuelve la BD y el vendedor descifrado. Solo un documento EMITIDO (con número y fecha) tiene
 * archivos: con otro estado lanza `DocumentoNoEmitido`.
 */
export function componerModelo(
  datos: DatosDocumentoSoporteBd,
  vendedor: VendedorDocumento
): ModeloDocumentoSoporte {
  const { documento, resolucion, liquidacion, medio, adquiriente } = datos
  if (
    documento.estado !== "EMITIDO" ||
    documento.consecutivo === null ||
    documento.fecha_emision === null
  ) {
    throw new DocumentoNoEmitido()
  }
  const prefijo = documento.prefijo ?? ""
  return {
    documento: {
      id: documento.id,
      prefijo,
      consecutivo: documento.consecutivo,
      numero: documento.numero ?? `${prefijo}${documento.consecutivo}`,
      fechaEmision: documento.fecha_emision,
      cuds: presente(documento.cuds),
      valorTotal: documento.valor_total,
    },
    resolucion: resolucion
      ? {
          numero: resolucion.numero_resolucion,
          fecha: resolucion.fecha_resolucion,
          prefijo: resolucion.prefijo,
          rangoDesde: resolucion.rango_desde,
          rangoHasta: resolucion.rango_hasta,
          vigenteDesde: resolucion.vigente_desde,
          vigenteHasta: resolucion.vigente_hasta,
        }
      : null,
    liquidacion: {
      id: liquidacion.id,
      periodoInicio: liquidacion.periodo_inicio,
      periodoFin: liquidacion.periodo_fin,
      montoRetenciones: liquidacion.monto_retenciones,
      montoNeto: liquidacion.monto_neto,
    },
    vendedor: {
      medioId: medio.id,
      nombreMedio: medio.nombre,
      titular: presente(vendedor.titular),
      tipoDocumento: vendedor.tipoDocumento,
      numeroDocumento: presente(vendedor.numeroDocumento),
      direccion: presente(vendedor.direccion),
      municipio: ubicacion(medio.municipio_codigo),
    },
    adquiriente: {
      razonSocial: presente(adquiriente.razon_social),
      nit: presente(adquiriente.nit),
      dv: presente(adquiriente.dv),
      direccion: presente(adquiriente.direccion),
      municipio: ubicacion(presente(adquiriente.municipio_codigo)),
    },
    lineas: datos.lineas.map((linea) => ({
      asignacionId: linea.asignacion_id,
      oferta: linea.oferta,
      marca: presente(linea.marca),
      plataforma: linea.plataforma,
      formato: linea.formato,
      publicadaAt: linea.publicada_at,
      valor: linea.valor,
    })),
    retenciones: datos.retenciones.map((retencion) => ({
      tipo: retencion.tipo,
      concepto: presente(retencion.concepto),
      tarifa: retencion.tarifa,
      base: retencion.base,
      valor: retencion.valor,
      municipio: ubicacion(retencion.municipio_codigo),
    })),
  }
}
