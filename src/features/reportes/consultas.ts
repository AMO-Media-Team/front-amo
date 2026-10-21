import "server-only"

import type { CeldaActividad } from "@/components/charts/datos"
import type { FilaKpi } from "@/components/kpi/tipos"
import { configAnalitica } from "@/features/dashboard/servidor"
import { leerTodo } from "@/features/operacion/queries/comun"
import { tieneAlgunPermiso } from "@/lib/auth/dal"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { diasEnRango, serializarFecha } from "@/lib/fechas"
import { argumentosRpc } from "@/lib/supabase/rpc"
import { crearClienteServidor } from "@/lib/supabase/server"

import { REPORTES, type SlugReporte } from "./catalogo"
import { totalesCartera } from "./definiciones/cartera"
import { totalesCobertura } from "./definiciones/cobertura-territorial"
import { nombrePlataforma } from "./definiciones/comun"
import { totalesCumplimiento } from "./definiciones/cumplimiento-medios"
import { totalesDesempeno } from "./definiciones/desempeno-campanas"
import { totalesFinanzas } from "./definiciones/finanzas"
import { zonasComparadas } from "./definiciones/resumen-ejecutivo"
import { totalesAccesos } from "./definiciones/usuarios-accesos"
import {
  argumentosComparacion,
  argumentosPeriodo,
  contextoDatos,
  type FiltrosReporte,
  type NombresFiltros,
} from "./filtros"
import { granularidadPara } from "./graficos"
import { leer, numero, numeroONulo } from "./servidor"
import type {
  ContextoDatos,
  DatosCartera,
  DatosCobertura,
  DatosCumplimiento,
  DatosDesempeno,
  DatosFinanzas,
  DatosPorReporte,
  DatosResumen,
  DatosUsuariosAccesos,
  EstadoPerfil,
  FilaCampana,
  FilaCartera,
  FilaCobertura,
  FilaCumplimiento,
  FilaFinanzas,
  FilaMezcla,
  FilaPlataforma,
  FilaUsuarioAcceso,
  FilaZona,
  PuntoSerieGmv,
} from "./tipos"

/**
 * Consultas de los reportes (una por reporte) con el cliente del usuario: las
 * RPC exigen sus permisos y la RLS limita las filas. Cada una devuelve el
 * conjunto completo y normalizado que comparten la página y la exportación.
 *
 * La API entrega como máximo 1.000 filas por respuesta: las RPC cuyo detalle
 * crece con el negocio (campañas, medios, usuarios, anunciantes) se leen con
 * `leerTodo`, por tramos, para que los totales nunca salgan de un detalle
 * recortado. Las acotadas por catálogo o por el periodo (16 indicadores,
 * 33 departamentos, 168 horas…) se leen de una vez.
 */

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>

async function contexto(
  slug: SlugReporte,
  filtros: FiltrosReporte,
  nombres: NombresFiltros = {}
): Promise<ContextoDatos> {
  // `analitica.n_minimo_tasas`: el mismo umbral que aplican las RPC y el panel de Inicio.
  const { nMinimo } = await configAnalitica()
  return contextoDatos(REPORTES[slug], filtros, nMinimo, nombres)
}

// ── Resumen ejecutivo ────────────────────────────────────────────────────────

function filaKpi(fila: {
  kpi: string | null
  valor: number | null
  valor_anterior: number | null
  variacion: number | null
  n: number | null
  unidad: string | null
  serie: number[] | null
  n_anterior: number | null
}): FilaKpi {
  return {
    kpi: fila.kpi ?? "",
    valor: numeroONulo(fila.valor),
    valor_anterior: numeroONulo(fila.valor_anterior),
    variacion: numeroONulo(fila.variacion),
    n: numeroONulo(fila.n),
    n_anterior: numeroONulo(fila.n_anterior),
    unidad: fila.unidad ?? "conteo",
    serie: fila.serie ? fila.serie.map(numeroONulo) : null,
  }
}

