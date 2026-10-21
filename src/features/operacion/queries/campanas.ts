import "server-only"

import { cache } from "react"

import type { Database } from "@/types/database.types"

import { resumirCupos } from "../calculos"
import { ORDEN_PLATAFORMAS, type Plataforma } from "../estados"
import type { EstadoTablaCampanas } from "../estado-tablas"
import { textoParaFiltro } from "../formato"
import type {
  CampanaDetalle,
  CampanaFila,
  OfertaDetalle,
  OpcionCatalogo,
  PaginaFilas,
  ResumenCampanas,
} from "../tipos"
import {
  catalogos,
  clienteSolicitud,
  fallar,
  leerPagina,
  leerTodo,
  nombreDepartamento,
  nombreMunicipio,
} from "./comun"

type Tablas = Database["public"]["Tables"]

type FilaCampanaBd = Pick<
  Tablas["campanas"]["Row"],
  | "id"
  | "nombre"
  | "marca"
  | "anunciante_id"
  | "estado"
  | "fecha_inicio"
  | "fecha_fin"
  | "presupuesto_total"
  | "presupuesto_comprometido"
  | "created_at"
> & {
  anunciante: { nombre_comercial: string } | null
  ofertas: Pick<
    Tablas["ofertas"]["Row"],
    "id" | "plataforma" | "cupos_totales" | "cupos_ocupados"
  >[]
}

const SELECCION_LISTADO = `
  id, nombre, marca, anunciante_id, estado, fecha_inicio, fecha_fin, presupuesto_total,
  presupuesto_comprometido, created_at,
  anunciante:anunciantes ( nombre_comercial ),
  ofertas ( id, plataforma, cupos_totales, cupos_ocupados, deleted_at )
`

const COLUMNAS_ORDEN: Readonly<
  Record<EstadoTablaCampanas["orden"]["campo"], string>
> = {
  nombre: "nombre",
  inicio: "fecha_inicio",
  fin: "fecha_fin",
  presupuesto: "presupuesto_total",
  comprometido: "presupuesto_comprometido",
  estado: "estado",
  creado: "created_at",
}

function plataformasDe(ofertas: FilaCampanaBd["ofertas"]): Plataforma[] {
  const presentes = new Set(ofertas.map((oferta) => oferta.plataforma))
  return ORDEN_PLATAFORMAS.filter((plataforma) => presentes.has(plataforma))
}

function aCampanaFila(fila: FilaCampanaBd): CampanaFila {
  return {
    id: fila.id,
    nombre: fila.nombre,
    marca: fila.marca,
    anuncianteId: fila.anunciante_id,
    anunciante: fila.anunciante?.nombre_comercial ?? null,
    estado: fila.estado,
    fechaInicio: fila.fecha_inicio,
    fechaFin: fila.fecha_fin,
    presupuestoTotal: fila.presupuesto_total,
    presupuestoComprometido: fila.presupuesto_comprometido,
    ofertas: fila.ofertas.length,
    plataformas: plataformasDe(fila.ofertas),
    cuposTotales: fila.ofertas.reduce(
      (suma, oferta) => suma + oferta.cupos_totales,
      0
    ),
    cuposOcupados: fila.ofertas.reduce(
      (suma, oferta) => suma + oferta.cupos_ocupados,
      0
    ),
    creadaAt: fila.created_at,
  }
}

