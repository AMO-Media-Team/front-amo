/**
 * Errores de la BD al registrar o editar un medio → mensaje para la persona y,
 * si corresponde, el campo del formulario (módulo puro). La interpretación
 * común (códigos `AMO_*` con su `detail` en español, restricciones por nombre
 * exacto y respaldo por SQLSTATE) vive en `@/lib/errores-bd`; aquí solo se
 * suman las restricciones de `medios` y `medio_categorias` y el municipio
 * inhabilitado. Nunca se muestra el mensaje técnico.
 */
import {
  codigoNegocio,
  type ErrorBd,
  interpretarErrorBd,
  type Restricciones,
} from "@/lib/errores-bd"

import { CAMPOS_MEDIO, type CampoMedio, LIMITES_MEDIO } from "./schemas"

export interface ErrorInterpretado {
  mensaje: string
  campo?: CampoMedio
  /** Regla de negocio o restricción conocida: no hace falta registrarlo en el log. */
  esperado: boolean
}

export const MEDIO_DESACTUALIZADO =
  "Otra persona cambió este medio mientras lo editabas. Cierra la hoja, revisa los datos actuales y vuelve a intentarlo."

export const MEDIO_INEXISTENTE =
  "Este medio ya no está disponible: pudo darlo de baja otra persona. Vuelve al listado de medios."

export const CATEGORIAS_NO_DISPONIBLES =
  "Alguna categoría elegida ya no está disponible. Desmárcala (queda señalada al final de la lista) y vuelve a intentarlo."

export const MUNICIPIO_DESCONOCIDO = "Elige un municipio de la lista."

/** El registro se deshizo porque las categorías no se pudieron guardar. */
export const REGISTRO_REVERTIDO =
  "No pudimos guardar las categorías, así que no registramos el medio. Intenta de nuevo en unos segundos."

/** Ni las categorías ni la reversión funcionaron: el medio existe sin ellas. */
export const REGISTRO_SIN_CATEGORIAS =
  "El medio quedó registrado, pero sin sus categorías. Agrégalas desde «Editar datos»."

export const EDICION_SIN_CATEGORIAS =
  "Guardamos los datos del medio, pero no todos los cambios de sus categorías. Vuelve a abrir «Editar datos» para revisarlas e intentarlo de nuevo."

/** Solo cambiaban las categorías y no se pudieron guardar (todas o algunas). */
export const CATEGORIAS_SIN_GUARDAR =
  "No pudimos guardar todos los cambios de categorías. Cierra la hoja y vuelve a abrir «Editar datos» para revisarlas e intentarlo de nuevo."

const MUNICIPIO_NO_HABILITADO =
  "El municipio seleccionado no está habilitado en la plataforma."

const RESTRICCIONES_MEDIO = {
  medios_nombre_chk: {
    mensaje: `El nombre debe tener entre ${LIMITES_MEDIO.nombreMin} y ${LIMITES_MEDIO.nombreMax} caracteres.`,
    campo: "nombre",
  },
  medios_descripcion_audiencia_chk: {
    mensaje: `La descripción admite como máximo ${LIMITES_MEDIO.descripcionMax.toLocaleString("es-CO")} caracteres.`,
    campo: "descripcionAudiencia",
  },
  medios_municipio_codigo_fkey: {
    mensaje: MUNICIPIO_DESCONOCIDO,
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
} as const satisfies Restricciones

function esCampoMedio(campo: string | undefined): campo is CampoMedio {
  return CAMPOS_MEDIO.some((conocido) => conocido === campo)
}

export function interpretarErrorMedio(error: ErrorBd): ErrorInterpretado {
  // Única regla de configuración que alcanza a `medios`: el municipio debe
  // estar habilitado (`fn_validar_municipio_activo`).
  if (codigoNegocio(error) === "AMO_CONFIG_INVALIDA") {
    return {
      mensaje: error.details?.trim() || MUNICIPIO_NO_HABILITADO,
      campo: "municipioCodigo",
      esperado: true,
    }
  }
  const { mensaje, campo, esperado } = interpretarErrorBd(
    error,
    RESTRICCIONES_MEDIO
  )
  return esCampoMedio(campo)
    ? { mensaje, campo, esperado }
    : { mensaje, esperado }
}
