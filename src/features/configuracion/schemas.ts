/**
 * Esquemas zod de Configuración: los MISMOS en el cliente (formularios y
 * edición en línea) y en las Server Actions. Reflejan
 * `private.fn_validar_configuracion` y los CHECK de las tablas de §3.4 para que
 * el error llegue al campo antes de ir a la BD (que vuelve a validarlo todo).
 * Los formularios envían cifras como texto es-CO ("1.250.000", "15,5"); el
 * esquema las convierte.
 */
import { z } from "zod"

import { parsearFecha } from "@/lib/fechas"
import { Constants } from "@/types/database.types"

import { cantidadDecimales, textoANumero } from "./numeros"
import type { ReglasParametro, ValorParametro } from "./tipos"
import { normalizarValor, porcentajeAFraccion } from "./valores"
import { instanteBogota } from "./vigencias"

const ENUMS = Constants.public.Enums

export const PLATAFORMAS = ENUMS.plataforma
export const DOCUMENTOS_MEDIO = ENUMS.documento_medio_tipo
export const TIPOS_RETENCION = ENUMS.retencion_tipo
export const TIPOS_DOCUMENTO_ELECTRONICO = ENUMS.documento_electronico_tipo
export const TIPOS_TERMINOS = ENUMS.terminos_tipo
export const CANALES = ENUMS.notificacion_canal
export const CONCEPTOS_RETENCION = [
  "SERVICIOS",
  "PUBLICIDAD",
  "HONORARIOS",
] as const
export const CLAVES_FORMATO = [
  "POST_FEED",
  "REEL",
  "HISTORIA",
  "CARRUSEL",
  "VIDEO",
] as const

export const PATRON_CLAVE_PARAMETRO = /^[a-z_]+(\.[a-z_]+)+$/
const PATRON_CLAVE_PLANTILLA = /^[a-z_]+(\.[a-z_]+)+$/
const PATRON_VERSION = /^[0-9A-Za-z._-]{1,20}$/
const PATRON_PREFIJO = /^[A-Z0-9]{0,4}$/
const PATRON_MUNICIPIO = /^\d{5}$/
const PATRON_DEPARTAMENTO = /^\d{2}$/

const id = z.uuid({ error: "Identificador inválido." })

export const esquemaId = z.object({ id })
const marcaTiempo = z.string().min(1, "Falta la versión del registro.").max(64)

// ── Cifras ──────────────────────────────────────────────────────────────────

interface OpcionesNumero {
  min?: number
  max?: number
  /** Decimales admitidos por la columna (0 = entero). */
  decimales?: number
  mensaje?: string
}

function comoNumero(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null
  if (typeof valor === "string") return textoANumero(valor)
  return null
}

function reglasNumero(
  esquema: z.ZodNumber,
  { min, max, decimales }: OpcionesNumero
) {
  let resultado = esquema
  if (min !== undefined) {
    resultado = resultado.min(min, `Debe ser al menos ${formato(min)}.`)
  }
  if (max !== undefined) {
    resultado = resultado.max(max, `No puede pasar de ${formato(max)}.`)
  }
  if (decimales === 0) return resultado.int("Debe ser un número entero.")
  if (decimales !== undefined) {
    return resultado.refine(
      (n) => cantidadDecimales(n) <= decimales,
      `Usa como máximo ${decimales} decimales.`
    )
  }
  return resultado
}

function formato(n: number): string {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 4 }).format(n)
}

/** Cifra obligatoria escrita como texto es-CO o número. */
export function numero(opciones: OpcionesNumero = {}) {
  const mensaje = opciones.mensaje ?? "Escribe un número."
  return z
    .union([z.number(), z.string()], { error: mensaje })
    .transform((valor, ctx) => {
      const n = comoNumero(valor)
      if (n === null) {
        ctx.addIssue({ code: "custom", message: mensaje })
        return z.NEVER
      }
      return n
    })
    .pipe(reglasNumero(z.number(), opciones))
}

