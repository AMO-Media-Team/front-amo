import "server-only"

import type { ZonaMundo } from "@/components/maps/mapa-mundi"
import {
  aplicarFiltros,
  type FiltroPostgrest,
  filtrosVentana,
} from "@/features/auditoria/filtros-postgrest"
import { tieneAlgunPermiso } from "@/lib/auth/dal"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import {
  instantesDelRango,
  type RangoFechas,
  serializarFecha,
} from "@/lib/fechas"
import { obtenerPais } from "@/lib/geo/catalogo"
import { crearClienteServidor } from "@/lib/supabase/server"

import { filasLeidas, paginasEstratificadas } from "./puntos"
import { type ClienteGeo, geoMetricas, traducirError } from "./rpc-geo"
import type { IngresosPorUbicacion } from "./tipos"

/**
 * Ingresos exitosos del periodo por país y por departamento, para el mapa de
 * la página de Accesos. Con `analitica.mapa`, la RPC `geo_metricas` (conteo
 * exacto en la BD); sin él (un rol con `accesos.ver` pero sin analítica), la
 * tabla `accesos` con la RLS del usuario, muestreada si el periodo es enorme.
 */

/** Filas que se leen como máximo por la vía de la tabla. */
const MAXIMO_FILAS = 20_000

function zonaDePais(codigo: string, valor: number, nombre?: string): ZonaMundo {
  const pais = obtenerPais(codigo)
  return {
    codigo,
    nombre: nombre ?? pais?.nombre ?? codigo,
    valor,
    centro: pais && !pais.conGeometria ? pais.centroide : undefined,
  }
}

function ordenar(zonas: ZonaMundo[]): ZonaMundo[] {
  return zonas.sort(
    (a, b) => b.valor - a.valor || a.nombre.localeCompare(b.nombre, "es")
  )
}

async function desdeRpc(
  supabase: ClienteGeo,
  rango: RangoFechas
): Promise<IngresosPorUbicacion> {
  const periodo = {
    metrica: "accesos",
    desde: serializarFecha(rango.desde),
    hasta: serializarFecha(rango.hasta),
    departamento: null,
  } as const
  const [paises, departamentos] = await Promise.all([
    geoMetricas(supabase, { ...periodo, nivel: "internacional" }),
    geoMetricas(supabase, { ...periodo, nivel: "nacional" }),
  ])
  const zonas = paises.flatMap((fila) =>
    fila.valor && fila.valor > 0
      ? [zonaDePais(fila.codigo, fila.valor, fila.nombre)]
      : []
  )
  return {
    paises: ordenar(zonas),
    departamentos: Object.fromEntries(
      departamentos.map((fila) => [fila.codigo, fila.valor ?? 0])
    ),
    total: zonas.reduce((suma, zona) => suma + zona.valor, 0),
    estimado: false,
  }
}

async function desdeTabla(
  supabase: ClienteGeo,
  rango: RangoFechas
): Promise<IngresosPorUbicacion> {
  const filtros: FiltroPostgrest[] = [
    { columna: "evento", operador: "eq", valor: "LOGIN_EXITOSO" },
    ...filtrosVentana(instantesDelRango(rango)),
  ]
  // Solo los que traen país (los de redes locales o VPN no se ubican).
  const { count, error } = await aplicarFiltros(
    supabase.from("accesos").select("id", { count: "exact", head: true }),
    filtros
  ).not("pais_iso2", "is", null)
  if (error) throw traducirError(error)
  const total = count ?? 0
  const paginas = paginasEstratificadas(total, MAXIMO_FILAS)
  const lecturas = await Promise.all(
    paginas.map(([desde, hasta]) =>
      aplicarFiltros(
        supabase.from("accesos").select("pais_iso2, departamento_codigo"),
        filtros
      )
        .not("pais_iso2", "is", null)
        .order("id", { ascending: true })
        .range(desde, hasta)
    )
  )
  const factor = total / Math.max(1, filasLeidas(paginas))
  const porPais = new Map<string, number>()
  const porDepartamento: Record<string, number> = {}
  for (const { data, error: errorPagina } of lecturas) {
    if (errorPagina) throw traducirError(errorPagina)
    for (const { pais_iso2: pais, departamento_codigo: departamento } of data ??
      []) {
      if (!pais) continue
      const codigo = pais.toUpperCase()
      porPais.set(codigo, (porPais.get(codigo) ?? 0) + factor)
      if (codigo === "CO" && departamento) {
        porDepartamento[departamento] =
          (porDepartamento[departamento] ?? 0) + factor
      }
    }
  }
  return {
    paises: ordenar(
      [...porPais].map(([codigo, valor]) =>
        zonaDePais(codigo, Math.round(valor))
      )
    ),
    departamentos: Object.fromEntries(
      Object.entries(porDepartamento).map(([codigo, valor]) => [
        codigo,
        Math.round(valor),
      ])
    ),
    total,
    estimado: factor > 1,
  }
}

export async function ingresosPorUbicacion(
  rango: RangoFechas,
  usuario: UsuarioSesion
): Promise<IngresosPorUbicacion> {
  const supabase = await crearClienteServidor()
  return tieneAlgunPermiso(usuario, ["analitica.mapa"])
    ? desdeRpc(supabase, rango)
    : desdeTabla(supabase, rango)
}
