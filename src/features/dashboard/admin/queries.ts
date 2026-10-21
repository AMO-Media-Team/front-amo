import "server-only"

import { subDays } from "date-fns"
import { cache } from "react"

import type { FilaKpi } from "@/components/kpi/tipos"
import { numero } from "@/features/dashboard/insights/adaptadores"
import type {
  AccesoSospechoso,
  MetricasAtipicas,
} from "@/features/dashboard/insights/tipos"
import { serializarFecha } from "@/lib/fechas"

import { filasKpi } from "../kpi"
import type { Granularidad } from "../periodo"
import { clientePanel, fallar } from "../servidor"
import {
  esSegmentoSalud,
  type FilaCalor,
  type FilaCumplimientoMedio,
  type FilaEtapa,
  type FilaMezclaPanel,
  type FilaSalud,
  type FilaZona,
  type FuenteActividad,
  type MedioEnRiesgo,
  type PuntoGmv,
} from "./datos"

/**
 * Consultas del panel general (docs/modelo-datos.md §5.9). Memorizadas por
 * solicitud con argumentos primitivos: los bloques y el motor de insights
 * comparten la misma respuesta sin repetir la RPC. Un error se lanza y lo
 * recoge el límite de error del bloque; el resto del panel sigue en pie.
 */

const n = (valor: number | string | null | undefined) => numero(valor) ?? 0

export const kpisAdmin = cache(
  async (
    desde: string,
    hasta: string,
    desdeAnterior: string,
    hastaAnterior: string
  ): Promise<FilaKpi[]> => {
    const supabase = await clientePanel()
    const { data, error } = await supabase.rpc("kpis_admin", {
      p_desde: desde,
      p_hasta: hasta,
      p_desde_ant: desdeAnterior,
      p_hasta_ant: hastaAnterior,
    })
    if (error) fallar("consultar los indicadores", error)
    return filasKpi(data)
  }
)

export const serieGmv = cache(
  async (
    desde: string,
    hasta: string,
    granularidad: Granularidad
  ): Promise<PuntoGmv[]> => {
    const supabase = await clientePanel()
    const { data, error } = await supabase.rpc("serie_gmv", {
      p_desde: desde,
      p_hasta: hasta,
      p_granularidad: granularidad,
    })
    if (error) fallar("consultar la serie de GMV", error)
    return data.map((fila) => ({
      periodo: fila.periodo,
      gmvComprometido: n(fila.gmv_comprometido),
      gmvVerificado: n(fila.gmv_verificado),
      comision: n(fila.comision),
      negocios: n(fila.negocios),
      aceptadas: n(fila.asignaciones_aceptadas),
    }))
  }
)

/**
 * GMV verificado de los 90 días que terminan en `hasta` (proporción de la
 * regla 3). Mismo cierre que `salud_medios`: su «GMV en juego» también mira
 * los 90 días anteriores al fin del periodo, no a hoy.
 */
export const gmvVerificado90Dias = cache(
  async (hasta: string): Promise<number> => {
    const fin = new Date(`${hasta}T12:00:00Z`)
    const puntos = await serieGmv(
      serializarFecha(subDays(fin, 89)),
      hasta,
      "mes"
    )
    return puntos.reduce((total, punto) => total + punto.gmvVerificado, 0)
  }
)

export const embudoAsignaciones = cache(
  async (desde: string, hasta: string): Promise<FilaEtapa[]> => {
    const supabase = await clientePanel()
    const { data, error } = await supabase.rpc("embudo_asignaciones", {
      p_desde: desde,
      p_hasta: hasta,
    })
    if (error) fallar("consultar el embudo de asignaciones", error)
    return data.map((fila) => ({
      etapa: fila.etapa,
      orden: n(fila.orden),
      cantidad: n(fila.cantidad),
    }))
  }
)

export const mezclaPlataformas = cache(
  async (desde: string, hasta: string): Promise<FilaMezclaPanel[]> => {
    const supabase = await clientePanel()
    const { data, error } = await supabase.rpc("mezcla_plataformas", {
      p_desde: desde,
      p_hasta: hasta,
    })
    if (error) fallar("consultar la mezcla de plataformas", error)
    return data.map((fila) => ({
      plataforma: fila.plataforma,
      formatoClave: fila.formato_clave,
      formatoNombre: fila.formato_nombre,
      asignaciones: n(fila.asignaciones),
      gmv: n(fila.gmv),
      alcance: n(fila.alcance),
      participacion: numero(fila.participacion_gmv),
      cpmEfectivo: numero(fila.cpm_efectivo),
    }))
  }
)

/** Departamentos por GMV comprometido (todos: alimentan también el mini-mapa). */
export const zonasGmv = cache(
  async (desde: string, hasta: string): Promise<FilaZona[]> => {
    const supabase = await clientePanel()
    const { data, error } = await supabase.rpc("top_zonas", {
      p_nivel: "departamento",
      p_metrica: "gmv",
      p_desde: desde,
      p_hasta: hasta,
      p_limite: 40,
    })
    if (error) fallar("consultar los departamentos", error)
    return data.map((fila) => ({
      codigo: fila.codigo,
      nombre: fila.nombre,
      valor: n(fila.valor),
      participacion: numero(fila.participacion),
    }))
  }
)

