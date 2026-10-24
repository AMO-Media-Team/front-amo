import type { ReactNode } from "react"

import { aplicaVerificacion } from "../decision"
import {
  VerificarAsignacion,
  type VerificarAsignacionProps,
} from "./verificar-asignacion"

/**
 * «Verificar» para la ficha de la asignación (cabecera y pie fijo del
 * celular), o nada si no aplica: lo decide el servidor, porque el pie se
 * pinta en cuanto recibe algo, aunque `VerificarAsignacion` no muestre nada.
 */
export function verificarEnFicha(
  props: VerificarAsignacionProps
): ReactNode | undefined {
  return aplicaVerificacion(props.estado, props.puedeVerificar) ? (
    <VerificarAsignacion {...props} />
  ) : undefined
}
