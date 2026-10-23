import "server-only"

/**
 * Piezas de servidor de las acciones del paquete creativo (no son acciones):
 * leer con la sesión la versión que se va a cambiar con su oferta y su
 * formato, revalidar un archivo contra el formato y los topes vigentes, y
 * registrar el log sin datos personales.
 */
import { evaluarArchivo } from "@/lib/archivos/validar"
import type { DescripcionArchivo } from "@/lib/archivos/tipos"
import { type ErrorBd, MENSAJE_INESPERADO } from "@/lib/errores-bd"
import { fallo, type ResultadoFallo } from "@/lib/result"
import type { crearClienteServidor } from "@/lib/supabase/server"

import { interpretarErrorCreativo, MENSAJES_CREATIVO } from "./errores"
import {
  aVersionCreativo,
  COLUMNAS_CREATIVO,
  esPublicada,
  type FilaCreativo,
  versionEditable,
} from "./filas"
import { aFormatoOferta, maximoArchivos, reglasCreativo } from "./formatos"
import { mensajeMaximo } from "./paquete"
import { limitesCreativo } from "./queries"
import type {
  EstadoOferta,
  FormatoOferta,
  LimitesCreativo,
  VersionCreativo,
} from "./tipos"

export type ClienteUsuario = Awaited<ReturnType<typeof crearClienteServidor>>

/** Log de servidor sin datos personales: operación y código. */
export function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[creativos] ${operacion} falló (${codigo})`)
}

export function falloBd(operacion: string, error: ErrorBd): ResultadoFallo {
  const { mensaje, esperado } = interpretarErrorCreativo(error)
  if (!esperado) informar(operacion, error)
  return fallo(mensaje)
}

export function falloInesperado(
  operacion: string,
  error: unknown
): ResultadoFallo {
  informar(operacion, error)
  return fallo(MENSAJE_INESPERADO)
}

/** La versión que se va a cambiar, con lo necesario para validar contra su formato. */
export interface Edicion {
  version: VersionCreativo
  ofertaId: string
  estadoOferta: EstadoOferta
  formato: FormatoOferta
  limites: LimitesCreativo
}

const COLUMNAS_EDICION =
  `${COLUMNAS_CREATIVO}, oferta:ofertas!creativos_oferta_id_fkey ( id, estado, deleted_at, formato:formatos!ofertas_formato_fkey ( id, plataforma, clave, nombre, requisitos ) )` as const

type FilaEdicion = FilaCreativo & {
  oferta: {
    id: string
    estado: EstadoOferta
    deleted_at: string | null
    formato: Parameters<typeof aFormatoOferta>[0] | null
  } | null
}

/** Por qué no se puede cambiar esta versión con la oferta en ese estado. */
function motivoNoEditable(
  version: VersionCreativo,
  estado: EstadoOferta
): string {
  if (estado === "EN_REVISION") return MENSAJES_CREATIVO.enRevision
  if (esPublicada(estado)) {
    return version.pendiente
      ? MENSAJES_CREATIVO.noEditable
      : MENSAJES_CREATIVO.publicada
  }
  return version.vigente
    ? MENSAJES_CREATIVO.cerrada
    : MENSAJES_CREATIVO.noEditable
}

/**
 * Lee con la sesión (RLS) una versión del creativo, su oferta y su formato, y
 * comprueba que se puede cambiar (la misma regla que las políticas de
 * escritura, que la BD vuelve a imponer). Con `ofertaId`, además, que la
 * versión sea de esa oferta.
 */
export async function leerEdicion(
  supabase: ClienteUsuario,
  creativoId: string,
  ofertaId?: string
): Promise<{ ok: true; edicion: Edicion } | ResultadoFallo> {
  const [{ data, error }, limites] = await Promise.all([
    supabase
      .from("creativos")
      .select(COLUMNAS_EDICION)
      .eq("id", creativoId)
      .maybeSingle(),
    limitesCreativo(),
  ])
  if (error) return falloBd("leer el creativo", error)
  const fila = data as FilaEdicion | null
  if (!fila?.oferta?.formato || (ofertaId && fila.oferta_id !== ofertaId)) {
    return fallo(MENSAJES_CREATIVO.creativoNoEncontrado)
  }
  const version = aVersionCreativo(fila)
  const estado = fila.oferta.estado
  if (fila.oferta.deleted_at !== null) return fallo(MENSAJES_CREATIVO.cerrada)
  if (!versionEditable(version, estado)) {
    return fallo(motivoNoEditable(version, estado))
  }
  return {
    ok: true,
    edicion: {
      version,
      ofertaId: fila.oferta_id,
      estadoOferta: estado,
      formato: aFormatoOferta(fila.oferta.formato),
      limites,
    },
  }
}

/**
 * Revalida en el servidor lo que el navegador declaró de un archivo contra el
 * formato y los topes vigentes (MIME del tipo, peso, proporción, duración) y
 * que aún quepa en la versión. `null` si cumple; si no, el mensaje.
 */
export function problemaArchivo(
  edicion: Edicion,
  archivo: Pick<
    DescripcionArchivo,
    "nombre" | "tipo" | "tamano" | "dimensiones" | "duracionSeg"
  >,
  { contarNuevo = true }: { contarNuevo?: boolean } = {}
): string | null {
  const { formato, version, limites } = edicion
  const resultado = evaluarArchivo(
    archivo,
    reglasCreativo(formato, version.tipo, limites)
  )
  if (!resultado.ok) return resultado.mensaje
  const maximo = maximoArchivos(formato)
  const cantidad = version.archivos.length + (contarNuevo ? 1 : 0)
  return cantidad > maximo ? mensajeMaximo(maximo) : null
}
