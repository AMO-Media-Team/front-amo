/**
 * Traducción entre los formularios de «Mi empresa» y las filas de
 * `anunciantes` y `anunciantes_privado` (módulo puro): valores iniciales,
 * columnas que cambia cada edición y combinación de `datos_facturacion` sin
 * pisar lo que gestiona otro flujo.
 */
import {
  cambiosAnunciante,
  type ColumnasAnunciante,
  correoFacturacionDe,
  type FilaAnuncianteEditable,
  valoresFormulario,
} from "@/features/gestion-anunciantes/filas"
import { formatearNit } from "@/lib/colombia/nit"
import type { Json } from "@/types/database.types"

import {
  type DatosContactoEmpresa,
  type DatosEdicionEmpresa,
  type EntradaContactoEmpresa,
  type EntradaMiEmpresa,
  ETIQUETAS_REGIMEN,
  REGIMENES,
} from "./schemas"
import { celularContactoParaMostrar } from "./telefono"
import type {
  ContactoEmpresa,
  EmpresaPropia,
  FacturacionEmpresa,
} from "./tipos"

type ObjetoJson = { [clave: string]: Json | undefined }

function esObjeto(valor: Json | undefined): valor is ObjetoJson {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
}

function textoDe(valor: Json | undefined): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null
}

// ── Facturación (`anunciantes.datos_facturacion`) ───────────────────────────

/** Códigos DIAN de responsabilidad fiscal que la empresa declara con un interruptor. */
export const RESPONSABILIDAD_GRAN_CONTRIBUYENTE = "O-13"
export const RESPONSABILIDAD_AUTORRETENEDOR = "O-15"

export function leerFacturacion(datos: Json | undefined): FacturacionEmpresa {
  const objeto = esObjeto(datos) ? datos : {}
  return {
    email: correoFacturacionDe(objeto),
    regimen: textoDe(objeto.regimen),
    granContribuyente: objeto.es_gran_contribuyente === true,
    autorretenedor: objeto.es_autorretenedor === true,
  }
}

/** Los regímenes de la lista y, si es otro, el que tiene hoy guardado. */
export function opcionesRegimen(
  actual: string | null
): { valor: string; etiqueta: string }[] {
  const opciones = REGIMENES.map((regimen) => ({
    valor: regimen as string,
    etiqueta: ETIQUETAS_REGIMEN[regimen],
  }))
  if (actual && !(REGIMENES as readonly string[]).includes(actual)) {
    opciones.push({ valor: actual, etiqueta: actual })
  }
  return opciones
}

/** Lo de facturación que escribe la empresa desde su formulario. */
export interface FacturacionEscrita {
  emailFacturacion: string | null
  regimen: string
  granContribuyente: boolean
  autorretenedor: boolean
}

function conCodigo(
  codigos: readonly string[],
  codigo: string,
  incluir: boolean
): string[] {
  const sin = codigos.filter((actual) => actual !== codigo)
  return incluir ? [...sin, codigo] : sin
}

/**
 * `datos_facturacion` con lo escrito y el resto intacto: solo se toca lo que
 * cambió (guardar sin cambios devuelve el mismo objeto, así no se reescribe ni
 * queda en la bitácora). Sin correo o sin régimen, la clave desaparece en
 * lugar de quedar vacía. Las responsabilidades O-13 (gran contribuyente) y
 * O-15 (autorretenedor) se ajustan con su interruptor.
 */
export function facturacionNueva(
  actual: Json | undefined,
  escrita: FacturacionEscrita
): ObjetoJson {
  const objeto: ObjetoJson = esObjeto(actual) ? { ...actual } : {}
  const previa = leerFacturacion(objeto)

  if (escrita.emailFacturacion !== previa.email) {
    if (escrita.emailFacturacion) {
      objeto.email_facturacion = escrita.emailFacturacion
    } else {
      delete objeto.email_facturacion
    }
  }
  const regimen = escrita.regimen.trim()
  if (regimen !== (previa.regimen ?? "")) {
    if (regimen) objeto.regimen = regimen
    else delete objeto.regimen
  }

  const cambioGran = escrita.granContribuyente !== previa.granContribuyente
  const cambioAuto = escrita.autorretenedor !== previa.autorretenedor
  if (cambioGran) objeto.es_gran_contribuyente = escrita.granContribuyente
  if (cambioAuto) objeto.es_autorretenedor = escrita.autorretenedor
  if (cambioGran || cambioAuto) {
    const previas = Array.isArray(objeto.responsabilidades_fiscales)
      ? objeto.responsabilidades_fiscales.filter(
          (codigo): codigo is string => typeof codigo === "string"
        )
      : []
    let codigos = previas
    if (cambioGran) {
      codigos = conCodigo(
        codigos,
        RESPONSABILIDAD_GRAN_CONTRIBUYENTE,
        escrita.granContribuyente
      )
    }
    if (cambioAuto) {
      codigos = conCodigo(
        codigos,
        RESPONSABILIDAD_AUTORRETENEDOR,
        escrita.autorretenedor
      )
    }
    objeto.responsabilidades_fiscales = [...codigos].sort()
  }
  return objeto
}

/** JSON con las claves ordenadas: compara sin que importe el orden. */
function canonico(valor: Json | undefined): string {
  return JSON.stringify(valor ?? null, (_clave, dato: unknown) =>
    dato && typeof dato === "object" && !Array.isArray(dato)
      ? Object.fromEntries(
          Object.entries(dato as Record<string, unknown>).sort(([a], [b]) =>
            a.localeCompare(b)
          )
        )
      : dato
  )
}

export function jsonIgual(a: Json | undefined, b: Json | undefined): boolean {
  return canonico(a) === canonico(b)
}

// ── Datos de la empresa ──────────────────────────────────────────────────────

