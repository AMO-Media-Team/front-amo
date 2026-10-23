import "server-only"

import { cache } from "react"

import { datosDocumentosAnunciante } from "@/features/documentos-anunciante/queries"
import { catalogosAnunciante } from "@/features/gestion-anunciantes/queries"
import { firmarDescarga } from "@/lib/storage/descargas"
import { crearClienteServidor } from "@/lib/supabase/server"

import { aContacto, leerFacturacion } from "./filas"
import type {
  ContactoEmpresa,
  DatosMiEmpresa,
  EmpresaPropia,
  MiembroEquipo,
} from "./tipos"

/**
 * Lecturas de «Mi empresa» con el cliente del USUARIO (JWT + RLS): la empresa
 * solo ve su fila de `anunciantes` y de `anunciantes_privado`, y de `perfiles`
 * solo a sus compañeros (`miembros_organizacion()`). Un error se lanza y lo
 * recoge el límite de error de la sección.
 */

const clienteSolicitud = cache(crearClienteServidor)

function fallar(operacion: string, error: { code?: string | null }): never {
  throw new Error(`No se pudo ${operacion} (${error.code ?? "sin código"}).`)
}

/** URL firmada del logo como usuario (todo usuario activo lee los logos, §8). */
async function urlLogo(ruta: string | null): Promise<string | null> {
  if (!ruta) return null
  const firmada = await firmarDescarga({
    bucket: "avatares",
    ruta,
    firmante: { como: "usuario", cliente: await clienteSolicitud() },
  })
  // Sin logo visible se muestra el monograma: no es motivo para fallar.
  return firmada.ok ? firmada.datos.url : null
}

/** La empresa de la sesión; `null` si no existe o ya no es visible. */
export const empresaPropia = cache(
  async (anuncianteId: string): Promise<EmpresaPropia | null> => {
    const supabase = await clienteSolicitud()
    const { data: fila, error } = await supabase
      .from("anunciantes")
      .select(
        `id, razon_social, nombre_comercial, sector_id, pais_iso2, nit, digito_verificacion,
         municipio_codigo, identificacion_extranjera, ciudad_extranjera, datos_facturacion,
         estado_verificacion, motivo_estado, enviado_verificacion_at, verificado_at, logo_path,
         updated_at, deleted_at, sector:sectores ( nombre )`
      )
      .eq("id", anuncianteId)
      .maybeSingle()
    if (error) fallar("leer la empresa", error)
    if (!fila || fila.deleted_at) return null
    return {
      id: fila.id,
      razonSocial: fila.razon_social,
      nombreComercial: fila.nombre_comercial,
      sector: {
        id: fila.sector_id,
        nombre: fila.sector?.nombre ?? "Sector actual",
      },
      paisIso2: fila.pais_iso2.trim().toUpperCase(),
      nit: fila.nit,
      digitoVerificacion: fila.digito_verificacion,
      municipioCodigo: fila.municipio_codigo,
      identificacionExtranjera: fila.identificacion_extranjera,
      ciudadExtranjera: fila.ciudad_extranjera,
      facturacion: leerFacturacion(fila.datos_facturacion),
      estado: fila.estado_verificacion,
      motivoEstado: fila.motivo_estado?.trim() || null,
      enviadoVerificacionAt: fila.enviado_verificacion_at,
      verificadoAt: fila.verificado_at,
      actualizadoAt: fila.updated_at,
      logoUrl: await urlLogo(fila.logo_path),
      tieneLogo: fila.logo_path !== null,
    }
  }
)

/** Persona de contacto (`anunciantes_privado`, select propio). */
export const contactoEmpresa = cache(
  async (anuncianteId: string): Promise<ContactoEmpresa> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase
      .from("anunciantes_privado")
      .select(
        "contacto_nombre, contacto_email, contacto_celular, direccion, updated_at"
      )
      .eq("anunciante_id", anuncianteId)
      .maybeSingle()
    if (error) fallar("leer la persona de contacto", error)
    return aContacto(data)
  }
)

/**
 * Todo lo de la página «Mi empresa»: datos, contacto, catálogos del
 * formulario y los documentos (para el avance de la verificación). `null` si
 * la empresa no existe o ya no es visible.
 */
export const datosMiEmpresa = cache(
  async (anuncianteId: string): Promise<DatosMiEmpresa | null> => {
    const [empresa, contacto, catalogos, documentos] = await Promise.all([
      empresaPropia(anuncianteId),
      contactoEmpresa(anuncianteId),
      catalogosAnunciante(),
      datosDocumentosAnunciante(anuncianteId),
    ])
    if (!empresa || !documentos) return null
    return { empresa, contacto, catalogos, documentos }
  }
)

/** Fila de `miembros_organizacion()` (la SRF genera columnas no nulas: se corrige aquí). */
interface FilaMiembro {
  id: string
  nombre: string | null
  email: string
  rol_clave: string | null
  estado: MiembroEquipo["estado"]
  ultimo_acceso_at: string | null
}

/**
 * Compañeros de la empresa de la sesión, incluida la propia persona
 * (`miembros_organizacion()`: filtra por la organización del JWT y omite las
 * cuentas dadas de baja). La ruta del avatar no se usa: las fotos de perfil
 * solo las firma su dueño o quien ve usuarios.
 */
export const miembrosEquipo = cache(async (): Promise<MiembroEquipo[]> => {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase.rpc("miembros_organizacion")
  if (error) fallar("leer tu equipo", error)
  return (data as FilaMiembro[]).map((fila) => ({
    id: fila.id,
    nombre: fila.nombre?.trim() || null,
    email: fila.email,
    rolClave: fila.rol_clave,
    estado: fila.estado,
    ultimoAccesoAt: fila.ultimo_acceso_at,
  }))
})
