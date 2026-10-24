/**
 * Supresión de datos del titular (CTA-007), módulo puro: lee lo que devuelve
 * `suprimir_titular_srv` y planea el borrado en Storage, que el servidor hace
 * DESPUÉS del commit con el cliente de servicio. Por eso cada carpeta o
 * archivo se acepta solo si es de las formas que la BD produce: el avatar del
 * perfil y la carpeta o un documento del medio. Nada más se borra.
 */
import { z } from "zod"

import type { ArchivoSupresion, ResultadoSupresion } from "./tipos"

const esquemaArchivo = z.union([
  z.object({ bucket: z.string(), prefijo: z.string() }),
  z.object({ bucket: z.string(), ruta: z.string() }),
])

const esquemaResultado = z.object({
  solicitud: z.number().int(),
  bloqueos: z.array(z.string()).default([]),
  cuenta: z.literal("BORRAR"),
  medio: z.enum(["BORRAR", "ANONIMIZAR", "CONSERVAR", "NINGUNA"]),
  contacto_empresa: z.enum(["BORRAR", "NINGUNO"]),
  archivos: z.array(esquemaArchivo).default([]),
  se_conserva: z.array(z.string()).default([]),
  simulacion: z.boolean().optional(),
})

/** El JSON de `suprimir_titular_srv` (o `supresion_resultado`); `null` si no tiene esa forma. */
export function leerResultadoSupresion(
  valor: unknown
): ResultadoSupresion | null {
  const lectura = esquemaResultado.safeParse(valor)
  if (!lectura.success) return null
  const datos = lectura.data
  return {
    solicitud: datos.solicitud,
    bloqueos: datos.bloqueos,
    cuenta: datos.cuenta,
    medio: datos.medio,
    contactoEmpresa: datos.contacto_empresa,
    archivos: datos.archivos,
    seConserva: datos.se_conserva,
    simulacion: datos.simulacion === true,
  }
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
const SEGMENTO = "[A-Za-z0-9_.-]+"

/** Lo único que la supresión borra en Storage (`suprimir_titular_srv`). */
const PERMITIDOS: readonly {
  bucket: string
  prefijo?: RegExp
  ruta?: RegExp
}[] = [
  { bucket: "avatares", prefijo: new RegExp(`^perfil/${UUID}/$`) },
  { bucket: "documentos", prefijo: new RegExp(`^medio/${UUID}/$`) },
  {
    bucket: "documentos",
    ruta: new RegExp(`^medio/${UUID}/(?:${SEGMENTO}/)*${SEGMENTO}$`),
  },
]

function sinTrampas(valor: string): boolean {
  return (
    !valor.includes("..") && !valor.includes("//") && !valor.startsWith("/")
  )
}

/** ¿La BD pidió borrar algo con una forma conocida? (si no, no se toca). */
export function archivoPermitido(archivo: ArchivoSupresion): boolean {
  if ("prefijo" in archivo) {
    return (
      sinTrampas(archivo.prefijo) &&
      PERMITIDOS.some(
        (permitido) =>
          permitido.bucket === archivo.bucket &&
          permitido.prefijo?.test(archivo.prefijo)
      )
    )
  }
  return (
    sinTrampas(archivo.ruta) &&
    PERMITIDOS.some(
      (permitido) =>
        permitido.bucket === archivo.bucket &&
        permitido.ruta?.test(archivo.ruta)
    )
  )
}

export interface PlanBorrado {
  /** Carpetas a listar (y borrar completas), por bucket. */
  prefijos: { bucket: string; prefijo: string }[]
  /** Archivos sueltos, por bucket. */
  rutas: Map<string, string[]>
  /** Lo que la BD pidió con una forma desconocida: no se borra. */
  rechazados: number
}

export function planBorrado(
  archivos: readonly ArchivoSupresion[]
): PlanBorrado {
  const prefijos: { bucket: string; prefijo: string }[] = []
  const rutas = new Map<string, string[]>()
  let rechazados = 0
  for (const archivo of archivos) {
    if (!archivoPermitido(archivo)) {
      rechazados += 1
      continue
    }
    if ("prefijo" in archivo) {
      if (
        !prefijos.some(
          (p) => p.bucket === archivo.bucket && p.prefijo === archivo.prefijo
        )
      ) {
        prefijos.push({ bucket: archivo.bucket, prefijo: archivo.prefijo })
      }
    } else {
      const lista = rutas.get(archivo.bucket) ?? []
      if (!lista.includes(archivo.ruta)) lista.push(archivo.ruta)
      rutas.set(archivo.bucket, lista)
    }
  }
  return { prefijos, rutas, rechazados }
}

/** Lotes para `storage.remove` (Storage admite hasta 1.000; se usan 100). */
export function enLotes<T>(elementos: readonly T[], tamano = 100): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < elementos.length; i += tamano) {
    lotes.push(elementos.slice(i, i + tamano))
  }
  return lotes
}