async function serieGmv(
  supabase: Cliente,
  rango: FiltrosReporte["rango"],
  granularidad: DatosResumen["granularidad"]
): Promise<PuntoSerieGmv[]> {
  const filas = await leer(
    "leer la serie de GMV",
    supabase.rpc("serie_gmv", {
      ...argumentosPeriodo(rango),
      p_granularidad: granularidad,
    })
  )
  return filas.map((fila) => ({
    periodo: fila.periodo,
    gmvComprometido: numero(fila.gmv_comprometido),
    gmvVerificado: numero(fila.gmv_verificado),
    comision: numero(fila.comision),
    negocios: numero(fila.negocios),
  }))
}

const TOP_MUNICIPIOS = 10
/** Todos los departamentos (33): el desglose completo explica las variaciones. */
const TODOS_LOS_DEPARTAMENTOS = 40

async function topZonas(
  supabase: Cliente,
  nivel: "departamento" | "municipio",
  metrica: "gmv" | "medios",
  rango: FiltrosReporte["rango"],
  limite: number
): Promise<FilaZona[]> {
  const filas = await leer(
    "leer el ranking por zona",
    supabase.rpc("top_zonas", {
      p_nivel: nivel,
      p_metrica: metrica,
      ...argumentosPeriodo(rango),
      p_limite: limite,
    })
  )
  return filas.map((fila) => ({
    codigo: fila.codigo,
    nombre: fila.nombre ?? fila.codigo,
    valor: numero(fila.valor),
    valorAnterior: numeroONulo(fila.valor_anterior),
    participacion: numeroONulo(fila.participacion),
    variacion: numeroONulo(fila.variacion),
  }))
}

async function cargarResumen(
  filtros: FiltrosReporte,
  usuario: UsuarioSesion
): Promise<DatosResumen> {
  const supabase = await crearClienteServidor()
  const granularidad = granularidadPara(diasEnRango(filtros.rango))
  const conRanking = tieneAlgunPermiso(usuario, ["analitica.global"])
  // `top_zonas` compara siempre con los N días previos; el reporte, con el
  // periodo alineado (docs/kpis.md §0.1): se lee cada periodo por separado.
  const gmvPorDepartamento = (rango: FiltrosReporte["rango"]) =>
    conRanking
      ? topZonas(
          supabase,
          "departamento",
          "gmv",
          rango,
          TODOS_LOS_DEPARTAMENTOS
        )
      : Promise.resolve(null)
  const [
    kpis,
    serie,
    serieAnterior,
    mezcla,
    zonas,
    zonasAnteriores,
    ctx,
    config,
  ] = await Promise.all([
    leer(
      "leer el resumen ejecutivo",
      supabase.rpc("reporte_resumen_ejecutivo", argumentosComparacion(filtros))
    ),
    serieGmv(supabase, filtros.rango, granularidad),
    serieGmv(supabase, filtros.anterior, granularidad),
    leer(
      "leer la mezcla por plataforma",
      supabase.rpc("mezcla_plataformas", argumentosPeriodo(filtros.rango))
    ),
    gmvPorDepartamento(filtros.rango),
    gmvPorDepartamento(filtros.anterior),
    contexto("resumen-ejecutivo", filtros),
    configAnalitica(),
  ])
  return {
    contexto: ctx,
    config,
    kpis: kpis.map(filaKpi),
    granularidad,
    serie,
    serieAnterior,
    mezcla: mezcla.map((fila): FilaMezcla => ({
      plataforma: fila.plataforma,
      formatoClave: fila.formato_clave,
      formatoNombre: fila.formato_nombre,
      asignaciones: numero(fila.asignaciones),
      gmv: numero(fila.gmv),
      alcance: numero(fila.alcance),
      participacion: numeroONulo(fila.participacion_gmv),
      cpm: numeroONulo(fila.cpm_efectivo),
    })),
    zonas: zonas ? zonasComparadas(zonas, zonasAnteriores ?? []) : null,
  }
}

// ── Cobertura territorial ────────────────────────────────────────────────────

