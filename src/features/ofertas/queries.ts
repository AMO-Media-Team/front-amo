import "server-only"

/**
 * Lectura de la ficha de una oferta (ANU-009, ANU-014, ADM-005). Todo se lee
 * con el cliente del USUARIO (JWT + RLS): el anunciante solo ve las de su
 * empresa y el equipo AMO las ve con `ofertas.ver`. Un error de lectura se
 * lanza y lo recoge el límite de error de la página.
 */
import { cache } from "react"

import { creativosDeOferta } from "@/features/creativos/queries"
import { resumirCupos } from "@/features/operacion/calculos"
import {
  catalogos,
  type ClienteServidor,
  clienteSolicitud,
  departamentoJuntoAMunicipio,
  enLotes,
  fallar,
  nombreDepartamento,
  nombreMunicipio,
} from "@/features/operacion/queries/comun"
import { codigoNegocio } from "@/lib/errores-bd"
import type { Json } from "@/types/database.types"

import type {
  FilaHistorial,
  MedioExcluido,
  OfertaCompleta,
  SegmentacionOferta,
} from "./tipos"

const SELECCION = `
  id, titulo, estado, plataforma, formato_id, publicaciones_por_medio, permite_multiples_cupos,
  presupuesto_maximo, presupuesto_comprometido, tope_porcentaje_por_medio, departamentos_objetivo,
  municipios_objetivo, categorias_objetivo, seguidores_minimos, medios_excluidos, ventana_inicio, ventana_fin,
  fecha_limite_aceptacion, permanencia_minima_dias, exclusividad_dias, cortes_requeridos, instrucciones,
  restricciones, comentario_moderacion, enviada_at, devuelta_at, publicada_at, cupos_completos_at,
  en_ejecucion_at, vencida_at, cerrada_at, cancelada_at, created_at, deleted_at, gestion_asistida,
  campana:campanas ( id, nombre, marca, estado, fecha_inicio, fecha_fin, presupuesto_total ),
  anunciante:anunciantes ( id, nombre_comercial, razon_social ),
  cupos:oferta_cupos ( franja_id, cupos_totales, cupos_ocupados ),
  historial:oferta_historial (
    id, desde, hacia, actor_tipo, actor_id, comentario, created_at,
    actor:perfiles!oferta_historial_actor_id_fkey ( nombre )
  )
`

/** Valores por defecto de docs/modelo-datos.md §7 si la clave no es visible. */
const UMBRAL_SEGUIDORES_POR_DEFECTO = 30_000

const CLAVE_UMBRAL = "medios.umbral_seguidores"
const CLAVE_RECARGO = "precios.recargo_exclusividad"

function comoNumero(valor: Json | undefined): number | null {
  const numero = typeof valor === "string" ? Number(valor) : valor
  return typeof numero === "number" && Number.isFinite(numero) ? numero : null
}

/** Umbral de seguidores y recargo de exclusividad (configuración pública). */
async function parametrosOferta(supabase: ClienteServidor) {
  const { data, error } = await supabase
    .from("configuracion")
    .select("clave, valor")
    .in("clave", [CLAVE_UMBRAL, CLAVE_RECARGO])
  if (error) fallar("leer la configuración de ofertas", error)
  const valores = new Map(data.map((fila) => [fila.clave, fila.valor]))
  return {
    umbral:
      comoNumero(valores.get(CLAVE_UMBRAL)) ?? UMBRAL_SEGUIDORES_POR_DEFECTO,
    recargo: comoNumero(valores.get(CLAVE_RECARGO)),
  }
}

/**
 * Nombres públicos de los medios excluidos (`medios_para_exclusion`, sin
 * cifras). Esa función exige gestionar ofertas; un rol interno que solo las
 * consulta los lee de `medios` con su propia RLS (`medios.ver`). Si tampoco
 * puede, queda solo la cantidad (`null`).
 */
