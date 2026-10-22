import "server-only"

import { cache } from "react"

import { clienteSolicitud, fallar } from "@/features/operacion/queries/comun"
import type { MedioDetalle } from "@/features/operacion/tipos"

import { opcionesCategorias } from "./categorias"
import { ordenarPersonas } from "./presentacion"
import type { MedioEditable, OpcionCategoria, PersonaMedio } from "./tipos"

/**
 * Lecturas del registro y la edición de medios. Todo con el cliente del
 * USUARIO (JWT + RLS): la BD decide qué ve cada rol.
 */

/** Categorías que se pueden asignar hoy (activas y no borradas), en su orden de catálogo. */
const categoriasActivas = cache(async (): Promise<OpcionCategoria[]> => {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("categorias")
    .select("id, nombre")
    .eq("activo", true)
    .is("deleted_at", null)
    .order("orden")
    .order("nombre")
  if (error) fallar("leer las categorías", error)
  return data
})

/**
 * Para el botón del listado: sin categorías el registro sigue siendo posible
 * (se agregan después), así que un fallo no tumba el encabezado de la página.
 */
export async function categoriasParaRegistro(): Promise<
  OpcionCategoria[] | null
> {
  try {
    return await categoriasActivas()
  } catch (error) {
    console.error(
      `[gestion-medios] categorías para el registro: ${error instanceof Error ? error.message : "error"}`
    )
    return null
  }
}

/**
 * Una archivada solo muestra su nombre con `configuracion.ver` (RLS de
 * `categorias`); sin él la ficha la señala igual como «(archivada)».
 */
const CATEGORIA_SIN_NOMBRE = "Sin nombre visible"

/** Categorías que el medio tiene hoy (con nombre si la RLS deja verlas). */
async function categoriasDelMedio(medioId: string): Promise<OpcionCategoria[]> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("medio_categorias")
    .select("categoria_id, categoria:categorias ( nombre )")
    .eq("medio_id", medioId)
  if (error) fallar("leer las categorías del medio", error)
  return data.map((fila) => ({
    id: fila.categoria_id,
    nombre: fila.categoria?.nombre ?? CATEGORIA_SIN_NOMBRE,
  }))
}

export interface CategoriasEdicion {
  /** Las que el medio tiene hoy. */
  categoriaIds: string[]
  /** Activas + las archivadas que el medio conserva. */
  opciones: OpcionCategoria[]
}

/** Categorías de la hoja «Editar datos» (se consulta junto con el medio). */
export async function categoriasEdicion(
  medioId: string
): Promise<CategoriasEdicion> {
  const [activas, delMedio] = await Promise.all([
    categoriasActivas(),
    categoriasDelMedio(medioId),
  ])
  return {
    categoriaIds: delMedio.map((categoria) => categoria.id),
    opciones: opcionesCategorias(activas, delMedio),
  }
}

/** Valores actuales del medio para la hoja «Editar datos». */
export function medioEditable(
  medio: MedioDetalle,
  categoriaIds: readonly string[]
): MedioEditable {
  return {
    id: medio.id,
    nombre: medio.nombre,
    tipo: medio.tipo,
    municipioCodigo: medio.municipioCodigo,
    descripcionAudiencia: medio.descripcionAudiencia,
    categoriaIds: [...categoriaIds],
    actualizadoAt: medio.actualizadoAt,
  }
}

/** Personas vinculadas al medio (`perfiles.medio_id`); la RLS exige `usuarios.ver`. */
export async function usuariosDelMedio(
  medioId: string
): Promise<PersonaMedio[]> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("perfiles")
    .select(
      `id, nombre, email, estado, ultimo_acceso_at,
       rol:roles!perfiles_rol_id_fkey ( nombre, color )`
    )
    .eq("medio_id", medioId)
    .is("deleted_at", null)
    .limit(200)
  if (error) fallar("leer las personas del medio", error)
  return ordenarPersonas(
    data.map((fila) => ({
      id: fila.id,
      nombre: fila.nombre,
      email: fila.email,
      estado: fila.estado,
      rol: fila.rol,
      ultimoAccesoAt: fila.ultimo_acceso_at,
    }))
  )
}