/** Valores iniciales del formulario: lo guardado (NIT con puntos, como en el RUT). */
export function valoresMiEmpresa(empresa: EmpresaPropia): EntradaMiEmpresa {
  return {
    ...valoresFormulario({
      id: empresa.id,
      razonSocial: empresa.razonSocial,
      nombreComercial: empresa.nombreComercial,
      sector: empresa.sector,
      paisIso2: empresa.paisIso2,
      nit: empresa.nit,
      digitoVerificacion: empresa.digitoVerificacion,
      municipioCodigo: empresa.municipioCodigo,
      identificacionExtranjera: empresa.identificacionExtranjera,
      ciudadExtranjera: empresa.ciudadExtranjera,
      emailFacturacion: empresa.facturacion.email,
      actualizadoAt: empresa.actualizadoAt,
    }),
    regimen: empresa.facturacion.regimen ?? "",
    granContribuyente: empresa.facturacion.granContribuyente,
    autorretenedor: empresa.facturacion.autorretenedor,
    actualizadoAt: empresa.actualizadoAt,
  }
}

/** La fila tal como está hoy en las columnas que edita la empresa. */
export type FilaEmpresaEditable = FilaAnuncianteEditable

/**
 * Con la identificación bloqueada, lo que llega del navegador para esos
 * campos se reemplaza por lo guardado: así ni se valida (un dato heredado no
 * frena el guardado) ni se escribe.
 */
export function conIdentificacionGuardada(
  entrada: EntradaMiEmpresa,
  fila: Pick<
    FilaEmpresaEditable,
    | "razon_social"
    | "pais_iso2"
    | "nit"
    | "digito_verificacion"
    | "identificacion_extranjera"
  >
): EntradaMiEmpresa {
  return {
    ...entrada,
    razonSocial: fila.razon_social,
    paisIso2: fila.pais_iso2.trim(),
    nit: fila.nit ? formatearNit(fila.nit) : "",
    digitoVerificacion: fila.digito_verificacion ?? "",
    identificacionExtranjera: fila.identificacion_extranjera ?? "",
  }
}

/** Columnas de identificación que la empresa ya no escribe tras verificarse. */
const COLUMNAS_IDENTIFICACION: readonly (keyof ColumnasAnunciante)[] = [
  "razon_social",
  "pais_iso2",
  "nit",
  "digito_verificacion",
  "identificacion_extranjera",
]

export type CambiosEmpresa = Partial<
  ColumnasAnunciante & { datos_facturacion: ObjetoJson }
>

/**
 * Columnas que cambia la edición (solo lo que cambió: guardar sin cambios no
 * deja una fila vacía en la bitácora ni mueve `updated_at`).
 */
export function cambiosMiEmpresa(
  actual: FilaEmpresaEditable,
  datos: DatosEdicionEmpresa,
  bloqueada: boolean
): CambiosEmpresa {
  const { datos_facturacion: _soloCorreo, ...columnas } = cambiosAnunciante(
    actual,
    datos
  )
  const cambios: CambiosEmpresa = bloqueada
    ? Object.fromEntries(
        Object.entries(columnas).filter(
          ([columna]) =>
            !COLUMNAS_IDENTIFICACION.includes(
              columna as keyof ColumnasAnunciante
            )
        )
      )
    : columnas
  const facturacion = facturacionNueva(actual.datos_facturacion, {
    emailFacturacion: datos.emailFacturacion,
    regimen: datos.regimen,
    granContribuyente: datos.granContribuyente,
    autorretenedor: datos.autorretenedor,
  })
  return jsonIgual(facturacion, actual.datos_facturacion)
    ? cambios
    : { ...cambios, datos_facturacion: facturacion }
}

export function hayCambios(cambios: object): boolean {
  return Object.keys(cambios).length > 0
}

// ── Persona de contacto (`anunciantes_privado`) ─────────────────────────────

export function valoresContacto(
  contacto: ContactoEmpresa
): EntradaContactoEmpresa {
  return {
    nombre: contacto.nombre ?? "",
    correo: contacto.email ?? "",
    celular: celularContactoParaMostrar(contacto.celular),
    direccion: contacto.direccion ?? "",
    version: contacto.actualizadoAt ?? "",
  }
}

export interface ColumnasContacto {
  contacto_nombre: string
  contacto_email: string
  contacto_celular: string | null
  direccion: string | null
}

export function columnasContacto(
  datos: DatosContactoEmpresa
): ColumnasContacto {
  return {
    contacto_nombre: datos.nombre,
    contacto_email: datos.correo,
    contacto_celular: datos.celular,
    direccion: datos.direccion,
  }
}

/** Solo las columnas que cambiaron (el correo se compara sin mayúsculas: es `citext`). */
export function cambiosContacto(
  actual: {
    [C in keyof ColumnasContacto]: string | null
  },
  nuevas: ColumnasContacto
): Partial<ColumnasContacto> {
  return Object.fromEntries(
    Object.entries(nuevas).filter(([columna, valor]) => {
      const previo = actual[columna as keyof ColumnasContacto]
      return columna === "contacto_email"
        ? (previo ?? "").toLowerCase() !== (valor ?? "").toLowerCase()
        : previo !== valor
    })
  )
}

export function aContacto(
  fila: {
    contacto_nombre: string | null
    contacto_email: string | null
    contacto_celular: string | null
    direccion: string | null
    updated_at: string
  } | null
): ContactoEmpresa {
  return {
    nombre: fila?.contacto_nombre?.trim() || null,
    email: fila?.contacto_email?.trim() || null,
    celular: fila?.contacto_celular?.trim() || null,
    direccion: fila?.direccion?.trim() || null,
    actualizadoAt: fila?.updated_at ?? null,
  }
}
