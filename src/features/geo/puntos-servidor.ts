import "server-only"

import {
  aplicarFiltros,
  type FiltroPostgrest,
  filtrosVentana,
} from "@/features/auditoria/filtros-postgrest"
import {
  instantesDelRango,
  parsearFecha,
  rangoPersonalizado,
} from "@/lib/fechas"
import { obtenerMunicipio } from "@/lib/geo/catalogo"

import { puntosAlrededor } from "./azar"
import { CODIGO_COLOMBIA } from "./niveles"
import {
  agregarEnCuadricula,
  type Coordenada,
  filasLeidas,
  PASO_CUADRICULA,
  paginasEstratificadas,
} from "./puntos"
import { type ClienteGeo, traducirError } from "./rpc-geo"
import {
  type ConsultaMapaGeo,
  ErrorDatosGeo,
  type PuntoGeo,
  type RespuestaPuntosGeo,
} from "./tipos"

/**
 * Puntos reales del modo calor, leídos con el cliente del USUARIO (la RLS
 * exige `accesos.ver` o `medios.ver`; la ruta ya validó el permiso de la
 * métrica). Privacidad: los accesos se agregan en celdas (sin coordenadas
 * individuales, sin usuario ni IP) y los medios se ubican en la cabecera de su
 * municipio, nunca en su dirección.
 */

/** Dispersión de los medios alrededor de la cabecera, para que el calor no sea un punto. */
const RADIO_MEDIOS_GRADOS = 0.03

function ventana(consulta: ConsultaMapaGeo) {
  const desde = parsearFecha(consulta.desde)
  const hasta = parsearFecha(consulta.hasta)
  if (!desde || !hasta) {
    throw new ErrorDatosGeo("consulta-invalida", "El periodo no es válido.")
  }
  return instantesDelRango(rangoPersonalizado(desde, hasta))
}

/** Mismo universo que `geo_metricas('…', 'accesos')`: ingresos exitosos, solo Colombia bajo el nivel país. */
function filtrosAccesos(consulta: ConsultaMapaGeo): FiltroPostgrest[] {
  const filtros: FiltroPostgrest[] = [
    { columna: "evento", operador: "eq", valor: "LOGIN_EXITOSO" },
    ...filtrosVentana(ventana(consulta)),
  ]
  if (consulta.nivel !== "internacional") {
    filtros.push({
      columna: "pais_iso2",
      operador: "eq",
      valor: CODIGO_COLOMBIA,
    })
  }
  if (consulta.nivel === "departamental" && consulta.departamento) {
    filtros.push({
      columna: "departamento_codigo",
      operador: "eq",
      valor: consulta.departamento,
    })
  }
  return filtros
}

async function puntosAccesos(
  supabase: ClienteGeo,
  consulta: ConsultaMapaGeo
): Promise<Omit<RespuestaPuntosGeo, "consulta" | "origen">> {
  const filtros = filtrosAccesos(consulta)
  const paso = PASO_CUADRICULA[consulta.nivel]

  // Solo los accesos con coordenadas.
  const { count, error } = await aplicarFiltros(
    supabase.from("accesos").select("id", { count: "exact", head: true }),
    filtros
  )
    .not("lat", "is", null)
    .not("lon", "is", null)
  if (error) throw traducirError(error)
  const total = count ?? 0
  const paginas = paginasEstratificadas(total)

  const lecturas = await Promise.all(
    paginas.map(([desde, hasta]) =>
      aplicarFiltros(supabase.from("accesos").select("lat, lon"), filtros)
        .not("lat", "is", null)
        .not("lon", "is", null)
        // Orden estable: las páginas no se solapan ni dejan huecos.
        .order("id", { ascending: true })
        .range(desde, hasta)
    )
  )
  const coordenadas: Coordenada[] = []
  for (const { data, error: errorPagina } of lecturas) {
    if (errorPagina) throw traducirError(errorPagina)
    for (const { lat, lon } of data ?? []) {
      // `numeric`: se convierte por si el transporte lo entrega como texto.
      if (lat !== null && lon !== null)
        coordenadas.push({ lon: Number(lon), lat: Number(lat) })
    }
  }
  const muestra = filasLeidas(paginas)
  return {
    puntos: agregarEnCuadricula(
      coordenadas,
      paso,
      muestra > 0 ? total / muestra : 1
    ),
    total,
    muestra,
    pasoGrados: paso,
  }
}

/** Medios verificados al cierre del periodo (la foto de `geo_metricas('…', 'medios')`). */
function filtrosMedios(consulta: ConsultaMapaGeo): FiltroPostgrest[] {
  const filtros: FiltroPostgrest[] = [
    { columna: "estado", operador: "eq", valor: "VERIFICADO" },
    { columna: "deleted_at", operador: "is", valor: "null" },
    {
      columna: "verificado_at",
      operador: "lt",
      valor: ventana(consulta).hastaExclusivo,
    },
  ]
  if (consulta.nivel === "departamental" && consulta.departamento) {
    filtros.push({
      columna: "departamento_codigo",
      operador: "eq",
      valor: consulta.departamento,
    })
  }
  return filtros
}

async function puntosMedios(
  supabase: ClienteGeo,
  consulta: ConsultaMapaGeo
): Promise<Omit<RespuestaPuntosGeo, "consulta" | "origen">> {
  const filtros = filtrosMedios(consulta)
  const { count, error } = await aplicarFiltros(
    supabase.from("medios").select("id", { count: "exact", head: true }),
    filtros
  )
  if (error) throw traducirError(error)
  const total = count ?? 0
  // Se leen todos (sin muestreo): son pocos y cada uno cuenta en su municipio.
  const paginas = paginasEstratificadas(total, Number.MAX_SAFE_INTEGER)
  const lecturas = await Promise.all(
    paginas.map(([desde, hasta]) =>
      aplicarFiltros(
        supabase.from("medios").select("municipio_codigo"),
        filtros
      )
        .order("id", { ascending: true })
        .range(desde, hasta)
    )
  )
  const porMunicipio = new Map<string, number>()
  for (const { data, error: errorPagina } of lecturas) {
    if (errorPagina) throw traducirError(errorPagina)
    for (const { municipio_codigo: codigo } of data ?? []) {
      porMunicipio.set(codigo, (porMunicipio.get(codigo) ?? 0) + 1)
    }
  }
  const puntos = [...porMunicipio].flatMap(([codigo, cantidad]): PuntoGeo[] => {
    const municipio = obtenerMunicipio(codigo)
    return municipio
      ? puntosAlrededor(
          municipio.centroide,
          cantidad,
          `medios|${codigo}`,
          RADIO_MEDIOS_GRADOS
        )
      : []
  })
  return { puntos, total, muestra: total, pasoGrados: 0.01 }
}

export async function puntosCalor(
  supabase: ClienteGeo,
  consulta: ConsultaMapaGeo
): Promise<RespuestaPuntosGeo> {
  const lectura =
    consulta.metrica === "accesos"
      ? await puntosAccesos(supabase, consulta)
      : consulta.metrica === "medios" && consulta.nivel !== "internacional"
        ? await puntosMedios(supabase, consulta)
        : null
  if (!lectura) {
    throw new ErrorDatosGeo(
      "consulta-invalida",
      "Esta métrica no tiene puntos reales para el mapa de calor."
    )
  }
  return { consulta, ...lectura, origen: "base-de-datos" }
}
