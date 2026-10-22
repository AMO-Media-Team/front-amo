/**
 * Esquemas zod de «Mi medio › Cuentas sociales»: los MISMOS en el formulario
 * (cliente, con `zodResolver`) y en las Server Actions. Reflejan los CHECK de
 * `cuentas_sociales` y `verificaciones_cuenta` para que el error llegue al
 * campo antes de ir a la BD, que vuelve a validarlo todo (RLS, triggers,
 * unicidad). Módulo puro.
 */
import { z } from "zod"

import { textoANumero } from "@/features/configuracion/numeros"
import { BUCKETS } from "@/lib/archivos/buckets"
import {
  esquemaArchivoSubido,
  esquemaDescripcionArchivo,
  type LimitesArchivo,
} from "@/lib/archivos/esquemas"
import type { ReglasArchivo } from "@/lib/archivos/validar"
import { Constants } from "@/types/database.types"

import { interpretarPerfil, type Plataforma } from "./perfil-red"

export const PLATAFORMAS_BD = Constants.public.Enums.plataforma

export const LIMITES_CUENTA = {
  /** Tarifa informativa en pesos (`numeric(14,2)`, > 0). */
  tarifaMax: 1_000_000_000,
  seguidoresMax: 1_000_000_000,
} as const

/** Capturas de pantalla: imágenes (se recomprimen a WebP en el navegador). */
export const MIMES_CAPTURA = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
] as const

export const LIMITES_CAPTURA: LimitesArchivo = {
  mimes: MIMES_CAPTURA,
  maxBytes: BUCKETS.documentos.maxBytes,
}

/** Lo que la zona de carga revisa antes de subir (y el motor tras comprimir). */
export const REGLAS_CAPTURA: ReglasArchivo = LIMITES_CAPTURA

const id = z.uuid({ error: "Identificador inválido." })

const plataforma = z
  .string({ error: "Elige la red social." })
  .min(1, { error: "Elige la red social.", abort: true })
  .pipe(z.enum(PLATAFORMAS_BD, { error: "Elige una red social de la lista." }))

const perfil = z.string({
  error: "Escribe el usuario de la cuenta o pega el enlace de tu perfil.",
})

// ── Cifras escritas en es-CO («45.000», «$ 250.000») ─────────────────────────

interface OpcionesEntero {
  vacio: string
  invalido: string
  min: { valor: number; mensaje: string }
  max: { valor: number; mensaje: string }
}

function entero(valor: string | number): number | null {
  return typeof valor === "number"
    ? Number.isFinite(valor)
      ? valor
      : null
    : textoANumero(valor)
}

function reglasEntero({ invalido, min, max }: OpcionesEntero) {
  return z
    .number()
    .int(invalido)
    .min(min.valor, min.mensaje)
    .max(max.valor, max.mensaje)
}

function enteroObligatorio(opciones: OpcionesEntero) {
  return z
    .union([z.string(), z.number()], { error: opciones.vacio })
    .transform((valor, ctx) => {
      if (typeof valor === "string" && !valor.trim()) {
        ctx.addIssue({ code: "custom", message: opciones.vacio })
        return z.NEVER
      }
      const n = entero(valor)
      if (n === null) {
        ctx.addIssue({ code: "custom", message: opciones.invalido })
        return z.NEVER
      }
      return n
    })
    .pipe(reglasEntero(opciones))
}

function enteroOpcional(opciones: OpcionesEntero) {
  return z
    .union([z.string(), z.number(), z.null()], { error: opciones.invalido })
    .transform((valor, ctx) => {
      if (valor === null || (typeof valor === "string" && !valor.trim())) {
        return null
      }
      const n = entero(valor)
      if (n === null) {
        ctx.addIssue({ code: "custom", message: opciones.invalido })
        return z.NEVER
      }
      return n
    })
    .pipe(reglasEntero(opciones).nullable())
}

const seguidores = enteroObligatorio({
  vacio: "Escribe cuántos seguidores tiene hoy la cuenta.",
  invalido: "Escribe solo el número de seguidores, por ejemplo 45.000.",
  min: { valor: 1, mensaje: "La cuenta debe tener al menos un seguidor." },
  max: {
    valor: LIMITES_CUENTA.seguidoresMax,
    mensaje: "Revisa la cifra: es demasiado alta.",
  },
})

