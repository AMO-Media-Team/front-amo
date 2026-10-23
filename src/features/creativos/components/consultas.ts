"use client"

/**
 * El paquete creativo en el navegador (React Query sobre las acciones de
 * `features/creativos`): lo que pinta el panel de una oferta y las URL
 * firmadas de los archivos de una versión, que se renuevan antes de vencer.
 */
import {
  type QueryClient,
  queryOptions,
  skipToken,
  useQuery,
} from "@tanstack/react-query"

import { FRACCION_RENOVACION } from "@/lib/archivos/subida"
import type { ResultadoAccion } from "@/lib/result"

import { firmarArchivosVersion, leerCreativoEditable } from "../actions"
import type { DatosCreativo, FirmasVersion, VersionCreativo } from "../tipos"

export const CLAVES_CREATIVO = {
  todo: ["creativos"] as const,
  datos: (ofertaId: string) => ["creativos", "datos", ofertaId] as const,
  firmas: (creativoId: string, archivos: string) =>
    ["creativos", "firmas", creativoId, archivos] as const,
}

export const MENSAJE_SIN_CONEXION =
  "No hay conexión con el servidor. Revisa tu red e intenta de nuevo."

/** Error con el mensaje listo para la interfaz (en español). */
export class ErrorCreativo extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "ErrorCreativo"
  }
}

/** Resultado de una acción, o el error con su mensaje (sin red la acción lanza). */
export async function datosDe<T>(
  llamar: () => Promise<ResultadoAccion<T>>
): Promise<T> {
  let resultado: ResultadoAccion<T>
  try {
    resultado = await llamar()
  } catch {
    throw new ErrorCreativo(MENSAJE_SIN_CONEXION)
  }
  if (!resultado.ok) throw new ErrorCreativo(resultado.error)
  return resultado.datos
}

export function opcionesDatosCreativo(ofertaId: string) {
  return queryOptions({
    queryKey: CLAVES_CREATIVO.datos(ofertaId),
    queryFn: () => datosDe(() => leerCreativoEditable({ ofertaId })),
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  })
}

export function useDatosCreativo(ofertaId: string) {
  return useQuery(opcionesDatosCreativo(ofertaId))
}

/** Funde un cambio en lo que pinta el panel de la oferta. */
export function actualizarDatos(
  cliente: QueryClient,
  ofertaId: string,
  cambiar: (datos: DatosCreativo) => DatosCreativo
): void {
  cliente.setQueryData<DatosCreativo>(
    CLAVES_CREATIVO.datos(ofertaId),
    (previos) => (previos ? cambiar(previos) : previos)
  )
}

const VIGENCIA_SUPUESTA_S = 60

function renovarEn(firmas: FirmasVersion | undefined): number {
  return (
    (firmas?.vigenciaSegundos ?? VIGENCIA_SUPUESTA_S) *
    1000 *
    FRACCION_RENOVACION
  )
}

/**
 * URL firmadas (original y miniatura) de los archivos de una versión. Cambian
 * de clave cuando cambian los archivos y se vuelven a pedir al consumir el
 * 80 % de su vigencia, solo mientras la pestaña está visible.
 */
export function useFirmasVersion(
  version: Pick<VersionCreativo, "id" | "archivos"> | null
) {
  const ids = version?.archivos.map((archivo) => archivo.id).join(",") ?? ""
  return useQuery({
    queryKey: CLAVES_CREATIVO.firmas(version?.id ?? "", ids),
    queryFn:
      version && ids
        ? () => datosDe(() => firmarArchivosVersion({ creativoId: version.id }))
        : skipToken,
    staleTime: (consulta) => renovarEn(consulta.state.data),
    refetchInterval: (consulta) => renovarEn(consulta.state.data),
    retry: 1,
  })
}
