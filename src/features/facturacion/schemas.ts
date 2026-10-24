/**
 * Entradas de la facturación al anunciante (módulo puro): los MISMOS esquemas
 * en los formularios (cliente) y en las Server Actions. Las cifras se escriben
 * como en Colombia («4.000.000», «1.250.000,50»); los límites son los de la BD
 * (`notas_credito_numero_chk`, `pagos_anunciante_referencia_chk`, CUFE y CUDE
 * de 96 hexadecimales), que lo vuelve a validar todo. Los formularios usan los
 * `campos*` sin la ruta del archivo (se sube aparte) y con los límites de la
 * factura que se ve (`conLimites*`).
 */
import { z } from "zod"

import {
  cantidadDecimales,
  textoANumero,
} from "@/features/configuracion/numeros"
import {
  LONGITUD_MAXIMA_MOTIVO,
  LONGITUD_MINIMA_MOTIVO,
} from "@/features/usuarios/schemas"
import { BUCKETS } from "@/lib/archivos/buckets"
import {
  esquemaArchivoSubido,
  esquemaDescripcionArchivo,
  type LimitesArchivo,
} from "@/lib/archivos/esquemas"
import { parsearFecha, serializarFecha } from "@/lib/fechas"
import { formatearCOP } from "@/lib/format"

import {
  enCentavos,
  normalizarCodigoDian,
  PATRON_CODIGO_DIAN,
} from "./presentacion"
import { MEDIOS_PAGO } from "./tipos"

/** `numeric(14,2)`. */
export const VALOR_MAXIMO = 999_999_999_999.99
export const CONSECUTIVO_MAXIMO = 9_999_999_999
export const LARGO_REFERENCIA = 120
export const LONGITUD_MINIMA_MOTIVO_NOTA = 10
export const LONGITUD_MAXIMA_MOTIVO_NOTA = 1000
const LARGO_MAXIMO_RUTA = 1024

const id = z.uuid({ error: "Identificador inválido." })

/** Hoy en Bogotá (`YYYY-MM-DD`): ninguna fecha de factura, pago o nota es futura. */
export function hoyEnBogota(ahora: Date = new Date()): string {
  return serializarFecha(ahora)
}

function dia(vacio: string) {
  return z
    .string({ error: vacio })
    .trim()
    .min(1, vacio)
    .refine(
      (valor) => parsearFecha(valor) !== null,
      "Escribe una fecha válida."
    )
}

function diaHastaHoy(vacio: string, futuro: string) {
  return dia(vacio).refine((valor) => valor <= hoyEnBogota(), futuro)
}

// ── Cifras ───────────────────────────────────────────────────────────────────

interface OpcionesDinero {
  vacio: string
  invalido: string
  /** `true`: debe ser mayor que cero; `false`: cero o más. */
  positivo: boolean
  mensajeMinimo: string
}

function leerPesos(valor: string | number): number | null {
  const n = typeof valor === "number" ? valor : textoANumero(valor)
  return n !== null && Number.isFinite(n) && cantidadDecimales(n) <= 2
    ? n
    : null
}

function reglasPesos({ positivo, mensajeMinimo }: OpcionesDinero) {
  const base = positivo
    ? z.number().positive(mensajeMinimo)
    : z.number().min(0, mensajeMinimo)
  return base.max(VALOR_MAXIMO, "Revisa la cifra: es demasiado alta.")
}

/** Pesos obligatorios, con hasta dos decimales. */
function pesos(opciones: OpcionesDinero) {
  return z
    .union([z.string(), z.number()], { error: opciones.vacio })
    .transform((valor, ctx) => {
      if (typeof valor === "string" && !valor.trim()) {
        ctx.addIssue({ code: "custom", message: opciones.vacio })
        return z.NEVER
      }
      const n = leerPesos(valor)
      if (n === null) {
        ctx.addIssue({ code: "custom", message: opciones.invalido })
        return z.NEVER
      }
      return n
    })
    .pipe(reglasPesos(opciones))
}

/** Pesos opcionales: vacío es cero. */
function pesosOpcionales(opciones: Omit<OpcionesDinero, "vacio">) {
  return z
    .union([z.string(), z.number(), z.null(), z.undefined()], {
      error: opciones.invalido,
    })
    .transform((valor, ctx) => {
      if (
        valor === null ||
        valor === undefined ||
        (typeof valor === "string" && !valor.trim())
      ) {
        return 0
      }
      const n = leerPesos(valor)
      if (n === null) {
        ctx.addIssue({ code: "custom", message: opciones.invalido })
        return z.NEVER
      }
      return n
    })
    .pipe(reglasPesos({ ...opciones, vacio: "" }))
}

