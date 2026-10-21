/**
 * Lecturas de los datos demo con la clave de servicio, para que las pruebas
 * no dependan de nombres generados por la semilla (`pnpm demo:generar`).
 */
import {
  type ClienteSupabase,
  crearClienteServicio,
} from "../../scripts/bootstrap/supabase"
import { entorno } from "./cuentas"
import { credencialesDemo } from "./sesiones"

export interface Anunciante {
  id: string
  nombre: string
}

export function clienteDeLectura(): ClienteSupabase {
  return crearClienteServicio(entorno)
}

/** Empresa a la que pertenece la cuenta demo del anunciante. */
export async function anuncianteDemo(
  servicio: ClienteSupabase
): Promise<Anunciante> {
  const { email } = credencialesDemo("ANUNCIANTE")
  const { data: perfil } = await servicio
    .from("perfiles")
    .select("anunciante_id")
    .eq("email", email)
    .maybeSingle()
  if (!perfil?.anunciante_id) {
    throw new Error(`La cuenta ${email} no tiene un anunciante asociado.`)
  }
  const { data, error } = await servicio
    .from("anunciantes")
    .select("id, nombre_comercial")
    .eq("id", perfil.anunciante_id)
    .single()
  if (error) throw new Error(`No se pudo leer el anunciante: ${error.message}`)
  return { id: data.id, nombre: data.nombre_comercial }
}

/** Otros anunciantes con campañas: lo que el anunciante demo NO debe ver. */
export async function anunciantesAjenos(
  servicio: ClienteSupabase,
  propio: Anunciante
): Promise<(Anunciante & { campanaId: string })[]> {
  const { data, error } = await servicio
    .from("campanas")
    .select("id, anunciante:anunciantes!inner ( id, nombre_comercial )")
    .neq("anunciante_id", propio.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) throw new Error(`No se pudieron leer campañas: ${error.message}`)
  const ajenos = new Map<string, Anunciante & { campanaId: string }>()
  for (const { id, anunciante } of data) {
    if (ajenos.has(anunciante.id)) continue
    // Un nombre contenido en el propio no sirve para comprobar el aislamiento.
    if (propio.nombre.includes(anunciante.nombre_comercial)) continue
    ajenos.set(anunciante.id, {
      id: anunciante.id,
      nombre: anunciante.nombre_comercial,
      campanaId: id,
    })
  }
  if (ajenos.size === 0)
    throw new Error("No hay campañas de otros anunciantes.")
  return [...ajenos.values()]
}
