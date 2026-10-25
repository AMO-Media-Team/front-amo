import "server-only"

import { cache } from "react"

import { creativosDeOferta } from "@/features/creativos/queries"
import type { EstadoCreativo, FormatoOferta } from "@/features/creativos/tipos"
import { clienteSolicitud, fallar } from "@/features/operacion/queries/comun"
import type { Json } from "@/types/database.types"

import { CLAVES_CONFIGURACION, configuracionDesdeFilas } from "./configuracion"
import { estadoCreativoInicial } from "./creativos"
import { requisitosDeFormato } from "./formatos"
import { CORTES_OFERTA } from "./schemas"
import type {
  CampanaAsistente,
  CatalogoAsistente,
  ConfiguracionAsistente,
  CorteOferta,
  EstadoAnunciante,
  FormatoAsistente,
  MedioExcluido,
  OfertaGuardadaBd,
} from "./tipos"

/**
 * Lecturas del asistente de oferta. Todo con el cliente del USUARIO (JWT +
 * RLS): el anunciante solo ve sus campañas y ofertas, el catálogo activo y la
 * configuración pública. Un error de lectura se lanza y lo recoge el límite
 * de error de la página.
 */

const n = (valor: number | string | null | undefined): number | null => {
  if (valor === null || valor === undefined) return null
  const numero = typeof valor === "number" ? valor : Number(valor)
  return Number.isFinite(numero) ? numero : null
}

// ── Configuración pública ────────────────────────────────────────────────────

export const configuracionAsistente = cache(
  async (): Promise<ConfiguracionAsistente> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase
      .from("configuracion")
      .select("clave, valor")
      .in("clave", CLAVES_CONFIGURACION)
    if (error) fallar("leer la configuración de ofertas", error)
    return configuracionDesdeFilas(data)
  }
)

// ── Catálogo ─────────────────────────────────────────────────────────────────

const COLUMNAS_FORMATO = "id, plataforma, clave, nombre, requisitos, orden"

function formatoDesdeFila(fila: {
  id: string
  plataforma: FormatoAsistente["plataforma"]
  clave: string
  nombre: string
  requisitos: Json
  orden: number
}): FormatoAsistente {
  return {
    id: fila.id,
    plataforma: fila.plataforma,
    clave: fila.clave,
    nombre: fila.nombre,
    requisitos: requisitosDeFormato(fila.requisitos),
    orden: fila.orden,
  }
}

/** Formatos y franjas activos y categorías visibles (RLS: solo las activas). */
export const catalogoAsistente = cache(async (): Promise<CatalogoAsistente> => {
  const supabase = await clienteSolicitud()
  const [formatos, franjas, categorias] = await Promise.all([
    supabase
      .from("formatos")
      .select(COLUMNAS_FORMATO)
      .eq("activo", true)
      .order("orden"),
    supabase
      .from("franjas")
      .select("id, clave, nombre, seguidores_min, seguidores_max, orden")
      .eq("activa", true)
      .order("orden"),
    supabase
      .from("categorias")
      .select("id, nombre, orden")
      .eq("activo", true)
      .is("deleted_at", null)
      .order("orden")
      .order("nombre"),
  ])
  if (formatos.error) fallar("leer los formatos", formatos.error)
  if (franjas.error) fallar("leer las franjas", franjas.error)
  if (categorias.error) fallar("leer las categorías", categorias.error)
  return {
    formatos: formatos.data.map(formatoDesdeFila),
    franjas: franjas.data.map((fila) => ({
      id: fila.id,
      clave: fila.clave,
      nombre: fila.nombre,
      seguidoresMin: fila.seguidores_min,
      seguidoresMax: fila.seguidores_max,
    })),
    categorias: categorias.data.map((fila) => ({
      id: fila.id,
      nombre: fila.nombre,
    })),
  }
})

/**
 * Formatos que ya no están activos pero usa alguna oferta del asistente
 * (AMO los retiró después de crearla): solo para nombrarlos y explicar cómo
 * seguir. El catálogo del asistente no los ofrece.
 */
export async function formatosRetirados(
  formatoIds: readonly string[]
): Promise<FormatoAsistente[]> {
  if (formatoIds.length === 0) return []
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("formatos")
    .select(COLUMNAS_FORMATO)
    .in("id", [...formatoIds])
    .eq("activo", false)
    .order("orden")
  if (error) fallar("leer los formatos retirados", error)
  return data.map(formatoDesdeFila)
}

// ── Campaña y empresa ────────────────────────────────────────────────────────

/**
 * Campaña con lo que queda disponible; `null` si no existe o no se ve (la del
 * anunciante, o cualquiera con `campanas.ver` en la gestión asistida).
 */
export async function campanaParaAsistente(
  campanaId: string,
  ofertaEditada?: string
): Promise<CampanaAsistente | null> {
  const supabase = await clienteSolicitud()
  const [campana, disponible] = await Promise.all([
    supabase
      .from("campanas")
      .select(
        "id, nombre, estado, fecha_inicio, fecha_fin, presupuesto_total, anunciante_id"
      )
      .eq("id", campanaId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.rpc("disponible_campana", {
      p_campana_id: campanaId,
      ...(ofertaEditada ? { p_excluir_oferta: ofertaEditada } : {}),
    }),
  ])
  if (campana.error) fallar("leer la campaña", campana.error)
  if (!campana.data) return null
  if (disponible.error) {
    console.error(
      `[asistente-oferta] leer el disponible falló (${disponible.error.code ?? "sin código"})`
    )
  }
  return {
    id: campana.data.id,
    nombre: campana.data.nombre,
    anuncianteId: campana.data.anunciante_id,
    estado: campana.data.estado,
    fechaInicio: campana.data.fecha_inicio,
    fechaFin: campana.data.fecha_fin,
    presupuestoTotal: n(campana.data.presupuesto_total) ?? 0,
    disponible: disponible.error ? null : n(disponible.data),
  }
}

/**
 * Campaña de una oferta (la edición asistida llega solo con el id de la
 * oferta, ADM-014); `null` si no existe o la RLS no la deja ver.
 */
export async function campanaDeOferta(
  ofertaId: string
): Promise<string | null> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("ofertas")
    .select("campana_id")
    .eq("id", ofertaId)
    .is("deleted_at", null)
    .maybeSingle()
  if (error) fallar("leer la oferta", error)
  return data?.campana_id ?? null
}