async function cobertura(
  supabase: Cliente,
  rango: FiltrosReporte["rango"],
  departamento: string | null
): Promise<Omit<FilaCobertura, "gmvAnterior">[]> {
  const filas = await leer(
    "leer la cobertura territorial",
    supabase.rpc(
      "reporte_cobertura_territorial",
      argumentosRpc<"reporte_cobertura_territorial">({
        ...argumentosPeriodo(rango),
        p_departamento: departamento,
      })
    )
  )
  return filas.map((fila) => ({
    codigo: fila.municipio_codigo ?? fila.departamento_codigo,
    departamentoCodigo: fila.departamento_codigo,
    departamento: fila.departamento,
    municipio: fila.municipio ?? null,
    poblacion: numeroONulo(fila.poblacion),
    medios: numero(fila.medios),
    mediosActivos: numero(fila.medios_activos),
    mediosPor100k: numeroONulo(fila.medios_por_100k),
    asignaciones: numero(fila.asignaciones),
    gmv: numero(fila.gmv),
    alcance: numero(fila.alcance),
  }))
}

function conAnterior(
  filas: readonly Omit<FilaCobertura, "gmvAnterior">[],
  anteriores: readonly Omit<FilaCobertura, "gmvAnterior">[] | null
): FilaCobertura[] {
  const previo = new Map(anteriores?.map((f) => [f.codigo, f.gmv]))
  return filas.map((fila) => ({
    ...fila,
    gmvAnterior: previo.get(fila.codigo) ?? null,
  }))
}

async function cargarCobertura(
  filtros: FiltrosReporte,
  usuario: UsuarioSesion
): Promise<DatosCobertura> {
  const supabase = await crearClienteServidor()
  const dep = filtros.departamento
  const conTop = !dep && tieneAlgunPermiso(usuario, ["analitica.global"])
  const [nacional, nacionalAnterior, municipios, municipiosAnterior, top, ctx] =
    await Promise.all([
      cobertura(supabase, filtros.rango, null),
      dep ? Promise.resolve(null) : cobertura(supabase, filtros.anterior, null),
      dep ? cobertura(supabase, filtros.rango, dep) : Promise.resolve(null),
      dep ? cobertura(supabase, filtros.anterior, dep) : Promise.resolve(null),
      conTop
        ? topZonas(
            supabase,
            "municipio",
            "medios",
            filtros.rango,
            TOP_MUNICIPIOS
          )
        : Promise.resolve(null),
      contexto("cobertura-territorial", filtros),
    ])
  const filas = municipios ?? nacional
  const anteriores = municipiosAnterior ?? nacionalAnterior ?? []
  return {
    contexto: ctx,
    nivel: dep ? "municipio" : "departamento",
    departamento: dep,
    filas: conAnterior(filas, anteriores),
    departamentos: conAnterior(nacional, nacionalAnterior),
    totales: totalesCobertura(conAnterior(filas, anteriores)),
    anterior: totalesCobertura(conAnterior(anteriores, null)),
    topMunicipios: top,
  }
}

// ── Usuarios y accesos ───────────────────────────────────────────────────────

async function usuariosAccesos(
  supabase: Cliente,
  rango: FiltrosReporte["rango"]
): Promise<FilaUsuarioAcceso[]> {
  const filas = await leerTodo("leer los usuarios y accesos", (desde, hasta) =>
    supabase
      .rpc("reporte_usuarios_accesos", argumentosPeriodo(rango))
      .range(desde, hasta)
  )
  return filas.map((fila) => ({
    id: fila.usuario_id,
    nombre: fila.nombre ?? null,
    email: fila.email,
    rol: fila.rol ?? null,
    estado: fila.estado as EstadoPerfil,
    ultimoAccesoAt: fila.ultimo_acceso_at ?? null,
    exitosos: numero(fila.accesos_exitosos),
    fallidos: numero(fila.accesos_fallidos),
    paises: numero(fila.paises_distintos),
    sospechosos: numero(fila.sospechosos),
    mfaActivo: Boolean(fila.mfa_activo),
  }))
}