function codigoDian(vacio: string, invalido: string) {
  return z
    .string({ error: vacio })
    .transform(normalizarCodigoDian)
    .pipe(z.string().min(1, vacio).regex(PATRON_CODIGO_DIAN, invalido))
}

function rutaArchivo(vacio: string) {
  return z.string({ error: vacio }).min(1, vacio).max(LARGO_MAXIMO_RUTA, vacio)
}

// ── Lo por facturar y el borrador ───────────────────────────────────────────

export const esquemaConsultaPendientes = z.object({
  hasta: diaHastaHoy(
    "Indica la fecha de corte.",
    "La fecha de corte no puede ser futura."
  ).nullable(),
})

export type EntradaConsultaPendientes = z.input<
  typeof esquemaConsultaPendientes
>

export const esquemaGenerarFactura = z
  .object({
    anuncianteId: z.uuid({ error: "Elige el anunciante." }),
    /** `null`: consolidada (todas sus campañas). */
    campanaId: z.uuid({ error: "Elige la campaña." }).nullable(),
    desde: dia("Indica desde qué fecha."),
    hasta: diaHastaHoy(
      "Indica hasta qué fecha facturar.",
      "La fecha de corte no puede ser futura: lo de hoy se factura desde mañana o con corte de hoy."
    ),
  })
  .refine((datos) => datos.desde <= datos.hasta, {
    path: ["desde"],
    message: "«Desde» no puede ser posterior a «Hasta».",
  })

export type EntradaGenerarFactura = z.input<typeof esquemaGenerarFactura>

export const esquemaAnularBorrador = z.object({
  facturaId: id,
  motivo: z
    .string({ error: "Indica el motivo." })
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

export type EntradaAnularBorrador = z.input<typeof esquemaAnularBorrador>

export const esquemaFactura = z.object({ facturaId: id })
export type EntradaFactura = z.input<typeof esquemaFactura>

// ── Factura expedida ─────────────────────────────────────────────────────────

const consecutivo = z
  .union([z.string(), z.number()], {
    error: "Escribe el número de la factura.",
  })
  .transform((valor, ctx) => {
    const texto = typeof valor === "number" ? String(valor) : valor.trim()
    if (!texto) {
      ctx.addIssue({
        code: "custom",
        message: "Escribe el número de la factura.",
      })
      return z.NEVER
    }
    const n = /^\d+$/.test(texto) ? Number(texto) : textoANumero(texto)
    if (n === null || !Number.isInteger(n)) {
      ctx.addIssue({
        code: "custom",
        message: "Escribe solo el número, sin el prefijo; por ejemplo 1234.",
      })
      return z.NEVER
    }
    return n
  })
  .pipe(
    z
      .number()
      .min(1, "El número debe ser mayor que cero.")
      .max(CONSECUTIVO_MAXIMO, "Revisa el número: es demasiado largo.")
  )

export const camposFacturaExpedida = z.object({
  facturaId: id,
  prefijo: z
    .string({ error: "Escribe el prefijo." })
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z0-9]{0,4}$/,
      "El prefijo tiene hasta 4 letras o números, sin espacios."
    ),
  consecutivo,
  fechaEmision: diaHastaHoy(
    "Indica la fecha de emisión.",
    "La fecha de emisión no puede ser futura."
  ),
  /** Vacío: la BD usa los días de vencimiento configurados. */
  fechaVencimiento: z
    .string()
    .trim()
    .refine(
      (valor) => valor === "" || parsearFecha(valor) !== null,
      "Escribe una fecha válida."
    )
    .transform((valor) => valor || null),
  cufe: codigoDian(
    "Pega el CUFE de la factura.",
    "El CUFE son 96 caracteres (números y letras de la a a la f), como lo muestra el software de facturación."
  ),
  total: pesos({
    vacio: "Escribe el total de la factura expedida.",
    invalido:
      "Escribe el total en pesos; por ejemplo 4.760.000 o 4.760.000,50.",
    positivo: true,
    mensajeMinimo: "El total debe ser mayor que cero.",
  }),
})

function reglasFacturaExpedida<
  T extends z.ZodType<{
    fechaEmision: string
    fechaVencimiento: string | null
  }>,
