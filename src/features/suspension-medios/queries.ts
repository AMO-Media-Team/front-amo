import "server-only"

import { cache } from "react"

import {
  clienteSolicitud,
  enLotes,
  fallar,
} from "@/features/operacion/queries/comun"

import { leerDetalleAlerta, ordenarAlertas } from "./alertas"
import { estaAbierta, ordenarDisputas } from "./disputas"
import { asignacionEnCurso, type FilaEnCurso, ordenarEnCurso } from "./en-curso"
import type {
  AlertaDelMedio,
  AsignacionEnCurso,
  DisputaDelMedio,
} from "./tipos"

/**
 * Lecturas de la ficha y la suspensión de un medio con el cliente del USUARIO
 * (JWT + RLS): `asignaciones_en_curso_medio` y `alertas_metricas` exigen
 * `asignaciones.ver`; las disputas, `disputas.ver` (o ver la asignación). Las
 * columnas de alerta de `metricas` ya no se leen por PostgREST: vienen de
 * `alertas_metricas`. Un error se lanza y lo recoge el límite de la sección.
 */

/** Disputas cerradas que muestra la pestaña (las más recientes); las abiertas, todas. */
export const LIMITE_DISPUTAS = 100

/** Métricas con alerta que se detallan en la pestaña. */
export const LIMITE_ALERTAS = 100

/** ADM-002 c2: lo que el medio tiene en curso, para decidir si se cancela. */
export async function asignacionesEnCursoDelMedio(
  medioId: string
): Promise<AsignacionEnCurso[]> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase.rpc("asignaciones_en_curso_medio", {
    p_medio_id: medioId,
  })
  if (error) fallar("leer las asignaciones en curso del medio", error)
  return ordenarEnCurso(
    (data as FilaEnCurso[]).map((fila) => asignacionEnCurso(fila))
  )
}

const SELECCION_DISPUTAS = `
  id, estado, motivo, parte, descripcion, resolucion, estado_asignacion_origen, estado_asignacion_resultante,
  created_at, fecha_resolucion,
  asignacion:asignaciones!inner (
    id, medio_id, estado,
    oferta:ofertas ( titulo ),
    anunciante:anunciantes ( nombre_comercial )
  )
` as const

type FilaDisputa = {
  id: string
  estado: DisputaDelMedio["estado"]
  motivo: DisputaDelMedio["motivo"]
  parte: DisputaDelMedio["parte"]
  descripcion: string
  resolucion: string | null
  estado_asignacion_origen: DisputaDelMedio["estadoOrigen"]
  estado_asignacion_resultante: DisputaDelMedio["estadoResultante"]
  created_at: string
  fecha_resolucion: string | null
  asignacion: {
    id: string
    estado: DisputaDelMedio["asignacion"]["estado"]
    oferta: { titulo: string } | null
    anunciante: { nombre_comercial: string } | null
  }
}

function disputaDeFila(fila: FilaDisputa): DisputaDelMedio {
  return {
    id: fila.id,
    estado: fila.estado,
    motivo: fila.motivo,
    parte: fila.parte,
    descripcion: fila.descripcion,
    resolucion: fila.resolucion,
    estadoOrigen: fila.estado_asignacion_origen,
    estadoResultante: fila.estado_asignacion_resultante,
    creadaAt: fila.created_at,
    resueltaAt: fila.fecha_resolucion,
    asignacion: {
      id: fila.asignacion.id,
      estado: fila.asignacion.estado,
      oferta: fila.asignacion.oferta?.titulo ?? null,
      anunciante: fila.asignacion.anunciante?.nombre_comercial ?? null,
    },
  }
}

export interface DisputasDelMedio {
  /** Abiertas primero (todas), luego las cerradas más recientes. */
  disputas: DisputaDelMedio[]
  /** Hay más cerradas que las `LIMITE_DISPUTAS` que se muestran. */
  cerradasTruncadas: boolean
}

/** Disputas de las asignaciones del medio: todas las abiertas y las cerradas más recientes. */
export const disputasDelMedio = cache(
  async (medioId: string): Promise<DisputasDelMedio> => {
    const supabase = await clienteSolicitud()
    const consulta = () =>
      supabase
        .from("disputas")
        .select(SELECCION_DISPUTAS)
        .eq("asignacion.medio_id", medioId)
        .order("created_at", { ascending: false })
        .order("id")
    const [abiertas, cerradas] = await Promise.all([
      consulta().in("estado", ["ABIERTA", "EN_REVISION"]),
      // Una de más para saber si hay más de las que se muestran.
      consulta()
        .in("estado", ["RESUELTA", "DESCARTADA"])
        .limit(LIMITE_DISPUTAS + 1),
    ])
    if (abiertas.error)
      fallar("leer las disputas abiertas del medio", abiertas.error)
    if (cerradas.error)
      fallar("leer las disputas cerradas del medio", cerradas.error)
    return {
      disputas: ordenarDisputas(
        [...abiertas.data, ...cerradas.data.slice(0, LIMITE_DISPUTAS)].map(
          disputaDeFila
        )
      ),
      cerradasTruncadas: cerradas.data.length > LIMITE_DISPUTAS,
    }
  }
)

