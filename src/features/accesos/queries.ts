import "server-only"

import { cache } from "react"

import { desplazamiento } from "@/components/data-table/estado-url"
import { contarPor, serieTemporal } from "@/features/auditoria/agregados"
import {
  aplicarFiltros,
  type FiltroPostgrest,
  filtrosVentana,
  patronBusqueda,
} from "@/features/auditoria/filtros-postgrest"
import { ipVisible } from "@/features/auditoria/privacidad"
import {
  etiquetaComparacion,
  type VentanaTiempo,
  ventanasComparadas,
} from "@/features/auditoria/periodo"
import {
  fallar,
  leerMuestra,
  nombrePais,
  perfilesQueCoinciden,
} from "@/features/auditoria/servidor"
import type { IndicadorComparado } from "@/features/auditoria/tipos"
import { tieneAlgunPermiso } from "@/lib/auth/dal"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import type { RangoFechas } from "@/lib/fechas"
import { obtenerDepartamento, obtenerMunicipio } from "@/lib/geo/catalogo"
import { crearClienteServidor } from "@/lib/supabase/server"

import { celdasActividad } from "./actividad"
import { type ConteoEvento, desgloseEventos } from "./desglose"
import {
  banderaEmoji,
  EVENTOS,
  esDispositivo,
  type EventoAcceso,
} from "./catalogo"
import {
  type EstadoTablaAccesos,
  type FiltrosAccesos,
  filtrosPostgrestAccesos,
  ordenAccesos,
} from "./estado-accesos"
import { type Nombradores, rankingCiudades, rankingPaises } from "./rankings"
import type {
  AccesoFila,
  ActividadAccesos,
  OpcionPais,
  PaginaAccesos,
  RankingsAccesos,
  ResumenAccesos,
} from "./tipos"

/**
 * Consultas del registro de accesos con el cliente del USUARIO: la RLS de
 * `accesos` exige `accesos.ver` (§3.3). Conteos exactos con `count=exact`;
 * países, ciudades y personas únicas salen de una muestra de hasta
 * `LIMITE_MUESTRA` eventos del periodo mientras no exista la RPC
 * `metricas_accesos`/`geo_metricas` (M9).
 */

export const LIMITE_MUESTRA = 10_000
export const LIMITE_EXPORTACION = 5_000
export const LIMITE_ALERTAS = 3

const COLUMNAS_ACCESO = `
  id, created_at, evento, aal, ip, pais_iso2, municipio_codigo, ciudad,
  navegador, sistema_operativo, dispositivo, es_sospechoso, motivo_sospecha, usuario_id,
  usuario:perfiles!accesos_usuario_id_fkey ( id, nombre, email, rol:roles!perfiles_rol_id_fkey ( nombre, color ) )
` as const

async function contar(
  operacion: string,
  filtros: readonly FiltroPostgrest[]
): Promise<number> {
  const supabase = await crearClienteServidor()
  const { count, error } = await aplicarFiltros(
    supabase.from("accesos").select("id", { count: "exact", head: true }),
    filtros
  )
  if (error) fallar(operacion, error)
  return count ?? 0
}

async function contarComparado(
  operacion: string,
  ventanas: { actual: VentanaTiempo; anterior: VentanaTiempo },
  extra: FiltroPostgrest
): Promise<IndicadorComparado> {
  const [valor, anterior] = await Promise.all([
    contar(operacion, [...filtrosVentana(ventanas.actual), extra]),
    contar(operacion, [...filtrosVentana(ventanas.anterior), extra]),
  ])
  return { valor, anterior }
}

function porEvento(evento: EventoAcceso): FiltroPostgrest {
  return { columna: "evento", operador: "eq", valor: evento }
}

const SOSPECHOSOS: FiltroPostgrest = {
  columna: "es_sospechoso",
  operador: "is",
  valor: "true",
}

// ── Muestra del periodo ─────────────────────────────────────────────────────

