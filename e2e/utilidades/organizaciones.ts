/**
 * Anunciantes y medios que registran las pruebas desde la interfaz (no son
 * `es_demo`: la purga demo no se los lleva). Sus nombres empiezan por un
 * prefijo de prueba y terminan en el sufijo de la corrida; las personas que se
 * invitan a ellos usan un prefijo de correo propio. `borrarOrganizacionesE2E`
 * los quita antes y después de cada suite, como hace usuarios.spec con sus
 * cuentas.
 */
import { digitoVerificacion } from "../../src/lib/colombia/nit"
import type { ClienteSupabase } from "../../scripts/bootstrap/supabase"

export interface PrefijosPrueba {
  /** Inicio del nombre del medio y de la razón social del anunciante. */
  nombre: string
  /** Inicio del correo de las personas invitadas (dominio reservado `@amo.test`). */
  correo: string
}

/** Sufijo corto y distinto por corrida (también separa los proyectos de Playwright). */
export function sufijoCorrida(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 36 ** 2)
    .toString(36)
    .padStart(2, "0")}`
}

export interface NitDePrueba {
  /** 10 dígitos que empiezan por 87 (los datos demo usan 90 y 99). */
  nit: string
  dv: string
  /** Un dígito que NO corresponde al NIT (para probar el rechazo). */
  dvErrado: string
}

/** NIT colombiano válido y casi seguro libre, derivado de `semilla` (por omisión, la hora). */
export function nitDePrueba(semilla: number = Date.now()): NitDePrueba {
  const nit = `87${String(Math.abs(Math.trunc(semilla)) % 100_000_000).padStart(8, "0")}`
  const dv = digitoVerificacion(nit)
  return { nit, dv, dvErrado: String((Number(dv) + 1) % 10) }
}

function fallo(accion: string, error: { message: string }): never {
  throw new Error(`${accion}: ${error.message}`)
}

/**
 * Borra lo que las pruebas registraron con esos prefijos: primero las
 * personas (un perfil vinculado impide borrar su organización), luego medios
 * y anunciantes. `servicio` debe actuar como el superadministrador
 * (`clienteComoSuperadmin`): la bitácora atribuye el borrado.
 */
export async function borrarOrganizacionesE2E(
  servicio: ClienteSupabase,
  prefijos: PrefijosPrueba
): Promise<void> {
  const { data: personas, error } = await servicio
    .from("perfiles")
    .select("id")
    .like("email", `${prefijos.correo}%`)
  if (error) fallo("No se pudieron listar las personas de prueba", error)
  for (const { id } of personas) {
    const { error: errorBorrado } = await servicio.auth.admin.deleteUser(id)
    if (errorBorrado)
      fallo("No se pudo borrar una persona de prueba", errorBorrado)
  }

  const { error: errorMedios } = await servicio
    .from("medios")
    .delete()
    .like("nombre", `${prefijos.nombre}%`)
    .eq("es_demo", false)
  if (errorMedios)
    fallo("No se pudieron borrar los medios de prueba", errorMedios)

  const { error: errorAnunciantes } = await servicio
    .from("anunciantes")
    .delete()
    .like("razon_social", `${prefijos.nombre}%`)
    .eq("es_demo", false)
  if (errorAnunciantes) {
    fallo("No se pudieron borrar los anunciantes de prueba", errorAnunciantes)
  }
}