>(esquema: T) {
  return esquema.refine(
    (datos) =>
      !datos.fechaVencimiento || datos.fechaVencimiento >= datos.fechaEmision,
    {
      path: ["fechaVencimiento"],
      message: "El vencimiento no puede ser anterior a la emisión.",
    }
  )
}

export const esquemaFacturaExpedida = reglasFacturaExpedida(
  camposFacturaExpedida.extend({
    archivoPath: rutaArchivo("Carga el PDF de la factura expedida."),
  })
)

export type EntradaFacturaExpedida = z.input<typeof esquemaFacturaExpedida>

/** Formulario: sin la ruta del PDF y con el total del borrador a la vista. */
export function esquemaFormularioExpedida(totalBorrador: number) {
  return reglasFacturaExpedida(camposFacturaExpedida).refine(
    (datos) => enCentavos(datos.total) === enCentavos(totalBorrador),
    {
      path: ["total"],
      message: `No coincide con el total del borrador (${formatearCOP(totalBorrador)}): revisa que sea la factura correcta.`,
    }
  )
}

export type ValoresFormularioExpedida = z.input<typeof camposFacturaExpedida>

// ── Pagos del anunciante ────────────────────────────────────────────────────

export const camposPago = z.object({
  facturaId: id,
  fecha: diaHastaHoy(
    "Indica la fecha del pago.",
    "La fecha del pago no puede ser futura."
  ),
  monto: pesos({
    vacio: "Escribe el valor que llegó a la cuenta de AMO.",
    invalido: "Escribe el valor en pesos; por ejemplo 4.000.000.",
    positivo: false,
    mensajeMinimo: "El valor no puede ser negativo.",
  }),
  retenciones: pesosOpcionales({
    invalido: "Escribe las retenciones en pesos; por ejemplo 160.000.",
    positivo: false,
    mensajeMinimo: "Las retenciones no pueden ser negativas.",
  }),
  medioPago: z.enum(MEDIOS_PAGO, { error: "Elige cómo pagó el anunciante." }),
  referencia: z
    .string()
    .trim()
    .max(LARGO_REFERENCIA, `Máximo ${LARGO_REFERENCIA} caracteres.`)
    .transform((valor) => valor || null),
})

function reglasPago<
  T extends z.ZodType<{ monto: number; retenciones: number }>,
>(esquema: T) {
  return esquema.refine((datos) => datos.monto + datos.retenciones > 0, {
    path: ["monto"],
    message: "El pago más las retenciones debe ser mayor que cero.",
  })
}

export const esquemaRegistrarPago = reglasPago(
  camposPago.extend({
    soportePath: rutaArchivo("Carga el soporte del pago."),
  })
)

export type EntradaRegistrarPago = z.input<typeof esquemaRegistrarPago>
export type ValoresFormularioPago = z.input<typeof camposPago>

/** Formulario: sin el soporte y con el saldo y la emisión de la factura. */
export function esquemaFormularioPago({
  saldo,
  fechaEmision,
}: {
  saldo: number
  fechaEmision: string
}) {
  return reglasPago(camposPago)
    .refine(
      (datos) =>
        enCentavos(datos.monto) + enCentavos(datos.retenciones) <=
        enCentavos(saldo),
      {
        path: ["monto"],
        message: `El pago más las retenciones no puede superar el saldo (${formatearCOP(saldo)}).`,
      }
    )
    .refine((datos) => datos.fecha >= fechaEmision, {
      path: ["fecha"],
      message:
        "La fecha del pago no puede ser anterior a la emisión de la factura.",
    })
}

// ── Notas crédito ────────────────────────────────────────────────────────────

export const camposNotaCredito = z.object({
  facturaId: id,
  numero: z
    .string({ error: "Escribe el número de la nota crédito." })
    .trim()
    .toUpperCase()
    .min(1, "Escribe el número de la nota crédito.")
    .regex(
      /^[A-Z0-9][A-Z0-9 -]{0,39}$/,
      "Usa letras, números, espacios o guiones (hasta 40), como en el software de facturación."
    ),
  cude: codigoDian(
    "Pega el CUDE de la nota crédito.",
    "El CUDE son 96 caracteres (números y letras de la a a la f), como lo muestra el software de facturación."
  ),
  fechaEmision: diaHastaHoy(
    "Indica la fecha de la nota crédito.",
    "La fecha de la nota crédito no puede ser futura."
  ),
  valor: pesos({
    vacio: "Escribe el valor de la nota crédito.",
    invalido: "Escribe el valor en pesos; por ejemplo 1.190.000.",
    positivo: true,
    mensajeMinimo: "El valor debe ser mayor que cero.",
  }),
  motivo: z
    .string({ error: "Cuenta el motivo de la nota crédito." })
    .trim()
    .min(
      LONGITUD_MINIMA_MOTIVO_NOTA,
      `Cuenta el motivo (al menos ${LONGITUD_MINIMA_MOTIVO_NOTA} caracteres).`
    )
    .max(
      LONGITUD_MAXIMA_MOTIVO_NOTA,
      `Máximo ${LONGITUD_MAXIMA_MOTIVO_NOTA.toLocaleString("es-CO")} caracteres.`
    ),
  /** Asignaciones que la nota saca de la factura (quedan libres para facturar). */
  asignacionIds: z.array(id).max(1000).default([]),
})

