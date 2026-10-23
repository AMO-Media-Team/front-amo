/**
 * Esquemas zod del asistente de oferta: los MISMOS en el formulario
 * (`zodResolver`) y en las Server Actions. Módulo puro.
 *
 * Los valores se agrupan por paso (`que`, `quien`, `cuando`, `cuanto`,
 * `envio`): cada grupo valida sus reglas cruzadas por su cuenta, así un campo
 * vacío del paso 4 no impide comprobar la ventana del paso 3.
 *
 * - `esquemaOferta(null)` (borrador): lo que exige la BD para guardar
 *   (restricciones CHECK de `ofertas` y `oferta_cupos`). Lo usan «Guardar
 *   borrador» y el servidor.
 * - `esquemaOferta(contexto)` (completo): además las reglas que la BD aplica
 *   al enviar a revisión (`validar_envio_oferta`), para avisarlas en su paso:
 *   ventana dentro de la campaña, anticipación de la fecha límite, cupos
 *   mínimos y presupuesto disponible. La BD las vuelve a comprobar.
 */
import { z } from "zod"

import {
  cantidadDecimales,
  textoANumero,
} from "@/features/configuracion/numeros"
import {
  esquemaCodigoDepartamento,
  esquemaCodigoMunicipio,
  esquemaSegmentacion,
} from "@/features/territorio/schemas"
import { formatearCOP, formatearFecha, formatearNumero } from "@/lib/format"

import {
  finDeCampana,
  inicioDeCampana,
  instante,
  minimoFechaLimite,
} from "./instantes"
import type { CorteOferta, MedioExcluido } from "./tipos"

export const LIMITES_OFERTA = {
  tituloMin: 3,
  tituloMax: 120,
  publicacionesMax: 10,
  formatosMax: 9,
  categoriasMax: 100,
  excluidosMax: 2000,
  seguidoresMax: 1_000_000_000,
  permanenciaMax: 365,
  exclusividadMax: 90,
  cuposMax: 500,
  presupuestoMax: 999_999_999_999,
  textoMax: 4000,
  busquedaMin: 3,
  busquedaMax: 80,
} as const

export const CORTES_OFERTA = [
  "H24",
  "H72",
  "D7",
] as const satisfies readonly CorteOferta[]

// ── Valores del formulario (lo que se escribe) ───────────────────────────────

export interface CupoFranjaEntrada {
  franjaId: string
  /** Cifra escrita ('' = sin cupos en la franja). */
  cantidad: string
}

/** Presupuesto y cupos de la oferta de un formato (una oferta por formato). */
export interface FormatoElegidoEntrada {
  formatoId: string
  presupuestoMaximo: string
  cupos: CupoFranjaEntrada[]
}

export interface ValoresOferta {
  que: {
    /** Un formato por oferta (cada plataforma ofrece solo los suyos). */
    formatoIds: string[]
    titulo: string
    publicacionesPorMedio: string
  }
  quien: {
    segmentacion: { departamentos: string[]; municipios: string[] }
    categorias: string[]
    seguidoresMinimos: string
    mediosExcluidos: MedioExcluido[]
  }
  cuando: {
    /** ISO UTC ('' sin elegir). */
    ventanaInicio: string
    ventanaFin: string
    fechaLimite: string
    permanenciaDias: string
    cortes: CorteOferta[]
    exclusividad: boolean
    exclusividadDias: string
  }
  cuanto: {
    formatos: FormatoElegidoEntrada[]
    /** Porcentaje escrito («15», «12,5»). */
    topePorcentaje: string
  }
  envio: {
    instrucciones: string
    restricciones: string
  }
}

/** Lo que el modo completo necesita saber de la campaña y la configuración. */
export interface ContextoValidacion {
  campana: { fechaInicio: string; fechaFin: string }
  /** Disponible de la campaña para estas ofertas; null si no se conoce. */
  disponible: number | null
  anticipacionHoras: number
  minimoCupos: number
  /** Formatos activos (los elegidos deben seguir estándolo). */
  formatos: readonly { id: string }[]
  /**
   * Formatos cuya oferta ya se envió (no se edita): su presupuesto ya está
   * descontado del disponible y no vuelve a contar.
   */
  enviados?: readonly string[]
  /** Reloj inyectable para las pruebas. */
  ahora?: () => Date
}

// ── Piezas ────────────────────────────────────────────────────────────────────

const id = z.uuid({ error: "Identificador inválido." })

