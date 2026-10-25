import "server-only"

import { cache } from "react"

import {
  clienteSolicitud,
  fallar,
  leerPagina,
  leerTodo,
} from "@/features/operacion/queries/comun"
import { patronLiteral } from "@/features/operacion/formato"
import type { PaginaFilas } from "@/features/operacion/tipos"
import type { Database, Json } from "@/types/database.types"

import type { EstadoTablaMisCampanas } from "./estado-tabla"
import type { OpcionAnuncianteGestion } from "./gestion"
import { contarPorEstado } from "./presentacion"
import type {
  CampanaActiva,
  MiCampana,
  MiCampanaFila,
  OfertaDeCampana,
  OfertaPorAtender,
  ResumenMisCampanas,
  SituacionEmpresa,
} from "./tipos"

/**
 * Consultas del portal de campañas del anunciante. Todo se lee con el cliente
 * de la SESIÓN: la RLS deja ver las campañas y ofertas de la propia empresa
 * (también las de sus compañeros, ANU-002) y oculta las archivadas. El filtro
 * explícito por anunciante solo hace legible la intención.
 */

type Tablas = Database["public"]["Tables"]

// ── Empresa ──────────────────────────────────────────────────────────────────

/** Estado de verificación de la empresa del usuario (ADM-003, lado anunciante). */
export const situacionEmpresa = cache(
  async (anuncianteId: string): Promise<SituacionEmpresa | null> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase
      .from("anunciantes")
      .select(
        "id, nombre_comercial, estado_verificacion, motivo_estado, enviado_verificacion_at"
      )
      .eq("id", anuncianteId)
      .maybeSingle()
    if (error) fallar("leer el estado de tu empresa", error)
    if (!data) return null
    return {
      anuncianteId: data.id,
      nombre: data.nombre_comercial,
      estado: data.estado_verificacion,
      motivo: data.motivo_estado,
      enviadaAt: data.enviado_verificacion_at,
    }
  }
)

// ── Listado ──────────────────────────────────────────────────────────────────

type FilaListado = Pick<
  Tablas["campanas"]["Row"],
  | "id"
  | "nombre"
  | "marca"
  | "estado"
  | "fecha_inicio"
  | "fecha_fin"
  | "presupuesto_total"
  | "presupuesto_comprometido"
  | "created_at"
> & { ofertas: Pick<Tablas["ofertas"]["Row"], "estado">[] }

const SELECCION_LISTADO = `
  id, nombre, marca, estado, fecha_inicio, fecha_fin, presupuesto_total,
  presupuesto_comprometido, created_at,
  ofertas ( estado, deleted_at )
`

const COLUMNAS_ORDEN: Readonly<
  Record<EstadoTablaMisCampanas["orden"]["campo"], string>
> = {
  nombre: "nombre",
  inicio: "fecha_inicio",
  fin: "fecha_fin",
  presupuesto: "presupuesto_total",
  estado: "estado",
  creado: "created_at",
}

function aFila(fila: FilaListado): MiCampanaFila {
  return {
    id: fila.id,
    nombre: fila.nombre,
    marca: fila.marca,
    estado: fila.estado,
    fechaInicio: fila.fecha_inicio,
    fechaFin: fila.fecha_fin,
    presupuestoTotal: fila.presupuesto_total,
    presupuestoComprometido: fila.presupuesto_comprometido,
    ofertas: fila.ofertas.length,
    ofertasPorEstado: contarPorEstado(fila.ofertas),
    creadaAt: fila.created_at,
  }
}

export async function listarMisCampanas(
  anuncianteId: string,
  estado: EstadoTablaMisCampanas
): Promise<PaginaFilas<MiCampanaFila>> {
  const supabase = await clienteSolicitud()
  const patron = patronLiteral(estado.q)
  const pagina = await leerPagina(
    "listar tus campañas",
    estado.pagina,
    estado.tamano,
    (desde, hasta) => {
      let consulta = supabase
        .from("campanas")
        .select(SELECCION_LISTADO, { count: "exact" })
        .eq("anunciante_id", anuncianteId)
        .is("deleted_at", null)
        .is("ofertas.deleted_at", null)
      if (patron) {
        consulta = consulta.or(`nombre.ilike.${patron},marca.ilike.${patron}`)
      }
      if (estado.estado.length > 0) {
        consulta = consulta.in("estado", estado.estado)
      }
      return consulta
        .order(COLUMNAS_ORDEN[estado.orden.campo], {
          ascending: !estado.orden.descendente,
        })
        .order("id")
        .range(desde, hasta)
        .overrideTypes<FilaListado[], { merge: false }>()
    }
  )
  return { total: pagina.total, filas: pagina.filas.map(aFila) }
}