async function cargarUsuariosAccesos(
  filtros: FiltrosReporte
): Promise<DatosUsuariosAccesos> {
  const supabase = await crearClienteServidor()
  const [filas, anteriores, actividad, ctx] = await Promise.all([
    usuariosAccesos(supabase, filtros.rango),
    usuariosAccesos(supabase, filtros.anterior),
    leer(
      "leer la actividad de accesos",
      supabase.rpc("actividad_heatmap", {
        ...argumentosPeriodo(filtros.rango),
        p_fuente: "accesos",
      })
    ),
    contexto("usuarios-accesos", filtros),
  ])
  return {
    contexto: ctx,
    filas,
    totales: totalesAccesos(filas),
    anterior: totalesAccesos(anteriores),
    actividad: actividad.map((celda): CeldaActividad => ({
      diaSemana: numero(celda.dia_semana),
      hora: numero(celda.hora),
      cantidad: numero(celda.cantidad),
    })),
  }
}

// ── Desempeño de campañas ────────────────────────────────────────────────────

async function campanas(
  supabase: Cliente,
  rango: FiltrosReporte["rango"],
  anunciante: string | null
): Promise<FilaCampana[]> {
  const filas = await leerTodo(
    "leer el desempeño de las campañas",
    (desde, hasta) =>
      supabase
        .rpc(
          "reporte_desempeno_campanas",
          argumentosRpc<"reporte_desempeno_campanas">({
            ...argumentosPeriodo(rango),
            p_anunciante_id: anunciante,
          })
        )
        .range(desde, hasta)
  )
  return filas.map((fila) => ({
    id: fila.campana_id,
    campana: fila.campana,
    anunciante: fila.anunciante ?? null,
    ofertas: numero(fila.ofertas),
    cupos: numero(fila.cupos),
    cuposOcupados: numero(fila.cupos_ocupados),
    tasaLlenado: numeroONulo(fila.tasa_llenado),
    gmvComprometido: numero(fila.gmv_comprometido),
    gmvVerificado: numero(fila.gmv_verificado),
    alcance: numero(fila.alcance),
    impresiones: numero(fila.impresiones),
    interacciones: numero(fila.interacciones),
    reproducciones: numero(fila.reproducciones),
    clics: numero(fila.clics),
    cpm: numeroONulo(fila.cpm_efectivo),
    costoPorInteraccion: numeroONulo(fila.costo_por_interaccion),
    engagement: numeroONulo(fila.engagement),
    costoPorAlcance: numeroONulo(fila.costo_por_alcance),
    tasaCumplimiento: numeroONulo(fila.tasa_cumplimiento),
    nVerificadas: numero(fila.n_verificadas),
  }))
}

async function porPlataforma(
  supabase: Cliente,
  rango: FiltrosReporte["rango"]
): Promise<FilaPlataforma[]> {
  const filas = await leer(
    "leer el desempeño por plataforma",
    supabase.rpc(
      "desempeno_anunciante",
      argumentosRpc<"desempeno_anunciante">({
        ...argumentosPeriodo(rango),
        p_dimension: "plataforma",
        p_campana_id: null,
      })
    )
  )
  return filas.map((fila) => ({
    plataforma: fila.clave,
    nombre: nombrePlataforma(fila.clave),
    asignaciones: numero(fila.asignaciones),
    gmv: numero(fila.gmv),
    alcance: numero(fila.alcance),
    impresiones: numero(fila.impresiones),
    cpm: numeroONulo(fila.cpm_efectivo),
    engagement: numeroONulo(fila.engagement),
    n: numero(fila.n),
  }))
}

async function nombreAnunciante(
  supabase: Cliente,
  id: string
): Promise<string | null> {
  const { data } = await supabase
    .from("anunciantes")
    .select("nombre_comercial")
    .eq("id", id)
    .maybeSingle()
  return data?.nombre_comercial ?? null
}

async function cargarDesempeno(
  filtros: FiltrosReporte,
  usuario: UsuarioSesion
): Promise<DatosDesempeno> {
  const supabase = await crearClienteServidor()
  // El anunciante ve solo lo suyo (la RPC lo fuerza); el filtro es para internos.
  const anunciante = usuario.anuncianteId ? null : filtros.anunciante
  const [filas, anteriores, plataformas, nombre] = await Promise.all([
    campanas(supabase, filtros.rango, anunciante),
    campanas(supabase, filtros.anterior, anunciante),
    // `desempeno_anunciante` no filtra por anunciante para un interno.
    anunciante ? Promise.resolve(null) : porPlataforma(supabase, filtros.rango),
    anunciante ? nombreAnunciante(supabase, anunciante) : Promise.resolve(null),
  ])
  return {
    contexto: await contexto("desempeno-campanas", filtros, {
      anunciante: nombre,
    }),
    unAnunciante: Boolean(usuario.anuncianteId) || anunciante !== null,
    filas,
    totales: totalesDesempeno(filas),
    anterior: totalesDesempeno(anteriores),
    porPlataforma: plataformas,
  }
}

