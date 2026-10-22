/**
 * Traducción entre el formulario y la fila de `public.anunciantes` (módulo
 * puro): columnas que se escriben, cuáles cambia una edición, combinación del
 * correo de facturación con el resto de `datos_facturacion` y valores
 * iniciales de la hoja.
 */
import { formatearNit } from "@/lib/colombia/nit"
import type { Json, TablesInsert } from "@/types/database.types"

import {
  type DatosAnunciante,
  type EntradaAnunciante,
  PAIS_COLOMBIA,
} from "./schemas"
import type { AnuncianteEditable } from "./tipos"

/**
 * Columnas de identificación y ubicación que escribe el equipo AMO. Todas van
 * siempre (con `null` las que no aplican): al cambiar de país en una edición
 * no quedan restos del anterior (los CHECK de la tabla lo exigen).
 */
export type ColumnasAnunciante = Required<
  Pick<
    TablesInsert<"anunciantes">,
    | "razon_social"
    | "nombre_comercial"
    | "sector_id"
    | "pais_iso2"
    | "nit"
    | "digito_verificacion"
    | "municipio_codigo"
    | "identificacion_extranjera"
    | "ciudad_extranjera"
  >
>

export function columnasAnunciante(datos: DatosAnunciante): ColumnasAnunciante {
  const { identificacion } = datos
  const colombiana = identificacion.tipo === "NIT"
  return {
    razon_social: datos.razonSocial,
    nombre_comercial: datos.nombreComercial,
    sector_id: datos.sectorId,
    pais_iso2: datos.paisIso2,
    nit: colombiana ? identificacion.nit : null,
    digito_verificacion: colombiana ? identificacion.digitoVerificacion : null,
    municipio_codigo: colombiana ? identificacion.municipioCodigo : null,
    identificacion_extranjera: colombiana
      ? null
      : identificacion.identificacion,
    ciudad_extranjera: colombiana ? null : identificacion.ciudad,
  }
}

type ObjetoJson = { [clave: string]: Json | undefined }

function esObjeto(valor: Json | undefined): valor is ObjetoJson {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
}

/**
 * `datos_facturacion` con el correo nuevo y el resto intacto (régimen,
 * responsabilidades fiscales… los gestiona otro flujo). Sin correo, la clave
 * desaparece en lugar de quedar vacía.
 */
export function conCorreoFacturacion(
  actual: Json | undefined,
  correo: string | null
): ObjetoJson {
  const { email_facturacion: _anterior, ...resto } = esObjeto(actual)
    ? actual
    : {}
  return correo ? { ...resto, email_facturacion: correo } : resto
}

/** Correo de facturación guardado, si es un texto. */
export function correoFacturacionDe(datos: Json | undefined): string | null {
  if (!esObjeto(datos)) return null
  const correo = datos.email_facturacion
  return typeof correo === "string" && correo.trim() ? correo : null
}

/** La fila tal como está hoy en las columnas que edita el equipo AMO. */
export type FilaAnuncianteEditable = ColumnasAnunciante & {
  datos_facturacion: Json
}

export type CambiosAnunciante = Partial<
  ColumnasAnunciante & { datos_facturacion: ObjetoJson }
>

/**
 * Columnas que cambia una edición (como en medios, solo se escribe lo que
 * cambió): corregir el nombre no reescribe la identificación tributaria ni
 * dispara su trigger, y guardar sin cambios no deja una fila vacía en la
 * bitácora ni mueve `updated_at`. Al cambiar de país, las columnas del país
 * anterior pasan a `null` (cambian, así que se incluyen).
 */
export function cambiosAnunciante(
  actual: FilaAnuncianteEditable,
  datos: DatosAnunciante
): CambiosAnunciante {
  const nuevas = columnasAnunciante(datos)
  const cambios: CambiosAnunciante = Object.fromEntries(
    Object.entries(nuevas).filter(
      ([columna, valor]) =>
        valor !== actual[columna as keyof ColumnasAnunciante]
    )
  )
  if (
    datos.emailFacturacion !== correoFacturacionDe(actual.datos_facturacion)
  ) {
    cambios.datos_facturacion = conCorreoFacturacion(
      actual.datos_facturacion,
      datos.emailFacturacion
    )
  }
  return cambios
}

export function hayCambiosAnunciante(cambios: CambiosAnunciante): boolean {
  return Object.keys(cambios).length > 0
}

const VACIO: EntradaAnunciante = {
  razonSocial: "",
  nombreComercial: "",
  sectorId: "",
  paisIso2: PAIS_COLOMBIA,
  nit: "",
  digitoVerificacion: "",
  municipioCodigo: "",
  identificacionExtranjera: "",
  ciudadExtranjera: "",
  emailFacturacion: "",
}

/**
 * Valores iniciales del formulario: vacío y en Colombia para registrar; los
 * actuales (NIT con puntos, como en el RUT) para editar.
 */
export function valoresFormulario(
  anunciante: AnuncianteEditable | null
): EntradaAnunciante {
  if (!anunciante) return VACIO
  return {
    razonSocial: anunciante.razonSocial,
    nombreComercial: anunciante.nombreComercial,
    sectorId: anunciante.sector.id,
    paisIso2: anunciante.paisIso2,
    nit: anunciante.nit ? formatearNit(anunciante.nit) : "",
    digitoVerificacion: anunciante.digitoVerificacion ?? "",
    municipioCodigo: anunciante.municipioCodigo ?? "",
    identificacionExtranjera: anunciante.identificacionExtranjera ?? "",
    ciudadExtranjera: anunciante.ciudadExtranjera ?? "",
    emailFacturacion: anunciante.emailFacturacion ?? "",
  }
}