/** Cifra opcional: vacío → `null`. */
export function numeroOpcional(opciones: OpcionesNumero = {}) {
  const mensaje = opciones.mensaje ?? "Escribe un número o déjalo vacío."
  return z
    .union([z.number(), z.string(), z.null()], { error: mensaje })
    .transform((valor, ctx) => {
      if (valor === null || (typeof valor === "string" && !valor.trim())) {
        return null
      }
      const n = comoNumero(valor)
      if (n === null) {
        ctx.addIssue({ code: "custom", message: mensaje })
        return z.NEVER
      }
      return n
    })
    .pipe(reglasNumero(z.number(), opciones).nullable())
}

/** Porcentaje escrito como 0–100 → fracción 0–1 con `decimalesFraccion` decimales. */
export function porcentaje({
  min = 0,
  max = 100,
  decimalesFraccion = 4,
}: { min?: number; max?: number; decimalesFraccion?: number } = {}) {
  return numero({
    min,
    max,
    decimales: Math.max(0, decimalesFraccion - 2),
    mensaje: "Escribe un porcentaje.",
  }).transform((n) =>
    decimalesFraccion === 4
      ? porcentajeAFraccion(n)
      : Number((n / 100).toFixed(decimalesFraccion))
  )
}

const textoRequerido = (min: number, max: number, campo: string) =>
  z
    .string({ error: `Escribe ${campo}.` })
    .trim()
    .min(1, `Escribe ${campo}.`)
    .min(min, `Escribe al menos ${min} caracteres.`)
    .max(max, `Máximo ${max} caracteres.`)

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .transform((valor) => (valor === "" ? null : valor))

const dia = z
  .string({ error: "Elige una fecha." })
  .refine((valor) => parsearFecha(valor) !== null, "Elige una fecha válida.")

const diaOpcional = z
  .string()
  .refine(
    (valor) => valor === "" || parsearFecha(valor) !== null,
    "Elige una fecha válida."
  )
  .transform((valor) => (valor === "" ? null : valor))

// ── Parámetros de `configuracion` ───────────────────────────────────────────

const valorJson: z.ZodType<ValorParametro> = z.union([
  z.number(),
  z.boolean(),
  z.string().max(200),
  z.array(z.string().max(60)).max(300),
  z.record(z.string().max(60), z.number()),
])

export const esquemaGuardarParametro = z.object({
  clave: z.string().regex(PATRON_CLAVE_PARAMETRO, "Parámetro desconocido."),
  valor: valorJson,
  actualizadoAt: marcaTiempo,
})

export type EntradaGuardarParametro = z.input<typeof esquemaGuardarParametro>

export interface OpcionesValidacionValor {
  /** Valores que viven en otra tabla (ISO2 de países, DIVIPOLA de municipios). */
  existe?: (valor: string) => boolean
}

function enRango(reglas: ReglasParametro) {
  const min =
    reglas.tipo === "PORCENTAJE"
      ? Math.max(0, reglas.minimo ?? 0)
      : reglas.minimo
  const max =
    reglas.tipo === "PORCENTAJE"
      ? Math.min(1, reglas.maximo ?? 1)
      : reglas.maximo
  return { min, max }
}

function textoRango(
  reglas: ReglasParametro,
  min: number | null,
  max: number | null
): string {
  const f = (n: number) =>
    reglas.tipo === "PORCENTAJE" ? `${formato(n * 100)}%` : formato(n)
  if (min !== null && max !== null)
    return `Debe estar entre ${f(min)} y ${f(max)}.`
  if (min !== null) return `Debe ser al menos ${f(min)}.`
  return `No puede pasar de ${f(max ?? 0)}.`
}

/**
 * Mismas reglas que `private.fn_validar_configuracion`: tipo, rango y
 * opciones. Además, una lista no puede quedar vacía y un mapa con opciones
 * debe tener un valor para cada una (sin ellos la regla dejaría de aplicarse).
 */
