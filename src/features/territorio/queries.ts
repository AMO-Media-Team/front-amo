import "server-only"

import { crearClienteServidor } from "@/lib/supabase/server"

import {
  aDepartamento,
  aMunicipio,
  ordenarDepartamentos,
  ordenarMunicipios,
} from "./presentacion"
import type { DepartamentoActivo, MunicipioActivo } from "./tipos"

/**
 * Lecturas del territorio activo con el cliente del USUARIO (JWT + RLS: los
 * catálogos geo los lee cualquier sesión válida). Un error se lanza; la
 * acción lo convierte en un mensaje para la persona.
 */

function fallar(operacion: string, error: { code?: string | null }): never {
  throw new Error(`No se pudo ${operacion} (${error.code ?? "sin código"}).`)
}

export async function departamentosActivos(): Promise<DepartamentoActivo[]> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from("departamentos")
    .select("codigo, nombre, nombre_corto, region")
    .eq("activo", true)
  if (error) fallar("leer los departamentos", error)
  return ordenarDepartamentos(data.map(aDepartamento))
}

/**
 * Municipios activos de un departamento activo. Desactivar un departamento no
 * desactiva sus municipios, pero la BD exige ambos activos (`medio_elegible`,
 * registro de medios y anunciantes): con el departamento inactivo, nada.
 */
export async function municipiosActivos(
  departamento: string
): Promise<MunicipioActivo[]> {
  const supabase = await crearClienteServidor()
  const [estado, municipios] = await Promise.all([
    supabase
      .from("departamentos")
      .select("activo")
      .eq("codigo", departamento)
      .maybeSingle(),
    supabase
      .from("municipios")
      .select("codigo, nombre, departamento_codigo, es_capital")
      .eq("departamento_codigo", departamento)
      .eq("activo", true),
  ])
  if (estado.error) fallar("leer el departamento", estado.error)
  if (municipios.error) fallar("leer los municipios", municipios.error)
  if (!estado.data?.activo) return []
  return ordenarMunicipios(municipios.data.map(aMunicipio))
}