interface FilaMuestra {
  created_at: string
  evento: EventoAcceso
  usuario_id: string | null
  pais_iso2: string | null
  municipio_codigo: string | null
  ciudad: string | null
}

const totalDelPeriodo = cache((desde: string, hastaExclusivo: string) =>
  contar("contar los accesos", filtrosVentana({ desde, hastaExclusivo }))
)

/** Eventos del periodo con las columnas para agrupar (memorizado por solicitud). */
const muestraDelPeriodo = cache(
  async (desde: string, hastaExclusivo: string) => {
    const [supabase, total] = await Promise.all([
      crearClienteServidor(),
      totalDelPeriodo(desde, hastaExclusivo),
    ])
    return leerMuestra<FilaMuestra>(
      "leer los accesos del periodo",
      total,
      LIMITE_MUESTRA,
      (inicio, fin) =>
        supabase
          .from("accesos")
          .select(
            "created_at, evento, usuario_id, pais_iso2, municipio_codigo, ciudad"
          )
          .gte("created_at", desde)
          .lt("created_at", hastaExclusivo)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(inicio, fin)
    )
  }
)

function muestra(ventana: VentanaTiempo) {
  return muestraDelPeriodo(ventana.desde, ventana.hastaExclusivo)
}

const nombradores: Nombradores = {
  pais: nombrePais,
  municipio: (codigo) => {
    const municipio = obtenerMunicipio(codigo)
    if (!municipio) return null
    return {
      nombre: municipio.nombre,
      departamento:
        obtenerDepartamento(municipio.departamentoCodigo)?.nombre ?? null,
    }
  },
}

/** Indicadores del periodo con su comparación contra el periodo anterior. */
export async function resumenAccesos(
  rango: RangoFechas
): Promise<ResumenAccesos> {
  const ventanas = ventanasComparadas(rango)
  const [exitosos, fallidos, bloqueados, sospechosos, { filas, completa }] =
    await Promise.all([
      contarComparado(
        "contar los ingresos",
        ventanas,
        porEvento("LOGIN_EXITOSO")
      ),
      contarComparado(
        "contar los fallos",
        ventanas,
        porEvento("LOGIN_FALLIDO")
      ),
      contarComparado(
        "contar los bloqueos",
        ventanas,
        porEvento("LOGIN_BLOQUEADO")
      ),
      contarComparado("contar los sospechosos", ventanas, SOSPECHOSOS),
      muestra(ventanas.actual),
    ])
  const ingresos = filas.filter((fila) => fila.evento === "LOGIN_EXITOSO")
  const intentos = exitosos.valor + fallidos.valor
  return {
    exitosos,
    fallidos,
    bloqueados,
    sospechosos,
    paises: contarPor(ingresos, (fila) => fila.pais_iso2).length,
    usuariosUnicos: contarPor(ingresos, (fila) => fila.usuario_id).length,
    tasaFallo: intentos > 0 ? fallidos.valor / intentos : null,
    serieExitosos: completa
      ? serieTemporal(
          ingresos.map((fila) => fila.created_at),
          rango
        )
      : [],
    muestraCompleta: completa,
    comparacion: etiquetaComparacion(rango),
  }
}

/** Accesos sospechosos del periodo (cabecera del panel de alertas; un solo conteo). */
export function totalSospechosos(rango: RangoFechas): Promise<number> {
  return contar("contar los sospechosos", [
    ...filtrosVentana(ventanasComparadas(rango).actual),
    SOSPECHOSOS,
  ])
}

/** Países y ciudades de origen de los ingresos exitosos. */
export async function rankingsAccesos(
  rango: RangoFechas
): Promise<RankingsAccesos> {
  const { filas } = await muestra(ventanasComparadas(rango).actual)
  const ingresos = filas.filter((fila) => fila.evento === "LOGIN_EXITOSO")
  return {
    paises: rankingPaises(ingresos, nombradores),
    ciudades: rankingCiudades(ingresos, nombradores),
    total: ingresos.length,
    sinUbicacion: ingresos.filter((fila) => !fila.pais_iso2).length,
  }
}