// ── Cumplimiento de medios ───────────────────────────────────────────────────

async function cumplimiento(
  supabase: Cliente,
  rango: FiltrosReporte["rango"],
  departamento: string | null
): Promise<FilaCumplimiento[]> {
  const filas = await leerTodo(
    "leer el cumplimiento de los medios",
    (desde, hasta) =>
      supabase
        .rpc(
          "reporte_cumplimiento_medios",
          argumentosRpc<"reporte_cumplimiento_medios">({
            ...argumentosPeriodo(rango),
            p_departamento: departamento,
          })
        )
        .range(desde, hasta)
  )
  return filas.map((fila) => ({
    id: fila.medio_id,
    medio: fila.medio,
    departamento: fila.departamento ?? null,
    municipio: fila.municipio ?? null,
    nivel: numeroONulo(fila.nivel),
    comprometidas: numero(fila.comprometidas),
    cumplidas: numero(fila.cumplidas),
    vencidas: numero(fila.vencidas),
    canceladas: numero(fila.canceladas),
    enDisputa: numero(fila.en_disputa),
    tasa: numeroONulo(fila.tasa_cumplimiento),
    alertas: numero(fila.alertas_metricas),
    multiplicador: numeroONulo(fila.multiplicador_promedio),
  }))
}

async function cargarCumplimiento(
  filtros: FiltrosReporte
): Promise<DatosCumplimiento> {
  const supabase = await crearClienteServidor()
  const [filas, anteriores, ctx] = await Promise.all([
    cumplimiento(supabase, filtros.rango, filtros.departamento),
    cumplimiento(supabase, filtros.anterior, filtros.departamento),
    contexto("cumplimiento-medios", filtros),
  ])
  return {
    contexto: ctx,
    departamento: filtros.departamento,
    filas,
    totales: totalesCumplimiento(filas),
    anterior: totalesCumplimiento(anteriores),
  }
}

// ── Finanzas ─────────────────────────────────────────────────────────────────

async function finanzas(
  supabase: Cliente,
  rango: FiltrosReporte["rango"],
  agrupacion: FiltrosReporte["agrupacion"]
): Promise<FilaFinanzas[]> {
  const filas = await leerTodo("leer el reporte financiero", (desde, hasta) =>
    supabase
      .rpc("reporte_finanzas", {
        ...argumentosPeriodo(rango),
        p_agrupacion: agrupacion,
      })
      .range(desde, hasta)
  )
  return filas.map((fila) => ({
    id: fila.grupo_id,
    grupo: fila.grupo ?? fila.grupo_id,
    gmvComprometido: numero(fila.gmv_comprometido),
    gmvVerificado: numero(fila.gmv_verificado),
    comision: numero(fila.comision),
    takeRate: numeroONulo(fila.take_rate),
    pagadoMedios: numero(fila.pagado_medios),
    facturado: numero(fila.facturado),
    recaudado: numero(fila.recaudado),
    cartera: numero(fila.cartera),
  }))
}

/** Ids de los anunciantes de un sector (para filtrar el detalle por anunciante). */
async function anunciantesDelSector(
  supabase: Cliente,
  sector: string
): Promise<Set<string>> {
  const filas = await leerTodo(
    "leer los anunciantes del sector",
    (desde, hasta) =>
      supabase
        .from("anunciantes")
        .select("id")
        .eq("sector_id", sector)
        .order("id")
        .range(desde, hasta)
  )
  return new Set(filas.map((fila) => fila.id))
}

async function nombreSector(
  supabase: Cliente,
  id: string
): Promise<string | null> {
  const { data } = await supabase
    .from("sectores")
    .select("nombre")
    .eq("id", id)
    .maybeSingle()
  return data?.nombre ?? null
}

