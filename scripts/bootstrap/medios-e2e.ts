/**
 * Medios de las cuentas E2E de rol MEDIO (módulo puro: ids, datos base y la
 * decisión de cómo reiniciar el medio nuevo). El plan del medio verificado
 * está en `medio-verificado-e2e.ts` y las escrituras, en `aprovisionar-medios.ts`.
 *
 * - «Medio E2E» (`E2E_MEDIO_*`): VERIFICADO nivel 1, con una cuenta de
 *   Instagram verificada de 40.000 seguidores, datos de pago completos y los
 *   documentos del nivel aprobados y vigentes.
 * - «Medio Nuevo E2E» (`E2E_MEDIO_NUEVO_*`): PENDIENTE recién registrado, sin
 *   cuentas, documentos ni pago. Cada corrida lo devuelve a ese estado.
 * - «Medio Suspensión E2E» (`E2E_MEDIO_SUSPENSION_*`): VERIFICADO nivel 1 como
 *   el Medio E2E, pero en otro municipio y con su propia cuenta de Instagram:
 *   las pruebas de suspensión lo suspenden y lo reactivan sin tocar al medio
 *   que usa la pauta. Cada corrida lo deja verificado (lo reactiva si quedó
 *   suspendido).
 *
 * Los ids son fijos, como el del anunciante E2E: las pruebas los ubican sin
 * consultar. Son `es_demo`, así que la purga demo se los lleva y la siguiente
 * corrida de `pnpm bootstrap:e2e` los vuelve a crear.
 */
import type { Database } from "../../src/types/database.types"

type Enums = Database["public"]["Enums"]
type FilaMedio = Database["public"]["Tables"]["medios"]["Row"]

export const MEDIO_E2E_ID = "e2e00000-0000-4000-8000-00000000b001"
export const MEDIO_NUEVO_E2E_ID = "e2e00000-0000-4000-8000-00000000b002"
export const MEDIO_SUSPENSION_E2E_ID = "e2e00000-0000-4000-8000-00000000b003"

/** Lo que el equipo AMO registra al dar de alta un medio (hoja «Registrar medio»). */
export interface DatosBaseMedio {
  id: string
  nombre: string
  tipo: Enums["medio_tipo"]
  /** Código DIVIPOLA preferido; si ya no está activo se usa el primero activo. */
  municipioPreferido: string
  descripcionAudiencia: string | null
  /** Categoría temática por nombre (los ids cambian entre entornos); `null`: ninguna. */
  categoria: string | null
}

export const MEDIO_E2E: DatosBaseMedio = {
  id: MEDIO_E2E_ID,
  nombre: "Medio E2E",
  tipo: "PAGINA_NOTICIAS",
  municipioPreferido: "05001",
  descripcionAudiencia:
    "Medio de las pruebas automatizadas de AMO. Audiencia del Valle de Aburrá interesada en noticias locales.",
  categoria: "Noticias generales",
}

/** Recién registrado: solo nombre, tipo y municipio (el resto lo completa el medio). */
export const MEDIO_NUEVO_E2E: DatosBaseMedio = {
  id: MEDIO_NUEVO_E2E_ID,
  nombre: "Medio Nuevo E2E",
  tipo: "CREADOR",
  municipioPreferido: "76001",
  descripcionAudiencia: null,
  categoria: null,
}

/**
 * Verificado para las pruebas de suspensión: en Barranquilla, para que las
 * ofertas dirigidas a uno (`{ paraMedio }`: municipio y categorías) no le
 * lleguen al otro.
 */
export const MEDIO_SUSPENSION_E2E: DatosBaseMedio = {
  id: MEDIO_SUSPENSION_E2E_ID,
  nombre: "Medio Suspensión E2E",
  tipo: "PAGINA_NOTICIAS",
  municipioPreferido: "08001",
  descripcionAudiencia:
    "Medio de las pruebas automatizadas de suspensión de AMO. Audiencia de Barranquilla interesada en noticias locales.",
  categoria: "Noticias generales",
}

export const NIVEL_MEDIO_E2E = 1

/** Cuenta social verificada de un medio E2E. */
export interface CuentaSocialE2E {
  plataforma: Enums["plataforma"]
  handle: string
  url: string
  seguidores: number
}

