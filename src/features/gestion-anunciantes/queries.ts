import "server-only"

import { cache } from "react"

import { listarPaises } from "@/lib/geo/catalogo"
import { crearClienteServidor } from "@/lib/supabase/server"

import { correoFacturacionDe } from "./filas"
import type {
  AnuncianteEditable,
  CatalogosAnunciante,
  OpcionPais,
  OpcionSector,
  UsuarioVinculado,
} from "./tipos"

/**
 * Lecturas del registro y la edición de anunciantes con el cliente del
 * USUARIO (JWT + RLS): la BD decide qué ve cada rol. Los catálogos no lanzan
 * (el formulario muestra el fallo con «Reintentar»); las demás lecturas sí, y
 * las recoge el límite de error de su sección.
 */

const clienteSolicitud = cache(crearClienteServidor)

function fallar(operacion: string, error: { code?: string | null }): never {
  throw new Error(`No se pudo ${operacion} (${error.code ?? "sin código"}).`)
}

let paises: OpcionPais[] | undefined

/** Países del diccionario ISO por nombre en español (la FK apunta a la misma semilla). */
function paisesOrdenados(): OpcionPais[] {
  paises ??= listarPaises()
    .map((pais) => ({ iso2: pais.iso2, nombre: pais.nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
  return paises
}

/** Sectores activos (RLS: los inactivos solo los ve Configuración). `null` si falla. */
async function sectoresActivos(): Promise<OpcionSector[] | null> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("sectores")
    .select("id, nombre")
    .eq("activo", true)
    .is("deleted_at", null)
    .order("orden")
    .order("nombre")
  if (error) {
    console.error(`[gestion-anunciantes] leer sectores falló (${error.code})`)
    return null
  }
  return data
}

/** Catálogos del formulario; `null` si no se pudieron leer los sectores. */
export const catalogosAnunciante = cache(
  async (): Promise<CatalogosAnunciante | null> => {
    const sectores = await sectoresActivos()
    return sectores ? { sectores, paises: paisesOrdenados() } : null
  }
)

/** Datos editables de un anunciante no borrado; `null` si no existe o no es visible. */
export const anuncianteEditable = cache(
  async (id: string): Promise<AnuncianteEditable | null> => {
    const supabase = await clienteSolicitud()
    const { data: fila, error } = await supabase
      .from("anunciantes")
      .select(
        `id, razon_social, nombre_comercial, sector_id, pais_iso2, nit, digito_verificacion,
         municipio_codigo, identificacion_extranjera, ciudad_extranjera, datos_facturacion,
         updated_at, deleted_at, sector:sectores ( nombre )`
      )
      .eq("id", id)
      .maybeSingle()
    if (error) fallar("leer el anunciante para editarlo", error)
    if (!fila || fila.deleted_at) return null
    return {
      id: fila.id,
      razonSocial: fila.razon_social,
      nombreComercial: fila.nombre_comercial,
      sector: {
        id: fila.sector_id,
        nombre: fila.sector?.nombre ?? "Sector actual",
      },
      paisIso2: fila.pais_iso2,
      nit: fila.nit,
      digitoVerificacion: fila.digito_verificacion,
      municipioCodigo: fila.municipio_codigo,
      identificacionExtranjera: fila.identificacion_extranjera,
      ciudadExtranjera: fila.ciudad_extranjera,
      emailFacturacion: correoFacturacionDe(fila.datos_facturacion),
      actualizadoAt: fila.updated_at,
    }
  }
)

/** Tope de personas que lista la pestaña (una empresa rara vez pasa de unas decenas). */
const MAXIMO_USUARIOS = 200

/**
 * Personas vinculadas al anunciante (RLS de `perfiles`: `usuarios.ver`). Las
 * cuentas dadas de baja (`deleted_at`) no se listan; su historial sigue en
 * Usuarios y en Auditoría.
 */
export async function usuariosDelAnunciante(
  anuncianteId: string
): Promise<UsuarioVinculado[]> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("perfiles")
    .select(
      "id, nombre, email, estado, ultimo_acceso_at, created_at, rol:roles!perfiles_rol_id_fkey ( nombre, color )"
    )
    .eq("anunciante_id", anuncianteId)
    .is("deleted_at", null)
    .order("created_at")
    .order("id")
    .limit(MAXIMO_USUARIOS)
  if (error) fallar("leer las personas del anunciante", error)
  return data.map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    email: fila.email,
    estado: fila.estado,
    rol: fila.rol,
    ultimoAccesoAt: fila.ultimo_acceso_at,
    creadoAt: fila.created_at,
  }))
}
