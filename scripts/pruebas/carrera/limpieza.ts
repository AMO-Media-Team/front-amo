/**
 * Limpieza total de los datos de la prueba de carrera, en orden de
 * dependencias (las FK de negocio son RESTRICT). También recoge los restos de
 * corridas interrumpidas: solo filas `es_demo` con el prefijo de la prueba.
 * La bitácora no se toca: es inmutable para la API (solo la purga del owner
 * la borra) y conserva el rastro de la prueba marcado como demo.
 */
import type { ClienteSupabase } from "../../bootstrap/supabase"
import { borrarUsuario, PREFIJO_EMAIL, SUFIJO_OPERADOR } from "./cuentas"
import { PREFIJO_NOMBRE, type Registro, registroVacio } from "./datos"

const TROZO = 100

function trozos<T>(lista: readonly T[]): T[][] {
  return Array.from({ length: Math.ceil(lista.length / TROZO) }, (_, i) =>
    lista.slice(i * TROZO, (i + 1) * TROZO)
  )
}

type TablaLimpiable =
  | "asignaciones"
  | "creativos"
  | "ofertas"
  | "campanas"
  | "cuentas_sociales"
  | "medios"
  | "anunciantes"
  | "notificaciones"

async function borrarDonde(
  servicio: ClienteSupabase,
  tabla: TablaLimpiable,
  columna: string,
  valores: readonly string[]
): Promise<void> {
  for (const trozo of trozos(valores)) {
    const { error } = await servicio.from(tabla).delete().in(columna, trozo)
    if (error) throw new Error(`No se pudo limpiar ${tabla}: ${error.message}`)
  }
}

async function idsDe(
  servicio: ClienteSupabase,
  tabla:
    "campanas" | "ofertas" | "asignaciones" | "cuentas_sociales" | "creativos",
  columna: string,
  valores: readonly string[]
): Promise<string[]> {
  const ids: string[] = []
  for (const trozo of trozos(valores)) {
    const { data, error } = await servicio
      .from(tabla)
      .select("id")
      .in(columna, trozo)
    if (error) throw new Error(`No se pudo leer ${tabla}: ${error.message}`)
    ids.push(...data.map((fila) => fila.id))
  }
  return ids
}

/** Registro con los restos de corridas anteriores (prefijo de la prueba y `es_demo`). */
export async function buscarRestos(
  servicio: ClienteSupabase
): Promise<Registro> {
  const restos = registroVacio()
  const [anunciantes, medios, perfiles] = await Promise.all([
    servicio
      .from("anunciantes")
      .select("id")
      .eq("es_demo", true)
      .like("razon_social", `${PREFIJO_NOMBRE}% SAS`),
    servicio
      .from("medios")
      .select("id")
      .eq("es_demo", true)
      .like("nombre", `${PREFIJO_NOMBRE}% medio %`),
    servicio
      .from("perfiles")
      .select("id, email")
      .like("email", `${PREFIJO_EMAIL}%@amo.test`),
  ])
  if (anunciantes.error || medios.error || perfiles.error) {
    throw new Error("No se pudieron buscar restos de corridas anteriores.")
  }
  restos.anunciantes = anunciantes.data.map((f) => f.id)
  restos.medios = medios.data.map((f) => f.id)
  // `limpiar` espera al operador en primera posición (se borra al final).
  const esOperador = (email: string) => email.includes(SUFIJO_OPERADOR)
  restos.usuarios = [
    ...perfiles.data.filter((f) => esOperador(f.email)),
    ...perfiles.data.filter((f) => !esOperador(f.email)),
  ].map((f) => f.id)
  restos.campanas = await idsDe(
    servicio,
    "campanas",
    "anunciante_id",
    restos.anunciantes
  )
  restos.ofertas = await idsDe(
    servicio,
    "ofertas",
    "campana_id",
    restos.campanas
  )
  return restos
}

export function hayDatos(registro: Registro): boolean {
  return Object.values(registro).some((ids: string[]) => ids.length > 0)
}

export interface ResultadoLimpieza {
  filasNegocio: number
  usuarios: number
}

/**
 * Borra todo lo del registro. El operador (primer usuario) se borra al final:
 * sus FK `on delete set null` (verificado_por, moderada_por…) ya no tienen filas.
 */
export async function limpiar(
  servicio: ClienteSupabase,
  registro: Registro
): Promise<ResultadoLimpieza> {
  const campanas = registro.campanas
  const ofertas = [
    ...new Set([
      ...registro.ofertas,
      ...(await idsDe(servicio, "ofertas", "campana_id", campanas)),
    ]),
  ]
  const asignaciones = await idsDe(
    servicio,
    "asignaciones",
    "campana_id",
    campanas
  )
  const cuentas = await idsDe(
    servicio,
    "cuentas_sociales",
    "medio_id",
    registro.medios
  )
  const entidades = [
    ...campanas,
    ...ofertas,
    ...asignaciones,
    ...cuentas,
    ...registro.medios,
    ...registro.anunciantes,
  ]

  await borrarDonde(servicio, "asignaciones", "id", asignaciones)
  await borrarDonde(servicio, "creativos", "oferta_id", ofertas)
  await borrarDonde(servicio, "ofertas", "id", ofertas)
  await borrarDonde(servicio, "campanas", "id", campanas)
  const [operador, ...usuariosMedio] = registro.usuarios
  for (const usuarioId of usuariosMedio)
    await borrarUsuario(servicio, usuarioId)
  await borrarDonde(servicio, "cuentas_sociales", "id", cuentas)
  await borrarDonde(servicio, "medios", "id", registro.medios)
  await borrarDonde(servicio, "anunciantes", "id", registro.anunciantes)
  if (operador) await borrarUsuario(servicio, operador)
  // Avisos a otros usuarios (moderadores, etc.) sobre las entidades de la prueba.
  await borrarDonde(servicio, "notificaciones", "entidad_id", entidades)
  return { filasNegocio: entidades.length, usuarios: registro.usuarios.length }
}

/** Filas de la corrida que siguen en la BD (debe ser 0 tras limpiar). */
export async function contarRestos(
  servicio: ClienteSupabase,
  registro: Registro
): Promise<number> {
  const consultas = [
    servicio
      .from("campanas")
      .select("id", { count: "exact", head: true })
      .in("id", registro.campanas),
    servicio
      .from("ofertas")
      .select("id", { count: "exact", head: true })
      .in("id", registro.ofertas),
    servicio
      .from("medios")
      .select("id", { count: "exact", head: true })
      .in("id", registro.medios),
    servicio
      .from("anunciantes")
      .select("id", { count: "exact", head: true })
      .in("id", registro.anunciantes),
    servicio
      .from("perfiles")
      .select("id", { count: "exact", head: true })
      .in("id", registro.usuarios),
    servicio
      .from("asignaciones")
      .select("id", { count: "exact", head: true })
      .in("campana_id", registro.campanas),
  ]
  const conteos = await Promise.all(consultas)
  return conteos.reduce((total, { count }) => total + (count ?? 0), 0)
}
