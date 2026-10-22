/**
 * Errores de la BD en «Mi medio» → mensaje para el medio y, si corresponde, el
 * campo del formulario (módulo puro). La interpretación común (códigos `AMO_*`
 * con su `detail`, restricciones por nombre exacto y respaldo por SQLSTATE)
 * vive en `@/lib/errores-bd`; aquí se suman las restricciones de cada
 * escritura y se ubica cada error en su campo. Nunca se muestra el mensaje
 * técnico.
 */
import { LIMITES_MEDIO } from "@/features/gestion-medios/schemas"
import {
  codigoNegocio,
  type ErrorBd,
  interpretarErrorBd,
  type Restricciones,
} from "@/lib/errores-bd"

import { LIMITES_PAGO } from "./schemas"

export interface ErrorInterpretado<C extends string> {
  mensaje: string
  campo?: C
  /** Regla de negocio o restricción conocida: no hace falta registrarlo. */
  esperado: boolean
}

export const PERFIL_DESACTUALIZADO =
  "Tu perfil cambió en otra pestaña o lo actualizó el equipo de AMO. Carga los datos vigentes y vuelve a hacer tus cambios."

export const CATEGORIAS_NO_DISPONIBLES =
  "Alguna categoría elegida ya no está disponible. Desmárcala (queda señalada al final) y vuelve a guardar."

export const PERFIL_SIN_CATEGORIAS =
  "Guardamos tu perfil, pero no los cambios de categorías. Vuelve a intentarlo en unos segundos."

export const PERFIL_SIN_AUDIENCIA =
  "Guardamos tu perfil, pero no todo el origen de tu audiencia. Revisa los porcentajes y vuelve a guardar."

export const SIN_MEDIO =
  "Tu cuenta aún no está vinculada a un medio. Escríbele al equipo de AMO."

export const DOCUMENTO_DUPLICADO =
  "Ese número de documento ya está registrado en otro medio de AMO. Si es tuyo, escríbele al equipo de AMO."

const MUNICIPIO_NO_HABILITADO =
  "Ese municipio no está habilitado en AMO. Elige otro de la lista."

const SUMA_AUDIENCIA = "La suma de tu audiencia no puede pasar de 100 %."

export type CampoErrorPerfil =
  | "nombre"
  | "municipioCodigo"
  | "descripcionAudiencia"
  | "categoriaIds"
  | "audiencia"

const RESTRICCIONES_PERFIL = {
  medios_nombre_chk: {
    mensaje: `El nombre debe tener entre ${LIMITES_MEDIO.nombreMin} y ${LIMITES_MEDIO.nombreMax} caracteres.`,
    campo: "nombre",
  },
  medios_descripcion_audiencia_chk: {
    mensaje: `La descripción admite como máximo ${LIMITES_MEDIO.descripcionMax.toLocaleString("es-CO")} caracteres.`,
    campo: "descripcionAudiencia",
  },
  medios_municipio_codigo_fkey: {
    mensaje: MUNICIPIO_NO_HABILITADO,
    campo: "municipioCodigo",
  },
  medio_categorias_categoria_id_fkey: {
    mensaje: CATEGORIAS_NO_DISPONIBLES,
    campo: "categoriaIds",
  },
  medio_categorias_pkey: {
    mensaje: "Cada categoría se elige una sola vez.",
    campo: "categoriaIds",
  },
  medio_audiencia_paises_suma_chk: { mensaje: SUMA_AUDIENCIA, campo: "audiencia" },
  medio_audiencia_paises_porcentaje_chk: {
    mensaje: "Cada porcentaje debe estar entre 0 y 100 %.",
    campo: "audiencia",
  },
  medio_audiencia_paises_pkey: {
    mensaje: "Cada país va una sola vez.",
    campo: "audiencia",
  },
  medio_audiencia_paises_pais_iso2_fkey: {
    mensaje: "Elige los países de la lista.",
    campo: "audiencia",
  },
} as const satisfies Restricciones

/** Qué tabla escribía la solicitud que falló (ubica el `AMO_CONFIG_INVALIDA`). */
export type EscrituraPerfil = "medio" | "categorias" | "audiencia"

const CAMPO_DE_ESCRITURA: Readonly<Record<EscrituraPerfil, CampoErrorPerfil>> = {
  medio: "municipioCodigo",
  categorias: "categoriaIds",
  audiencia: "audiencia",
}

const RESPALDO_CONFIG: Readonly<Record<EscrituraPerfil, string>> = {
  medio: MUNICIPIO_NO_HABILITADO,
  categorias: CATEGORIAS_NO_DISPONIBLES,
  audiencia: SUMA_AUDIENCIA,
}

function conCampo<C extends string>(
  { mensaje, campo, esperado }: ReturnType<typeof interpretarErrorBd>,
  campos: readonly C[]
): ErrorInterpretado<C> {
  const conocido = campos.find((c) => c === campo)
  return conocido ? { mensaje, campo: conocido, esperado } : { mensaje, esperado }
}

const CAMPOS_ERROR_PERFIL: readonly CampoErrorPerfil[] = [
  "nombre",
  "municipioCodigo",
  "descripcionAudiencia",
  "categoriaIds",
  "audiencia",
]

export function interpretarErrorPerfil(
  error: ErrorBd,
  escritura: EscrituraPerfil
): ErrorInterpretado<CampoErrorPerfil> {
  // Las reglas de configuración que alcanzan al perfil: municipio habilitado
  // (`medios`) y categoría activa (`medio_categorias`).
  if (codigoNegocio(error) === "AMO_CONFIG_INVALIDA") {
    return {
      mensaje: error.details?.trim() || RESPALDO_CONFIG[escritura],
      campo: CAMPO_DE_ESCRITURA[escritura],
      esperado: true,
    }
  }
  return conCampo(
    interpretarErrorBd(error, RESTRICCIONES_PERFIL),
    CAMPOS_ERROR_PERFIL
  )
}

export type CampoErrorPago = "titularNombre" | "numeroDocumento"

const RESTRICCIONES_PAGO = {
  medios_privado_numero_documento_hash_key: {
    mensaje: DOCUMENTO_DUPLICADO,
    campo: "numeroDocumento",
  },
  medios_privado_titular_nombre_chk: {
    mensaje: `El nombre del titular debe tener entre ${LIMITES_PAGO.titularMin} y ${LIMITES_PAGO.titularMax} caracteres.`,
    campo: "titularNombre",
  },
  medios_privado_numero_documento_resumen_chk: {
    mensaje: "Revisa el número de documento.",
    campo: "numeroDocumento",
  },
  medios_privado_datos_pago_resumen_chk:
    "El nombre del banco o la billetera es demasiado largo.",
  medios_privado_pago_completo_chk:
    "Los datos de pago van completos: método, número y entidad.",
} as const satisfies Restricciones

export function interpretarErrorPago(
  error: ErrorBd
): ErrorInterpretado<CampoErrorPago> {
  return conCampo(interpretarErrorBd(error, RESTRICCIONES_PAGO), [
    "titularNombre",
    "numeroDocumento",
  ])
}

/** `enviar_medio_a_verificacion_srv`: su `detail` ya dice qué falta. */
export function interpretarErrorEnvio(error: ErrorBd): ErrorInterpretado<never> {
  const { mensaje, esperado } = interpretarErrorBd(error)
  return { mensaje, esperado }
}
