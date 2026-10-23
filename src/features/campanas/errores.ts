/**
 * Errores de la BD en las campañas → mensaje y campo del formulario (módulo
 * puro). Las reglas de negocio llegan como `AMO_*` con su `detail` ya escrito
 * para la persona; aquí solo se decide en qué campo mostrarlo.
 */
import {
  type ErrorBd,
  type ErrorBdInterpretado,
  interpretarErrorBd,
  type Restricciones,
} from "@/lib/errores-bd"

import { type CampoCampana, mensajePresupuestoMinimo } from "./schemas"

export const CAMPANA_DESACTUALIZADA =
  "Alguien de tu equipo cambió esta campaña mientras la editabas. Carga los datos vigentes y vuelve a aplicar tus cambios."

export const CAMPANA_NO_EDITABLE =
  "Esta campaña ya no se puede editar: solo se cambian las campañas en borrador o activas."

export const SIN_EMPRESA =
  "Tu cuenta aún no está vinculada a una empresa. Escríbele al equipo de AMO."

export const CAMPANA_NO_ENCONTRADA =
  "No encontramos la campaña o ya no tienes acceso a ella. Actualiza la página."

type CampoError = CampoCampana

const RESTRICCIONES_CAMPANA: Restricciones = {
  campanas_nombre_chk: {
    campo: "nombre" satisfies CampoError,
    mensaje: "El nombre debe tener entre 3 y 120 caracteres.",
  },
  campanas_marca_chk: {
    campo: "marca" satisfies CampoError,
    mensaje: "La marca debe tener entre 1 y 80 caracteres.",
  },
  campanas_objetivo_chk: {
    campo: "objetivo" satisfies CampoError,
    mensaje: "El objetivo admite hasta 500 caracteres.",
  },
  campanas_fechas_chk: {
    campo: "fechaFin" satisfies CampoError,
    mensaje: "La fecha de fin no puede ser anterior a la de inicio.",
  },
  campanas_presupuesto_total_chk: {
    campo: "presupuesto" satisfies CampoError,
    mensaje: "El presupuesto debe ser mayor que cero.",
  },
  campanas_presupuesto_comprometido_chk: {
    campo: "presupuesto" satisfies CampoError,
    mensaje:
      "El presupuesto no puede quedar por debajo de lo ya comprometido en cupos aceptados.",
  },
}

/** Códigos de negocio que pertenecen a un campo del formulario. */
const CAMPO_POR_CODIGO: Readonly<Record<string, CampoError>> = {
  AMO_PRESUPUESTO_CAMPANA: "presupuesto",
}

/**
 * `AMO_PRESUPUESTO_CAMPANA` al editar: la BD no deja el total por debajo de
 * lo que reservan las ofertas en revisión o publicadas ni de los cupos
 * aceptados. Con el piso vigente se dice la cifra, igual que el formulario;
 * sin él, queda el detalle de la BD.
 */
export function mensajePresupuestoCampana(
  error: ErrorBd,
  minimo: number | null
): string {
  return minimo !== null && Number.isFinite(minimo) && minimo > 0
    ? mensajePresupuestoMinimo(minimo)
    : interpretarErrorCampana(error).mensaje
}

export function interpretarErrorCampana(error: ErrorBd): ErrorBdInterpretado {
  const interpretado = interpretarErrorBd(error, RESTRICCIONES_CAMPANA)
  const campo = interpretado.codigo
    ? CAMPO_POR_CODIGO[interpretado.codigo]
    : undefined
  return campo ? { ...interpretado, campo } : interpretado
}
