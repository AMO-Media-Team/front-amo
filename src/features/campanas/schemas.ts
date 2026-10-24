/**
 * Esquemas zod del portal de campañas: los MISMOS en el formulario y en la
 * Server Action. Las reglas que dependen de la campaña (lo comprometido, las
 * ventanas de sus ofertas vivas, el día de hoy en Bogotá) entran por
 * `ReglasCampana`: el cliente las recibe de la página y la acción las vuelve a
 * leer de la BD antes de validar. La BD las exige de nuevo.
 */
import { z } from "zod"

import { textoANumero } from "@/features/configuracion/numeros"
import { instanteDeDia } from "@/features/operacion/formato"
import {
  LONGITUD_MAXIMA_MOTIVO,
  LONGITUD_MINIMA_MOTIVO,
} from "@/features/usuarios/schemas"
import { parsearFecha } from "@/lib/fechas"
import { formatearCOP, formatearFecha } from "@/lib/format"

/** Límites de las columnas de `campanas` (CHECK de la BD). */
export const LIMITES_CAMPANA = {
  nombreMin: 3,
  nombreMax: 120,
  marcaMax: 80,
  objetivoMax: 500,
  /** `numeric(14,2)`: hasta 999.999.999.999 pesos. */
  presupuestoMax: 999_999_999_999,
} as const

export interface ReglasCampana {
  /** Hoy en Bogotá ('YYYY-MM-DD'). */
  hoy: string
  /** Piso del presupuesto (`presupuestoMinimo`); 0 en una campaña nueva. */
  presupuestoMinimo: number
  /** Fechas guardadas: si no cambian, no se les exige ser de hoy en adelante. */
  fechaInicioActual?: string | null
  fechaFinActual?: string | null
  /** Ventanas de las ofertas vivas (`limitesFechas`). */
  inicioMaximo?: string | null
  finMinimo?: string | null
}

const id = z.uuid({ error: "Identificador inválido." })

const nombre = z
  .string({ error: "Escribe el nombre de la campaña." })
  .trim()
  .min(1, { error: "Escribe el nombre de la campaña.", abort: true })
  .min(
    LIMITES_CAMPANA.nombreMin,
    `El nombre debe tener al menos ${LIMITES_CAMPANA.nombreMin} caracteres.`
  )
  .max(
    LIMITES_CAMPANA.nombreMax,
    `Máximo ${LIMITES_CAMPANA.nombreMax} caracteres.`
  )

const marca = z
  .string({ error: "Escribe la marca o el producto." })
  .trim()
  .min(1, "Escribe la marca o el producto que promociona la campaña.")
  .max(
    LIMITES_CAMPANA.marcaMax,
    `Máximo ${LIMITES_CAMPANA.marcaMax} caracteres.`
  )

const objetivo = z
  .string()
  .trim()
  .max(
    LIMITES_CAMPANA.objetivoMax,
    `Máximo ${LIMITES_CAMPANA.objetivoMax} caracteres.`
  )
  .transform((texto) => texto || null)

function dia(vacio: string) {
  return z
    .string({ error: vacio })
    .trim()
    .min(1, { error: vacio, abort: true })
    .refine((texto) => parsearFecha(texto) !== null, "Elige una fecha válida.")
}

const presupuesto = z
  .union([z.string(), z.number()], {
    error: "Escribe el presupuesto total de la campaña.",
  })
  .transform((valor, ctx) => {
    if (typeof valor === "string" && !valor.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Escribe el presupuesto total de la campaña.",
      })
      return z.NEVER
    }
    const numero = typeof valor === "number" ? valor : textoANumero(valor)
    if (numero === null || !Number.isFinite(numero)) {
      ctx.addIssue({
        code: "custom",
        message: "Escribe el valor en pesos, por ejemplo 25.000.000.",
      })
      return z.NEVER
    }
    return numero
  })
  .pipe(
    z
      .number()
      .int("Escribe el valor en pesos, sin centavos.")
      .positive("El presupuesto debe ser mayor que cero.")
      .max(
        LIMITES_CAMPANA.presupuestoMax,
        "Revisa la cifra: es demasiado alta."
      )
  )

const camposCampana = {
  nombre,
  marca,
  objetivo,
  fechaInicio: dia("Elige la fecha de inicio."),
  fechaFin: dia("Elige la fecha de fin."),
  presupuesto,
}

export const CAMPOS_CAMPANA = [
  "nombre",
  "marca",
  "objetivo",
  "fechaInicio",
  "fechaFin",
  "presupuesto",
] as const

export type CampoCampana = (typeof CAMPOS_CAMPANA)[number]

/** "30 de octubre de 2026" para una columna `date`. */
function diaLargo(fecha: string): string {
  return formatearFecha(instanteDeDia(fecha), "largo")
}

interface DatosValidables {
  fechaInicio: string
  fechaFin: string
  presupuesto: number
}

