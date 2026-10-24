/**
 * Preferencias de la cuenta guardadas en `perfiles.preferencias` (jsonb, < 8 KB):
 * las de interfaz (se aplican en caliente) y las categorías de avisos que la
 * persona no quiere recibir por correo (`correo.silenciadas`, que lee
 * `private.correo_silenciado` al encolar). Viajan con la cuenta (otro
 * navegador, otro equipo). El JSON puede traer claves de otros módulos o de
 * versiones anteriores: se conservan al escribir y lo que no se reconoce se
 * ignora al leer.
 * Módulo puro: lo usan el servidor, el proveedor de cliente y los tests.
 */
import { z } from "zod"

import {
  CLAVES_CATEGORIA,
  type ClaveCategoria,
  categoriaDe,
} from "@/features/notificaciones/presentacion"
import type { TipoRol } from "@/lib/auth/permisos"
import type { Json } from "@/types/database.types"

export const TEMAS = ["dark", "light", "system"] as const
/** Las mismas densidades que ofrece la tabla de datos (`components/data-table`). */
export const DENSIDADES = ["compacta", "normal", "comoda"] as const
/** `sistema` sigue `prefers-reduced-motion`; `reducido` lo impone en la app. */
export const MOVIMIENTOS = ["sistema", "reducido"] as const
/** Separadores de miles y decimales: `1.234.567,89` o `1,234,567.89`. */
export const FORMATOS_NUMERO = ["colombia", "internacional"] as const

/**
 * Avisos de la cuenta y respuestas con plazo legal: siempre llegan por correo
 * (la base tampoco deja silenciarlos).
 */
export const CATEGORIAS_CORREO_OBLIGATORIAS = [
  "seguridad",
  "privacidad",
] as const satisfies readonly ClaveCategoria[]

export type CategoriaSilenciable = Exclude<
  ClaveCategoria,
  (typeof CATEGORIAS_CORREO_OBLIGATORIAS)[number]
>

/** Las que se pueden silenciar, en el orden de `CLAVES_CATEGORIA`. */
export const CATEGORIAS_SILENCIABLES = CLAVES_CATEGORIA.filter(
  (clave): clave is CategoriaSilenciable =>
    !(CATEGORIAS_CORREO_OBLIGATORIAS as readonly string[]).includes(clave)
)

/**
 * Categorías de avisos que recibe cada tipo de rol (las que se muestran en
 * «Avisos por correo»). El equipo AMO recibe las colas de trabajo; el medio y
 * el anunciante, los avisos de su operación.
 */
export const CATEGORIAS_CORREO_POR_TIPO: Readonly<
  Record<TipoRol, readonly ClaveCategoria[]>
> = {
  ADMIN: ["pendientes", "seguridad", "privacidad"],
  ANUNCIANTE: [
    "ofertas",
    "asignaciones",
    "pagos",
    "verificacion",
    "disputas",
    "seguridad",
    "privacidad",
  ],
  MEDIO: [
    "ofertas",
    "asignaciones",
    "ejecucion",
    "pagos",
    "verificacion",
    "cuentas",
    "disputas",
    "seguridad",
    "privacidad",
  ],
}

/**
 * Categorías que hoy sí salen por correo: las que tienen al menos una
 * plantilla EMAIL activa (`clavesCorreoActivas`), en el orden del catálogo.
 * `null` si no se supo (la interfaz no deshabilita nada).
 */
export function categoriasConCorreo(
  claves: readonly string[] | null
): ClaveCategoria[] | null {
  if (!claves) return null
  const presentes = new Set(claves.map(categoriaDe))
  return CLAVES_CATEGORIA.filter((clave) => presentes.has(clave))
}

export function esSilenciable(
  clave: ClaveCategoria
): clave is CategoriaSilenciable {
  return (CATEGORIAS_SILENCIABLES as readonly string[]).includes(clave)
}