export const esquemaRegistrarNotaCredito = camposNotaCredito.extend({
  archivoPath: rutaArchivo("Carga el PDF de la nota crédito."),
})

export type EntradaRegistrarNotaCredito = z.input<
  typeof esquemaRegistrarNotaCredito
>
export type ValoresFormularioNota = z.input<typeof camposNotaCredito>

/** Formulario: sin el PDF y con el saldo y la emisión de la factura. */
export function esquemaFormularioNota({
  saldo,
  fechaEmision,
}: {
  saldo: number
  fechaEmision: string
}) {
  return camposNotaCredito
    .refine((datos) => enCentavos(datos.valor) <= enCentavos(saldo), {
      path: ["valor"],
      message: `La nota crédito no puede superar el saldo (${formatearCOP(saldo)}).`,
    })
    .refine((datos) => datos.fechaEmision >= fechaEmision, {
      path: ["fechaEmision"],
      message:
        "La nota crédito no puede ser anterior a la emisión de la factura.",
    })
}

// ── Archivos (PDF de la factura y de la nota; soporte del pago) ─────────────

export const DESTINOS_ARCHIVO = ["factura", "pago"] as const
export type DestinoArchivo = (typeof DESTINOS_ARCHIVO)[number]

/** `soportes/factura/{id}/` solo PDF; `soportes/pago/{id}/` PDF o foto. */
export const LIMITES_ARCHIVO: Readonly<Record<DestinoArchivo, LimitesArchivo>> =
  {
    factura: {
      mimes: ["application/pdf"],
      maxBytes: BUCKETS.soportes.maxBytes,
    },
    pago: {
      mimes: ["application/pdf", "image/jpeg", "image/png"],
      maxBytes: BUCKETS.soportes.maxBytes,
    },
  }

export const esquemaPrepararArchivo = z.discriminatedUnion("destino", [
  z.object({
    facturaId: id,
    destino: z.literal("factura"),
    descripcion: esquemaDescripcionArchivo(LIMITES_ARCHIVO.factura),
  }),
  z.object({
    facturaId: id,
    destino: z.literal("pago"),
    descripcion: esquemaDescripcionArchivo(LIMITES_ARCHIVO.pago),
  }),
])

export type EntradaPrepararArchivo = z.input<typeof esquemaPrepararArchivo>

export const esquemaConfirmarArchivo = z.discriminatedUnion("destino", [
  z.object({
    facturaId: id,
    destino: z.literal("factura"),
    archivo: esquemaArchivoSubido(LIMITES_ARCHIVO.factura),
  }),
  z.object({
    facturaId: id,
    destino: z.literal("pago"),
    archivo: esquemaArchivoSubido(LIMITES_ARCHIVO.pago),
  }),
])

export type EntradaConfirmarArchivo = z.input<typeof esquemaConfirmarArchivo>

export const esquemaFirmarArchivo = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("factura"),
    facturaId: id,
    descargar: z.boolean().default(true),
  }),
  z.object({
    tipo: z.literal("pago"),
    facturaId: id,
    pagoId: id,
    descargar: z.boolean().default(true),
  }),
  z.object({
    tipo: z.literal("nota"),
    facturaId: id,
    notaId: id,
    descargar: z.boolean().default(true),
  }),
])

export type EntradaFirmarArchivo = z.input<typeof esquemaFirmarArchivo>

/** Exportación del listado (CSV o Excel): queda `EXPORTAR` en la bitácora. */
export const esquemaExportacionFacturas = z.object({
  formato: z.enum(["csv", "xlsx"]),
  filas: z.number().int().min(0).max(1_000_000),
})

export type EntradaExportacionFacturas = z.input<
  typeof esquemaExportacionFacturas
>