export async function resumenMisCampanas(
  anuncianteId: string
): Promise<ResumenMisCampanas> {
  const supabase = await clienteSolicitud()
  const filas = await leerTodo("resumir tus campañas", (desde, hasta) =>
    supabase
      .from("campanas")
      .select("id, estado, presupuesto_total, presupuesto_comprometido")
      .eq("anunciante_id", anuncianteId)
      .is("deleted_at", null)
      .order("id")
      .range(desde, hasta)
  )
  const activas = filas.filter((fila) => fila.estado === "ACTIVA")
  return {
    total: filas.length,
    activas: activas.length,
    borradores: filas.filter((fila) => fila.estado === "BORRADOR").length,
    cerradas: filas.filter(
      (fila) => fila.estado === "FINALIZADA" || fila.estado === "CANCELADA"
    ).length,
    presupuestoActivas: activas.reduce(
      (suma, fila) => suma + fila.presupuesto_total,
      0
    ),
    comprometidoActivas: activas.reduce(
      (suma, fila) => suma + fila.presupuesto_comprometido,
      0
    ),
  }
}

// ── Ficha ────────────────────────────────────────────────────────────────────

/**
 * La campaña con lo que le queda para ofertas (`disponible_campana`). Con
 * `anuncianteId`, solo si es de esa empresa (el portal del anunciante); sin
 * él, la que la RLS deje ver (la gestión asistida del equipo AMO).
 */
async function leerCampana(
  anuncianteId: string | null,
  id: string
): Promise<MiCampana | null> {
  const supabase = await clienteSolicitud()
  let consulta = supabase
    .from("campanas")
    .select(
      `id, nombre, marca, objetivo, anunciante_id, estado, fecha_inicio, fecha_fin, presupuesto_total,
       presupuesto_comprometido, activada_at, finalizada_at, cancelada_at, created_at, updated_at, es_demo,
       gestion_asistida`
    )
    .eq("id", id)
    .is("deleted_at", null)
  if (anuncianteId) consulta = consulta.eq("anunciante_id", anuncianteId)
  const [campana, disponible] = await Promise.all([
    consulta.maybeSingle(),
    supabase.rpc("disponible_campana", { p_campana_id: id }),
  ])
  if (campana.error) fallar("leer la campaña", campana.error)
  if (disponible.error)
    fallar("leer el disponible de la campaña", disponible.error)
  const fila = campana.data
  if (!fila) return null
  // La función devuelve null si la campaña no es visible (las SQL generan `number`).
  const valorDisponible = disponible.data as number | null
  return {
    id: fila.id,
    nombre: fila.nombre,
    marca: fila.marca,
    objetivo: fila.objetivo,
    anuncianteId: fila.anunciante_id,
    estado: fila.estado,
    fechaInicio: fila.fecha_inicio,
    fechaFin: fila.fecha_fin,
    presupuestoTotal: fila.presupuesto_total,
    presupuestoComprometido: fila.presupuesto_comprometido,
    disponible:
      typeof valorDisponible === "number" && Number.isFinite(valorDisponible)
        ? valorDisponible
        : null,
    activadaAt: fila.activada_at,
    finalizadaAt: fila.finalizada_at,
    canceladaAt: fila.cancelada_at,
    creadaAt: fila.created_at,
    actualizadaAt: fila.updated_at,
    esDemo: fila.es_demo,
    gestionAsistida: fila.gestion_asistida,
  }
}

/** Campaña de la empresa del usuario (`null` si no existe o es de otra). */
export const obtenerMiCampana = cache(
  async (anuncianteId: string, id: string): Promise<MiCampana | null> =>
    leerCampana(anuncianteId, id)
)

/**
 * Campaña que el equipo AMO gestiona por cuenta de su anunciante (ADM-014):
 * sin filtrar por empresa, la RLS decide (`campanas.ver`).
 */
export const obtenerCampanaGestionable = cache(
  async (id: string): Promise<MiCampana | null> => leerCampana(null, id)
)

/**
 * Empresas por cuenta de las cuales el equipo AMO puede crear una campaña
 * (no borradas), con su verificación, por nombre. Con `anunciantes.ver`.
 */
export const anunciantesParaGestion = cache(
  async (): Promise<OpcionAnuncianteGestion[]> => {
    const supabase = await clienteSolicitud()
    const filas = await leerTodo("leer los anunciantes", (desde, hasta) =>
      supabase
        .from("anunciantes")
        .select("id, nombre_comercial, estado_verificacion")
        .is("deleted_at", null)
        .order("nombre_comercial")
        .order("id")
        .range(desde, hasta)
    )
    return filas.map((fila) => ({
      id: fila.id,
      nombre: fila.nombre_comercial,
      estado: fila.estado_verificacion,
    }))
  }
)

const SELECCION_OFERTA = `
  id, campana_id, titulo, estado, plataforma, fecha_limite_aceptacion, ventana_inicio, ventana_fin,
  presupuesto_maximo, presupuesto_comprometido, cupos_totales, cupos_ocupados, comentario_moderacion,
  devuelta_at, updated_at,
  formato:formatos ( nombre )
`

type FilaOferta = Pick<
  Tablas["ofertas"]["Row"],
  | "id"
  | "campana_id"
  | "titulo"
  | "estado"
  | "plataforma"
  | "fecha_limite_aceptacion"
  | "ventana_inicio"
  | "ventana_fin"
  | "presupuesto_maximo"
  | "presupuesto_comprometido"
  | "cupos_totales"
  | "cupos_ocupados"
  | "comentario_moderacion"
  | "devuelta_at"
  | "updated_at"