export function esquemaValorParametro(
  reglas: ReglasParametro,
  { existe }: OpcionesValidacionValor = {}
): z.ZodType<ValorParametro> {
  const { min, max } = enRango(reglas)
  const fueraDeRango = (n: number) =>
    (min !== null && n < min) || (max !== null && n > max)
  const mensajeRango = textoRango(reglas, min, max)
  const opciones = reglas.opciones

  switch (reglas.tipo) {
    case "ENTERO":
      return z
        .number({ error: "Escribe un número entero." })
        .int("Debe ser un número entero.")
        .refine((n) => !fueraDeRango(n), mensajeRango)
    case "DECIMAL":
    case "PORCENTAJE":
      return z
        .number({ error: "Escribe un número." })
        .refine((n) => Number.isFinite(n), "Escribe un número.")
        .refine((n) => !fueraDeRango(n), mensajeRango)
    case "BOOLEANO":
      return z.boolean({ error: "Elige sí o no." })
    case "TEXTO":
      return z
        .string({ error: "Elige una opción." })
        .min(1, "Elige una opción.")
        .refine(
          (texto) => !opciones || opciones.includes(texto),
          "No es una opción permitida."
        )
        .refine((texto) => !existe || existe(texto), "No es un valor válido.")
    case "LISTA_TEXTO":
      return z
        .array(z.string(), { error: "Elige al menos una opción." })
        .min(1, "Elige al menos una opción.")
        .refine(
          (lista) => !opciones || lista.every((x) => opciones.includes(x)),
          "Contiene opciones no permitidas."
        )
        .refine(
          (lista) => !existe || lista.every(existe),
          "Contiene valores que no existen."
        )
        .transform((lista) => normalizarValor(reglas, lista) as string[])
    case "MAPA_DECIMAL":
      return z
        .record(z.string(), z.number({ error: "Escribe un número." }))
        .refine(
          (mapa) =>
            !opciones || Object.keys(mapa).every((k) => opciones.includes(k)),
          "Contiene claves no permitidas."
        )
        .refine(
          (mapa) => !opciones || opciones.every((k) => k in mapa),
          "Completa el valor de cada opción."
        )
        .refine(
          (mapa) => Object.values(mapa).every((n) => !fueraDeRango(n)),
          mensajeRango.replace("Debe", "Cada valor debe")
        )
        .transform(
          (mapa) => normalizarValor(reglas, mapa) as Record<string, number>
        )
  }
}

// ── Tarifas ─────────────────────────────────────────────────────────────────

export const INICIOS_TARIFA = [
  "pronto",
  "manana",
  "lunes",
  "mes",
  "fecha",
] as const
export type InicioTarifa = (typeof INICIOS_TARIFA)[number]

/** Cuánto después de "ahora" entra una tarifa "lo antes posible" (margen de reloj). */
export const MARGEN_INICIO_MS = 60_000

export const VALOR_MAXIMO_TARIFA = 999_999_999

export const esquemaProgramarTarifa = z
  .object({
    formatoId: id,
    franjaId: id,
    valor: numero({
      min: 1,
      max: VALOR_MAXIMO_TARIFA,
      decimales: 0,
      mensaje: "Escribe el valor en pesos.",
    }),
    inicio: z.enum(INICIOS_TARIFA, { error: "Elige cuándo empieza." }),
    dia: z.string(),
    hora: z.string(),
  })
  .superRefine((datos, ctx) => {
    if (datos.inicio !== "fecha") return
    const desde = instanteBogota(datos.dia, datos.hora || "00:00")
    if (!desde) {
      ctx.addIssue({ code: "custom", path: ["dia"], message: "Elige el día." })
    } else if (desde.getTime() <= Date.now()) {
      ctx.addIssue({
        code: "custom",
        path: ["hora"],
        message: "La nueva vigencia debe empezar en el futuro.",
      })
    }
  })

export type EntradaProgramarTarifa = z.input<typeof esquemaProgramarTarifa>

export const esquemaIdTarifa = z.object({ tarifaId: id })
export const esquemaValidarTarifas = z.object({
  tarifaIds: z
    .array(id)
    .min(1, "Elige al menos una tarifa.")
    .max(500, "Demasiadas tarifas a la vez."),
})

