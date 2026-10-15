import "server-only"

import { cache } from "react"

import { desplazamiento } from "@/components/data-table/estado-url"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { tieneAlgunPermiso } from "@/lib/auth/dal"
import type { RangoFechas } from "@/lib/fechas"
import { crearClienteServidor } from "@/lib/supabase/server"

import { contarPor, serieTemporal } from "./agregados"
import {
  ACCIONES_SENSIBLES,
  ENTIDADES_CONFIGURACION,
  nombreEntidad,
} from "./catalogo"
import {
  ACTOR_SISTEMA,
  type EstadoTablaBitacora,
  type FiltrosBitacora,
  filtrosPostgrestBitacora,
  ordenBitacora,
} from "./estado-bitacora"
import {
  aplicarFiltros,
  type CursorTiempo,
  filtroCursor,
  type FiltroPostgrest,
  filtrosVentana,
  lista,
  patronBusqueda,
} from "./filtros-postgrest"
import {
  etiquetaComparacion,
  type VentanaTiempo,
  ventanasComparadas,
} from "./periodo"
import {
  COLUMNAS_EVENTO,
  type ContextoEventos,
  describirEvento,
  type FilaBitacora,
  perfilesReferenciados,
} from "./presentacion"
import {
  fallar,
  leerMuestra,
  nombrePais,
  perfilesQueCoinciden,
  perfilesVisibles,
  rolesDeLaPlataforma,
} from "./servidor"
import type {
  EventoBitacora,
  IndicadorComparado,
  OpcionesFiltroBitacora,
  PaginaBitacora,
  ResumenBitacora,
  TramoLineaTiempo,
} from "./tipos"

/**
 * Consultas de la bitácora con el cliente del USUARIO: la RLS de `bitacora`
 * exige `auditoria.ver` (docs/modelo-datos.md §3.3). No hay RPC de resumen:
 * los conteos son exactos (`count=exact`, sin traer filas) y lo que necesita
 * agrupar (actores únicos, serie por día, opciones de filtro) sale de una
 * muestra de hasta `LIMITE_MUESTRA` eventos del periodo.
 */

export const LIMITE_MUESTRA = 10_000
export const EVENTOS_POR_TRAMO = 40
export const LIMITE_EXPORTACION = 5_000

// ── Conteos ─────────────────────────────────────────────────────────────────

async function contar(
  operacion: string,
  filtros: readonly FiltroPostgrest[]
): Promise<number> {
  const supabase = await crearClienteServidor()
  const { count, error } = await aplicarFiltros(
    supabase.from("bitacora").select("id", { count: "exact", head: true }),
    filtros
  )
  if (error) fallar(operacion, error)
  return count ?? 0
}

const FILTRO_SENSIBLES: FiltroPostgrest = {
  o: `accion.in.${lista(ACCIONES_SENSIBLES)},origen.eq.API_DIRECTA`,
}
const FILTRO_CONFIGURACION: FiltroPostgrest = {
  o: `accion.eq.CONFIGURAR,entidad.in.${lista(ENTIDADES_CONFIGURACION)}`,
}

async function contarComparado(
  operacion: string,
  ventanas: { actual: VentanaTiempo; anterior: VentanaTiempo },
  extra: readonly FiltroPostgrest[] = []
): Promise<IndicadorComparado> {
  const [valor, anterior] = await Promise.all([
    contar(operacion, [...filtrosVentana(ventanas.actual), ...extra]),
    contar(operacion, [...filtrosVentana(ventanas.anterior), ...extra]),
  ])
  return { valor, anterior }
}

// ── Muestra del periodo (actores, entidades, serie) ─────────────────────────

type FilaMuestra = Pick<FilaBitacora, "created_at" | "actor_id" | "entidad">

/**
 * Eventos del periodo con las columnas mínimas para agrupar. Memorizada por
 * solicitud: la usan el resumen y las opciones de filtro de la misma página.
 */
const muestraDelPeriodo = cache(
  async (desde: string, hastaExclusivo: string, total: number) => {
    const supabase = await crearClienteServidor()
    return leerMuestra<FilaMuestra>(
      "leer la actividad del periodo",
      total,
      LIMITE_MUESTRA,
      (inicio, fin) =>
        supabase
          .from("bitacora")
          .select("created_at, actor_id, entidad")
          .gte("created_at", desde)
          .lt("created_at", hastaExclusivo)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(inicio, fin)
    )
  }
)

const totalDelPeriodo = cache((desde: string, hastaExclusivo: string) =>
  contar("contar los eventos", filtrosVentana({ desde, hastaExclusivo }))
)

