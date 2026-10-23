/**
 * Errores de «Mi empresa» → mensaje para la persona y, si corresponde, el
 * campo del formulario (módulo puro). Los datos de la empresa usan la misma
 * interpretación que el registro interno (`interpretarErrorAnunciante`: DV del
 * NIT, municipio, restricciones de `anunciantes`); el contacto y el envío, el
 * catálogo común con las restricciones de `anunciantes_privado`. Nunca se
 * muestra el mensaje técnico.
 */
import {
  type ErrorAnunciante,
  esNitRepetido,
  interpretarErrorAnunciante,
  NIT_REPETIDO,
  SIN_PERMISO,
} from "@/features/gestion-anunciantes/errores"
import {
  type ErrorBd,
  interpretarErrorBd,
  MENSAJE_INESPERADO,
  type Restricciones,
} from "@/lib/errores-bd"

import { LIMITES_CONTACTO } from "./schemas"

export const SIN_EMPRESA =
  "Tu cuenta no está vinculada a una empresa. Escríbele al equipo de AMO para revisarla."

export const SIN_PERMISO_EMPRESA =
  "No tienes permiso para editar los datos de tu empresa, o tu sesión necesita verificarse de nuevo. Vuelve a ingresar si el problema continúa."

export const EMPRESA_DESACTUALIZADA =
  "Otra persona de tu equipo o el equipo de AMO actualizó los datos de la empresa mientras los editabas. Carga los datos vigentes y vuelve a hacer tus cambios."

/** AMO verificó la empresa mientras se corregía su identificación. */
export const IDENTIFICACION_YA_VERIFICADA =
  "Tu empresa ya está verificada: la razón social y la identificación tributaria solo las corrige el equipo de AMO. Carga los datos vigentes y guarda lo demás."

export const CONTACTO_DESACTUALIZADO =
  "Otra persona de tu equipo actualizó el contacto mientras lo editabas. Carga los datos vigentes y vuelve a hacer tus cambios."

export const CONTACTO_INCOMPLETO =
  "Antes de enviar, completa la persona de contacto: nombre y correo."

export const LOGO_NO_COINCIDE =
  "El logo recibido no corresponde a tu empresa. Súbelo de nuevo."

/**
 * NIT ya registrado por otra empresa. La empresa no ve a las demás, así que
 * no se nombra a quién lo tiene.
 */
export const NIT_DE_OTRA_EMPRESA = `${NIT_REPETIDO.replace(/\.$/, "")}. Si es el de tu empresa, escríbele al equipo de AMO.`

export interface ErrorInterpretado<C extends string> {
  mensaje: string
  campo?: C
  /** Regla de negocio o restricción conocida: no hace falta registrarlo. */
  esperado: boolean
}

/**
 * Datos de la empresa: mismos mensajes y campos que el registro interno, con
 * los textos de permiso y de NIT repetido dichos a la propia empresa.
 */
export function interpretarErrorEmpresa(
  error: ErrorBd
): ErrorAnunciante & { esperado: boolean } {
  const interpretado = interpretarErrorAnunciante(error)
  if (esNitRepetido(error)) {
    return { mensaje: NIT_DE_OTRA_EMPRESA, campo: "nit", esperado: true }
  }
  if (interpretado.mensaje === SIN_PERMISO) {
    return { mensaje: SIN_PERMISO_EMPRESA, esperado: true }
  }
  return {
    ...interpretado,
    esperado: interpretado.mensaje !== MENSAJE_INESPERADO,
  }
}

export type CampoErrorContacto = "nombre" | "correo" | "celular" | "direccion"

const RESTRICCIONES_CONTACTO = {
  anunciantes_privado_contacto_nombre_chk: {
    mensaje: `El nombre debe tener entre ${LIMITES_CONTACTO.nombre.min} y ${LIMITES_CONTACTO.nombre.max} caracteres.`,
    campo: "nombre",
  },
  anunciantes_privado_contacto_email_chk: {
    mensaje: "Escribe un correo válido.",
    campo: "correo",
  },
  anunciantes_privado_contacto_celular_chk: {
    mensaje:
      "Revisa el celular: solo números, con el indicativo si es de otro país.",
    campo: "celular",
  },
  anunciantes_privado_direccion_chk: {
    mensaje: `La dirección admite hasta ${LIMITES_CONTACTO.direccion.max} caracteres.`,
    campo: "direccion",
  },
  anunciantes_privado_pkey: CONTACTO_DESACTUALIZADO,
} as const satisfies Restricciones

const CAMPOS_ERROR_CONTACTO: readonly CampoErrorContacto[] = [
  "nombre",
  "correo",
  "celular",
  "direccion",
]

export function interpretarErrorContacto(
  error: ErrorBd
): ErrorInterpretado<CampoErrorContacto> {
  const { mensaje, campo, esperado } = interpretarErrorBd(
    error,
    RESTRICCIONES_CONTACTO
  )
  const conocido = CAMPOS_ERROR_CONTACTO.find((c) => c === campo)
  return conocido
    ? { mensaje, campo: conocido, esperado }
    : { mensaje, esperado }
}

/** `enviar_anunciante_a_verificacion_srv` y el logo: su `detail` ya dice qué pasó. */
export function interpretarErrorGeneral(
  error: ErrorBd
): ErrorInterpretado<never> {
  const { mensaje, esperado } = interpretarErrorBd(error)
  return { mensaje, esperado }
}