/**
 * Ingresos exitosos por día de la semana y hora de Bogotá (mapa de calor).
 * Reemplazable por `actividad_heatmap(p_desde, p_hasta, 'accesos')` cuando
 * exista la RPC (M9): misma forma de celda.
 */
export async function actividadAccesos(
  rango: RangoFechas
): Promise<ActividadAccesos> {
  const { filas, completa } = await muestra(ventanasComparadas(rango).actual)
  const ingresos = filas.filter((fila) => fila.evento === "LOGIN_EXITOSO")
  return {
    celdas: celdasActividad(ingresos.map((fila) => fila.created_at)),
    total: ingresos.length,
    muestraCompleta: completa,
  }
}

/** Eventos de sesión del periodo (verificaciones, cierres, revocaciones…). */
export async function eventosDeSesion(rango: RangoFechas): Promise<{
  conteos: ConteoEvento[]
  muestraCompleta: boolean
}> {
  const { filas, completa } = await muestra(ventanasComparadas(rango).actual)
  return {
    conteos: desgloseEventos(filas.map((fila) => fila.evento)),
    muestraCompleta: completa,
  }
}

/** Países con accesos en el periodo (opciones del filtro). */
export async function paisesDelPeriodo(
  rango: RangoFechas
): Promise<OpcionPais[]> {
  const { filas } = await muestra(ventanasComparadas(rango).actual)
  return contarPor(filas, (fila) => fila.pais_iso2?.toUpperCase()).map(
    ({ clave, cantidad }) => ({
      iso2: clave,
      nombre: nombrePais(clave) ?? clave,
      bandera: banderaEmoji(clave),
      cantidad,
    })
  )
}

// ── Filas ───────────────────────────────────────────────────────────────────

interface FilaAcceso {
  id: number
  created_at: string
  evento: EventoAcceso
  aal: string | null
  ip: unknown
  pais_iso2: string | null
  municipio_codigo: string | null
  ciudad: string | null
  navegador: string | null
  sistema_operativo: string | null
  dispositivo: string | null
  es_sospechoso: boolean
  motivo_sospecha: string | null
  usuario: {
    id: string
    nombre: string | null
    email: string
    rol: { nombre: string; color: string } | null
  } | null
}

function aAccesoFila(fila: FilaAcceso, ipCompleta: boolean): AccesoFila {
  const municipio = fila.municipio_codigo
    ? nombradores.municipio(fila.municipio_codigo)
    : null
  const pais = fila.pais_iso2 ? nombrePais(fila.pais_iso2) : null
  return {
    id: fila.id,
    at: fila.created_at,
    evento: fila.evento,
    etiquetaEvento: EVENTOS[fila.evento].etiqueta,
    resultado: EVENTOS[fila.evento].resultado,
    usuario: fila.usuario
      ? {
          id: fila.usuario.id,
          nombre: fila.usuario.nombre?.trim() || fila.usuario.email,
          email: fila.usuario.email,
          rol: fila.usuario.rol?.nombre ?? null,
          color: fila.usuario.rol?.color ?? null,
        }
      : null,
    paisIso2: fila.pais_iso2,
    pais,
    bandera: banderaEmoji(fila.pais_iso2),
    ciudad: municipio?.nombre ?? fila.ciudad,
    region: municipio?.departamento ?? pais,
    dispositivo: esDispositivo(fila.dispositivo) ? fila.dispositivo : null,
    navegador: fila.navegador,
    sistemaOperativo: fila.sistema_operativo,
    ip: ipVisible(fila.ip, ipCompleta),
    aal: fila.aal,
    sospechoso: fila.es_sospechoso,
    motivoSospecha: fila.motivo_sospecha,
  }
}