/** Fila de `alertas_metricas` (cada métrica que tuvo alerta, con su detalle). */
export interface AlertaCruda {
  metricaId: string
  asignacionId: string
  estado: AlertaDelMedio["estado"]
  desviacion: boolean
  multiplo: boolean
  detalle: unknown
  creadaAt: string
}

/** Métricas del medio que tuvieron alerta (`alertas_metricas(p_medio_id)`). */
export const alertasCrudasDelMedio = cache(
  async (medioId: string): Promise<AlertaCruda[]> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase.rpc("alertas_metricas", {
      p_medio_id: medioId,
    })
    if (error) fallar("leer las alertas de métricas del medio", error)
    return data.map((fila) => ({
      metricaId: fila.metrica_id,
      asignacionId: fila.asignacion_id,
      estado: fila.estado_validacion,
      desviacion: fila.alerta_desviacion,
      multiplo: fila.alerta_multiplo,
      detalle: fila.detalle_alertas,
      creadaAt: fila.created_at,
    }))
  }
)

/** Columnas de `metricas` que sí se leen por PostgREST (sin las de alerta). */
const SELECCION_CONTEXTO_METRICA = `
  id, corte, plataforma, fecha_corte, observaciones, validada_at,
  publicacion:publicaciones ( numero ),
  asignacion:asignaciones (
    oferta:ofertas ( titulo ),
    anunciante:anunciantes ( nombre_comercial ),
    cuenta:cuentas_sociales ( handle )
  )
` as const

/**
 * Pestaña «Alertas»: las métricas con alerta (las que esperan validación
 * primero) con su contexto (corte, oferta, cuenta) y lo que anotó quien las
 * validó. Detalla hasta `LIMITE_ALERTAS`; `total` dice cuántas hay.
 */
export async function alertasDelMedio(
  medioId: string
): Promise<{ alertas: AlertaDelMedio[]; total: number }> {
  const crudas = ordenarAlertas(await alertasCrudasDelMedio(medioId))
  const visibles = crudas.slice(0, LIMITE_ALERTAS)
  const supabase = await clienteSolicitud()
  const lotes = await Promise.all(
    enLotes(visibles.map((alerta) => alerta.metricaId)).map(async (ids) => {
      const { data, error } = await supabase
        .from("metricas")
        .select(SELECCION_CONTEXTO_METRICA)
        .in("id", ids)
      if (error) fallar("leer el contexto de las métricas con alerta", error)
      return data
    })
  )
  const contexto = new Map(lotes.flat().map((fila) => [fila.id, fila]))

  return {
    total: crudas.length,
    alertas: visibles.map((alerta): AlertaDelMedio => {
      const fila = contexto.get(alerta.metricaId)
      return {
        metricaId: alerta.metricaId,
        asignacionId: alerta.asignacionId,
        estado: alerta.estado,
        desviacion: alerta.desviacion,
        multiplo: alerta.multiplo,
        detalle: leerDetalleAlerta(alerta.detalle),
        creadaAt: alerta.creadaAt,
        corte: fila?.corte ?? null,
        plataforma: fila?.plataforma ?? null,
        fechaCorte: fila?.fecha_corte ?? null,
        numeroPublicacion: fila?.publicacion?.numero ?? null,
        observaciones: fila?.observaciones ?? null,
        validadaAt: fila?.validada_at ?? null,
        oferta: fila?.asignacion?.oferta?.titulo ?? null,
        anunciante: fila?.asignacion?.anunciante?.nombre_comercial ?? null,
        handle: fila?.asignacion?.cuenta?.handle ?? null,
      }
    }),
  }
}

/**
 * Contadores de las pestañas: disputas abiertas y alertas por validar. Nunca
 * falla: sin dato (`null`), la pestaña sale sin contador y su sección muestra
 * el error al abrirla.
 */
export async function pendientesDelMedio(
  medioId: string,
  { verDisputas, verAlertas }: { verDisputas: boolean; verAlertas: boolean }
): Promise<{
  disputasAbiertas: number | null
  alertasPorValidar: number | null
}> {
  const [disputas, alertas] = await Promise.all([
    verDisputas ? disputasDelMedio(medioId).catch(() => null) : null,
    verAlertas ? alertasCrudasDelMedio(medioId).catch(() => null) : null,
  ])
  return {
    disputasAbiertas: disputas
      ? disputas.disputas.filter((disputa) => estaAbierta(disputa.estado))
          .length
      : null,
    alertasPorValidar: alertas
      ? alertas.filter((alerta) => alerta.estado === "PENDIENTE").length
      : null,
  }
}
