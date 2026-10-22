/**
 * Esquemas zod del registro y la edición de anunciantes: los MISMOS en el
 * formulario (cliente, con `zodResolver`) y en la Server Action (servidor).
 * Módulo puro. Los límites son los CHECK de `public.anunciantes`
 * (docs/modelo-datos.md §3.5) y el DV, el de la DIAN (`@/lib/colombia/nit`):
 * así el error aparece en el campo antes de llegar a la BD.
 */
import { z } from "zod"

import {
  digitoVerificacion,
  formatearNit,
  NIT_DIGITOS_MAX,
  NIT_DIGITOS_MIN,
  normalizarNit,
} from "@/lib/colombia/nit"

export const PAIS_COLOMBIA = "CO"

export const LIMITES = {
  razonSocial: { min: 2, max: 200 },
  nombreComercial: { min: 2, max: 120 },
  identificacionExtranjera: { min: 2, max: 40 },
  ciudadExtranjera: { max: 120 },
  correo: { max: 254 },
} as const

/** Espacios repetidos o en los extremos fuera: así se guarda y se compara. */
function colapsarEspacios(valor: string): string {
  return valor.replace(/\s+/g, " ").trim()
}

const id = z.uuid({ error: "Identificador inválido." })

const razonSocial = z
  .string({ error: "Escribe la razón social." })
  .overwrite(colapsarEspacios)
  .min(
    LIMITES.razonSocial.min,
    "Escribe la razón social (al menos 2 caracteres)."
  )
  .max(LIMITES.razonSocial.max, `Máximo ${LIMITES.razonSocial.max} caracteres.`)

const nombreComercial = z
  .string({ error: "Escribe el nombre comercial." })
  .overwrite(colapsarEspacios)
  .min(
    LIMITES.nombreComercial.min,
    "Escribe el nombre comercial (al menos 2 caracteres)."
  )
  .max(
    LIMITES.nombreComercial.max,
    `Máximo ${LIMITES.nombreComercial.max} caracteres.`
  )

const sectorId = z
  .string({ error: "Elige el sector." })
  .min(1, "Elige el sector.")
  .pipe(z.uuid({ error: "Elige un sector de la lista." }))

const paisIso2 = z
  .string({ error: "Elige el país." })
  .min(1, "Elige el país.")
  .regex(/^[A-Z]{2}$/, "Elige un país de la lista.")

const correoFacturacion = z
  .string()
  .trim()
  .toLowerCase()
  .max(LIMITES.correo.max, "El correo es demasiado largo.")
  .refine(
    (valor) => valor === "" || z.email().safeParse(valor).success,
    "Escribe un correo válido."
  )

/** Campos tal como los escribe la persona (todos texto: el formulario no maneja `null`). */
const objetoCampos = z.object({
  razonSocial,
  nombreComercial,
  sectorId,
  paisIso2,
  nit: z.string(),
  digitoVerificacion: z.string().trim(),
  municipioCodigo: z.string(),
  identificacionExtranjera: z.string().overwrite(colapsarEspacios),
  ciudadExtranjera: z.string().overwrite(colapsarEspacios),
  emailFacturacion: correoFacturacion,
})

type CamposAnunciante = z.output<typeof objetoCampos>

export type CampoAnunciante = keyof CamposAnunciante

type Contexto = z.RefinementCtx<CamposAnunciante>

function avisar(contexto: Contexto, campo: CampoAnunciante, mensaje: string) {
  contexto.addIssue({ code: "custom", path: [campo], message: mensaje })
}

/** Mensaje del NIT escrito, o `null` si es un NIT de 6 a 15 dígitos. */
function problemaNit(nit: string): string | null {
  if (nit === "") return "Escribe el NIT de la empresa."
  if (!/^\d+$/.test(nit)) {
    return "Escribe solo los números del NIT, sin el dígito de verificación."
  }
  if (nit.length < NIT_DIGITOS_MIN || nit.length > NIT_DIGITOS_MAX) {
    return `El NIT tiene entre ${NIT_DIGITOS_MIN} y ${NIT_DIGITOS_MAX} dígitos (sin el de verificación).`
  }
  return null
}

/** Mensaje del DV frente al NIT ya válido, o `null` si coincide. */
function problemaDigito(nit: string, dv: string): string | null {
  const esperado = digitoVerificacion(nit)
  if (dv === "") {
    return `Escribe el dígito de verificación (según el NIT es ${esperado}).`
  }
  if (!/^\d$/.test(dv)) return "Es un solo dígito, del 0 al 9."
  if (dv !== esperado) {
    return `No corresponde al NIT: para ${formatearNit(nit)} es ${esperado}. Revisa ambos en el RUT.`
  }
  return null
}