/** Cuenta verificada del Medio E2E: 40.000 seguidores (franja F1, 30.000–60.000). */
export const CUENTA_INSTAGRAM_E2E = {
  plataforma: "INSTAGRAM",
  handle: "medio.e2e.amo",
  url: "https://www.instagram.com/medio.e2e.amo",
  seguidores: 40_000,
} as const satisfies CuentaSocialE2E

/** Cuenta verificada del Medio Suspensión E2E: 45.000 seguidores (también F1). */
export const CUENTA_INSTAGRAM_SUSPENSION_E2E = {
  plataforma: "INSTAGRAM",
  handle: "medio.suspension.e2e.amo",
  url: "https://www.instagram.com/medio.suspension.e2e.amo",
  seguidores: 45_000,
} as const satisfies CuentaSocialE2E

// ── Medio Nuevo E2E ──────────────────────────────────────────────────────────

export type FilaMedioNuevo = Pick<
  FilaMedio,
  | "estado"
  | "verificado_at"
  | "rechazado_at"
  | "suspendido_at"
  | "motivo_estado"
  | "deleted_at"
>

/**
 * - `CREAR`: no existe (primera corrida o tras una purga demo).
 * - `LIMPIAR`: sigue PENDIENTE y nunca pasó por una decisión del equipo AMO:
 *   basta con borrar lo que se le agregó.
 * - `RECREAR`: se verificó, rechazó o suspendió alguna vez (ninguna
 *   transición lo devuelve a recién registrado): se borra y se registra de nuevo.
 */
export type AccionMedioNuevo = "CREAR" | "LIMPIAR" | "RECREAR"

export function accionMedioNuevo(
  fila: FilaMedioNuevo | null
): AccionMedioNuevo {
  if (!fila) return "CREAR"
  const recienRegistrado =
    fila.estado === "PENDIENTE" &&
    fila.deleted_at === null &&
    fila.verificado_at === null &&
    fila.rechazado_at === null &&
    fila.suspendido_at === null &&
    fila.motivo_estado === null
  return recienRegistrado ? "LIMPIAR" : "RECREAR"
}

/** Lo que hizo el reinicio, en palabras, para el registro de la corrida. */
export function describirAccionMedioNuevo(accion: AccionMedioNuevo): string {
  switch (accion) {
    case "CREAR":
      return "registrado (PENDIENTE)"
    case "LIMPIAR":
      return "reiniciado a recién registrado"
    case "RECREAR":
      return "registrado de nuevo (había pasado por una decisión del equipo AMO)"
  }
}

// ── Datos base ───────────────────────────────────────────────────────────────

/** Qué agregar y qué quitar para pasar de `actual` a `deseado`. */
export function diferencia<T>(
  actual: readonly T[],
  deseado: readonly T[]
): { agregar: T[]; quitar: T[] } {
  const enActual = new Set(actual)
  const enDeseado = new Set(deseado)
  return {
    agregar: [...enDeseado].filter((valor) => !enActual.has(valor)),
    quitar: [...enActual].filter((valor) => !enDeseado.has(valor)),
  }
}

export type FilaBaseMedio = Pick<
  FilaMedio,
  | "nombre"
  | "tipo"
  | "municipio_codigo"
  | "descripcion_audiencia"
  | "deleted_at"
>

/**
 * Columnas que difieren de los datos base (`null` si no hay nada que
 * cambiar): una corrida repetida no escribe ni deja ruido en la bitácora.
 */
export function cambiosMedio(
  fila: FilaBaseMedio,
  datos: DatosBaseMedio,
  municipio: string
): Partial<FilaBaseMedio> | null {
  const deseado: FilaBaseMedio = {
    nombre: datos.nombre,
    tipo: datos.tipo,
    municipio_codigo: municipio,
    descripcion_audiencia: datos.descripcionAudiencia,
    deleted_at: null,
  }
  const columnas = (Object.keys(deseado) as (keyof FilaBaseMedio)[]).filter(
    (columna) => fila[columna] !== deseado[columna]
  )
  if (columnas.length === 0) return null
  return Object.fromEntries(
    columnas.map((columna) => [columna, deseado[columna]])
  ) as Partial<FilaBaseMedio>
}