export async function listarCampanas(
  estado: EstadoTablaCampanas
): Promise<PaginaFilas<CampanaFila>> {
  const supabase = await clienteSolicitud()
  const texto = textoParaFiltro(estado.q)
  const seleccion =
    estado.plataforma.length > 0
      ? `${SELECCION_LISTADO}, con_plataforma:ofertas!inner ( id )`
      : SELECCION_LISTADO

  const pagina = await leerPagina(
    "listar las campañas",
    estado.pagina,
    estado.tamano,
    (desde, hasta) => {
      let consulta = supabase
        .from("campanas")
        .select(seleccion, { count: "exact" })
        .is("deleted_at", null)
        .is("ofertas.deleted_at", null)
      if (texto) {
        consulta = consulta.or(`nombre.ilike.%${texto}%,marca.ilike.%${texto}%`)
      }
      if (estado.estado.length > 0)
        consulta = consulta.in("estado", estado.estado)
      if (estado.anunciante.length > 0) {
        consulta = consulta.in("anunciante_id", estado.anunciante)
      }
      if (estado.plataforma.length > 0) {
        consulta = consulta
          .in("con_plataforma.plataforma", estado.plataforma)
          .is("con_plataforma.deleted_at", null)
      }
      return consulta
        .order(COLUMNAS_ORDEN[estado.orden.campo], {
          ascending: !estado.orden.descendente,
        })
        .order("id")
        .range(desde, hasta)
        .overrideTypes<FilaCampanaBd[], { merge: false }>()
    }
  )

  return { total: pagina.total, filas: pagina.filas.map(aCampanaFila) }
}

/** Todas las campañas de un anunciante (las más recientes primero) para su ficha. */
export const campanasDelAnunciante = cache(
  async (anuncianteId: string): Promise<CampanaFila[]> => {
    const supabase = await clienteSolicitud()
    const filas = await leerTodo(
      "leer las campañas del anunciante",
      (desde, hasta) =>
        supabase
          .from("campanas")
          .select(SELECCION_LISTADO)
          .eq("anunciante_id", anuncianteId)
          .is("deleted_at", null)
          .is("ofertas.deleted_at", null)
          .order("fecha_inicio", { ascending: false })
          .order("id")
          .range(desde, hasta)
          .overrideTypes<FilaCampanaBd[], { merge: false }>()
    )
    return filas.map(aCampanaFila)
  }
)

const campanasVisibles = cache(async () => {
  const supabase = await clienteSolicitud()
  return leerTodo("leer las campañas", (desde, hasta) =>
    supabase
      .from("campanas")
      .select(
        "id, nombre, estado, presupuesto_total, presupuesto_comprometido, created_at"
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id")
      .range(desde, hasta)
  )
})

export async function resumenCampanas(): Promise<ResumenCampanas> {
  const filas = await campanasVisibles()
  const activas = filas.filter((fila) => fila.estado === "ACTIVA")
  const contar = (estado: string) =>
    filas.filter((fila) => fila.estado === estado).length
  return {
    total: filas.length,
    activas: activas.length,
    borradores: contar("BORRADOR"),
    finalizadas: contar("FINALIZADA"),
    canceladas: contar("CANCELADA"),
    presupuestoActivas: activas.reduce((s, f) => s + f.presupuesto_total, 0),
    comprometidoActivas: activas.reduce(
      (s, f) => s + f.presupuesto_comprometido,
      0
    ),
  }
}

/** Opciones del filtro "Campaña" (las más recientes primero). */
export async function opcionesCampanas(): Promise<OpcionCatalogo[]> {
  return (await campanasVisibles()).map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
  }))
}

// ── Ficha ────────────────────────────────────────────────────────────────────

export const obtenerCampana = cache(
  async (id: string): Promise<CampanaDetalle | null> => {
    const supabase = await clienteSolicitud()
    const { data: fila, error } = await supabase
      .from("campanas")
      .select(
        `id, nombre, marca, objetivo, anunciante_id, estado, fecha_inicio, fecha_fin, presupuesto_total,
         presupuesto_comprometido, activada_at, finalizada_at, cancelada_at, created_at, es_demo, deleted_at,
         anunciante:anunciantes ( nombre_comercial )`
      )
      .eq("id", id)
      .maybeSingle()
    if (error) fallar("leer la campaña", error)
    if (!fila || fila.deleted_at) return null
    return {
      id: fila.id,
      nombre: fila.nombre,
      marca: fila.marca,
      objetivo: fila.objetivo,
      anuncianteId: fila.anunciante_id,
      anunciante: fila.anunciante?.nombre_comercial ?? null,
      estado: fila.estado,
      fechaInicio: fila.fecha_inicio,
      fechaFin: fila.fecha_fin,
      presupuestoTotal: fila.presupuesto_total,
      presupuestoComprometido: fila.presupuesto_comprometido,
      activadaAt: fila.activada_at,
      finalizadaAt: fila.finalizada_at,
      canceladaAt: fila.cancelada_at,
      creadaAt: fila.created_at,
      esDemo: fila.es_demo,
    }
  }
)

