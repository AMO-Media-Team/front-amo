/**
 * Quién gestiona campañas y ofertas y con qué permisos (módulo puro, ADM-014).
 * El anunciante gestiona las de su empresa (`*.gestionar_propias`); el equipo
 * AMO, las de cualquier anunciante (`*.gestionar`). Las acciones aceptan
 * cualquiera de los dos y la BD decide: propiedad para el anunciante,
 * permiso de la transición para el equipo. Las pantallas asistidas exigen
 * TODOS sus permisos (el catálogo no los encadena: sin `campanas.ver`, por
 * ejemplo, la campaña recién creada no se puede leer).
 */
import type { ClavePermiso } from "@/lib/auth/permisos"
import type { TipoRol } from "@/lib/auth/tipos"

import type { EstadoAnunciante } from "./tipos"

/** Acciones sobre campañas: el anunciante o el equipo AMO (al menos uno). */
export const PERMISOS_GESTION_CAMPANAS = [
  "campanas.gestionar_propias",
  "campanas.gestionar",
] as const satisfies readonly ClavePermiso[]

/** Acciones sobre ofertas: el anunciante o el equipo AMO (al menos uno). */
export const PERMISOS_GESTION_OFERTAS = [
  "ofertas.gestionar_propias",
  "ofertas.gestionar",
] as const satisfies readonly ClavePermiso[]

/** Alta y edición asistidas de una campaña (todos). */
export const PERMISOS_CAMPANA_ASISTIDA = [
  "campanas.gestionar",
  "campanas.ver",
  "anunciantes.ver",
] as const satisfies readonly ClavePermiso[]

/** Asistente de oferta en modo asistido (todos). */
export const PERMISOS_OFERTA_ASISTIDA = [
  "ofertas.gestionar",
  "ofertas.ver",
  "campanas.ver",
] as const satisfies readonly ClavePermiso[]

export function tieneTodos(
  permisos: Iterable<string>,
  requeridos: readonly ClavePermiso[]
): boolean {
  const disponibles = new Set(permisos)
  return requeridos.every((permiso) => disponibles.has(permiso))
}

/** Puede abrir el alta y la edición asistidas de campañas. */
export function puedeGestionarCampanasAsistidas(
  permisos: Iterable<string>
): boolean {
  return tieneTodos(permisos, PERMISOS_CAMPANA_ASISTIDA)
}

/** Puede abrir el asistente de oferta por cuenta de un anunciante. */
export function puedeGestionarOfertasAsistidas(
  permisos: Iterable<string>
): boolean {
  return tieneTodos(permisos, PERMISOS_OFERTA_ASISTIDA)
}

/**
 * Solo el anunciante actúa sobre «su» empresa: al equipo AMO no se le exige
 * una (la elige o la deriva la BD de la campaña).
 */
export function exigeEmpresaPropia(usuario: {
  rol: { tipo: TipoRol }
}): boolean {
  return usuario.rol.tipo === "ANUNCIANTE"
}

// ── Selector de anunciante ───────────────────────────────────────────────────

/** Empresa elegible para la gestión asistida (no borrada). */
export interface OpcionAnuncianteGestion {
  id: string
  nombre: string
  estado: EstadoAnunciante
}

/** Minúsculas y sin tildes: «Café» se encuentra escribiendo «cafe». */
export function normalizarBusqueda(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es-CO")
    .replace(/\s+/g, " ")
    .trim()
}

/** Anunciantes cuyo nombre contiene cada palabra buscada (sin texto: todos). */
export function filtrarAnunciantes<
  T extends Pick<OpcionAnuncianteGestion, "nombre">,
>(opciones: readonly T[], texto: string): T[] {
  const palabras = normalizarBusqueda(texto).split(" ").filter(Boolean)
  if (palabras.length === 0) return [...opciones]
  return opciones.filter((opcion) => {
    const nombre = normalizarBusqueda(opcion.nombre)
    return palabras.every((palabra) => nombre.includes(palabra))
  })
}

/**
 * Lo que puede hacer el equipo AMO según la verificación de la empresa: con
 * cualquier estado prepara borradores; activar la campaña y enviar ofertas a
 * revisión exigen la empresa VERIFICADO (la BD lo exige a todo actor). Si no
 * se pudo leer el estado (`null`, sin `anunciantes.ver`), no se afirma nada:
 * decide la BD.
 */
export function notaVerificacionAsistida(
  estado: EstadoAnunciante | null
): string | null {
  if (estado === null || estado === "VERIFICADO") return null
  return "Puedes preparar borradores; activar y enviar a revisión exige la empresa verificada."
}

/**
 * Lo que la empresa recibe como aviso de la gestión asistida: solo los
 * cambios de estado (`fn_avisar_gestion_asistida`). Editar, archivar o
 * versionar el paquete creativo queda en la bitácora, sin aviso.
 */
export const AVISOS_GESTION_ASISTIDA =
  "La empresa recibe un aviso cuando creas, activas o cancelas una campaña, y cuando envías, retiras o cancelas una oferta."
