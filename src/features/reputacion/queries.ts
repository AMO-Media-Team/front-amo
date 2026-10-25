import "server-only"

import { cache } from "react"

import { fallar } from "@/features/auditoria/servidor"
import {
  calidadDeCuentas,
  type ResumenMultiplicador,
  resumenMultiplicador,
} from "@/features/calidad-medio/calidad"
import {
  cuentasCalidad,
  parametrosCalidad,
} from "@/features/calidad-medio/queries"
import { crearClienteServidor } from "@/lib/supabase/server"

import { reputacionDesdeRpc } from "./adaptador"
import type { Reputacion } from "./tipos"

/**
 * Lecturas de la reputación del medio (MED-016) con el cliente del USUARIO:
 * `mi_reputacion()` es definer, exige `inicio.medio` y filtra por
 * `mi_medio_id()`; trae también el mínimo de casos vigente, que el medio no
 * puede leer en `configuracion`. Un error se lanza y lo recoge el límite de
 * error de la sección.
 */

/** La reputación a hoy (una lectura por solicitud); `null` sin medio visible. */
export const miReputacion = cache(async (): Promise<Reputacion | null> => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc("mi_reputacion")
  if (error) fallar("consultar tu reputación", error)
  return reputacionDesdeRpc(data[0])
})

/**
 * El multiplicador vigente más bajo de las cuentas del medio, con su nota (el
 * cálculo de «Calidad de tus cuentas»). Es un dato de apoyo: si la lectura
 * falla devuelve `null` y la sección de calidad muestra el error por su cuenta.
 */
export async function resumenCalidadMedio(
  medioId: string,
  ahora: Date
): Promise<ResumenMultiplicador | null> {
  try {
    const [cuentas, parametros] = await Promise.all([
      cuentasCalidad(medioId),
      parametrosCalidad(),
    ])
    return resumenMultiplicador(calidadDeCuentas(cuentas, parametros), ahora)
  } catch {
    return null
  }
}