// ── Franjas y formatos ──────────────────────────────────────────────────────

export const esquemaFranja = z
  .object({
    id: id.nullable(),
    clave: z.string().trim().toUpperCase(),
    nombre: textoRequerido(2, 60, "el nombre"),
    seguidoresMin: numero({ min: 0, max: 2_000_000_000, decimales: 0 }),
    seguidoresMax: numeroOpcional({ min: 1, max: 2_000_000_000, decimales: 0 }),
    orden: numero({ min: 0, max: 32_767, decimales: 0 }),
    activa: z.boolean(),
    actualizadoAt: z.string().nullable(),
  })
  .superRefine((datos, ctx) => {
    if (datos.id === null && !/^F\d$/.test(datos.clave)) {
      ctx.addIssue({
        code: "custom",
        path: ["clave"],
        message: "Usa F seguida de un dígito (F4).",
      })
    }
    if (
      datos.seguidoresMax !== null &&
      datos.seguidoresMax <= datos.seguidoresMin
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["seguidoresMax"],
        message: "Debe ser mayor que el mínimo.",
      })
    }
  })

export type EntradaFranja = z.input<typeof esquemaFranja>

const listaCorta = z
  .array(z.string().trim().min(1).max(40))
  .max(20, "Máximo 20 valores.")

export const esquemaFormato = z
  .object({
    id: id.nullable(),
    plataforma: z.enum(PLATAFORMAS, { error: "Elige la plataforma." }),
    clave: z.enum(CLAVES_FORMATO, { error: "Elige el tipo de formato." }),
    nombre: textoRequerido(2, 60, "el nombre"),
    activo: z.boolean(),
    orden: numero({ min: 0, max: 32_767, decimales: 0 }),
    relacionesAspecto: listaCorta,
    mime: listaCorta,
    duracionMaxS: numeroOpcional({ min: 1, max: 3600, decimales: 0 }),
    pesoMaxMb: numeroOpcional({ min: 1, max: 500, decimales: 0 }),
    maxArchivos: numeroOpcional({ min: 1, max: 20, decimales: 0 }),
    actualizadoAt: z.string().nullable(),
  })
  .superRefine((datos, ctx) => {
    for (const relacion of datos.relacionesAspecto) {
      if (!/^\d+(\.\d+)?:\d+(\.\d+)?$/.test(relacion)) {
        ctx.addIssue({
          code: "custom",
          path: ["relacionesAspecto"],
          message: `«${relacion}» no es una relación de aspecto (usa 9:16).`,
        })
        return
      }
    }
    for (const tipo of datos.mime) {
      if (!/^(image|video)\/[a-z0-9.+-]+$/.test(tipo)) {
        ctx.addIssue({
          code: "custom",
          path: ["mime"],
          message: `«${tipo}» no es un tipo de archivo (usa video/mp4).`,
        })
        return
      }
    }
  })

export type EntradaFormato = z.input<typeof esquemaFormato>

// ── Comisiones de excepción ─────────────────────────────────────────────────

export const OBJETIVOS_COMISION = ["anunciante", "campana"] as const

export const esquemaExcepcion = z
  .object({
    id: id.nullable(),
    objetivo: z.enum(OBJETIVOS_COMISION, { error: "Elige a quién aplica." }),
    objetivoId: z.string().min(1, "Elige el anunciante o la campaña."),
    porcentaje: porcentaje({ min: 0, max: 50 }),
    desdeAhora: z.boolean(),
    desde: z.string(),
    hasta: diaOpcional,
    motivo: textoRequerido(3, 500, "el motivo"),
    actualizadoAt: z.string().nullable(),
  })
  .superRefine((datos, ctx) => {
    if (!z.uuid().safeParse(datos.objetivoId).success) {
      ctx.addIssue({
        code: "custom",
        path: ["objetivoId"],
        message: "Elige el anunciante o la campaña.",
      })
    }
    if (!datos.desdeAhora && parsearFecha(datos.desde) === null) {
      ctx.addIssue({
        code: "custom",
        path: ["desde"],
        message: "Elige el día.",
      })
    }
    if (
      datos.hasta !== null &&
      !datos.desdeAhora &&
      parsearFecha(datos.desde) !== null &&
      datos.hasta < datos.desde
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["hasta"],
        message: "Debe ser igual o posterior al inicio.",
      })
    }
  })