async function muestra(ventana: VentanaTiempo) {
  const total = await totalDelPeriodo(ventana.desde, ventana.hastaExclusivo)
  return muestraDelPeriodo(ventana.desde, ventana.hastaExclusivo, total)
}

/** Indicadores del periodo: eventos, actores, configuración y sensibles. */
export async function resumenBitacora(
  rango: RangoFechas
): Promise<ResumenBitacora> {
  const ventanas = ventanasComparadas(rango)
  const [eventos, configuracion, sensibles, { filas, completa }] =
    await Promise.all([
      contarComparado("contar los eventos", ventanas),
      contarComparado("contar los cambios de configuración", ventanas, [
        FILTRO_CONFIGURACION,
      ]),
      contarComparado("contar los eventos sensibles", ventanas, [
        FILTRO_SENSIBLES,
      ]),
      muestra(ventanas.actual),
    ])

  const actores = contarPor(filas, (fila) => fila.actor_id)
  const principal = actores[0]
  const perfiles = principal
    ? await perfilesVisibles([principal.clave])
    : new Map()
  const perfil = principal ? perfiles.get(principal.clave) : undefined

  return {
    eventos,
    configuracion,
    sensibles,
    actoresUnicos: actores.length,
    actorPrincipal: principal
      ? {
          nombre:
            perfil?.nombre?.trim() ||
            perfil?.email ||
            "Usuario sin perfil visible",
          eventos: principal.cantidad,
        }
      : null,
    serieDiaria: completa
      ? serieTemporal(
          filas.map((fila) => fila.created_at),
          rango
        )
      : [],
    muestraCompleta: completa,
    comparacion: etiquetaComparacion(rango),
  }
}

/** Actores y entidades con actividad en el periodo (opciones de los filtros). */
export async function opcionesFiltroBitacora(
  rango: RangoFechas
): Promise<OpcionesFiltroBitacora> {
  const { actual } = ventanasComparadas(rango)
  const { filas } = await muestra(actual)
  const actores = contarPor(filas, (fila) => fila.actor_id ?? ACTOR_SISTEMA)
  const perfiles = await perfilesVisibles(
    actores.map((a) => a.clave).filter((clave) => clave !== ACTOR_SISTEMA)
  )
  return {
    actores: actores.map(({ clave, cantidad }) => {
      const perfil = perfiles.get(clave)
      return {
        id: clave,
        nombre:
          clave === ACTOR_SISTEMA
            ? "Sistema"
            : perfil?.nombre?.trim() ||
              perfil?.email ||
              `Usuario ${clave.slice(0, 8)}`,
        color: perfil?.color ?? null,
        eventos: cantidad,
      }
    }),
    entidades: contarPor(filas, (fila) => fila.entidad).map(
      ({ clave, cantidad }) => ({
        entidad: clave,
        nombre: nombreEntidad(clave),
        eventos: cantidad,
      })
    ),
  }
}

// ── Eventos descritos ───────────────────────────────────────────────────────

/** Contexto para describir un lote de filas: perfiles, roles, países y permiso de IP. */
async function contextoPara(
  filas: readonly FilaBitacora[],
  usuario: UsuarioSesion
): Promise<ContextoEventos> {
  const [roles, perfiles] = await Promise.all([
    rolesDeLaPlataforma(),
    perfilesVisibles(filas.flatMap(perfilesReferenciados)),
  ])
  const nombres = new Map<string, string>(roles.porId)
  // Las claves de rol ("ADMIN") aparecen en metadatos como `rol`.
  for (const [clave, rol] of roles.porClave) nombres.set(clave, rol.nombre)
  for (const [id, perfil] of perfiles) {
    nombres.set(id, perfil.nombre?.trim() || perfil.email)
  }
  return {
    nombres,
    perfiles,
    roles: roles.porClave,
    nombrePais,
    ipCompleta: tieneAlgunPermiso(usuario, ["datos_sensibles.ver"]),
  }
}

async function describir(
  filas: readonly FilaBitacora[],
  usuario: UsuarioSesion
): Promise<EventoBitacora[]> {
  const contexto = await contextoPara(filas, usuario)
  return filas.map((fila) => describirEvento(fila, contexto))
}

async function filtrosConBusqueda(
  filtros: FiltrosBitacora,
  ventana: VentanaTiempo
): Promise<FiltroPostgrest[]> {
  const coincidentes = await perfilesQueCoinciden(patronBusqueda(filtros.q))
  return filtrosPostgrestBitacora(filtros, ventana, coincidentes)
}

/** Código de PostgREST cuando se pide una página más allá del final. */
const RANGO_FUERA = "PGRST103"

