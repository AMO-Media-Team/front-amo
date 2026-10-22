"use server"

/**
 * Lectura del territorio activo para los selectores (`SelectorTerritorio`).
 * Son acciones (no una API) para reutilizar el DAL: sesión al día y perfil
 * activo antes de leer. El cliente las cachea con React Query.
 */
import "server-only"

import { requerirUsuario } from "@/lib/auth/dal"
import { desdeErrorZod, exito, fallo, type ResultadoAccion } from "@/lib/result"

import { departamentosActivos, municipiosActivos } from "./queries"
import { esquemaCodigoDepartamento } from "./schemas"
import type { DepartamentoActivo, MunicipioActivo } from "./tipos"

function informar(operacion: string, error: unknown): void {
  const detalle = error instanceof Error ? error.message : "error desconocido"
  console.error(`[territorio] ${operacion} falló: ${detalle}`)
}

export async function listarDepartamentosActivos(): Promise<
  ResultadoAccion<DepartamentoActivo[]>
> {
  await requerirUsuario()
  try {
    return exito(await departamentosActivos())
  } catch (error) {
    informar("listarDepartamentosActivos", error)
    return fallo(
      "No pudimos cargar los departamentos. Intenta de nuevo en unos segundos."
    )
  }
}

export async function listarMunicipiosActivos(
  departamento: string
): Promise<ResultadoAccion<MunicipioActivo[]>> {
  await requerirUsuario()
  const validacion = esquemaCodigoDepartamento.safeParse(departamento)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  try {
    return exito(await municipiosActivos(validacion.data))
  } catch (error) {
    informar("listarMunicipiosActivos", error)
    return fallo(
      "No pudimos cargar los municipios. Intenta de nuevo en unos segundos."
    )
  }
}