async function leerExcluidos(
  supabase: ClienteServidor,
  ids: readonly string[]
): Promise<MedioExcluido[] | null> {
  if (ids.length === 0) return []
  const { data, error } = await supabase.rpc("medios_para_exclusion", {
    p_ids: [...ids],
  })
  if (!error) {
    return data.map((medio) => ({
      id: medio.id,
      nombre: medio.nombre,
      municipio: medio.municipio ?? null,
    }))
  }
  if (codigoNegocio(error) !== "AMO_NO_AUTORIZADO") {
    fallar("leer los medios excluidos", error)
  }

  const lotes = await Promise.all(
    enLotes(ids).map((lote) =>
      supabase
        .from("medios")
        .select("id, nombre, municipio_codigo")
        .in("id", lote)
    )
  )
  if (lotes.some((lote) => lote.error)) return null
  return lotes
    .flatMap((lote) => lote.data ?? [])
    .map((medio) => ({
      id: medio.id,
      nombre: medio.nombre,
      municipio: nombreMunicipio(medio.municipio_codigo),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
}

/**
 * La oferta con todo lo que muestran la ficha del anunciante y la de
 * moderación: campaña, segmentación con nombres, cupos por franja,
 * condiciones, historial y versiones del creativo. `null` si no existe, está
 * archivada o la RLS no la deja ver.
 */
export const obtenerOferta = cache(
  async (id: string): Promise<OfertaCompleta | null> => {
    const supabase = await clienteSolicitud()
    const { data: fila, error } = await supabase
      .from("ofertas")
      .select(SELECCION)
      .eq("id", id)
      .maybeSingle()
    if (error) fallar("leer la oferta", error)
    if (!fila || fila.deleted_at || !fila.campana) return null

    const [
      { franjas, formatos, categorias },
      parametros,
      excluidos,
      creativos,
    ] = await Promise.all([
      catalogos(),
      parametrosOferta(supabase),
      leerExcluidos(supabase, fila.medios_excluidos),
      creativosDeOferta(fila.id),
    ])

    const segmentacion: SegmentacionOferta = {
      departamentos: fila.departamentos_objetivo
        .map((codigo) => ({
          codigo,
          nombre: nombreDepartamento(codigo) ?? codigo,
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
      municipios: fila.municipios_objetivo
        .map((codigo) => ({
          codigo,
          nombre: nombreMunicipio(codigo) ?? codigo,
          departamento: departamentoJuntoAMunicipio(codigo.slice(0, 2), {
            corto: true,
          }),
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
      categorias: fila.categorias_objetivo
        .map((categoria) => categorias.get(categoria))
        .filter((nombre): nombre is string => Boolean(nombre)),
      seguidoresMinimos: fila.seguidores_minimos,
      umbralPlataforma: parametros.umbral,
      seguidoresEfectivos: Math.max(
        parametros.umbral,
        fila.seguidores_minimos ?? 0
      ),
      excluidos: { total: fila.medios_excluidos.length, medios: excluidos },
    }

    const historial: FilaHistorial[] = fila.historial
      .map((cambio) => ({
        id: cambio.id,
        desde: cambio.desde,
        hacia: cambio.hacia,
        actorTipo: cambio.actor_tipo,
        actorId: cambio.actor_id,
        actorNombre: cambio.actor?.nombre ?? null,
        comentario: cambio.comentario,
        at: cambio.created_at,
      }))
      .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))

    return {
      id: fila.id,
      titulo: fila.titulo,
      estado: fila.estado,
      plataforma: fila.plataforma,
      formato: formatos.get(fila.formato_id)?.nombre ?? "Formato",
      campana: {
        id: fila.campana.id,
        nombre: fila.campana.nombre,
        marca: fila.campana.marca,
        estado: fila.campana.estado,
        fechaInicio: fila.campana.fecha_inicio,
        fechaFin: fila.campana.fecha_fin,
        presupuestoTotal: fila.campana.presupuesto_total,
      },
      anunciante: {
        id: fila.anunciante?.id ?? "",
        nombre:
          fila.anunciante?.nombre_comercial ??
          fila.anunciante?.razon_social ??
          null,
      },
      publicacionesPorMedio: fila.publicaciones_por_medio,
      permiteMultiplesCupos: fila.permite_multiples_cupos,
      presupuestoMaximo: fila.presupuesto_maximo,
      presupuestoComprometido: fila.presupuesto_comprometido,
      topePorMedio: fila.tope_porcentaje_por_medio,
      cupos: resumirCupos(
        fila.cupos.map((cupo) => {
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
      ventanaInicio: fila.ventana_inicio,
      ventanaFin: fila.ventana_fin,
      fechaLimiteAceptacion: fila.fecha_limite_aceptacion,
      permanenciaDias: fila.permanencia_minima_dias,
      exclusividadDias: fila.exclusividad_dias,
      recargoExclusividad: parametros.recargo,
      cortes: fila.cortes_requeridos,
      instrucciones: fila.instrucciones,
      restricciones: fila.restricciones,
      comentarioModeracion: fila.comentario_moderacion,
      fechas: {
        creadaAt: fila.created_at,
        enviadaAt: fila.enviada_at,
        devueltaAt: fila.devuelta_at,
        publicadaAt: fila.publicada_at,
        cuposCompletosAt: fila.cupos_completos_at,
        enEjecucionAt: fila.en_ejecucion_at,
        vencidaAt: fila.vencida_at,
        cerradaAt: fila.cerrada_at,
        canceladaAt: fila.cancelada_at,
      },
      segmentacion,
      historial,
      creativos,
      gestionAsistida: fila.gestion_asistida,
    }
  }
)