async function cargarFinanzas(filtros: FiltrosReporte): Promise<DatosFinanzas> {
  const supabase = await crearClienteServidor()
  const sector = filtros.sector
  const [porMes, porSector, porAnunciante, sectorAnterior, delSector, nombre] =
    await Promise.all([
      finanzas(supabase, filtros.rango, "mes"),
      finanzas(supabase, filtros.rango, "sector"),
      finanzas(supabase, filtros.rango, "anunciante"),
      finanzas(supabase, filtros.anterior, "sector"),
      sector ? anunciantesDelSector(supabase, sector) : Promise.resolve(null),
      sector ? nombreSector(supabase, sector) : Promise.resolve(null),
    ])
  const enSector = (filas: FilaFinanzas[]) =>
    sector ? filas.filter((fila) => fila.id === sector) : filas
  const anunciantes = delSector
    ? porAnunciante.filter((fila) => delSector.has(fila.id))
    : porAnunciante
  const filasTabla: Record<FiltrosReporte["agrupacion"], FilaFinanzas[]> = {
    anunciante: anunciantes,
    sector: enSector(porSector),
    mes: porMes,
  }
  return {
    contexto: await contexto("finanzas", filtros, { sector: nombre }),
    agrupacion: filtros.agrupacion,
    sector: sector ? (nombre ?? "seleccionado") : null,
    filas: filasTabla[filtros.agrupacion],
    porMes,
    porSector,
    porAnunciante: anunciantes,
    totales: totalesFinanzas(enSector(porSector)),
    anterior: totalesFinanzas(enSector(sectorAnterior)),
  }
}

// ── Cartera ──────────────────────────────────────────────────────────────────

async function cartera(supabase: Cliente, corte: Date): Promise<FilaCartera[]> {
  const filas = await leerTodo("leer la cartera", (desde, hasta) =>
    supabase
      .rpc("reporte_cartera", { p_corte: serializarFecha(corte) })
      .range(desde, hasta)
  )
  return filas.map((fila) => ({
    id: fila.anunciante_id,
    anunciante: fila.anunciante ?? "Anunciante sin nombre",
    facturado: numero(fila.facturado),
    pagado: numero(fila.pagado),
    saldo: numero(fila.saldo),
    saldo0a30: numero(fila.saldo_0_30),
    saldo31a60: numero(fila.saldo_31_60),
    saldo61a90: numero(fila.saldo_61_90),
    saldoMas90: numero(fila.saldo_90_mas),
    facturasVencidas: numero(fila.facturas_vencidas),
  }))
}

async function cargarCartera(filtros: FiltrosReporte): Promise<DatosCartera> {
  const supabase = await crearClienteServidor()
  const [filas, anteriores, ctx] = await Promise.all([
    cartera(supabase, filtros.corte),
    cartera(supabase, filtros.corteAnterior),
    contexto("cartera", filtros),
  ])
  return {
    contexto: ctx,
    corte: serializarFecha(filtros.corte),
    filas,
    totales: totalesCartera(filas),
    anterior: totalesCartera(anteriores),
  }
}

// ── Registro ─────────────────────────────────────────────────────────────────

type Cargadores = {
  [S in SlugReporte]: (
    filtros: FiltrosReporte,
    usuario: UsuarioSesion
  ) => Promise<DatosPorReporte[S]>
}

const CARGADORES: Cargadores = {
  "resumen-ejecutivo": cargarResumen,
  "desempeno-campanas": cargarDesempeno,
  finanzas: cargarFinanzas,
  cartera: cargarCartera,
  "cobertura-territorial": cargarCobertura,
  "cumplimiento-medios": cargarCumplimiento,
  "usuarios-accesos": cargarUsuariosAccesos,
}

export function cargarDatosReporte<S extends SlugReporte>(
  slug: S,
  filtros: FiltrosReporte,
  usuario: UsuarioSesion
): Promise<DatosPorReporte[S]> {
  const cargar: Cargadores[S] = CARGADORES[slug]
  return cargar(filtros, usuario)
}
