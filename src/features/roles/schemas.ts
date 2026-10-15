/**
 * Esquemas zod del módulo de Roles: los MISMOS en el formulario (cliente, con
 * `zodResolver`) y en la Server Action (servidor). Reflejan los CHECK de
 * `roles` (§3.2) para que el error llegue al campo antes de ir a la BD.
 */
import { z } from "zod"

import { CLAVES_PERMISO } from "@/lib/auth/permisos"
import { Constants } from "@/types/database.types"

import { esClaveDeSistema, PATRON_CLAVE_ROL } from "./clave"
import { PATRON_COLOR } from "./paleta"

export const TIPOS_ROL = Constants.public.Enums.rol_tipo
export const LONGITUD_MAXIMA_DESCRIPCION = 300

const id = z.uuid({ error: "Identificador inválido." })

const nombre = z
  .string({ error: "Escribe el nombre del rol." })
  .trim()
  .min(1, "Escribe el nombre del rol.")
  .min(2, "Escribe al menos 2 caracteres.")
  .max(60, "Máximo 60 caracteres.")

const descripcion = z
  .string()
  .trim()
  .max(
    LONGITUD_MAXIMA_DESCRIPCION,
    `Máximo ${LONGITUD_MAXIMA_DESCRIPCION} caracteres.`
  )
  .transform((valor) => (valor === "" ? null : valor))

const color = z
  .string({ error: "Elige un color." })
  .regex(PATRON_COLOR, "Elige un color de la paleta.")
  .transform((valor) => valor.toUpperCase())

const clave = z
  .string({ error: "Escribe la clave." })
  .trim()
  .toUpperCase()
  .min(1, "Escribe la clave del rol.")
  .regex(
    PATRON_CLAVE_ROL,
    "Usa MAYÚSCULAS, números y guion bajo, empezando por una letra (2 a 40)."
  )
  .refine(
    (valor) => !esClaveDeSistema(valor),
    "Esa clave está reservada para un rol de sistema."
  )

const origen = z
  .union([id, z.literal("")])
  .nullable()
  .transform((valor) => valor || null)

/** Todo rol del equipo interno exige verificación en dos pasos (CHECK `roles_mfa_interno_chk`). */
export function mfaObligatoria(tipo: (typeof TIPOS_ROL)[number]): boolean {
  return tipo === "ADMIN"
}

const esquemaDatosRol = z.object({
  nombre,
  descripcion,
  color,
  requiereMfa: z.boolean(),
})

export const esquemaCrearRol = esquemaDatosRol
  .extend({
    clave,
    tipo: z.enum(TIPOS_ROL, { error: "Elige el tipo de rol." }),
    clonarDesde: origen,
  })
  .transform((datos) => ({
    ...datos,
    requiereMfa: mfaObligatoria(datos.tipo) || datos.requiereMfa,
  }))

export const esquemaEditarRol = esquemaDatosRol.extend({ rolId: id })

export type EntradaCrearRol = z.input<typeof esquemaCrearRol>
export type DatosCrearRol = z.output<typeof esquemaCrearRol>
export type EntradaEditarRol = z.input<typeof esquemaEditarRol>

const clavePermiso = z.enum(CLAVES_PERMISO, { error: "Permiso desconocido." })
const listaPermisos = z.array(clavePermiso).max(CLAVES_PERMISO.length)

export const esquemaPermisosRol = z
  .object({ rolId: id, agregar: listaPermisos, quitar: listaPermisos })
  .refine(
    ({ agregar, quitar }) => agregar.length + quitar.length > 0,
    "No hay cambios que guardar."
  )
  .refine(
    ({ agregar, quitar }) => !agregar.some((clave) => quitar.includes(clave)),
    "Un permiso no puede otorgarse y retirarse a la vez."
  )

export type EntradaPermisosRol = z.input<typeof esquemaPermisosRol>

export const esquemaEliminarRol = z.object({
  rolId: id,
  confirmacion: z
    .string()
    .trim()
    .min(1, "Escribe el nombre del rol para confirmar."),
})

export type EntradaEliminarRol = z.input<typeof esquemaEliminarRol>