export type EntradaExcepcion = z.input<typeof esquemaExcepcion>

export const esquemaIdExcepcion = z.object({
  id,
  actualizadoAt: marcaTiempo,
})

/** Resultados que devuelve cada búsqueda de anunciante o campaña. */
export const LIMITE_BUSQUEDA_OBJETIVOS = 8

export const esquemaBuscarObjetivo = z.object({
  objetivo: z.enum(OBJETIVOS_COMISION),
  q: z.string().trim().max(80),
})

// ── Niveles de verificación ─────────────────────────────────────────────────

export const esquemaNivel = z
  .object({
    nivel: z.number().int().min(1).max(3),
    nombre: textoRequerido(2, 80, "el nombre"),
    requisitos: z
      .string()
      .transform((texto) =>
        texto
          .split("\n")
          .map((linea) => linea.trim())
          .filter(Boolean)
      )
      .pipe(
        z
          .array(z.string().max(200, "Cada requisito admite 200 caracteres."))
          .min(1, "Escribe al menos un requisito.")
          .max(12, "Máximo 12 requisitos.")
      ),
    documentosRequeridos: z
      .array(z.enum(DOCUMENTOS_MEDIO))
      .min(1, "Elige al menos un documento."),
    sinTope: z.boolean(),
    topeAnual: numeroOpcional({ min: 1, max: 999_999_999_999, decimales: 0 }),
    porcentajeAlerta: porcentaje({ min: 1, max: 100 }),
    porcentajeBloqueo: porcentaje({ min: 1, max: 100 }),
    pendienteValidacion: z.boolean(),
    actualizadoAt: marcaTiempo,
  })
  .superRefine((datos, ctx) => {
    if (!datos.sinTope && datos.topeAnual === null) {
      ctx.addIssue({
        code: "custom",
        path: ["topeAnual"],
        message: "Escribe el tope anual o marca «Sin tope».",
      })
    }
    if (datos.porcentajeAlerta > datos.porcentajeBloqueo) {
      ctx.addIssue({
        code: "custom",
        path: ["porcentajeAlerta"],
        message: "La alerta debe llegar antes (o a la vez) que el bloqueo.",
      })
    }
  })

export type EntradaNivel = z.input<typeof esquemaNivel>

// ── Tributario ──────────────────────────────────────────────────────────────

export const esquemaParametrosAnio = z.object({
  nuevo: z.boolean(),
  anio: numero({
    min: 2020,
    max: 2100,
    decimales: 0,
    mensaje: "Escribe el año.",
  }),
  uvt: numero({ min: 1, max: 9_999_999_999, decimales: 2 }),
  smlmv: numero({ min: 1, max: 999_999_999_999, decimales: 2 }),
  umbralSegSocialSmlmv: numeroOpcional({ min: 0.01, max: 9999, decimales: 2 }),
  pendienteValidacion: z.boolean(),
  actualizadoAt: z.string().nullable(),
})

export type EntradaParametrosAnio = z.input<typeof esquemaParametrosAnio>

/**
 * `hasta` es el ÚLTIMO día incluido (la acción guarda el fin exclusivo, un día
 * después): una vigencia de un solo día, con `hasta` igual a `desde`, es válida.
 */
function vigenciaDias<T extends { desde: string; hasta: string | null }>(
  datos: T,
  ctx: z.RefinementCtx
) {
  if (datos.hasta !== null && datos.hasta < datos.desde) {
    ctx.addIssue({
      code: "custom",
      path: ["hasta"],
      message: "Debe ser igual o posterior al inicio.",
    })
  }
}