function aCifra(
  texto: string,
  contexto: z.RefinementCtx,
  mensaje: string
): number {
  const valor = textoANumero(texto)
  if (valor === null) {
    contexto.addIssue({ code: "custom", message: mensaje })
    return z.NEVER
  }
  return valor
}

function entero(
  minimo: number,
  maximo: number,
  textos: { minimo: string; maximo: string }
) {
  return z
    .number()
    .int("Escribe un número entero, sin decimales.")
    .min(minimo, textos.minimo)
    .max(maximo, textos.maximo)
}

function cifraRequerida(
  vacio: string,
  invalida: string,
  rango: ReturnType<typeof entero>
) {
  return z
    .string({ error: vacio })
    .trim()
    .min(1, { error: vacio, abort: true })
    .transform((texto, contexto) => aCifra(texto, contexto, invalida))
    .pipe(rango)
}

function cifraOpcional(invalida: string, rango: ReturnType<typeof entero>) {
  return z
    .string()
    .trim()
    .transform((texto, contexto) =>
      texto === "" ? null : aCifra(texto, contexto, invalida)
    )
    .pipe(rango.nullable())
}

function instanteRequerido(vacio: string) {
  return z
    .string({ error: vacio })
    .trim()
    .min(1, { error: vacio, abort: true })
    .refine((texto) => instante(texto) !== null, "Elige una fecha válida.")
}

function textoOpcional(maximo: number, mensaje: string) {
  return z
    .string()
    .trim()
    .max(maximo, mensaje)
    .transform((texto) => (texto === "" ? null : texto))
}

function sinRepetidos<T>(valores: readonly T[]): T[] {
  return [...new Set(valores)]
}

const NUMERO = "Escribe solo números, por ejemplo 1.500.000."

// ── Paso 1 · Qué se publica ──────────────────────────────────────────────────

function esquemaQue(contexto: ContextoValidacion | null) {
  return z
    .object({
      formatoIds: z
        .array(id)
        .min(1, "Elige al menos un formato.")
        .max(LIMITES_OFERTA.formatosMax, "Demasiados formatos.")
        .transform(sinRepetidos),
      titulo: z
        .string({ error: "Escribe un título para la oferta." })
        .trim()
        .min(1, { error: "Escribe un título para la oferta.", abort: true })
        .min(
          LIMITES_OFERTA.tituloMin,
          `Usa al menos ${LIMITES_OFERTA.tituloMin} caracteres.`
        )
        .max(
          LIMITES_OFERTA.tituloMax,
          `Usa como máximo ${LIMITES_OFERTA.tituloMax} caracteres.`
        ),
      publicacionesPorMedio: cifraRequerida(
        "Indica cuántas publicaciones hace cada medio.",
        "Escribe un número de 1 a 10.",
        entero(1, LIMITES_OFERTA.publicacionesMax, {
          minimo: "Cada medio hace al menos 1 publicación.",
          maximo: `Como máximo ${LIMITES_OFERTA.publicacionesMax} publicaciones por medio.`,
        })
      ),
    })
    .superRefine((datos, ctx) => {
      if (!contexto) return
      const activos = new Set(contexto.formatos.map((formato) => formato.id))
      // Una oferta ya enviada no se toca: su formato no bloquea a las demás.
      const enviados = new Set(contexto.enviados ?? [])
      if (
        datos.formatoIds.some(
          (formatoId) => !activos.has(formatoId) && !enviados.has(formatoId)
        )
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["formatoIds"],
          message:
            "Uno de los formatos elegidos ya no está disponible. Quítalo para continuar.",
        })
      }
    })
}

// ── Paso 2 · A quién le llega ────────────────────────────────────────────────

const esquemaMedioExcluido = z.object({
  id,
  nombre: z.string().trim().min(1).max(300),
  municipio: z.string().trim().max(200).nullable(),
})

const esquemaQuien = z.object({
  segmentacion: esquemaSegmentacion,
  categorias: z
    .array(id)
    .max(LIMITES_OFERTA.categoriasMax, "Demasiadas categorías.")
    .transform(sinRepetidos),
  seguidoresMinimos: cifraOpcional(
    "Escribe solo números, por ejemplo 50.000.",
    entero(0, LIMITES_OFERTA.seguidoresMax, {
      minimo: "El mínimo no puede ser negativo.",
      maximo: "Ese mínimo es demasiado alto.",
    })
  ),
  mediosExcluidos: z
    .array(esquemaMedioExcluido)
    .max(LIMITES_OFERTA.excluidosMax, "Demasiados medios excluidos.")
    .transform((medios) =>
      medios.filter(
        (medio, indice) => medios.findIndex((m) => m.id === medio.id) === indice
      )
    ),
})