/** Estado de verificación de la empresa (decide si puede enviar a revisión). */
export async function estadoEmpresa(
  anuncianteId: string
): Promise<EstadoAnunciante | null> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("anunciantes")
    .select("estado_verificacion")
    .eq("id", anuncianteId)
    .maybeSingle()
  if (error) fallar("leer el estado de la empresa", error)
  return data?.estado_verificacion ?? null
}

// ── Ofertas ──────────────────────────────────────────────────────────────────

function cortesDe(valor: readonly string[] | null): CorteOferta[] {
  return CORTES_OFERTA.filter((corte) => valor?.includes(corte))
}

/**
 * Ofertas de la campaña por id, en el orden pedido (el de los formatos del
 * asistente). Las que no son de la campaña o no se ven se omiten.
 */
export async function ofertasParaAsistente(
  campanaId: string,
  ofertaIds: readonly string[]
): Promise<OfertaGuardadaBd[]> {
  if (ofertaIds.length === 0) return []
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("ofertas")
    .select(
      `id, formato_id, estado, titulo, publicaciones_por_medio, presupuesto_maximo,
       tope_porcentaje_por_medio, departamentos_objetivo, municipios_objetivo,
       categorias_objetivo, seguidores_minimos, medios_excluidos, ventana_inicio,
       ventana_fin, fecha_limite_aceptacion, permanencia_minima_dias, exclusividad_dias,
       cortes_requeridos, instrucciones, restricciones, comentario_moderacion, devuelta_at,
       updated_at, oferta_cupos ( franja_id, cupos_totales )`
    )
    .eq("campana_id", campanaId)
    .in("id", [...ofertaIds])
    .is("deleted_at", null)
  if (error) fallar("leer las ofertas", error)
  const porId = new Map(data.map((fila) => [fila.id, fila]))
  return ofertaIds.flatMap((ofertaId) => {
    const fila = porId.get(ofertaId)
    if (!fila) return []
    return [
      {
        ofertaId: fila.id,
        formatoId: fila.formato_id,
        estado: fila.estado,
        actualizadaAt: fila.updated_at,
        titulo: fila.titulo,
        publicacionesPorMedio: fila.publicaciones_por_medio,
        presupuestoMaximo: n(fila.presupuesto_maximo) ?? 0,
        topePorcentaje: n(fila.tope_porcentaje_por_medio) ?? 0,
        departamentos: fila.departamentos_objetivo.map((c) => c.trim()),
        municipios: fila.municipios_objetivo.map((c) => c.trim()),
        categorias: fila.categorias_objetivo,
        seguidoresMinimos: fila.seguidores_minimos,
        mediosExcluidos: fila.medios_excluidos,
        ventanaInicio: fila.ventana_inicio,
        ventanaFin: fila.ventana_fin,
        fechaLimite: fila.fecha_limite_aceptacion,
        permanenciaDias: fila.permanencia_minima_dias,
        exclusividadDias: fila.exclusividad_dias,
        cortes: cortesDe(fila.cortes_requeridos),
        instrucciones: fila.instrucciones,
        restricciones: fila.restricciones,
        comentarioModeracion: fila.comentario_moderacion,
        devueltaAt: fila.devuelta_at,
        cupos: fila.oferta_cupos.map((cupo) => ({
          franjaId: cupo.franja_id,
          cantidad: cupo.cupos_totales,
        })),
      },
    ]
  })
}

/** Nombres públicos de los medios excluidos (`medios_para_exclusion`, sin cifras). */
export async function mediosExcluidos(
  ids: readonly string[]
): Promise<MedioExcluido[]> {
  if (ids.length === 0) return []
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase.rpc("medios_para_exclusion", {
    p_ids: [...ids],
  })
  if (error) fallar("leer los medios excluidos", error)
  return data.map((medio) => ({
    id: medio.id,
    nombre: medio.nombre,
    municipio: medio.municipio ?? null,
  }))
}

/**
 * Estado del paquete creativo de cada oferta (para marcar el paso al
 * reabrir), con las mismas reglas y textos que el panel y la BD
 * (`estadoCreativoInicial`). El detalle lo pinta el panel de creativos.
 */
export async function estadoCreativos(
  ofertas: readonly { ofertaId: string; formatoId: string }[],
  formatos: readonly FormatoOferta[]
): Promise<Record<string, EstadoCreativo>> {
  const estados = await Promise.all(
    ofertas.map(async ({ ofertaId, formatoId }) => {
      const versiones = await creativosDeOferta(ofertaId)
      const formato = formatos.find((candidato) => candidato.id === formatoId)
      return [ofertaId, estadoCreativoInicial(versiones, formato)] as const
    })
  )
  return Object.fromEntries(estados)
}
