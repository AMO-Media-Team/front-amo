/**
 * Términos vigentes de las cuentas E2E externas (AUT-012). La compuerta del
 * DAL lleva a `/aceptar-terminos` a todo anunciante o medio con una versión
 * publicada sin aceptar; si el cliente publica sus textos, las pruebas que
 * esperan llegar a Inicio dejarían de ser repetibles. El aprovisionamiento
 * acepta por ellas lo vigente al momento de correr (solo fuera de producción,
 * como todo lo de `pnpm bootstrap:e2e`) y deja la marca en el agente de usuario.
 *
 * Una prueba de la compuerta publica su propia versión: esa queda pendiente
 * hasta la siguiente corrida del aprovisionamiento.
 */
import { createHash } from "node:crypto"

import type { Database } from "../../src/types/database.types"
import type { RolCuentaPrueba } from "./organizacion"
import { type ClienteSupabase, ErrorBootstrap } from "./supabase"

type Enums = Database["public"]["Enums"]
export type TipoTermino = Enums["terminos_tipo"]
export type TipoRolExterno = Exclude<Enums["rol_tipo"], "ADMIN">

/** Lo que `public.terminos_pendientes()` exige a cada tipo de rol externo. */
export const TERMINOS_POR_ROL: Readonly<
  Record<TipoRolExterno, readonly TipoTermino[]>
> = {
  MEDIO: ["TERMINOS_MEDIO", "POLITICA_DATOS", "CONDICIONES_COMERCIALES"],
  ANUNCIANTE: [
    "TERMINOS_ANUNCIANTE",
    "POLITICA_DATOS",
    "CONDICIONES_COMERCIALES",
  ],
}

/** Tipo de rol externo de una cuenta de prueba (`null` para los internos, que no aceptan términos). */
export function tipoRolExterno(rol: RolCuentaPrueba): TipoRolExterno | null {
  return rol === "MEDIO" || rol === "ANUNCIANTE" ? rol : null
}

export const AGENTE_ACEPTACION_E2E =
  "pnpm bootstrap:e2e (aceptación automática de la cuenta de prueba)"

export interface VersionPublicada {
  id: string
  tipo: TipoTermino
  vigente_desde: string | null
  created_at: string
}

function instante(fecha: string | null): number {
  return fecha === null ? Number.NaN : Date.parse(fecha)
}

/**
 * La versión vigente de cada tipo, como `terminos_pendientes()`: publicada,
 * con `vigente_desde` ya alcanzado y, entre esas, la más reciente (desempata
 * la creada después).
 */
export function vigentesPorTipo(
  versiones: readonly VersionPublicada[],
  ahora: Date
): VersionPublicada[] {
  const vigentes = new Map<TipoTermino, VersionPublicada>()
  for (const version of versiones) {
    const desde = instante(version.vigente_desde)
    if (Number.isNaN(desde) || desde > ahora.getTime()) continue
    const actual = vigentes.get(version.tipo)
    const masReciente =
      !actual ||
      desde > instante(actual.vigente_desde) ||
      (desde === instante(actual.vigente_desde) &&
        Date.parse(version.created_at) > Date.parse(actual.created_at))
    if (masReciente) vigentes.set(version.tipo, version)
  }
  return [...vigentes.values()]
}

/** Ids de las versiones vigentes que el rol exige y la cuenta aún no aceptó. */
export function versionesPorAceptar(
  tipoRol: TipoRolExterno,
  vigentes: readonly VersionPublicada[],
  aceptadas: ReadonlySet<string>
): string[] {
  const exigidos = new Set(TERMINOS_POR_ROL[tipoRol])
  return vigentes
    .filter(
      (version) => exigidos.has(version.tipo) && !aceptadas.has(version.id)
    )
    .map((version) => version.id)
}

/** Lo mismo que calcula el trigger de sellado: sha256 del correo en minúsculas. */
export function huellaCorreo(email: string): string {
  return createHash("sha256").update(email.toLowerCase(), "utf8").digest("hex")
}

/**
 * Acepta por la cuenta las versiones vigentes que le falten. Devuelve
 * cuántas aceptó (0 si no hay textos publicados o ya estaban aceptados).
 */
export async function aceptarTerminosVigentes(
  servicio: ClienteSupabase,
  cuenta: { id: string; email: string; tipoRol: TipoRolExterno }
): Promise<number> {
  const [versiones, aceptaciones] = await Promise.all([
    servicio
      .from("terminos_versiones")
      .select("id, tipo, vigente_desde, created_at")
      .eq("publicada", true),
    servicio
      .from("aceptaciones_terminos")
      .select("termino_version_id")
      .eq("perfil_id", cuenta.id),
  ])
  if (versiones.error || aceptaciones.error) {
    throw new ErrorBootstrap(
      `No se pudieron leer los términos: ${(versiones.error ?? aceptaciones.error)?.message}`
    )
  }
  const pendientes = versionesPorAceptar(
    cuenta.tipoRol,
    vigentesPorTipo(versiones.data, new Date()),
    new Set(aceptaciones.data.map((fila) => fila.termino_version_id))
  )
  if (pendientes.length === 0) return 0

  const { error } = await servicio.from("aceptaciones_terminos").insert(
    pendientes.map((terminoVersionId) => ({
      perfil_id: cuenta.id,
      termino_version_id: terminoVersionId,
      email_sha256: huellaCorreo(cuenta.email),
      user_agent: AGENTE_ACEPTACION_E2E,
    }))
  )
  if (error) {
    throw new ErrorBootstrap(
      `No se pudieron aceptar los términos de ${cuenta.email}: ${error.message}`
    )
  }
  return pendientes.length
}