// ── Paso 3 · Cuándo ──────────────────────────────────────────────────────────

function textoAnticipacion(horas: number): string {
  return horas <= 0
    ? "La fecha límite de aceptación ya pasó."
    : `La fecha límite de aceptación debe quedar al menos ${formatearNumero(horas)} ${horas === 1 ? "hora" : "horas"} después del envío.`
}

const diasExclusividad = entero(1, LIMITES_OFERTA.exclusividadMax, {
  minimo: "La exclusividad es de al menos 1 día.",
  maximo: `Como máximo ${LIMITES_OFERTA.exclusividadMax} días.`,
})

/**
 * Días de exclusividad escritos → número o el problema. Solo se leen con la
 * exclusividad activa: lo que quedó escrito al apagarla (y ya no se ve) no
 * bloquea el paso.
 */
function leerDiasExclusividad(
  texto: string
): { dias: number } | { error: string } {
  if (texto === "") {
    return { error: "Indica cuántos días de exclusividad (de 1 a 90)." }
  }
  const numero = textoANumero(texto)
  if (numero === null) {
    return { error: "Escribe un número de días, por ejemplo 15." }
  }
  const rango = diasExclusividad.safeParse(numero)
  return rango.success
    ? { dias: rango.data }
    : { error: rango.error.issues[0]?.message ?? "Revisa los días." }
}

function esquemaCuando(contexto: ContextoValidacion | null) {
  return z
    .object({
      ventanaInicio: instanteRequerido(
        "Elige el día y la hora de inicio de la ventana."
      ),
      ventanaFin: instanteRequerido(
        "Elige el día y la hora de fin de la ventana."
      ),
      fechaLimite: instanteRequerido(
        "Elige el día y la hora límite para aceptar."
      ),
      permanenciaDias: cifraRequerida(
        "Indica cuántos días debe quedar publicada.",
        "Escribe un número de días, por ejemplo 7.",
        entero(0, LIMITES_OFERTA.permanenciaMax, {
          minimo: "La permanencia no puede ser negativa.",
          maximo: `Como máximo ${LIMITES_OFERTA.permanenciaMax} días.`,
        })
      ),
      cortes: z
        .array(z.enum(CORTES_OFERTA))
        .min(1, "Exige al menos un corte de métricas.")
        .transform((cortes) =>
          CORTES_OFERTA.filter((corte) => cortes.includes(corte))
        ),
      exclusividad: z.boolean(),
      // Texto: se valida en el `superRefine`, y solo con la exclusividad activa.
      exclusividadDias: z.string().trim(),
    })
    .superRefine((datos, ctx) => {
      const inicio = instante(datos.ventanaInicio)
      const fin = instante(datos.ventanaFin)
      const limite = instante(datos.fechaLimite)
      if (inicio && fin && fin <= inicio) {
        ctx.addIssue({
          code: "custom",
          path: ["ventanaFin"],
          message: "El fin de la ventana debe quedar después del inicio.",
        })
      }
      if (fin && limite && limite > fin) {
        ctx.addIssue({
          code: "custom",
          path: ["fechaLimite"],
          message:
            "La fecha límite de aceptación no puede pasar del fin de la ventana.",
        })
      }
      if (datos.exclusividad) {
        const dias = leerDiasExclusividad(datos.exclusividadDias)
        if ("error" in dias) {
          ctx.addIssue({
            code: "custom",
            path: ["exclusividadDias"],
            message: dias.error,
          })
        }
      }
      if (!contexto) return
      const inicioCampana = inicioDeCampana(contexto.campana.fechaInicio)
      const finCampana = finDeCampana(contexto.campana.fechaFin)
      if (inicio && inicioCampana && inicio < inicioCampana) {
        ctx.addIssue({
          code: "custom",
          path: ["ventanaInicio"],
          message: `La ventana debe empezar dentro de la campaña, desde el ${formatearFecha(inicioCampana, "largo")}.`,
        })
      }
      if (fin && finCampana && fin > finCampana) {
        ctx.addIssue({
          code: "custom",
          path: ["ventanaFin"],
          message: `La ventana debe terminar dentro de la campaña, a más tardar el ${formatearFecha(new Date(finCampana.getTime() - 1), "largo")}.`,
        })
      }
      const ahora = contexto.ahora?.() ?? new Date()
      if (
        limite &&
        limite < minimoFechaLimite(ahora, contexto.anticipacionHoras)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["fechaLimite"],
          message: textoAnticipacion(contexto.anticipacionHoras),
        })
      }
    })
    .transform((datos) => {
      const dias = datos.exclusividad
        ? leerDiasExclusividad(datos.exclusividadDias)
        : null
      return {
        ...datos,
        exclusividadDias: dias && "dias" in dias ? dias.dias : null,
      }
    })
}

