/**
 * Decide qué se registra al aceptar términos (AUT-012), módulo puro. La
 * fuente de verdad es lo pendiente en la BD en el momento de aceptar; lo que
 * envía la pantalla solo dice qué tuvo delante la persona y qué marcó.
 */

export interface SolicitudAceptacion {
  /** Versiones vigentes sin aceptar según la BD (`terminos_pendientes()`). */
  pendientes: readonly string[]
  /** Versiones que la pantalla mostró. */
  mostradas: readonly string[]
  /** Versiones cuya casilla marcó la persona. */
  aceptadas: readonly string[]
}

export type RevisionAceptacion =
  /** Se registran exactamente las pendientes (lo ya aceptado o reemplazado se ignora). */
  | { tipo: "completa"; versiones: readonly string[] }
  /** Alguna pendiente se mostró pero no se marcó. */
  | { tipo: "incompleta"; faltan: readonly string[] }
  /** Se publicó una versión después de abrir la pantalla: hay que mostrarla. */
  | { tipo: "desactualizada" }

export function revisarAceptacion({
  pendientes,
  mostradas,
  aceptadas,
}: SolicitudAceptacion): RevisionAceptacion {
  if (pendientes.some((id) => !mostradas.includes(id))) {
    return { tipo: "desactualizada" }
  }
  const faltan = pendientes.filter((id) => !aceptadas.includes(id))
  if (faltan.length > 0) return { tipo: "incompleta", faltan }
  return { tipo: "completa", versiones: [...pendientes] }
}
