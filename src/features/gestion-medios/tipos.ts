/**
 * DTO del registro y la edición de medios: solo lo que la interfaz necesita.
 * Nada de datos privados (`medios_privado`) ni de pago.
 */
import type { TipoMedio } from "@/features/operacion/estados"
import type { EstadoPerfil, RolResumen } from "@/features/usuarios/tipos"

export type OpcionCategoria = {
  id: string
  nombre: string
  /** Archivada en Configuración: el medio la conserva, pero no se ofrece a otros. */
  archivada?: boolean
  /** Elegida en la hoja, pero ya no figura entre las opciones: hay que desmarcarla. */
  retirada?: boolean
}

/** Valores actuales del medio para la hoja «Editar datos». */
export type MedioEditable = {
  id: string
  nombre: string
  tipo: TipoMedio
  municipioCodigo: string
  descripcionAudiencia: string | null
  categoriaIds: string[]
  actualizadoAt: string
}

export type MedioRegistrado = {
  id: string
  /** Se registró, pero algo secundario (las categorías) no se pudo guardar. */
  advertencia: string | null
}

export type MedioGuardado = {
  actualizadoAt: string
  advertencia: string | null
}

/** Persona vinculada al medio (pestaña «Usuarios» de la ficha). */
export type PersonaMedio = {
  id: string
  nombre: string | null
  email: string
  estado: EstadoPerfil
  rol: Pick<RolResumen, "nombre" | "color"> | null
  ultimoAccesoAt: string | null
}
