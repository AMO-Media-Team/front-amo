import "server-only"

/**
 * Lecturas de «Calidad de tus cuentas» (PRC-003, PRC-004). Las cuentas se leen
 * con la sesión del medio (la RLS solo le muestra las suyas, con lo que dejó
 * el último recálculo semanal). Los parámetros `calidad.*` no son públicos en
 * `configuracion`: se leen como servicio, después de la compuerta del DAL de
 * la página (como los de «Mis cuentas»), porque no son datos sensibles y el
 * medio necesita conocerlos para entender su multiplicador. Si no se pueden
 * leer rigen los valores de la semilla (docs/modelo-datos.md §7).
 */
import { cache } from "react"

import { fallar, informar } from "@/features/auditoria/servidor"
import { crearClienteAdminOpcional } from "@/lib/supabase/admin"
import { crearClienteServidor } from "@/lib/supabase/server"

import {
  CLAVES_CALIDAD,
  PARAMETROS_CALIDAD_POR_DEFECTO,
  parametrosDesdeConfiguracion,
} from "./calidad"
import type { CuentaCalidad, ParametrosCalidad } from "./tipos"

/** Parámetros vigentes del multiplicador (una lectura por solicitud). */
export const parametrosCalidad = cache(async (): Promise<ParametrosCalidad> => {
  const admin = await crearClienteAdminOpcional()
  if (!admin) return PARAMETROS_CALIDAD_POR_DEFECTO
  const { data, error } = await admin
    .from("configuracion")
    .select("clave, valor")
    .in("clave", Object.values(CLAVES_CALIDAD))
  if (error) {
    informar("leer los parámetros de calidad", error)
    return PARAMETROS_CALIDAD_POR_DEFECTO
  }
  return parametrosDesdeConfiguracion(data)
})

/** `numeric` llega como número o como texto según su tamaño. */
function cifra(valor: number | string | null): number | null {
  if (valor === null || valor === "") return null
  const numero = typeof valor === "number" ? valor : Number(valor)
  return Number.isFinite(numero) ? numero : null
}

/**
 * Cuentas verificadas del medio con su calidad. Las que aún no se verifican
 * no entran: no pueden aceptar ofertas y no tienen multiplicador que explicar.
 */
export const cuentasCalidad = cache(
  async (medioId: string): Promise<CuentaCalidad[]> => {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("cuentas_sociales")
      .select(
        `id, plataforma, handle, seguidores_verificados, alcance_mediano, indice_calidad, indice_franja,
         multiplicador_calidad, multiplicador_proximo, multiplicador_proximo_desde,
         publicaciones_verificadas_count, multiplicador_calculado_at,
         franja:franjas(clave, nombre)`
      )
      .eq("medio_id", medioId)
      .eq("verificada", true)
      .is("deleted_at", null)
    if (error) fallar("leer la calidad de tus cuentas", error)
    return data.map((fila): CuentaCalidad => ({
      id: fila.id,
      plataforma: fila.plataforma,
      handle: fila.handle,
      seguidores: fila.seguidores_verificados,
      franja: fila.franja
        ? { clave: fila.franja.clave, nombre: fila.franja.nombre }
        : null,
      alcanceMediano: fila.alcance_mediano,
      indice: cifra(fila.indice_calidad),
      indiceFranja: cifra(fila.indice_franja),
      multiplicador: cifra(fila.multiplicador_calidad) ?? 1,
      proximo: cifra(fila.multiplicador_proximo),
      proximoDesde: fila.multiplicador_proximo_desde,
      publicacionesVerificadas: fila.publicaciones_verificadas_count,
      calculadoAt: fila.multiplicador_calculado_at,
    }))
  }
)