/** Una página de la tabla según el estado de la URL (paginación en el servidor). */
export async function listarBitacora(
  estado: EstadoTablaBitacora,
  filtros: FiltrosBitacora,
  rango: RangoFechas,
  usuario: UsuarioSesion
): Promise<PaginaBitacora> {
  const supabase = await crearClienteServidor()
  const condiciones = await filtrosConBusqueda(
    filtros,
    ventanasComparadas(rango).actual
  )

  const leerPagina = (pagina: number) => {
    const inicio = desplazamiento(pagina, estado.tamano)
    let consulta = aplicarFiltros(
      supabase.from("bitacora").select(COLUMNAS_EVENTO, { count: "exact" }),
      condiciones
    )
    for (const { columna, ascendente } of ordenBitacora(estado.orden)) {
      consulta = consulta.order(columna, { ascending: ascendente })
    }
    return consulta
      .order("id", { ascending: !estado.orden.descendente })
      .range(inicio, inicio + estado.tamano - 1)
  }

  let respuesta = await leerPagina(estado.pagina)
  if (respuesta.error?.code === RANGO_FUERA) {
    // La página pedida ya no existe (filtros más estrictos): se muestra la última.
    const total = await contar("contar los eventos", condiciones)
    respuesta = await leerPagina(Math.max(1, Math.ceil(total / estado.tamano)))
  }
  if (respuesta.error) fallar("listar la bitácora", respuesta.error)
  return {
    filas: await describir(respuesta.data, usuario),
    total: respuesta.count ?? 0,
  }
}

/**
 * Un tramo de la línea de tiempo: paginación por conjunto (keyset) sobre
 * `(created_at, id)` descendente, estable aunque lleguen eventos nuevos.
 */
export async function tramoLineaTiempo(
  filtros: FiltrosBitacora,
  rango: RangoFechas,
  cursor: CursorTiempo | null,
  usuario: UsuarioSesion
): Promise<TramoLineaTiempo> {
  const supabase = await crearClienteServidor()
  const condiciones = await filtrosConBusqueda(
    filtros,
    ventanasComparadas(rango).actual
  )
  if (cursor) condiciones.push(filtroCursor(cursor))

  const { data, error } = await aplicarFiltros(
    supabase.from("bitacora").select(COLUMNAS_EVENTO),
    condiciones
  )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(EVENTOS_POR_TRAMO + 1)
  if (error) fallar("leer la línea de tiempo", error)

  const hayMas = data.length > EVENTOS_POR_TRAMO
  const filas = data.slice(0, EVENTOS_POR_TRAMO)
  const ultimo = filas.at(-1)
  return {
    eventos: await describir(filas, usuario),
    siguiente:
      hayMas && ultimo ? { at: ultimo.created_at, id: ultimo.id } : null,
  }
}

/** Un evento por id (enlace directo al panel de detalle); `null` si no es visible. */
export async function obtenerEvento(
  id: number,
  usuario: UsuarioSesion
): Promise<EventoBitacora | null> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from("bitacora")
    .select(COLUMNAS_EVENTO)
    .eq("id", id)
    .maybeSingle()
  if (error) fallar("leer el evento", error)
  if (!data) return null
  const [evento] = await describir([data], usuario)
  return evento
}

/** Eventos para exportar (máx. `LIMITE_EXPORTACION`, del más reciente al más antiguo). */
export async function eventosParaExportar(
  filtros: FiltrosBitacora,
  rango: RangoFechas,
  usuario: UsuarioSesion
): Promise<{ eventos: EventoBitacora[]; total: number }> {
  const supabase = await crearClienteServidor()
  const condiciones = await filtrosConBusqueda(
    filtros,
    ventanasComparadas(rango).actual
  )
  const total = await contar("contar los eventos a exportar", condiciones)
  const { filas } = await leerMuestra<FilaBitacora>(
    "leer los eventos a exportar",
    total,
    LIMITE_EXPORTACION,
    (inicio, fin) =>
      aplicarFiltros(
        supabase.from("bitacora").select(COLUMNAS_EVENTO),
        condiciones
      )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(inicio, fin)
  )
  return { eventos: await describir(filas, usuario), total }
}

/** Eventos que cumplen los filtros en el periodo (encabezado de la línea de tiempo). */
export async function contarBitacora(
  filtros: FiltrosBitacora,
  rango: RangoFechas
): Promise<number> {
  const condiciones = await filtrosConBusqueda(
    filtros,
    ventanasComparadas(rango).actual
  )
  return contar("contar los eventos", condiciones)
}
