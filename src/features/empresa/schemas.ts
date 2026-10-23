/**
 * Esquemas zod de «Mi empresa»: los MISMOS en el formulario (cliente, con
 * `zodResolver`) y en la Server Action (servidor). Módulo puro.
 *
 * - Datos de la empresa: los campos del registro del equipo AMO
 *   (`esquemaAnunciante`: NIT con DV de la DIAN, municipio, correo de
 *   facturación…) más la condición tributaria y la versión del registro.
 * - Persona de contacto: los CHECK de `anunciantes_privado`.
 * - Logo: lo que admite el bucket `avatares`, sin miniatura.
 */
import { z } from "zod"

import {
  CAMPOS_ANUNCIANTE,
  esquemaAnunciante,
} from "@/features/gestion-anunciantes/schemas"
import {
  esquemaArchivoSubido,
  esquemaDescripcionArchivo,
} from "@/lib/archivos/esquemas"

import { REGLAS_LOGO } from "./logo"
import { normalizarCelularContacto } from "./telefono"

/** Espacios repetidos o en los extremos fuera: así se guarda y se compara. */
function colapsarEspacios(valor: string): string {
  return valor.replace(/\s+/g, " ").trim()
}

// ── Datos de la empresa ──────────────────────────────────────────────────────

/** Régimen de IVA (`datos_facturacion.regimen`), como lo lee Finanzas. */
export const REGIMENES = ["RESPONSABLE_IVA", "NO_RESPONSABLE_IVA"] as const
export type Regimen = (typeof REGIMENES)[number]

export const ETIQUETAS_REGIMEN: Readonly<Record<Regimen, string>> = {
  RESPONSABLE_IVA: "Responsable de IVA",
  NO_RESPONSABLE_IVA: "No responsable de IVA",
}

const LARGO_MAXIMO_REGIMEN = 40

/** Condición tributaria y versión del registro (bloqueo optimista). */
const tributariaYVersion = z.object({
  /** "" = sin informar; se admite el valor guardado aunque no sea de la lista. */
  regimen: z
    .string()
    .trim()
    .max(LARGO_MAXIMO_REGIMEN, "Elige un régimen de la lista."),
  granContribuyente: z.boolean(),
  autorretenedor: z.boolean(),
  actualizadoAt: z.string().min(1, "Falta la versión del registro.").max(64),
})

/**
 * Los campos de `CamposAnunciante` (mismas reglas que el registro interno) y
 * los propios de la empresa. Con la identificación bloqueada (empresa
 * verificada) la acción reemplaza esos campos por los guardados antes de
 * validar: el navegador no puede cambiarlos.
 */
export const esquemaMiEmpresa = z.intersection(
  esquemaAnunciante,
  tributariaYVersion
)

export type EntradaMiEmpresa = z.input<typeof esquemaMiEmpresa>
export type DatosEdicionEmpresa = z.output<typeof esquemaMiEmpresa>

/** Campos del formulario que pueden recibir un error del servidor. */
export const CAMPOS_MI_EMPRESA = [
  ...CAMPOS_ANUNCIANTE,
  "regimen",
  "granContribuyente",
  "autorretenedor",
] as const satisfies readonly (keyof EntradaMiEmpresa)[]

/** Campos de identificación que solo corrige el equipo AMO tras verificar. */
export const CAMPOS_IDENTIFICACION = [
  "razonSocial",
  "paisIso2",
  "nit",
  "digitoVerificacion",
  "identificacionExtranjera",
] as const satisfies readonly (keyof EntradaMiEmpresa)[]

// ── Persona de contacto ──────────────────────────────────────────────────────

export const LIMITES_CONTACTO = {
  nombre: { min: 2, max: 120 },
  correo: { max: 254 },
  celular: { max: 30 },
  direccion: { max: 200 },
} as const

export const esquemaContactoEmpresa = z.object({
  nombre: z
    .string({ error: "Escribe el nombre de la persona de contacto." })
    .overwrite(colapsarEspacios)
    .min(
      LIMITES_CONTACTO.nombre.min,
      "Escribe el nombre de la persona de contacto (al menos 2 caracteres)."
    )
    .max(
      LIMITES_CONTACTO.nombre.max,
      `Máximo ${LIMITES_CONTACTO.nombre.max} caracteres.`
    ),
  correo: z
    .string({ error: "Escribe el correo de la persona de contacto." })
    .trim()
    .toLowerCase()
    .min(1, "Escribe el correo de la persona de contacto.")
    .max(LIMITES_CONTACTO.correo.max, "El correo es demasiado largo.")
    .pipe(z.email({ error: "Escribe un correo válido." })),
  /** Opcional; se guarda normalizado (`+57 300 123 4567`) o `null`. */
  celular: z
    .string()
    .max(LIMITES_CONTACTO.celular.max, "El celular es demasiado largo.")
    .transform((valor, contexto) => {
      const resultado = normalizarCelularContacto(valor)
      if (!resultado.valido) {
        contexto.addIssue({ code: "custom", message: resultado.mensaje })
        return z.NEVER
      }
      return resultado.valor
    }),
  direccion: z
    .string()
    .overwrite(colapsarEspacios)
    .max(
      LIMITES_CONTACTO.direccion.max,
      `Máximo ${LIMITES_CONTACTO.direccion.max} caracteres.`
    )
    .transform((valor) => valor || null),
  /** `updated_at` de la fila; "" mientras no exista (se inserta). */
  version: z
    .string()
    .max(64)
    .transform((valor) => valor || null),
})

export type EntradaContactoEmpresa = z.input<typeof esquemaContactoEmpresa>
export type DatosContactoEmpresa = z.output<typeof esquemaContactoEmpresa>

export const CAMPOS_CONTACTO = [
  "nombre",
  "correo",
  "celular",
  "direccion",
] as const satisfies readonly (keyof EntradaContactoEmpresa)[]

// ── Logo ─────────────────────────────────────────────────────────────────────

/** El logo no lleva miniatura: el navegador no debe pedirla. */
const sinMiniatura = { error: "El logo no lleva miniatura." }

export const esquemaPrepararLogo = esquemaDescripcionArchivo(
  REGLAS_LOGO
).refine((archivo) => !archivo.conMiniatura, sinMiniatura)

export const esquemaConfirmarLogo = esquemaArchivoSubido(REGLAS_LOGO).refine(
  (archivo) => archivo.rutaMiniatura === null,
  sinMiniatura
)

export type EntradaPrepararLogo = z.input<typeof esquemaPrepararLogo>
export type EntradaConfirmarLogo = z.input<typeof esquemaConfirmarLogo>
