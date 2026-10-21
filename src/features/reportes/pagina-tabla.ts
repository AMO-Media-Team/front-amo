/**
 * Página de la tabla de detalle de cada reporte: el servidor lee la búsqueda,
 * los filtros facetados, el orden y la página de la URL (los MISMOS parsers
 * que la tabla en el cliente) y recorta en memoria el conjunto completo que
 * devolvió la RPC. Las opciones de cada faceta salen de los datos. Módulo puro.
 */
import type { OpcionFiltro } from "@/components/data-table/filtro-facetado"

import type { ColumnaReporte } from "./columnas"
import {
  columnasCartera,
  estadoTablaCartera,
  facetasCartera,
} from "./definiciones/cartera"
import {
  columnasCoberturaPara,
  estadoTablaCobertura,
  facetasCobertura,
} from "./definiciones/cobertura-territorial"
import {
  columnasCumplimiento,
  estadoTablaCumplimiento,
  facetasCumplimiento,
} from "./definiciones/cumplimiento-medios"
import {
  columnasDesempeno,
  estadoTablaDesempeno,
  facetasDesempeno,
} from "./definiciones/desempeno-campanas"
import {
  columnasFinanzas,
  estadoTablaFinanzas,
  facetasFinanzas,
} from "./definiciones/finanzas"
import {
  columnasResumen,
  estadoTablaResumen,
  facetasResumen,
  type FilaIndicadorResumen,
  filasResumen,
} from "./definiciones/resumen-ejecutivo"
import {
  columnasUsuariosAccesos,
  estadoTablaUsuariosAccesos,
  facetasUsuariosAccesos,
} from "./definiciones/usuarios-accesos"
import type { Agrupacion } from "./filtros"
import {
  aplicarEstadoTabla,
  type EstadoTablaMemoria,
  estadoEnMemoria,
  type FacetaReporte,
  opcionesFaceta,
} from "./tabla"
import type {
  DatosCobertura,
  DatosReporte,
  FilaCampana,
  FilaCartera,
  FilaCobertura,
  FilaCumplimiento,
  FilaFinanzas,
  FilaUsuarioAcceso,
} from "./tipos"

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** Opciones de cada faceta (por su clave en la URL). */
export type OpcionesFacetas = Readonly<Record<string, readonly OpcionFiltro[]>>

interface PaginaBase<R extends DatosReporte["reporte"], F> {
  reporte: R
  filas: F[]
  /** Filas que cumplen la búsqueda y las facetas (todas las páginas). */
  total: number
  /** Filas del reporte antes de buscar o filtrar. */
  totalReporte: number
  opciones: OpcionesFacetas
}

/** Lo que recibe la tabla del cliente (serializable), etiquetado por reporte. */
export type PaginaTablaReporte =
  | PaginaBase<"resumen-ejecutivo", FilaIndicadorResumen>
  | (PaginaBase<"cobertura-territorial", FilaCobertura> & {
      nivel: DatosCobertura["nivel"]
    })
  | PaginaBase<"usuarios-accesos", FilaUsuarioAcceso>
  | PaginaBase<"desempeno-campanas", FilaCampana>
  | PaginaBase<"cumplimiento-medios", FilaCumplimiento>
  | (PaginaBase<"finanzas", FilaFinanzas> & { agrupacion: Agrupacion })
  | PaginaBase<"cartera", FilaCartera>

/** Recorta las filas según el estado de la URL y arma las opciones de las facetas. */
export function recortarTabla<F>(
  filas: readonly F[],
  columnas: readonly ColumnaReporte<F>[],
  facetas: readonly FacetaReporte<F>[],
  estado: EstadoTablaMemoria
): {
  filas: F[]
  total: number
  totalReporte: number
  opciones: OpcionesFacetas
} {
  const pagina = aplicarEstadoTabla(filas, columnas, facetas, estado)
  return {
    ...pagina,
    totalReporte: filas.length,
    opciones: Object.fromEntries(
      facetas.map((faceta) => [faceta.clave, opcionesFaceta(filas, faceta)])
    ),
  }
}

/**
 * Página de la tabla del reporte para la URL actual. Cada caso lee el
 * estado con la definición de su tabla (lista blanca de orden y facetas).
 */
export async function paginaTablaReporte(
  entrada: DatosReporte,
  searchParams: SearchParams
): Promise<PaginaTablaReporte> {
  switch (entrada.reporte) {
    case "resumen-ejecutivo": {
      const estado = await estadoTablaResumen.cargar(searchParams)
      return {
        reporte: entrada.reporte,
        ...recortarTabla(
          filasResumen(entrada.datos),
          columnasResumen,
          facetasResumen,
          estadoEnMemoria(estado, estadoTablaResumen.clavesFiltro)
        ),
      }
    }
    case "cobertura-territorial": {
      const estado = await estadoTablaCobertura.cargar(searchParams)
      const { nivel } = entrada.datos
      return {
        reporte: entrada.reporte,
        nivel,
        ...recortarTabla(
          entrada.datos.filas,
          columnasCoberturaPara(nivel),
          facetasCobertura,
          estadoEnMemoria(estado, estadoTablaCobertura.clavesFiltro)
        ),
      }
    }
    case "usuarios-accesos": {
      const estado = await estadoTablaUsuariosAccesos.cargar(searchParams)
      return {
        reporte: entrada.reporte,
        ...recortarTabla(
          entrada.datos.filas,
          columnasUsuariosAccesos,
          facetasUsuariosAccesos,
          estadoEnMemoria(estado, estadoTablaUsuariosAccesos.clavesFiltro)
        ),
      }
    }
    case "desempeno-campanas": {
      const estado = await estadoTablaDesempeno.cargar(searchParams)
      return {
        reporte: entrada.reporte,
        ...recortarTabla(
          entrada.datos.filas,
          columnasDesempeno,
          facetasDesempeno,
          estadoEnMemoria(estado, estadoTablaDesempeno.clavesFiltro)
        ),
      }
    }
    case "cumplimiento-medios": {
      const estado = await estadoTablaCumplimiento.cargar(searchParams)
      return {
        reporte: entrada.reporte,
        ...recortarTabla(
          entrada.datos.filas,
          columnasCumplimiento,
          facetasCumplimiento,
          estadoEnMemoria(estado, estadoTablaCumplimiento.clavesFiltro)
        ),
      }
    }
    case "finanzas": {
      const estado = await estadoTablaFinanzas.cargar(searchParams)
      const { agrupacion } = entrada.datos
      return {
        reporte: entrada.reporte,
        agrupacion,
        ...recortarTabla(
          entrada.datos.filas,
          columnasFinanzas(agrupacion),
          facetasFinanzas,
          estadoEnMemoria(estado, estadoTablaFinanzas.clavesFiltro)
        ),
      }
    }
    case "cartera": {
      const estado = await estadoTablaCartera.cargar(searchParams)
      return {
        reporte: entrada.reporte,
        ...recortarTabla(
          entrada.datos.filas,
          columnasCartera,
          facetasCartera,
          estadoEnMemoria(estado, estadoTablaCartera.clavesFiltro)
        ),
      }
    }
  }
}