// ── Paso 4 · Cuánto ──────────────────────────────────────────────────────────

const esquemaCupo = z.object({
  franjaId: id,
  cantidad: cifraOpcional(
    "Escribe un número de cupos.",
    entero(0, LIMITES_OFERTA.cuposMax, {
      minimo: "Los cupos no pueden ser negativos.",
      maximo: `Como máximo ${LIMITES_OFERTA.cuposMax} cupos por franja.`,
    })
  ).transform((cantidad) => cantidad ?? 0),
})

const esquemaFormatoElegido = z.object({
  formatoId: id,
  presupuestoMaximo: cifraRequerida(
    "Escribe el presupuesto máximo de esta oferta.",
    NUMERO,
    entero(1, LIMITES_OFERTA.presupuestoMax, {
      minimo: "El presupuesto debe ser mayor que cero.",
      maximo: "Ese presupuesto es demasiado alto.",
    })
  ),
  cupos: z.array(esquemaCupo).max(20),
})

const topePorcentaje = z
  .string({ error: "Indica el tope por medio." })
  .trim()
  .min(1, { error: "Indica el tope por medio.", abort: true })
  .transform((texto, contexto) =>
    aCifra(texto, contexto, "Escribe un porcentaje, por ejemplo 15.")
  )
  .pipe(
    z
      .number()
      .min(1, "El tope por medio es de al menos 1 %.")
      .max(100, "El tope por medio no puede pasar de 100 %.")
      .refine(
        (valor) => cantidadDecimales(valor) <= 2,
        "Usa como máximo dos decimales."
      )
  )
  // La BD guarda la fracción (`numeric(5,4)`): 15 % → 0,15.
  .transform((valor) => Math.round(valor * 100) / 10_000)

function esquemaCuanto(contexto: ContextoValidacion | null) {
  return z
    .object({
      formatos: z.array(esquemaFormatoElegido).max(LIMITES_OFERTA.formatosMax),
      topePorcentaje,
    })
    .superRefine((datos, ctx) => {
      const ids = datos.formatos.map((formato) => formato.formatoId)
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({
          code: "custom",
          path: ["formatos"],
          message: "Hay un formato repetido.",
        })
      }
      if (!contexto) return
      const enviados = new Set(contexto.enviados ?? [])
      const editables = datos.formatos.filter(
        (formato) => !enviados.has(formato.formatoId)
      )
      datos.formatos.forEach((formato, indice) => {
        if (enviados.has(formato.formatoId)) return
        const cupos = formato.cupos.reduce((suma, c) => suma + c.cantidad, 0)
        if (cupos < Math.max(1, contexto.minimoCupos)) {
          // En el primer cupo: ahí llega el foco para corregirlo.
          ctx.addIssue({
            code: "custom",
            path: ["formatos", indice, "cupos", 0, "cantidad"],
            message:
              contexto.minimoCupos > 1
                ? `Define al menos ${formatearNumero(contexto.minimoCupos)} cupos entre las franjas.`
                : "Define al menos 1 cupo en alguna franja.",
          })
        }
        if (
          contexto.disponible !== null &&
          formato.presupuestoMaximo > contexto.disponible
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["formatos", indice, "presupuestoMaximo"],
            message: `Supera lo disponible en la campaña (${formatearCOP(contexto.disponible)}).`,
          })
        }
      })
      const total = editables.reduce(
        (suma, formato) => suma + formato.presupuestoMaximo,
        0
      )
      const primero = datos.formatos.indexOf(editables[0])
      if (
        editables.length > 1 &&
        contexto.disponible !== null &&
        total > contexto.disponible
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["formatos", primero, "presupuestoMaximo"],
          message: `Entre las ofertas suman ${formatearCOP(total)} y la campaña tiene disponibles ${formatearCOP(contexto.disponible)}.`,
        })
      }
    })
}

// ── Paso 6 · Condiciones ─────────────────────────────────────────────────────