/** Ofertas de la campaña con cupos por franja y segmentación legible. */
export async function ofertasDeCampana(
  campanaId: string
): Promise<OfertaDetalle[]> {
  const supabase = await clienteSolicitud()
  const [{ data, error }, { franjas, formatos, categorias }] =
    await Promise.all([
      supabase
        .from("ofertas")
        .select(
          `id, titulo, estado, plataforma, formato_id, publicaciones_por_medio, permite_multiples_cupos,
           presupuesto_maximo, presupuesto_comprometido, tope_porcentaje_por_medio, ventana_inicio,
           ventana_fin, fecha_limite_aceptacion, permanencia_minima_dias, cortes_requeridos, instrucciones,
           restricciones, comentario_moderacion, publicada_at, llena_at, departamentos_objetivo,
           municipios_objetivo, categorias_objetivo, seguidores_minimos, medios_excluidos, exclusividad_dias,
           cupos:oferta_cupos ( franja_id, cupos_totales, cupos_ocupados )`
        )
        .eq("campana_id", campanaId)
        .is("deleted_at", null)
        .order("created_at"),
      catalogos(),
    ])
  if (error) fallar("leer las ofertas", error)

  return data.map((oferta) => ({
    id: oferta.id,
    titulo: oferta.titulo,
    estado: oferta.estado,
    plataforma: oferta.plataforma,
    formato: formatos.get(oferta.formato_id)?.nombre ?? null,
    publicacionesPorMedio: oferta.publicaciones_por_medio,
    permiteMultiplesCupos: oferta.permite_multiples_cupos,
    presupuestoMaximo: oferta.presupuesto_maximo,
    presupuestoComprometido: oferta.presupuesto_comprometido,
    topePorMedio: oferta.tope_porcentaje_por_medio,
    ventanaInicio: oferta.ventana_inicio,
    ventanaFin: oferta.ventana_fin,
    fechaLimiteAceptacion: oferta.fecha_limite_aceptacion,
    permanenciaDias: oferta.permanencia_minima_dias,
    cortes: oferta.cortes_requeridos,
    instrucciones: oferta.instrucciones,
    restricciones: oferta.restricciones,
    comentarioModeracion: oferta.comentario_moderacion,
    publicadaAt: oferta.publicada_at,
    llenaAt: oferta.llena_at,
    cupos: resumirCupos(
      oferta.cupos.map((cupo) => {
        const franja = franjas.get(cupo.franja_id)
        return {
          franjaId: cupo.franja_id,
          clave: franja?.clave ?? "—",
          nombre: franja?.nombre ?? "Franja",
          orden: franja?.orden ?? 99,
          totales: cupo.cupos_totales,
          ocupados: cupo.cupos_ocupados,
        }
      })
    ),
    segmentacion: {
      departamentos: oferta.departamentos_objetivo
        .map((codigo) => ({
          codigo,
          nombre: nombreDepartamento(codigo) ?? codigo,
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
      municipios: oferta.municipios_objetivo
        .map((codigo) => ({
          codigo,
          nombre: nombreMunicipio(codigo) ?? codigo,
          departamento: nombreDepartamento(codigo.slice(0, 2)) ?? "",
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
      categorias: oferta.categorias_objetivo
        .map((id) => categorias.get(id))
        .filter((nombre): nombre is string => Boolean(nombre)),
      seguidoresMinimos: oferta.seguidores_minimos,
      mediosExcluidos: oferta.medios_excluidos.length,
      exclusividadDias: oferta.exclusividad_dias,
    },
  }))
}