const tarifa = enteroOpcional({
  vacio: "",
  invalido: "Escribe la tarifa en pesos, sin decimales; por ejemplo 250.000.",
  min: { valor: 1, mensaje: "La tarifa debe ser mayor que cero." },
  max: {
    valor: LIMITES_CUENTA.tarifaMax,
    mensaje: "Revisa la cifra: es demasiado alta.",
  },
})

// ── Alta y edición de cuentas ───────────────────────────────────────────────

/** Lo que se guarda: el perfil ya resuelto a usuario y URL canónica. */
export interface DatosCuenta {
  plataforma: Plataforma
  handle: string
  url: string
  tarifaReferencia: number | null
}

const camposCuenta = z.object({ plataforma, perfil, tarifa })

type CamposCuenta = z.output<typeof camposCuenta>

/** Resuelve el perfil a usuario y URL canónica; si no es válido, el error va al campo. */
function resolver(
  datos: CamposCuenta,
  ctx: z.RefinementCtx
): DatosCuenta | null {
  const resultado = interpretarPerfil(datos.plataforma, datos.perfil)
  if (!resultado.ok) {
    ctx.addIssue({ code: "custom", path: ["perfil"], message: resultado.mensaje })
    return null
  }
  return {
    plataforma: datos.plataforma,
    handle: resultado.handle,
    url: resultado.url,
    tarifaReferencia: datos.tarifa,
  }
}

export const esquemaRegistrarCuenta = camposCuenta.transform(
  (datos, ctx) => resolver(datos, ctx) ?? z.NEVER
)

/**
 * Edición: la plataforma no cambia (la BD no lo permite); viaja para resolver
 * el perfil y el servidor la compara con la guardada.
 */
export const esquemaEditarCuenta = camposCuenta
  .extend({
    cuentaId: id,
    actualizadaAt: z.string().min(1, "Falta la versión del registro.").max(64),
  })
  .transform((datos, ctx) => {
    const cuenta = resolver(datos, ctx)
    if (!cuenta) return z.NEVER
    return {
      ...cuenta,
      cuentaId: datos.cuentaId,
      actualizadaAt: datos.actualizadaAt,
    }
  })

export type EntradaCuenta = z.input<typeof esquemaRegistrarCuenta>
export type EntradaEditarCuenta = z.input<typeof esquemaEditarCuenta>
export type DatosEditarCuenta = z.output<typeof esquemaEditarCuenta>

export const VALORES_CUENTA: EntradaCuenta = {
  plataforma: "",
  perfil: "",
  tarifa: "",
}

export const CAMPOS_CUENTA = ["plataforma", "perfil", "tarifa"] as const

export const esquemaCuentaId = z.object({ cuentaId: id })
export type EntradaCuentaId = z.input<typeof esquemaCuentaId>

// ── Verificación ────────────────────────────────────────────────────────────

export const esquemaPrepararCaptura = z.object({
  cuentaId: id,
  descripcion: esquemaDescripcionArchivo(LIMITES_CAPTURA),
})
export type EntradaPrepararCaptura = z.input<typeof esquemaPrepararCaptura>

const captura = esquemaArchivoSubido(LIMITES_CAPTURA)

export const esquemaSeguidores = z.object({ seguidores })
export type EntradaSeguidores = z.input<typeof esquemaSeguidores>
export const CAMPOS_SEGUIDORES = ["seguidores"] as const

/** Pedir (o renovar) el código de la historia: se declaran los seguidores de hoy. */
export const esquemaGenerarCodigo = esquemaSeguidores.extend({ cuentaId: id })
export type EntradaGenerarCodigo = z.input<typeof esquemaGenerarCodigo>

/** Verificación por captura del panel: seguidores y la captura ya subida. */
export const esquemaVerificacionManual = esquemaSeguidores.extend({
  cuentaId: id,
  captura,
})
export type EntradaVerificacionManual = z.input<
  typeof esquemaVerificacionManual
>

/** Captura de la historia con el código, para la verificación que lo generó. */
export const esquemaCapturaCodigo = z.object({
  verificacionId: id,
  captura,
})
export type EntradaCapturaCodigo = z.input<typeof esquemaCapturaCodigo>

export const esquemaVerificacionId = z.object({ verificacionId: id })
export type EntradaVerificacionId = z.input<typeof esquemaVerificacionId>
