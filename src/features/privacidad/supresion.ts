/**
 * Supresión de datos del titular (CTA-007), módulo puro: lee lo que devuelve
 * `suprimir_titular_srv` (o lo que guarda `supresion_resultado`), planea el
 * borrado en Storage y lo ejecuta contra un almacén inyectado. El servidor
 * borra DESPUÉS del commit con el cliente de servicio; por eso cada carpeta o
 * archivo se acepta solo si es de las formas que la BD produce y del titular
 * de ESTA solicitud:
 *
 * - el avatar de su perfil (`avatares perfil/{perfil}/`);
 * - la carpeta completa de su medio (`documentos medio/{medio}/`) y su logo
 *   (`avatares medio/{medio}/`), SOLO cuando la BD decidió borrar el medio
 *   (`medio = BORRAR`);
 * - con el medio anonimizado, solo la prueba de vida y las certificaciones de
 *   pago (`documentos medio/{medio}/{PRUEBA_VIDA|CERT_BANCARIA|CERT_BILLETERA}/…`).
 *
 * Nada más se borra. Lo que Storage no logra borrar queda como pendiente
 * (`archivos_pendientes`) para «Reintentar el borrado de archivos».
 */
import { z } from "zod"

import type { AccionMedio, ArchivoSupresion, ResultadoSupresion } from "./tipos"

const esquemaArchivo = z.union([
  z.object({ bucket: z.string(), prefijo: z.string() }),
  z.object({ bucket: z.string(), ruta: z.string() }),
])

/** Normaliza a `{bucket, prefijo}` o `{bucket, ruta}` (zod deja pasar claves de más en el otro caso). */
function archivoDe(valor: z.output<typeof esquemaArchivo>): ArchivoSupresion {
  return "prefijo" in valor
    ? { bucket: valor.bucket, prefijo: valor.prefijo }
    : { bucket: valor.bucket, ruta: valor.ruta }
}

const esquemaResultado = z.object({
  solicitud: z.number().int(),
  bloqueos: z.array(z.string()).default([]),
  cuenta: z.literal("BORRAR"),
  medio: z.enum(["BORRAR", "ANONIMIZAR", "CONSERVAR", "NINGUNA"]),
  contacto_empresa: z.enum(["BORRAR", "NINGUNO"]),
  medio_id: z.uuid().nullish().catch(null),
  solicitudes_vinculacion: z.number().int().nonnegative().default(0),
  archivos: z.array(esquemaArchivo).default([]),
  // Solo en el resultado guardado tras ejecutar; un valor ilegible se trata
  // como «sin registro» en lugar de ocultar todo el resultado.
  archivos_pendientes: z.array(esquemaArchivo).nullish().catch(null),
  archivos_revisados_at: z.string().nullish().catch(null),
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
    medioId: datos.medio_id ?? null,
    contactoEmpresa: datos.contacto_empresa,
    solicitudesVinculacion: datos.solicitudes_vinculacion,
    archivos: datos.archivos.map(archivoDe),
    archivosPendientes: datos.archivos_pendientes
      ? datos.archivos_pendientes.map(archivoDe)
      : null,
    archivosRevisadosAt: datos.archivos_revisados_at ?? null,
    seConserva: datos.se_conserva,
    simulacion: datos.simulacion === true,
  }
}

// ── Qué se puede borrar ──────────────────────────────────────────────────────

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
const SEGMENTO = "[A-Za-z0-9_.-]+"

/** Documentos que la anonimización del medio borra (el resto se conserva). */
export const DOCUMENTOS_ANONIMIZACION = [
  "PRUEBA_VIDA",
  "CERT_BANCARIA",
  "CERT_BILLETERA",
] as const

const AVATAR = new RegExp(`^perfil/(${UUID})/$`)
const CARPETA_MEDIO = new RegExp(`^medio/(${UUID})/$`)
const DOCUMENTO_MEDIO = new RegExp(
  `^medio/(${UUID})/(${SEGMENTO})/(?:${SEGMENTO}/)*${SEGMENTO}$`
)