const esquemaEnvio = z.object({
  instrucciones: textoOpcional(
    LIMITES_OFERTA.textoMax,
    `Usa como máximo ${formatearNumero(LIMITES_OFERTA.textoMax)} caracteres.`
  ),
  restricciones: textoOpcional(
    LIMITES_OFERTA.textoMax,
    `Usa como máximo ${formatearNumero(LIMITES_OFERTA.textoMax)} caracteres.`
  ),
})

// ── Esquema completo ─────────────────────────────────────────────────────────

/**
 * `null` = borrador (lo que exige la BD para guardar); con contexto, además
 * las reglas del envío a revisión.
 */
export function esquemaOferta(contexto: ContextoValidacion | null) {
  return z
    .object({
      que: esquemaQue(contexto),
      quien: esquemaQuien,
      cuando: esquemaCuando(contexto),
      cuanto: esquemaCuanto(contexto),
      envio: esquemaEnvio,
    })
    .superRefine((datos, ctx) => {
      // Una oferta por formato: cada formato elegido tiene su presupuesto.
      const elegidos = [...datos.que.formatoIds].sort().join()
      const conPresupuesto = datos.cuanto.formatos
        .map((formato) => formato.formatoId)
        .sort()
        .join()
      if (elegidos !== conPresupuesto) {
        ctx.addIssue({
          code: "custom",
          path: ["cuanto", "formatos"],
          message:
            "Revisa el presupuesto y los cupos: no coinciden con los formatos elegidos.",
        })
      }
    })
}

export const esquemaBorradorOferta = esquemaOferta(null)

export type DatosOferta = z.output<typeof esquemaBorradorOferta>

// ── Acciones ─────────────────────────────────────────────────────────────────

/** Hasta dónde se buscan los borradores de un intento que se quedó sin respuesta. */
export const REINTENTO_MAXIMO_S = 86_400

/**
 * Ofertas que el asistente ya creó, para actualizarlas en lugar de
 * duplicarlas, con la versión (`updated_at`) que vio de cada una: si otra
 * persona la cambió entretanto, no se pisa. `segundosDesdeFallo`: el intento
 * anterior se quedó sin respuesta (falló la red) hace esos segundos; el
 * servidor adopta los borradores que ese intento alcanzó a crear.
 */
export const esquemaReferenciasOfertas = z.object({
  campanaId: id,
  existentes: z
    .array(
      z.object({
        formatoId: id,
        ofertaId: id,
        actualizadaAt: z.iso.datetime({
          offset: true,
          error: "Versión de la oferta inválida.",
        }),
      })
    )
    .max(LIMITES_OFERTA.formatosMax),
  segundosDesdeFallo: z
    .number()
    .int()
    .min(0)
    // Como mucho se busca en el último día.
    .transform((segundos) => Math.min(segundos, REINTENTO_MAXIMO_S))
    .optional(),
})

export type ReferenciasOfertas = z.input<typeof esquemaReferenciasOfertas>

export const esquemaDescartarOferta = z.object({ ofertaId: id })

export const esquemaBuscarMedios = z.object({
  texto: z
    .string()
    .trim()
    .min(
      LIMITES_OFERTA.busquedaMin,
      `Escribe al menos ${LIMITES_OFERTA.busquedaMin} letras del nombre.`
    )
    .max(LIMITES_OFERTA.busquedaMax, "Usa menos letras para buscar."),
})

/** Parámetros del estimador (`estimar_oferta`), ya interpretados. */
export const esquemaEstimacion = z.object({
  formatoId: id,
  departamentos: z.array(esquemaCodigoDepartamento).max(33),
  municipios: z.array(esquemaCodigoMunicipio).max(1_122),
  categorias: z.array(id).max(LIMITES_OFERTA.categoriasMax),
  seguidoresMinimos: z
    .number()
    .int()
    .min(0)
    .max(LIMITES_OFERTA.seguidoresMax)
    .nullable(),
  cupos: z
    .record(z.string(), z.number().int().min(0).max(LIMITES_OFERTA.cuposMax))
    .refine(
      (cupos) =>
        Object.keys(cupos).length <= 20 &&
        Object.keys(cupos).every((clave) => id.safeParse(clave).success),
      "Cupos por franja inválidos."
    ),
  exclusividadDias: z
    .number()
    .int()
    .min(1)
    .max(LIMITES_OFERTA.exclusividadMax)
    .nullable(),
  mediosExcluidos: z.array(id).max(LIMITES_OFERTA.excluidosMax),
  publicaciones: z.number().int().min(1).max(LIMITES_OFERTA.publicacionesMax),
})

export type ParametrosEstimacion = z.infer<typeof esquemaEstimacion>