export type TemaPreferido = (typeof TEMAS)[number]
export type DensidadPreferida = (typeof DENSIDADES)[number]
export type MovimientoPreferido = (typeof MOVIMIENTOS)[number]
export type FormatoNumeros = (typeof FORMATOS_NUMERO)[number]

export interface PreferenciasInterfaz {
  tema: TemaPreferido
  densidad: DensidadPreferida
  movimiento: MovimientoPreferido
  formatoNumeros: FormatoNumeros
  /** Categorías que la persona no quiere recibir por correo. */
  correoSilenciadas: readonly CategoriaSilenciable[]
}

export const PREFERENCIAS_POR_DEFECTO: PreferenciasInterfaz = {
  tema: "dark",
  densidad: "normal",
  movimiento: "sistema",
  formatoNumeros: "colombia",
  correoSilenciadas: [],
}

/** Cambios que envía la interfaz: al menos una preferencia válida. */
export const esquemaCambiosPreferencias = z
  .object({
    tema: z.enum(TEMAS),
    densidad: z.enum(DENSIDADES),
    movimiento: z.enum(MOVIMIENTOS),
    formatoNumeros: z.enum(FORMATOS_NUMERO),
    correoSilenciadas: z
      .array(z.enum(CATEGORIAS_SILENCIABLES))
      .max(CATEGORIAS_SILENCIABLES.length),
  })
  .partial()
  .strict()
  .refine((cambios) => Object.keys(cambios).length > 0, {
    message: "No hay cambios que guardar.",
  })

export type CambiosPreferencias = z.infer<typeof esquemaCambiosPreferencias>

function esObjeto(valor: unknown): valor is Record<string, Json | undefined> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
}

function valorDe<T extends string>(
  lista: readonly T[],
  valor: unknown,
  porDefecto: T
): T {
  return (lista as readonly unknown[]).includes(valor)
    ? (valor as T)
    : porDefecto
}

/** Sin repetidas, solo silenciables y en el orden del catálogo. */
export function normalizarSilenciadas(valor: unknown): CategoriaSilenciable[] {
  if (!Array.isArray(valor)) return []
  return CATEGORIAS_SILENCIABLES.filter((clave) => valor.includes(clave))
}

/** Preferencias efectivas a partir del JSON guardado (tolera basura y claves ajenas). */
export function leerPreferencias(guardado: unknown): PreferenciasInterfaz {
  if (!esObjeto(guardado)) return PREFERENCIAS_POR_DEFECTO
  const base = PREFERENCIAS_POR_DEFECTO
  return {
    tema: valorDe(TEMAS, guardado.tema, base.tema),
    densidad: valorDe(DENSIDADES, guardado.densidad, base.densidad),
    movimiento: valorDe(MOVIMIENTOS, guardado.movimiento, base.movimiento),
    formatoNumeros: valorDe(
      FORMATOS_NUMERO,
      guardado.formatoNumeros,
      base.formatoNumeros
    ),
    correoSilenciadas: normalizarSilenciadas(
      esObjeto(guardado.correo) ? guardado.correo.silenciadas : undefined
    ),
  }
}

/**
 * JSON a guardar: lo anterior (incluidas claves de otros módulos) + los
 * cambios. Las categorías silenciadas van en `correo.silenciadas`, el lugar
 * que lee la base al encolar un correo.
 */
export function fusionarPreferencias(
  guardado: unknown,
  cambios: CambiosPreferencias
): Record<string, Json | undefined> {
  const previo = esObjeto(guardado) ? guardado : {}
  const { correoSilenciadas, ...interfaz } = cambios
  const nuevas: Record<string, Json | undefined> = { ...previo, ...interfaz }
  if (correoSilenciadas !== undefined) {
    nuevas.correo = {
      ...(esObjeto(previo.correo) ? previo.correo : {}),
      silenciadas: normalizarSilenciadas(correoSilenciadas),
    }
  }
  return nuevas
}
