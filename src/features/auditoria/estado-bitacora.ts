/**
 * Estado de la bitácora en la URL (búsqueda, facetas, orden, página y vista),
 * compartido por la página, la tabla, la línea de tiempo y la exportación, y
 * su traducción a filtros de PostgREST sobre `public.bitacora`.
 */
import {
  createLoader,
  createParser,
  parseAsArrayOf,
  parseAsInteger,
  parseAsStringLiteral,
} from "nuqs/server"
import { z } from "zod"

import {
  definirEstadoTabla,
  type EstadoTabla,
  filtroDeOpciones,
} from "@/components/data-table/estado-url"

import {
  ACCIONES_BITACORA,
  ACCIONES_SENSIBLES,
  ENTIDADES_CONFIGURACION,
  GRUPOS_BITACORA,
  ORIGENES_BITACORA,
} from "./catalogo"
import {
  condicionesBusqueda,
  type FiltroPostgrest,
  filtrosVentana,
  lista,
  patronBusqueda,
  type VentanaFiltro,
} from "./filtros-postgrest"

/** Id de la lista de eventos en la página: destino de los atajos de los indicadores. */
export const ID_REGISTROS_BITACORA = "registros-bitacora"

/** Actor "sistema": eventos sin persona (triggers, tareas programadas). */
export const ACTOR_SISTEMA = "sistema"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ENTIDAD = /^[a-z][a-z0-9_]{0,62}$/

const parseAsActor = createParser<string>({
  parse: (valor) =>
    valor === ACTOR_SISTEMA || UUID.test(valor) ? valor.toLowerCase() : null,
  serialize: (valor) => valor,
})

const parseAsEntidad = createParser<string>({
  parse: (valor) => (ENTIDAD.test(valor) ? valor : null),
  serialize: (valor) => valor,
})

export const CAMPOS_ORDEN_BITACORA = ["fecha", "accion", "entidad"] as const

export const estadoTablaBitacora = definirEstadoTabla({
  camposOrden: CAMPOS_ORDEN_BITACORA,
  ordenPorDefecto: { campo: "fecha", descendente: true },
  filtros: {
    accion: filtroDeOpciones(ACCIONES_BITACORA),
    entidad: parseAsArrayOf(parseAsEntidad, ",").withDefault([]),
    actor: parseAsArrayOf(parseAsActor, ",").withDefault([]),
    origen: filtroDeOpciones(ORIGENES_BITACORA),
    grupo: filtroDeOpciones(GRUPOS_BITACORA),
  },
})

export type EstadoTablaBitacora = EstadoTabla<typeof estadoTablaBitacora>

export const VISTAS_BITACORA = ["tabla", "linea"] as const
export type VistaBitacora = (typeof VISTAS_BITACORA)[number]

/** Vista activa (se consulta en el servidor: cada vista pide sus propios datos). */
export const parseAsVista =
  parseAsStringLiteral(VISTAS_BITACORA).withDefault("tabla")

/**
 * Evento abierto en el panel de detalle (solo cliente; el servidor lo precarga).
 * Solo ids positivos y seguros: un número fuera del rango de `bigint` haría
 * fallar la consulta y, con ella, toda la sección de registros.
 */
export const parseAsEvento = createParser<number>({
  parse: (valor) => {
    const id = parseAsInteger.parse(valor)
    return id !== null && Number.isSafeInteger(id) && id > 0 ? id : null
  },
  serialize: (valor) => String(valor),
})

// ── Filtros independientes de la vista ──────────────────────────────────────

/**
 * Lo que acota el conjunto de eventos (sin orden ni página). Es también la
 * entrada validada de las acciones de "cargar más" y exportar.
 */
export const esquemaFiltrosBitacora = z.object({
  q: z.string().max(100),
  accion: z.array(z.enum(ACCIONES_BITACORA)).max(ACCIONES_BITACORA.length),
  entidad: z.array(z.string().regex(ENTIDAD)).max(60),
  actor: z
    .array(z.union([z.literal(ACTOR_SISTEMA), z.string().regex(UUID)]))
    .max(100),
  origen: z.array(z.enum(ORIGENES_BITACORA)).max(ORIGENES_BITACORA.length),
  grupo: z.array(z.enum(GRUPOS_BITACORA)).max(GRUPOS_BITACORA.length),
})

export type FiltrosBitacora = z.infer<typeof esquemaFiltrosBitacora>

export function filtrosDeEstado(estado: EstadoTablaBitacora): FiltrosBitacora {
  return {
    q: estado.q,
    accion: [...estado.accion],
    entidad: [...estado.entidad],
    actor: [...estado.actor],
    origen: [...estado.origen],
    grupo: [...estado.grupo],
  }
}