/** De quién son los archivos y qué decidió la BD para el medio. */
export interface ContextoBorrado {
  /** Solo con `BORRAR` se borra la carpeta completa del medio. */
  medio: AccionMedio
  /** El titular, si se conoce: solo su avatar. */
  perfilId?: string | null
  /** El medio del titular, si se conoce: solo sus documentos. */
  medioId?: string | null
}

type Clasificacion =
  | { clase: "avatar"; perfilId: string }
  | { clase: "medio"; medioId: string }
  | null

function sinTrampas(valor: string): boolean {
  return (
    !valor.includes("..") && !valor.includes("//") && !valor.startsWith("/")
  )
}

/** ¿Es algo que la supresión puede pedir borrar, en este contexto? ¿De quién es? */
function clasificar(
  archivo: ArchivoSupresion,
  { medio }: ContextoBorrado
): Clasificacion {
  if ("prefijo" in archivo) {
    if (!sinTrampas(archivo.prefijo)) return null
    if (archivo.bucket === "avatares") {
      const avatar = AVATAR.exec(archivo.prefijo)
      if (avatar) return { clase: "avatar", perfilId: avatar[1] }
    }
    if (
      (archivo.bucket === "documentos" || archivo.bucket === "avatares") &&
      medio === "BORRAR"
    ) {
      const carpeta = CARPETA_MEDIO.exec(archivo.prefijo)
      return carpeta ? { clase: "medio", medioId: carpeta[1] } : null
    }
    return null
  }
  if (!sinTrampas(archivo.ruta) || archivo.bucket !== "documentos") return null
  const documento = DOCUMENTO_MEDIO.exec(archivo.ruta)
  if (!documento) return null
  if (medio === "BORRAR") return { clase: "medio", medioId: documento[1] }
  if (
    medio === "ANONIMIZAR" &&
    (DOCUMENTOS_ANONIMIZACION as readonly string[]).includes(documento[2])
  ) {
    return { clase: "medio", medioId: documento[1] }
  }
  return null
}

/** ¿La BD pidió borrar algo con una forma conocida y del titular? (si no, no se toca). */
export function archivoPermitido(
  archivo: ArchivoSupresion,
  contexto: ContextoBorrado
): boolean {
  const clase = clasificar(archivo, contexto)
  if (!clase) return false
  if (clase.clase === "avatar") {
    return !contexto.perfilId || clase.perfilId === contexto.perfilId
  }
  return !contexto.medioId || clase.medioId === contexto.medioId
}

export interface PlanBorrado {
  /** Carpetas a listar (y borrar completas), por bucket. */
  prefijos: { bucket: string; prefijo: string }[]
  /** Archivos sueltos, por bucket. */
  rutas: Map<string, string[]>
  /** Lo que la BD pidió con una forma desconocida o de otra persona: no se borra. */
  rechazados: number
}

/**
 * Lo que se borra. Sin ids en el contexto (al reintentar, cuando el titular
 * ya no existe), el primero aceptado de cada clase fija el perfil y el medio:
 * nunca se borran archivos de dos personas ni de dos medios.
 */
