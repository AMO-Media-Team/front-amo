"use client"

/**
 * Territorio activo en el navegador (React Query sobre las acciones de
 * `features/territorio`). Cambia rara vez (lo ajusta el administrador en
 * Configuración): se guarda diez minutos y lo comparten todos los selectores
 * de la sesión. Un municipio que se desactive mientras tanto lo rechaza la BD
 * al guardar, con un mensaje claro.
 */
import {
  queryOptions,
  skipToken,
  useQueries,
  useQuery,
} from "@tanstack/react-query"

import {
  listarDepartamentosActivos,
  listarMunicipiosActivos,
} from "@/features/territorio/actions"
import type { MunicipioActivo } from "@/features/territorio/tipos"
import type { ResultadoAccion } from "@/lib/result"

export const CLAVES_TERRITORIO = {
  todo: ["territorio"] as const,
  departamentos: ["territorio", "departamentos"] as const,
  municipios: (departamento: string) =>
    ["territorio", "municipios", departamento] as const,
}

const VIGENCIA_MS = 10 * 60_000
const RETENCION_MS = 30 * 60_000

export const MENSAJE_SIN_CONEXION =
  "No hay conexión con el servidor. Revisa tu red e intenta de nuevo."

/** Error con el mensaje listo para la interfaz (en español). */
export class ErrorTerritorio extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "ErrorTerritorio"
  }
}

async function datosDe<T>(
  llamar: () => Promise<ResultadoAccion<T>>
): Promise<T> {
  let resultado: ResultadoAccion<T>
  try {
    resultado = await llamar()
  } catch {
    // Sin red la acción lanza (con un mensaje del navegador en inglés).
    throw new ErrorTerritorio(MENSAJE_SIN_CONEXION)
  }
  if (!resultado.ok) throw new ErrorTerritorio(resultado.error)
  return resultado.datos
}

export function opcionesDepartamentos() {
  return queryOptions({
    queryKey: CLAVES_TERRITORIO.departamentos,
    queryFn: () => datosDe(listarDepartamentosActivos),
    staleTime: VIGENCIA_MS,
    gcTime: RETENCION_MS,
    retry: 1,
    refetchOnWindowFocus: false,
  })
}

export function opcionesMunicipios(departamento: string) {
  return queryOptions({
    queryKey: CLAVES_TERRITORIO.municipios(departamento),
    queryFn: () => datosDe(() => listarMunicipiosActivos(departamento)),
    staleTime: VIGENCIA_MS,
    gcTime: RETENCION_MS,
    retry: 1,
    refetchOnWindowFocus: false,
  })
}

export function useDepartamentosActivos() {
  return useQuery(opcionesDepartamentos())
}

export function useMunicipiosActivos(departamento: string | null) {
  return useQuery({
    ...opcionesMunicipios(departamento ?? ""),
    queryFn: departamento
      ? opcionesMunicipios(departamento).queryFn
      : skipToken,
  })
}

export interface MunicipiosDeVarios {
  /** Municipios activos conocidos, por código. */
  porCodigo: ReadonlyMap<string, MunicipioActivo>
  /** Departamentos cuya lista aún se está cargando. */
  cargando: ReadonlySet<string>
  /** Departamentos cuya lista no se pudo cargar. */
  conError: ReadonlySet<string>
}

/** Municipios de varios departamentos a la vez (nombres de las fichas elegidas). */
export function useMunicipiosDeVarios(
  departamentos: readonly string[]
): MunicipiosDeVarios {
  return useQueries({
    queries: departamentos.map((departamento) =>
      opcionesMunicipios(departamento)
    ),
    combine: (resultados) => {
      const porCodigo = new Map<string, MunicipioActivo>()
      const cargando = new Set<string>()
      const conError = new Set<string>()
      resultados.forEach((resultado, indice) => {
        const departamento = departamentos[indice]
        if (resultado.isPending) cargando.add(departamento)
        if (resultado.isError) conError.add(departamento)
        for (const municipio of resultado.data ?? []) {
          porCodigo.set(municipio.codigo, municipio)
        }
      })
      return { porCodigo, cargando, conError }
    },
  })
}

/** Índice por código, para poner nombre a lo elegido. */
export function indicePorCodigo<T extends { codigo: string }>(
  lista: readonly T[] | undefined
): ReadonlyMap<string, T> {
  return new Map((lista ?? []).map((elemento) => [elemento.codigo, elemento]))
}

export type ConsultaDepartamentos = ReturnType<typeof useDepartamentosActivos>