/** Firma estable de los filtros (reinicia la línea de tiempo al cambiarlos). */
export function firmaFiltros(
  filtros: FiltrosBitacora,
  periodo: string
): string {
  return JSON.stringify([periodo, filtros])
}

const COLUMNAS_BUSQUEDA = ["actor_email", "entidad", "entidad_id", "motivo"]

function condicionActores(actores: readonly string[]): FiltroPostgrest | null {
  const personas = actores.filter((actor) => actor !== ACTOR_SISTEMA)
  const incluyeSistema = personas.length < actores.length
  if (actores.length === 0) return null
  if (!incluyeSistema) {
    return { columna: "actor_id", operador: "in", valor: lista(personas) }
  }
  if (personas.length === 0) {
    return { columna: "actor_id", operador: "is", valor: "null" }
  }
  return { o: `actor_id.in.${lista(personas)},actor_id.is.null` }
}

function condicionGrupos(
  grupos: readonly (typeof GRUPOS_BITACORA)[number][]
): FiltroPostgrest | null {
  const condiciones = grupos.flatMap((grupo) =>
    grupo === "SENSIBLES"
      ? [`accion.in.${lista(ACCIONES_SENSIBLES)}`, "origen.eq.API_DIRECTA"]
      : ["accion.eq.CONFIGURAR", `entidad.in.${lista(ENTIDADES_CONFIGURACION)}`]
  )
  return condiciones.length > 0 ? { o: condiciones.join(",") } : null
}

/**
 * Búsqueda libre: correo (enmascarado) del actor, entidad, id de la entidad y
 * motivo; además, los actores cuyo nombre coincide (`actoresCoincidentes`,
 * resueltos antes en `perfiles`) y el número de evento si se escribe uno.
 */
function condicionBusqueda(
  texto: string,
  actoresCoincidentes: readonly string[]
): FiltroPostgrest | null {
  const patron = patronBusqueda(texto)
  if (!patron) return null
  const condiciones = condicionesBusqueda(COLUMNAS_BUSQUEDA, patron)
  const personas = actoresCoincidentes.filter((id) => UUID.test(id))
  if (personas.length > 0) condiciones.push(`actor_id.in.${lista(personas)}`)
  const numero = texto.trim().replace(/^#/, "")
  if (/^\d{1,15}$/.test(numero)) condiciones.push(`id.eq.${numero}`)
  return { o: condiciones.join(",") }
}

/** Filtros de PostgREST para `bitacora` en una ventana de tiempo. */
export function filtrosPostgrestBitacora(
  filtros: FiltrosBitacora,
  ventana: VentanaFiltro,
  actoresCoincidentes: readonly string[] = []
): FiltroPostgrest[] {
  const resultado: FiltroPostgrest[] = [...filtrosVentana(ventana)]
  if (filtros.accion.length > 0) {
    resultado.push({
      columna: "accion",
      operador: "in",
      valor: lista(filtros.accion),
    })
  }
  if (filtros.origen.length > 0) {
    resultado.push({
      columna: "origen",
      operador: "in",
      valor: lista(filtros.origen),
    })
  }
  if (filtros.entidad.length > 0) {
    resultado.push({
      columna: "entidad",
      operador: "in",
      valor: lista(filtros.entidad),
    })
  }
  for (const condicion of [
    condicionActores(filtros.actor),
    condicionGrupos(filtros.grupo),
    condicionBusqueda(filtros.q, actoresCoincidentes),
  ]) {
    if (condicion) resultado.push(condicion)
  }
  return resultado
}

/** Orden de la tabla → columnas de PostgREST (el id desempata siempre). */
export function ordenBitacora(
  orden: EstadoTablaBitacora["orden"]
): { columna: "created_at" | "accion" | "entidad"; ascendente: boolean }[] {
  const ascendente = !orden.descendente
  const porFecha = { columna: "created_at", ascendente } as const
  switch (orden.campo) {
    case "accion":
      return [
        { columna: "accion", ascendente },
        { ...porFecha, ascendente: false },
      ]
    case "entidad":
      return [
        { columna: "entidad", ascendente },
        { ...porFecha, ascendente: false },
      ]
    case "fecha":
      return [porFecha]
  }
}

const cargarVistaYEvento = createLoader({
  vista: parseAsVista,
  evento: parseAsEvento,
})

/** Servidor: vista activa y evento a precargar en el panel. */
export function cargarPresentacion(
  searchParams: Promise<Record<string, string | string[] | undefined>>
) {
  return cargarVistaYEvento(searchParams)
}