/** Reglas que cruzan campos o dependen de la campaña guardada. */
function validarReglas(
  datos: DatosValidables,
  reglas: ReglasCampana,
  ctx: z.RefinementCtx
): void {
  if (
    typeof datos.presupuesto === "number" &&
    datos.presupuesto < reglas.presupuestoMinimo
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["presupuesto"],
      message: mensajePresupuestoMinimo(reglas.presupuestoMinimo),
    })
  }
  // zod sigue con las reglas aunque un campo haya fallado: sin dos fechas
  // reales no hay nada que comparar (el campo ya dice qué falta).
  const { fechaInicio, fechaFin } = datos
  if (!parsearFecha(fechaInicio) || !parsearFecha(fechaFin)) return
  if (fechaInicio !== reglas.fechaInicioActual && fechaInicio < reglas.hoy) {
    ctx.addIssue({
      code: "custom",
      path: ["fechaInicio"],
      message: "La campaña no puede empezar antes de hoy.",
    })
  }
  if (reglas.inicioMaximo && fechaInicio > reglas.inicioMaximo) {
    ctx.addIssue({
      code: "custom",
      path: ["fechaInicio"],
      message: `Tienes ofertas que se publican desde el ${diaLargo(reglas.inicioMaximo)}: la campaña debe empezar ese día o antes.`,
    })
  }
  if (fechaFin < fechaInicio) {
    ctx.addIssue({
      code: "custom",
      path: ["fechaFin"],
      message: "La fecha de fin no puede ser anterior a la de inicio.",
    })
  } else if (fechaFin !== reglas.fechaFinActual && fechaFin < reglas.hoy) {
    ctx.addIssue({
      code: "custom",
      path: ["fechaFin"],
      message: "La campaña debe terminar hoy o después.",
    })
  }
  if (reglas.finMinimo && fechaFin < reglas.finMinimo) {
    ctx.addIssue({
      code: "custom",
      path: ["fechaFin"],
      message: `Tienes ofertas que se publican hasta el ${diaLargo(reglas.finMinimo)}: la campaña debe terminar ese día o después.`,
    })
  }
}

export function mensajePresupuestoMinimo(minimo: number): string {
  return `El presupuesto no puede quedar por debajo de ${formatearCOP(minimo)}: es lo que ya tienen comprometido tus ofertas en revisión o publicadas y los cupos aceptados.`
}

/** Campaña nueva: sus datos y las reglas del día. */
export function esquemaNuevaCampana(reglas: ReglasCampana) {
  return z
    .object(camposCampana)
    .superRefine((datos, ctx) => validarReglas(datos, reglas, ctx))
}

/**
 * Campaña nueva por cuenta de un anunciante (ADM-014): lo mismo más la
 * empresa elegida. Al anunciante nunca se le lee de la entrada: es la suya.
 */
export function esquemaNuevaCampanaAsistida(reglas: ReglasCampana) {
  return z
    .object({
      ...camposCampana,
      anuncianteId: z
        .string({ error: "Elige el anunciante." })
        .min(1, { error: "Elige el anunciante.", abort: true })
        .pipe(z.uuid({ error: "Elige el anunciante de la lista." })),
    })
    .superRefine((datos, ctx) => validarReglas(datos, reglas, ctx))
}

export const CAMPOS_CAMPANA_ASISTIDA = [
  ...CAMPOS_CAMPANA,
  "anuncianteId",
] as const

/** Edición: lo mismo, con el registro y su versión (bloqueo optimista). */
export function esquemaEditarCampana(reglas: ReglasCampana) {
  return z
    .object({
      ...camposCampana,
      campanaId: id,
      actualizadoAt: z
        .string()
        .min(1, "Falta la versión del registro.")
        .max(64),
    })
    .superRefine((datos, ctx) => validarReglas(datos, reglas, ctx))
}

export type EntradaNuevaCampana = z.input<
  ReturnType<typeof esquemaNuevaCampana>
>
export type DatosNuevaCampana = z.output<ReturnType<typeof esquemaNuevaCampana>>
export type EntradaNuevaCampanaAsistida = z.input<
  ReturnType<typeof esquemaNuevaCampanaAsistida>
>
export type EntradaEditarCampana = z.input<
  ReturnType<typeof esquemaEditarCampana>
>

// ── Cambios de estado ────────────────────────────────────────────────────────

export const esquemaCampanaId = z.object({ campanaId: id })

export type EntradaCampanaId = z.input<typeof esquemaCampanaId>

export const esquemaCancelarCampana = z.object({
  campanaId: id,
  motivo: z
    .string({ error: "Escribe el motivo." })
    .trim()
    .min(
      LONGITUD_MINIMA_MOTIVO,
      `Describe el motivo (al menos ${LONGITUD_MINIMA_MOTIVO} caracteres).`
    )
    .max(
      LONGITUD_MAXIMA_MOTIVO,
      `Máximo ${LONGITUD_MAXIMA_MOTIVO} caracteres.`
    ),
})

export type EntradaCancelarCampana = z.input<typeof esquemaCancelarCampana>