export const esquemaRetencion = z
  .object({
    id: id.nullable(),
    tipo: z.enum(TIPOS_RETENCION, { error: "Elige el tipo." }),
    concepto: z.enum(CONCEPTOS_RETENCION, { error: "Elige el concepto." }),
    aplicaDeclarante: z.boolean(),
    tarifa: porcentaje({ min: 0, max: 100, decimalesFraccion: 6 }),
    baseMinimaUvt: numero({ min: 0, max: 99_999_999, decimales: 2 }),
    desde: dia,
    hasta: diaOpcional,
    pendienteValidacion: z.boolean(),
    actualizadoAt: z.string().nullable(),
  })
  .superRefine(vigenciaDias)

export type EntradaRetencion = z.input<typeof esquemaRetencion>

export const esquemaReteica = z
  .object({
    id: id.nullable(),
    municipioCodigo: z.string().regex(PATRON_MUNICIPIO, "Elige el municipio."),
    tarifaPorMil: numero({ min: 0, max: 20, decimales: 4 }),
    baseMinimaUvt: numero({ min: 0, max: 99_999_999, decimales: 2 }),
    desde: dia,
    hasta: diaOpcional,
    pendienteValidacion: z.boolean(),
    actualizadoAt: z.string().nullable(),
  })
  .superRefine(vigenciaDias)

export type EntradaReteica = z.input<typeof esquemaReteica>

export const esquemaResolucion = z
  .object({
    id: id.nullable(),
    tipo: z.enum(TIPOS_DOCUMENTO_ELECTRONICO, { error: "Elige el documento." }),
    prefijo: z
      .string()
      .trim()
      .toUpperCase()
      .regex(PATRON_PREFIJO, "Hasta 4 letras o números, sin espacios."),
    numeroResolucion: textoRequerido(1, 40, "el número de resolución"),
    fechaResolucion: dia,
    rangoDesde: numero({ min: 1, max: 9_999_999_999, decimales: 0 }),
    rangoHasta: numero({ min: 1, max: 9_999_999_999, decimales: 0 }),
    vigenteDesde: dia,
    vigenteHasta: diaOpcional,
    activa: z.boolean(),
    actualizadoAt: z.string().nullable(),
  })
  .superRefine((datos, ctx) => {
    if (datos.rangoHasta < datos.rangoDesde) {
      ctx.addIssue({
        code: "custom",
        path: ["rangoHasta"],
        message: "Debe ser igual o mayor que el inicio del rango.",
      })
    }
    if (
      datos.vigenteHasta !== null &&
      datos.vigenteHasta < datos.vigenteDesde
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["vigenteHasta"],
        message: "Debe ser igual o posterior al inicio de la vigencia.",
      })
    }
  })

export type EntradaResolucion = z.input<typeof esquemaResolucion>

export const esquemaBuscarMunicipio = z.object({ q: z.string().trim().max(60) })

// ── Catálogos ───────────────────────────────────────────────────────────────

export const CATALOGOS = ["sectores", "categorias"] as const

export const esquemaElementoCatalogo = z.object({
  catalogo: z.enum(CATALOGOS),
  id: id.nullable(),
  nombre: textoRequerido(2, 80, "el nombre"),
  descripcion: textoOpcional(300),
  orden: numero({ min: 0, max: 32_767, decimales: 0 }),
  activo: z.boolean(),
  actualizadoAt: z.string().nullable(),
})

export type EntradaElementoCatalogo = z.input<typeof esquemaElementoCatalogo>

export const esquemaArchivarCatalogo = z.object({
  catalogo: z.enum(CATALOGOS),
  id,
  archivar: z.boolean(),
  actualizadoAt: marcaTiempo,
})

export const esquemaActivoDepartamento = z.object({
  codigo: z.string().regex(PATRON_DEPARTAMENTO, "Departamento inválido."),
  activo: z.boolean(),
})