> & { formato: { nombre: string } | null }

function aOferta(fila: FilaOferta): OfertaDeCampana {
  return {
    id: fila.id,
    campanaId: fila.campana_id,
    titulo: fila.titulo,
    estado: fila.estado,
    plataforma: fila.plataforma,
    formato: fila.formato?.nombre ?? null,
    fechaLimiteAceptacion: fila.fecha_limite_aceptacion,
    ventanaInicio: fila.ventana_inicio,
    ventanaFin: fila.ventana_fin,
    presupuestoMaximo: fila.presupuesto_maximo,
    presupuestoComprometido: fila.presupuesto_comprometido,
    cuposTotales: fila.cupos_totales,
    cuposOcupados: fila.cupos_ocupados,
    comentarioModeracion: fila.comentario_moderacion,
    devueltaAt: fila.devuelta_at,
    actualizadaAt: fila.updated_at,
  }
}

/** Ofertas de la campaña (sin las archivadas), en orden de creación. */
export const ofertasDeMiCampana = cache(
  async (campanaId: string): Promise<OfertaDeCampana[]> => {
    const supabase = await clienteSolicitud()
    const filas = await leerTodo(
      "leer las ofertas de la campaña",
      (desde, hasta) =>
        supabase
          .from("ofertas")
          .select(SELECCION_OFERTA)
          .eq("campana_id", campanaId)
          .is("deleted_at", null)
          .order("created_at")
          .order("id")
          .range(desde, hasta)
          .overrideTypes<FilaOferta[], { merge: false }>()
    )
    return filas.map(aOferta)
  }
)

// ── Inicio del anunciante ────────────────────────────────────────────────────

/** Tope de ofertas devueltas o en borrador que revisa el inicio. */
const LIMITE_OFERTAS_ABIERTAS = 200

/**
 * Ofertas devueltas o en borrador de la empresa, con el nombre de su campaña
 * (una campaña cancelada o finalizada ya no tiene ninguna: la cancelación las
 * cancela en cascada y el cierre exige todas cerradas). El inicio decide
 * cuáles piden atención (`ofertasPorAtender`).
 */
export async function ofertasAbiertasDeEmpresa(
  anuncianteId: string
): Promise<OfertaPorAtender[]> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("ofertas")
    .select(`${SELECCION_OFERTA}, campana:campanas ( nombre )`)
    .eq("anunciante_id", anuncianteId)
    .in("estado", ["DEVUELTA", "BORRADOR"])
    .is("deleted_at", null)
    .order("fecha_limite_aceptacion")
    .order("id")
    .limit(LIMITE_OFERTAS_ABIERTAS)
    .overrideTypes<
      (FilaOferta & { campana: { nombre: string } | null })[],
      { merge: false }
    >()
  if (error) fallar("leer las ofertas por atender", error)
  return (data ?? []).map((fila) => ({
    ...aOferta(fila),
    campana: fila.campana?.nombre ?? "Campaña",
  }))
}

/** Campañas activas, la que termina primero arriba, con sus ofertas por estado. */
export async function campanasActivas(
  anuncianteId: string,
  limite: number
): Promise<{ campanas: CampanaActiva[]; total: number }> {
  const supabase = await clienteSolicitud()
  const { data, error, count } = await supabase
    .from("campanas")
    .select(
      `id, nombre, marca, fecha_inicio, fecha_fin, presupuesto_total, presupuesto_comprometido,
       ofertas ( estado, deleted_at )`,
      { count: "exact" }
    )
    .eq("anunciante_id", anuncianteId)
    .eq("estado", "ACTIVA")
    .is("deleted_at", null)
    .is("ofertas.deleted_at", null)
    .order("fecha_fin")
    .order("id")
    .limit(limite)
  if (error) fallar("leer tus campañas activas", error)
  return {
    total: count ?? data.length,
    campanas: data.map((fila) => ({
      id: fila.id,
      nombre: fila.nombre,
      marca: fila.marca,
      fechaInicio: fila.fecha_inicio,
      fechaFin: fila.fecha_fin,
      presupuestoTotal: fila.presupuesto_total,
      presupuestoComprometido: fila.presupuesto_comprometido,
      ofertasPorEstado: contarPorEstado(fila.ofertas),
    })),
  }
}

/** Valor por defecto de `ofertas.anticipacion_minima_horas` (docs/modelo-datos.md §7). */
const ANTICIPACION_POR_DEFECTO = 24

function comoEntero(valor: Json | undefined): number | null {
  const numero = typeof valor === "string" ? Number(valor) : valor
  return typeof numero === "number" && Number.isFinite(numero) && numero >= 0
    ? numero
    : null
}

/** Horas mínimas entre el envío a revisión y la fecha límite (configuración pública). */
export const anticipacionMinimaHoras = cache(async (): Promise<number> => {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("configuracion")
    .select("valor")
    .eq("clave", "ofertas.anticipacion_minima_horas")
    .maybeSingle()
  if (error) return ANTICIPACION_POR_DEFECTO
  return comoEntero(data?.valor) ?? ANTICIPACION_POR_DEFECTO
})
