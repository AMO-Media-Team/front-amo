/**
 * Esquemas zod del módulo de Usuarios: los MISMOS en el formulario (cliente,
 * con `zodResolver`) y en la Server Action (servidor). Módulo puro.
 */
import { z } from "zod"

import type { RolAsignable, TipoRol } from "./tipos"

export const LONGITUD_MINIMA_MOTIVO = 5
export const LONGITUD_MAXIMA_MOTIVO = 500
export const TEXTO_CONFIRMAR_ELIMINAR = "ELIMINAR"
/** Tope de filas por acción masiva (una llamada por usuario en la BD). */
export const MAXIMO_MASIVO = 100

const id = z.uuid({ error: "Identificador inválido." })

const nombre = z
  .string({ error: "Escribe el nombre." })
  .trim()
  .min(2, "Escribe al menos 2 caracteres.")
  .max(120, "Máximo 120 caracteres.")

const correo = z
  .string({ error: "Escribe el correo." })
  .trim()
  .toLowerCase()
  .min(1, "Escribe el correo.")
  .max(254, "El correo es demasiado largo.")
  .pipe(z.email("Escribe un correo válido."))

/**
 * Celular opcional: se aceptan espacios, guiones, puntos y paréntesis al
 * escribir, y se guarda como `+57 300 123 4567` o `3001234567` (CHECK de
 * `perfiles.celular`: `^\+?[0-9 ]{7,20}$`).
 */
export function normalizarCelular(valor: string): string {
  return valor
    .replace(/[-.()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const celular = z
  .string()
  .transform(normalizarCelular)
  .refine(
    (valor) => valor === "" || /^\+?[0-9 ]{7,20}$/.test(valor),
    "Escribe solo números (7 a 20), con + opcional al inicio."
  )
  .transform((valor) => (valor === "" ? null : valor))

const organizacionId = z
  .union([id, z.literal("")])
  .nullable()
  .transform((valor) => valor || null)

export const esquemaDatosUsuario = z.object({
  nombre,
  celular,
  rolId: z.string({ error: "Elige un rol." }).min(1, "Elige un rol.").pipe(id),
  organizacionId,
})

export const esquemaCrearUsuario = esquemaDatosUsuario.extend({
  email: correo,
  metodo: z.enum(["ENLACE", "CONTRASENA"]),
})

export const esquemaEditarUsuario = esquemaDatosUsuario.extend({
  usuarioId: id,
})

export type EntradaCrearUsuario = z.input<typeof esquemaCrearUsuario>
export type DatosCrearUsuario = z.output<typeof esquemaCrearUsuario>
export type EntradaEditarUsuario = z.input<typeof esquemaEditarUsuario>
export type DatosEditarUsuario = z.output<typeof esquemaEditarUsuario>

const ORGANIZACION_POR_TIPO: Partial<Record<TipoRol, string>> = {
  ANUNCIANTE: "Elige el anunciante al que pertenece.",
  MEDIO: "Elige el medio al que pertenece.",
}

/** ¿El tipo de rol exige una organización (anunciante o medio)? */
export function exigeOrganizacion(tipo: TipoRol | undefined): boolean {
  return tipo !== undefined && tipo in ORGANIZACION_POR_TIPO
}

/**
 * Reglas que dependen de los roles que el actor puede asignar (anti-escalada,
 * §5.4) y del tipo del rol elegido (organización obligatoria para anunciante y
 * medio; ninguna para internos). La BD las garantiza igual (trigger guardián).
 */
export function conReglasDeRol<
  T extends z.ZodType<{ rolId: string; organizacionId: string | null }>,
>(esquema: T, roles: readonly Pick<RolAsignable, "id" | "tipo">[]) {
  return esquema
    .superRefine((datos, contexto) => {
      const rol = roles.find((candidato) => candidato.id === datos.rolId)
      if (!rol) {
        contexto.addIssue({
          code: "custom",
          path: ["rolId"],
          message: "No puedes asignar ese rol.",
        })
        return
      }
      const mensaje = ORGANIZACION_POR_TIPO[rol.tipo]
      if (mensaje && !datos.organizacionId) {
        contexto.addIssue({
          code: "custom",
          path: ["organizacionId"],
          message: mensaje,
        })
      }
    })
    .transform((datos) => {
      const rol = roles.find((candidato) => candidato.id === datos.rolId)
      // Un rol interno nunca lleva organización (coherencia rol ↔ organización).
      return exigeOrganizacion(rol?.tipo)
        ? datos
        : { ...datos, organizacionId: null }
    })
}

export const esquemaUsuarioId = z.object({ usuarioId: id })

export const esquemaMotivo = z.object({
  usuarioId: id,
  motivo: z
    .string({ error: "Escribe el motivo." })
    .trim()
    .min(
      LONGITUD_MINIMA_MOTIVO,
      `Describe el motivo (al menos ${LONGITUD_MINIMA_MOTIVO} caracteres).`
    )
    .max(
      LONGITUD_MAXIMA_MOTIVO,
      `Máximo ${LONGITUD_MAXIMA_MOTIVO} caracteres.`
    ),
})

export type EntradaMotivo = z.input<typeof esquemaMotivo>

export const esquemaEliminar = z.object({
  usuarioId: id,
  confirmacion: z
    .string()
    .trim()
    .refine(
      (valor) => valor === TEXTO_CONFIRMAR_ELIMINAR,
      `Escribe ${TEXTO_CONFIRMAR_ELIMINAR} para confirmar.`
    ),
})

export const esquemaMasivo = z.object({
  usuarioIds: z
    .array(id)
    .min(1, "Selecciona al menos un usuario.")
    .max(MAXIMO_MASIVO, `Selecciona como máximo ${MAXIMO_MASIVO} usuarios.`),
})

export const esquemaExportacion = z.object({
  formato: z.enum(["csv", "xlsx"]),
  filas: z.number().int().min(0).max(1000),
})