function validarColombia(datos: CamposAnunciante, contexto: Contexto) {
  const nit = normalizarNit(datos.nit)
  const errorNit = problemaNit(nit)
  if (errorNit) {
    avisar(contexto, "nit", errorNit)
    if (
      datos.digitoVerificacion !== "" &&
      !/^\d$/.test(datos.digitoVerificacion)
    ) {
      avisar(contexto, "digitoVerificacion", "Es un solo dígito, del 0 al 9.")
    }
  } else {
    const errorDigito = problemaDigito(nit, datos.digitoVerificacion)
    if (errorDigito) avisar(contexto, "digitoVerificacion", errorDigito)
  }
  if (!/^\d{5}$/.test(datos.municipioCodigo)) {
    avisar(
      contexto,
      "municipioCodigo",
      "Elige el municipio de la sede principal."
    )
  }
}

function validarExtranjero(datos: CamposAnunciante, contexto: Contexto) {
  const { min, max } = LIMITES.identificacionExtranjera
  const identificacion = datos.identificacionExtranjera
  if (identificacion.length < min) {
    avisar(
      contexto,
      "identificacionExtranjera",
      "Escribe su identificación tributaria (al menos 2 caracteres)."
    )
  } else if (identificacion.length > max) {
    avisar(contexto, "identificacionExtranjera", `Máximo ${max} caracteres.`)
  }
  if (datos.ciudadExtranjera.length > LIMITES.ciudadExtranjera.max) {
    avisar(
      contexto,
      "ciudadExtranjera",
      `Máximo ${LIMITES.ciudadExtranjera.max} caracteres.`
    )
  }
}

/** Colombia exige NIT con DV correcto y municipio; otro país, su identificación tributaria. */
function validarIdentificacion(datos: CamposAnunciante, contexto: Contexto) {
  if (datos.paisIso2 === PAIS_COLOMBIA) validarColombia(datos, contexto)
  else validarExtranjero(datos, contexto)
}

/**
 * Identificación tributaria y ubicación ya resueltas por país: un anunciante
 * colombiano nunca lleva identificación extranjera ni ciudad libre, y uno de
 * otro país nunca lleva NIT ni municipio (CHECK de la tabla).
 */
export type IdentificacionAnunciante =
  | {
      tipo: "NIT"
      nit: string
      digitoVerificacion: string
      municipioCodigo: string
    }
  | { tipo: "EXTRANJERA"; identificacion: string; ciudad: string | null }

export interface DatosAnunciante {
  razonSocial: string
  nombreComercial: string
  sectorId: string
  paisIso2: string
  identificacion: IdentificacionAnunciante
  emailFacturacion: string | null
}

function resolver(datos: CamposAnunciante): DatosAnunciante {
  return {
    razonSocial: datos.razonSocial,
    nombreComercial: datos.nombreComercial,
    sectorId: datos.sectorId,
    paisIso2: datos.paisIso2,
    identificacion:
      datos.paisIso2 === PAIS_COLOMBIA
        ? {
            tipo: "NIT",
            nit: normalizarNit(datos.nit),
            digitoVerificacion: datos.digitoVerificacion,
            municipioCodigo: datos.municipioCodigo,
          }
        : {
            tipo: "EXTRANJERA",
            identificacion: datos.identificacionExtranjera,
            ciudad: datos.ciudadExtranjera || null,
          },
    emailFacturacion: datos.emailFacturacion || null,
  }
}

export const esquemaAnunciante = objetoCampos
  .superRefine(validarIdentificacion)
  .transform(resolver)

export const esquemaEditarAnunciante = objetoCampos
  .extend({
    id,
    actualizadoAt: z.string().min(1, "Falta la versión del registro.").max(64),
  })
  .superRefine(validarIdentificacion)
  .transform(
    (datos): DatosAnunciante & { id: string; actualizadoAt: string } => ({
      ...resolver(datos),
      id: datos.id,
      actualizadoAt: datos.actualizadoAt,
    })
  )

export type EntradaAnunciante = z.input<typeof esquemaAnunciante>
export type EntradaEditarAnunciante = z.input<typeof esquemaEditarAnunciante>
export type DatosEditarAnunciante = z.output<typeof esquemaEditarAnunciante>

/** Campos del formulario que pueden recibir un error del servidor. */
export const CAMPOS_ANUNCIANTE = [
  "razonSocial",
  "nombreComercial",
  "sectorId",
  "paisIso2",
  "nit",
  "digitoVerificacion",
  "municipioCodigo",
  "identificacionExtranjera",
  "ciudadExtranjera",
  "emailFacturacion",
] as const satisfies readonly CampoAnunciante[]