async function filtrosConBusqueda(
  filtros: FiltrosAccesos,
  ventana: VentanaTiempo
): Promise<FiltroPostgrest[]> {
  const coincidentes = await perfilesQueCoinciden(patronBusqueda(filtros.q))
  return filtrosPostgrestAccesos(filtros, ventana, coincidentes)
}

const RANGO_FUERA = "PGRST103"

/** Una página del registro según el estado de la URL. */
export async function listarAccesos(
  estado: EstadoTablaAccesos,
  filtros: FiltrosAccesos,
  rango: RangoFechas,
  usuario: UsuarioSesion
): Promise<PaginaAccesos> {
  const supabase = await crearClienteServidor()
  const condiciones = await filtrosConBusqueda(
    filtros,
    ventanasComparadas(rango).actual
  )
  const ipCompleta = tieneAlgunPermiso(usuario, ["datos_sensibles.ver"])

  const leerPagina = (pagina: number) => {
    const inicio = desplazamiento(pagina, estado.tamano)
    let consulta = aplicarFiltros(
      supabase.from("accesos").select(COLUMNAS_ACCESO, { count: "exact" }),
      condiciones
    )
    for (const { columna, ascendente } of ordenAccesos(estado.orden)) {
      consulta = consulta.order(columna, {
        ascending: ascendente,
        nullsFirst: false,
      })
    }
    return consulta
      .order("id", { ascending: !estado.orden.descendente })
      .range(inicio, inicio + estado.tamano - 1)
  }

  let respuesta = await leerPagina(estado.pagina)
  if (respuesta.error?.code === RANGO_FUERA) {
    const total = await contar("contar los accesos", condiciones)
    respuesta = await leerPagina(Math.max(1, Math.ceil(total / estado.tamano)))
  }
  if (respuesta.error) fallar("listar los accesos", respuesta.error)
  return {
    filas: respuesta.data.map((fila: FilaAcceso) =>
      aAccesoFila(fila, ipCompleta)
    ),
    total: respuesta.count ?? 0,
  }
}

/** Accesos sospechosos más recientes del periodo (tarjeta de alertas). */
export async function alertasSospechosas(
  rango: RangoFechas,
  usuario: UsuarioSesion
): Promise<AccesoFila[]> {
  const supabase = await crearClienteServidor()
  const { data, error } = await aplicarFiltros(
    supabase.from("accesos").select(COLUMNAS_ACCESO),
    [...filtrosVentana(ventanasComparadas(rango).actual), SOSPECHOSOS]
  )
    .order("created_at", { ascending: false })
    .limit(LIMITE_ALERTAS)
  if (error) fallar("leer los accesos sospechosos", error)
  const ipCompleta = tieneAlgunPermiso(usuario, ["datos_sensibles.ver"])
  return data.map((fila: FilaAcceso) => aAccesoFila(fila, ipCompleta))
}

/** Accesos para exportar (máx. `LIMITE_EXPORTACION`, del más reciente al más antiguo). */
export async function accesosParaExportar(
  filtros: FiltrosAccesos,
  rango: RangoFechas,
  usuario: UsuarioSesion
): Promise<{ filas: AccesoFila[]; total: number }> {
  const supabase = await crearClienteServidor()
  const condiciones = await filtrosConBusqueda(
    filtros,
    ventanasComparadas(rango).actual
  )
  const total = await contar("contar los accesos a exportar", condiciones)
  const { filas } = await leerMuestra(
    "leer los accesos a exportar",
    total,
    LIMITE_EXPORTACION,
    (inicio, fin) =>
      aplicarFiltros(
        supabase.from("accesos").select(COLUMNAS_ACCESO),
        condiciones
      )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(inicio, fin)
  )
  const ipCompleta = tieneAlgunPermiso(usuario, ["datos_sensibles.ver"])
  return {
    filas: filas.map((fila: FilaAcceso) => aAccesoFila(fila, ipCompleta)),
    total,
  }
}