export const esquemaActivoMunicipios = z.object({
  codigos: z
    .array(z.string().regex(PATRON_MUNICIPIO, "Municipio inválido."))
    .min(1, "Elige al menos un municipio.")
    .max(200, "Demasiados municipios a la vez."),
  activo: z.boolean(),
})

export const esquemaDepartamento = z.object({
  codigo: z.string().regex(PATRON_DEPARTAMENTO, "Departamento inválido."),
})

// ── Legal ───────────────────────────────────────────────────────────────────

export const LONGITUD_MAXIMA_TERMINOS = 200_000

export const esquemaVersionTerminos = z.object({
  id: id.nullable(),
  tipo: z.enum(TIPOS_TERMINOS, { error: "Elige el documento." }),
  version: z
    .string()
    .trim()
    .regex(PATRON_VERSION, "Usa letras, números, punto o guion (máx. 20)."),
  contenido: z
    .string()
    .trim()
    .min(1, "Escribe el contenido.")
    .max(
      LONGITUD_MAXIMA_TERMINOS,
      `Máximo ${LONGITUD_MAXIMA_TERMINOS.toLocaleString("es-CO")} caracteres.`
    ),
  actualizadoAt: z.string().nullable(),
})

export type EntradaVersionTerminos = z.input<typeof esquemaVersionTerminos>

export const TEXTO_CONFIRMAR_PUBLICACION = "PUBLICAR"

export const esquemaPublicarTerminos = z
  .object({
    id,
    inmediata: z.boolean(),
    dia: z.string(),
    hora: z.string(),
    confirmacion: z
      .string()
      .trim()
      .toUpperCase()
      .pipe(
        z.literal(TEXTO_CONFIRMAR_PUBLICACION, {
          error: `Escribe ${TEXTO_CONFIRMAR_PUBLICACION} para confirmar.`,
        })
      ),
    actualizadoAt: marcaTiempo,
  })
  .superRefine((datos, ctx) => {
    if (datos.inmediata) return
    const desde = instanteBogota(datos.dia, datos.hora || "00:00")
    if (!desde) {
      ctx.addIssue({ code: "custom", path: ["dia"], message: "Elige el día." })
    } else if (desde.getTime() <= Date.now()) {
      ctx.addIssue({
        code: "custom",
        path: ["hora"],
        message: "La vigencia debe empezar en el futuro.",
      })
    }
  })

export type EntradaPublicarTerminos = z.input<typeof esquemaPublicarTerminos>

// ── Plantillas ──────────────────────────────────────────────────────────────

export const esquemaPlantilla = z
  .object({
    clave: z.string().regex(PATRON_CLAVE_PLANTILLA, "Plantilla desconocida."),
    canal: z.enum(CANALES),
    nombre: textoRequerido(2, 120, "el nombre"),
    asunto: textoOpcional(200),
    cuerpo: z
      .string()
      .trim()
      .min(1, "Escribe el texto del aviso.")
      .max(5000, "Máximo 5.000 caracteres."),
    activa: z.boolean(),
    actualizadoAt: marcaTiempo,
  })
  .superRefine((datos, ctx) => {
    if (datos.canal === "EMAIL" && !datos.asunto) {
      ctx.addIssue({
        code: "custom",
        path: ["asunto"],
        message: "Un correo necesita asunto.",
      })
    }
  })

export type EntradaPlantilla = z.input<typeof esquemaPlantilla>

// ── Historial ───────────────────────────────────────────────────────────────

export const ENTIDADES_HISTORIAL = [
  "configuracion",
  "franjas",
  "formatos",
  "comisiones_excepcion",
  "niveles_verificacion",
  "parametros_tributarios",
  "retenciones_config",
  "reteica_municipal",
  "resoluciones_dian",
  "plantillas_notificacion",
  "terminos_versiones",
  "sectores",
  "categorias",
  "departamentos",
  "municipios",
] as const

export const esquemaHistorial = z.object({
  entidad: z.enum(ENTIDADES_HISTORIAL),
  entidadId: z.string().trim().min(1).max(120),
})

export type EntidadHistorial = (typeof ENTIDADES_HISTORIAL)[number]
