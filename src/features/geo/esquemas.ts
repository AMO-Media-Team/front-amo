/**
 * Validación de los parámetros de `GET /api/geo/metricas`. Usa el catálogo
 * geográfico completo (países y municipios), así que solo se importa en el
 * servidor y en pruebas.
 */
import { z } from "zod"

import { diasEnRango, parsearFecha, rangoPersonalizado } from "@/lib/fechas"
import {
  obtenerDepartamento,
  obtenerMunicipio,
  obtenerPais,
} from "@/lib/geo/catalogo"

import { DIAS_MAXIMOS_RANGO } from "./estado-url"
import {
  admiteCalor,
  DEFINICIONES_METRICAS,
  METRICAS_GEO,
  metricaDisponibleEn,
  metricasDelNivel,
  NIVELES_GEO,
  type NivelGeo,
} from "./metricas"
import { TIPO_ZONA } from "./niveles"
import type { ConsultaDetalleGeo, ConsultaMapaGeo } from "./tipos"

const FECHA_INVALIDA = "Usa una fecha válida con formato AAAA-MM-DD."

// Los mensajes llegan a la interfaz (aviso del mapa): siempre en español,
// también cuando falta el parámetro o no es una opción conocida.
const dia = z
  .string({ error: FECHA_INVALIDA })
  .refine((valor) => parsearFecha(valor) !== null, FECHA_INVALIDA)

const ZONA_VALIDA: Readonly<
  Record<NivelGeo, (zona: string, departamento: string | null) => boolean>
> = {
  internacional: (zona) => /^[A-Z]{2}$/.test(zona) && !!obtenerPais(zona),
  nacional: (zona) => /^\d{2}$/.test(zona) && !!obtenerDepartamento(zona),
  departamental: (zona, departamento) =>
    /^\d{5}$/.test(zona) &&
    !!obtenerMunicipio(zona) &&
    zona.startsWith(departamento ?? "--"),
}

export const esquemaParametrosGeo = z
  .object({
    vista: z
      .enum(["mapa", "puntos", "detalle"], {
        error: "La vista pedida no existe.",
      })
      .default("mapa"),
    nivel: z.enum(NIVELES_GEO, { error: "El nivel del mapa no es válido." }),
    metrica: z.enum(METRICAS_GEO, { error: "La métrica no existe." }),
    desde: dia,
    hasta: dia,
    depto: z.string().optional(),
    zona: z.string().trim().toUpperCase().optional(),
  })
  .superRefine((p, ctx) => {
    const inicio = parsearFecha(p.desde)
    const fin = parsearFecha(p.hasta)
    if (inicio && fin) {
      if (inicio > fin) {
        ctx.addIssue({
          code: "custom",
          path: ["hasta"],
          message: "La fecha final debe ser igual o posterior a la inicial.",
        })
      } else if (
        diasEnRango(rangoPersonalizado(inicio, fin)) > DIAS_MAXIMOS_RANGO
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["desde"],
          message: `El periodo no puede superar ${DIAS_MAXIMOS_RANGO} días.`,
        })
      }
    }

    if (!metricaDisponibleEn(p.metrica, p.nivel)) {
      ctx.addIssue({
        code: "custom",
        path: ["metrica"],
        message: `«${DEFINICIONES_METRICAS[p.metrica].titulo}» no está disponible para ${TIPO_ZONA[p.nivel].plural}.`,
      })
    }

    if (p.vista === "puntos" && !admiteCalor(p.metrica)) {
      ctx.addIssue({
        code: "custom",
        path: ["metrica"],
        message: `«${DEFINICIONES_METRICAS[p.metrica].titulo}» no tiene puntos reales para el mapa de calor.`,
      })
    }

    const departamento = p.nivel === "departamental" ? (p.depto ?? null) : null
    if (
      p.nivel === "departamental" &&
      !(
        departamento &&
        /^\d{2}$/.test(departamento) &&
        obtenerDepartamento(departamento)
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["depto"],
        message: "Indica un departamento válido (código DANE de dos dígitos).",
      })
    }

    if (p.vista === "detalle") {
      if (!p.zona || !ZONA_VALIDA[p.nivel](p.zona, departamento)) {
        ctx.addIssue({
          code: "custom",
          path: ["zona"],
          message: `Indica un ${TIPO_ZONA[p.nivel].singular.toLowerCase()} válido.`,
        })
      }
    }
  })

export type ParametrosGeo =
  | { readonly vista: "mapa" | "puntos"; readonly consulta: ConsultaMapaGeo }
  | { readonly vista: "detalle"; readonly consulta: ConsultaDetalleGeo }

/** Valida y normaliza los parámetros de la URL de la API. */
export function leerParametrosGeo(
  parametros: URLSearchParams
):
  | { readonly ok: true; readonly datos: ParametrosGeo }
  | { readonly ok: false; readonly error: z.ZodError } {
  const resultado = esquemaParametrosGeo.safeParse(
    Object.fromEntries(parametros)
  )
  if (!resultado.success) return { ok: false, error: resultado.error }

  const p = resultado.data
  const consulta: ConsultaMapaGeo = {
    nivel: p.nivel,
    metrica: p.metrica,
    desde: p.desde,
    hasta: p.hasta,
    departamento: p.nivel === "departamental" ? (p.depto ?? null) : null,
  }
  return {
    ok: true,
    datos:
      p.vista === "detalle"
        ? {
            vista: "detalle",
            consulta: {
              ...consulta,
              zona: p.zona ?? "",
              metricasKpi: metricasDelNivel(p.nivel),
              // La ruta lo activa según los permisos del usuario.
              conMedios: false,
            },
          }
        : { vista: p.vista, consulta },
  }
}