export function planBorrado(
  archivos: readonly ArchivoSupresion[],
  contexto: ContextoBorrado
): PlanBorrado {
  const prefijos: { bucket: string; prefijo: string }[] = []
  const rutas = new Map<string, string[]>()
  let rechazados = 0
  let perfilId = contexto.perfilId ?? null
  let medioId = contexto.medioId ?? null
  for (const archivo of archivos) {
    const clase = clasificar(archivo, contexto)
    const propio =
      clase?.clase === "avatar"
        ? (perfilId ??= clase.perfilId) === clase.perfilId
        : clase?.clase === "medio"
          ? (medioId ??= clase.medioId) === clase.medioId
          : false
    if (!propio) {
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

/** ¿Es el mismo archivo o la misma carpeta? */
export function mismoArchivo(a: ArchivoSupresion, b: ArchivoSupresion) {
  if (a.bucket !== b.bucket) return false
  if ("prefijo" in a) return "prefijo" in b && a.prefijo === b.prefijo
  return "ruta" in b && a.ruta === b.ruta
}

/**
 * Los pendientes que se pueden reintentar: solo los que la BD pidió borrar al
 * ejecutar (`archivos`). Lo que no esté en esa lista no se toca.
 */
export function pendientesReintentables(
  resultado: Pick<ResultadoSupresion, "archivos" | "archivosPendientes">
): ArchivoSupresion[] {
  return (resultado.archivosPendientes ?? []).filter((pendiente) =>
    resultado.archivos.some((archivo) => mismoArchivo(archivo, pendiente))
  )
}

// ── Ejecución contra Storage ─────────────────────────────────────────────────

/** Lo que el borrado necesita de Storage (el servidor lo da con el cliente de servicio). */
export interface AlmacenBorrado {
  /** Todas las rutas bajo una carpeta (con subcarpetas); lanza si falla. */
  listar: (bucket: string, carpeta: string) => Promise<string[]>
  /** Borra un lote; devuelve cuántos borró. Lanza si falla. */
  borrar: (bucket: string, rutas: string[]) => Promise<number>
  /** Rutas derivadas de un archivo que también se borran (su miniatura). */
  derivadas?: (ruta: string) => string[]
  /** Solo la operación y el código: nunca rutas ni datos del titular. */
  informar?: (operacion: string, error: unknown) => void
}

export interface ResultadoBorrado {
  borrados: number
  /** Lo que sigue en Storage y se puede reintentar (forma de la BD). */
  pendientes: ArchivoSupresion[]
  /** Lo que la BD pidió y no se acepta (forma desconocida o de otra persona). */
  rechazados: number
}

/**
 * Borra de Storage lo planeado, por lotes. Una carpeta que no se pudo listar,
 * o con algún lote fallido, queda pendiente completa (volver a listarla solo
 * encuentra lo que falte); un archivo suelto queda pendiente si falla él o su
 * miniatura. Un fallo no deshace la supresión.
 */
export async function borrarPlan(
  plan: PlanBorrado,
  almacen: AlmacenBorrado
): Promise<ResultadoBorrado> {
  const pendientes: ArchivoSupresion[] = []
  const anotarPendiente = (archivo: ArchivoSupresion) => {
    if (!pendientes.some((otro) => mismoArchivo(otro, archivo))) {
      pendientes.push(archivo)
    }
  }
  // Cada ruta a borrar, con el archivo o la carpeta de la BD de la que sale.
  const origenes = new Map<string, Map<string, ArchivoSupresion>>()
  const agregar = (bucket: string, ruta: string, origen: ArchivoSupresion) => {
    const delBucket = origenes.get(bucket) ?? new Map()
    if (!delBucket.has(ruta)) delBucket.set(ruta, origen)
    origenes.set(bucket, delBucket)
  }

  for (const { bucket, prefijo } of plan.prefijos) {
    const origen: ArchivoSupresion = { bucket, prefijo }
    try {
      const rutas = await almacen.listar(bucket, prefijo.replace(/\/$/, ""))
      for (const ruta of rutas) agregar(bucket, ruta, origen)
    } catch (error) {
      almacen.informar?.(`listar ${bucket} para la supresión`, error)
      anotarPendiente(origen)
    }
  }
  for (const [bucket, rutas] of plan.rutas) {
    for (const ruta of rutas) {
      const origen: ArchivoSupresion = { bucket, ruta }
      agregar(bucket, ruta, origen)
      for (const derivada of almacen.derivadas?.(ruta) ?? []) {
        agregar(bucket, derivada, origen)
      }
    }
  }

  let borrados = 0
  for (const [bucket, delBucket] of origenes) {
    for (const lote of enLotes([...delBucket.keys()])) {
      try {
        borrados += await almacen.borrar(bucket, lote)
      } catch (error) {
        almacen.informar?.(`borrar en ${bucket} tras la supresión`, error)
        for (const ruta of lote) {
          const origen = delBucket.get(ruta)
          if (origen) anotarPendiente(origen)
        }
      }
    }
  }
  return { borrados, pendientes, rechazados: plan.rechazados }
}