export const saludMedios = cache(
  async (desde: string, hasta: string): Promise<FilaSalud[]> => {
    const supabase = await clientePanel()
    const { data, error } = await supabase.rpc("salud_medios", {
      p_desde: desde,
      p_hasta: hasta,
    })
    if (error) fallar("consultar la salud de los medios", error)
    return data.flatMap((fila) =>
      esSegmentoSalud(fila.segmento)
        ? [
            {
              segmento: fila.segmento,
              cantidad: n(fila.cantidad),
              porcentaje: numero(fila.porcentaje),
              gmvEnJuego: n(fila.gmv_en_juego),
            },
          ]
        : []
    )
  }
)

export const mediosEnRiesgo = cache(
  async (limite: number): Promise<MedioEnRiesgo[]> => {
    const supabase = await clientePanel()
    const { data, error } = await supabase.rpc("medios_en_riesgo", {
      p_limite: limite,
    })
    if (error) fallar("consultar los medios en riesgo", error)
    return data.map((fila) => ({
      id: fila.medio_id,
      nombre: fila.nombre,
      departamento: fila.departamento,
      ultimaAceptacionAt: fila.ultima_aceptacion_at,
      gmv90d: n(fila.gmv_90d),
      abiertas: n(fila.asignaciones_abiertas),
    }))
  }
)

export const actividadHeatmap = cache(
  async (
    desde: string,
    hasta: string,
    fuente: FuenteActividad
  ): Promise<FilaCalor[]> => {
    const supabase = await clientePanel()
    const { data, error } = await supabase.rpc("actividad_heatmap", {
      p_desde: desde,
      p_hasta: hasta,
      p_fuente: fuente,
    })
    if (error) fallar("consultar la actividad por hora", error)
    return data.map((fila) => ({
      dia_semana: n(fila.dia_semana),
      hora: n(fila.hora),
      cantidad: n(fila.cantidad),
    }))
  }
)

/** Vencidas por medio del periodo (`reportes.ver`), para la regla 2. */
export const cumplimientoMedios = cache(
  async (desde: string, hasta: string): Promise<FilaCumplimientoMedio[]> => {
    const supabase = await clientePanel()
    const { data, error } = await supabase.rpc("reporte_cumplimiento_medios", {
      p_desde: desde,
      p_hasta: hasta,
    })
    if (error) fallar("consultar el cumplimiento de los medios", error)
    return data.map((fila) => ({
      medioId: fila.medio_id,
      medio: fila.medio,
      departamento: fila.departamento,
      vencidas: n(fila.vencidas),
    }))
  }
)

const LIMITE_ATIPICAS = 1_000

/**
 * Métricas PENDIENTE con alerta de integridad (regla 5 y alertas). La RLS de
 * `metricas` exige `asignaciones.ver` a los internos.
 */
export const metricasAtipicasPendientes = cache(
  async (): Promise<MetricasAtipicas> => {
    const supabase = await clientePanel()
    const { data, error, count } = await supabase
      .from("metricas")
      .select("created_at, alerta_desviacion, alerta_multiplo", {
        count: "exact",
      })
      .eq("estado_validacion", "PENDIENTE")
      .or("alerta_desviacion.eq.true,alerta_multiplo.eq.true")
      .order("created_at", { ascending: true })
      .limit(LIMITE_ATIPICAS)
    if (error) fallar("consultar las métricas atípicas", error)
    return {
      total: count ?? data.length,
      desviacion: data.filter((fila) => fila.alerta_desviacion).length,
      multiplo: data.filter((fila) => fila.alerta_multiplo).length,
      masAntiguaAt: data[0]?.created_at ?? null,
    }
  }
)

const LIMITE_SOSPECHOSOS = 500

/**
 * Accesos sospechosos del periodo con el tipo de rol de cada cuenta (regla
 * 6: es crítico si hay cuentas internas). `accesos.ver` para leerlos; el
 * tipo de rol solo llega con `usuarios.ver` (si no, se asume externo).
 */
export const accesosSospechosos = cache(
  async (
    desdeInstante: string,
    hastaInstante: string
  ): Promise<AccesoSospechoso[]> => {
    const supabase = await clientePanel()
    const { data, error } = await supabase
      .from("accesos")
      .select("usuario_id, pais_iso2, motivo_sospecha")
      .eq("es_sospechoso", true)
      .gte("created_at", desdeInstante)
      .lt("created_at", hastaInstante)
      .order("created_at", { ascending: false })
      .limit(LIMITE_SOSPECHOSOS)
    if (error) fallar("consultar los accesos sospechosos", error)

    const ids = [
      ...new Set(data.flatMap((fila) => fila.usuario_id ?? [])),
    ].slice(0, 200)
    const internos = new Set<string>()
    if (ids.length) {
      const { data: perfiles } = await supabase
        .from("perfiles")
        .select("id, rol:roles!perfiles_rol_id_fkey ( tipo )")
        .in("id", ids)
      for (const perfil of perfiles ?? []) {
        if (perfil.rol?.tipo === "ADMIN") internos.add(perfil.id)
      }
    }
    return data.map((fila) => ({
      usuarioId: fila.usuario_id ?? "desconocido",
      esInterno: fila.usuario_id ? internos.has(fila.usuario_id) : false,
      paisIso2: fila.pais_iso2,
      motivo: fila.motivo_sospecha,
    }))
  }
)
