import "server-only"

import { cache } from "react"

import {
  aDepartamento,
  aMunicipio,
  ordenarDepartamentos,
  ordenarMunicipios,
} from "@/features/territorio/presentacion"
import { rolesAsignables } from "@/features/usuarios/queries"
import { tieneAlgunPermiso } from "@/lib/auth/dal"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { envCliente } from "@/lib/env"
import { getEnvServidor } from "@/lib/env.server"
import { obtenerDepartamento, obtenerMunicipio } from "@/lib/geo/catalogo"
import { crearClienteAdmin } from "@/lib/supabase/admin"
import { crearClienteServidor } from "@/lib/supabase/server"
import type { Json } from "@/types/database.types"

import { MENSAJES_VINCULACION } from "./errores"
import { conVigencia } from "./memoria"
import {
  coincidenciasDeMedio,
  type FilaMedio,
  leerCuentasDeclaradas,
  nombreNormalizadoMedio,
  RUTA_FORMULARIO,
} from "./presentacion"
import type {
  CapacidadesCola,
  DatosColaSolicitudes,
  DatosFormularioPublico,
  EstadoSolicitud,
  PoliticaDatos,
  RolMedioAsignable,
  SolicitudVinculacion,
  TerritorioPublico,
  TipoMedioSolicitud,
} from "./tipos"

/**
 * Lecturas de la vinculación de medios (MED-001).
 *
 * - El formulario público no tiene sesión: el territorio activo, la política
 *   de datos publicada y el umbral de seguidores (todo información pública)
 *   se leen con el cliente de servicio y se memorizan unos minutos.
 * - La cola se lee con el cliente del USUARIO: la RLS solo la muestra a
 *   quien tiene `medios.verificar`.
 *
 * Un error se lanza: la página o el límite de error de la sección lo muestran.
 */

function fallar(operacion: string, error: { code?: string | null }): never {
  throw new Error(`No se pudo ${operacion} (${error.code ?? "sin código"}).`)
}

// ── Formulario público ──────────────────────────────────────────────────────

const VIGENCIA_FORMULARIO_MS = 5 * 60_000
/** `max_rows` de PostgREST: el catálogo de municipios se pide por páginas. */
const PAGINA_MUNICIPIOS = 1000
const UMBRAL_POR_DEFECTO = 30_000

type ClienteServicio = Awaited<ReturnType<typeof crearClienteAdmin>>
type ClienteUsuario = Awaited<ReturnType<typeof crearClienteServidor>>

async function territorioActivo(
  admin: ClienteServicio
): Promise<TerritorioPublico> {
  const departamentos = await admin
    .from("departamentos")
    .select("codigo, nombre, nombre_corto, region")
    .eq("activo", true)
  if (departamentos.error) fallar("leer los departamentos", departamentos.error)
  const activos = new Set(departamentos.data.map((d) => d.codigo.trim()))

  const municipios = []
  for (let desde = 0; ; desde += PAGINA_MUNICIPIOS) {
    const pagina = await admin
      .from("municipios")
      .select("codigo, nombre, departamento_codigo, es_capital")
      .eq("activo", true)
      .order("codigo")
      .range(desde, desde + PAGINA_MUNICIPIOS - 1)
    if (pagina.error) fallar("leer los municipios", pagina.error)
    municipios.push(...pagina.data)
    if (pagina.data.length < PAGINA_MUNICIPIOS) break
  }

  // La BD exige municipio Y departamento activos (`crear_solicitud_vinculacion_srv`).
  return {
    departamentos: ordenarDepartamentos(departamentos.data.map(aDepartamento)),
    municipios: ordenarMunicipios(
      municipios
        .map(aMunicipio)
        .filter((municipio) => activos.has(municipio.departamentoCodigo))
    ),
  }
}

async function politicaVigente(
  admin: ClienteServicio
): Promise<PoliticaDatos | null> {
  const { data, error } = await admin
    .from("terminos_versiones")
    .select("version, vigente_desde, contenido_md")
    .eq("tipo", "POLITICA_DATOS")
    .eq("publicada", true)
    .lte("vigente_desde", new Date().toISOString())
    .order("vigente_desde", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) fallar("leer la política de datos", error)
  if (!data?.vigente_desde) return null
  return {
    version: data.version,
    vigenteDesde: data.vigente_desde,
    contenidoMd: data.contenido_md,
  }
}

function comoEntero(valor: Json | undefined, respaldo: number): number {
  const numero = typeof valor === "string" ? Number(valor) : valor
  return typeof numero === "number" && Number.isInteger(numero) && numero > 0
    ? numero
    : respaldo
}

/** `medios.umbral_seguidores` (parámetro público): orienta, no bloquea. */
async function umbralSeguidores(
  cliente: ClienteServicio | ClienteUsuario
): Promise<number> {
  const { data, error } = await cliente
    .from("configuracion")
    .select("valor")
    .eq("clave", "medios.umbral_seguidores")
    .maybeSingle()
  if (error) fallar("leer el umbral de seguidores", error)
  return comoEntero(data?.valor, UMBRAL_POR_DEFECTO)
}

const cargarFormularioPublico = conVigencia(
  async (): Promise<DatosFormularioPublico> => {
    const admin = await crearClienteAdmin()
    const [territorio, politica, umbral] = await Promise.all([
      territorioActivo(admin),
      politicaVigente(admin),
      umbralSeguidores(admin),
    ])
    return { territorio, politica, umbralSeguidores: umbral }
  },
  VIGENCIA_FORMULARIO_MS
)

/** Datos del formulario `/vincular` (públicos; memorizados unos minutos). */
export const datosFormularioPublico = cache(cargarFormularioPublico)

// ── Cola interna ────────────────────────────────────────────────────────────

/** Pendientes que muestra la cola (las más antiguas primero). */
export const LIMITE_PENDIENTES = 100
/** Atendidas recientes que se muestran como referencia. */
export const LIMITE_ATENDIDAS = 20

const COLUMNAS_SOLICITUD = `
  id, estado, nombre_medio, tipo, contacto_nombre, email, celular,
  municipio_codigo, cuentas, mensaje, created_at, resuelta_at, motivo_descarte,
  resolutor:perfiles!solicitudes_vinculacion_resuelta_por_fkey ( nombre ),
  medio:medios!solicitudes_vinculacion_medio_id_fkey ( id, nombre )
`

interface FilaSolicitud {
  id: string
  estado: EstadoSolicitud
  nombre_medio: string
  tipo: TipoMedioSolicitud | null
  contacto_nombre: string
  email: string
  celular: string | null
  municipio_codigo: string
  cuentas: Json
  mensaje: string | null
  created_at: string
  resuelta_at: string | null
  motivo_descarte: string | null
  resolutor: { nombre: string | null } | null
  medio: { id: string; nombre: string } | null
}

/** «Pasto, Nariño»; el código si ya no está en el catálogo. */
function ubicacionDe(codigo: string): string {
  const municipio = obtenerMunicipio(codigo.trim())
  if (!municipio) return `Municipio ${codigo}`
  const departamento = obtenerDepartamento(municipio.departamentoCodigo)
  return departamento
    ? `${municipio.nombre}, ${departamento.nombreCorto}`
    : municipio.nombre
}

function aSolicitud(fila: FilaSolicitud): SolicitudVinculacion {
  const municipioCodigo = fila.municipio_codigo.trim()
  return {
    id: fila.id,
    estado: fila.estado,
    nombreMedio: fila.nombre_medio,
    tipo: fila.tipo,
    contactoNombre: fila.contacto_nombre,
    email: fila.email,
    celular: fila.celular,
    municipioCodigo,
    ubicacion: ubicacionDe(municipioCodigo),
    cuentas: leerCuentasDeclaradas(fila.cuentas),
    mensaje: fila.mensaje,
    recibidaAt: fila.created_at,
    resolucion: fila.resuelta_at
      ? {
          at: fila.resuelta_at,
          por: fila.resolutor?.nombre ?? null,
          motivo: fila.motivo_descarte,
          medio: fila.medio,
        }
      : null,
    coincidencias: [],
  }
}

/**
 * Medios ya registrados con el nombre de alguna solicitud pendiente (RLS:
 * quien no ve medios no recibe coincidencias, y la invitación sigue
 * funcionando con un medio nuevo).
 */
async function mediosConNombres(
  supabase: ClienteUsuario,
  nombres: readonly string[]
): Promise<FilaMedio[]> {
  const normalizados = [...new Set(nombres.map(nombreNormalizadoMedio))].filter(
    Boolean
  )
  if (normalizados.length === 0) return []
  const { data, error } = await supabase
    .from("medios")
    .select("id, nombre, estado, municipio_codigo, created_at")
    .in("nombre_normalizado", normalizados)
    .is("deleted_at", null)
    .limit(200)
  if (error) fallar("buscar medios con el mismo nombre", error)
  return data.map((medio) => ({
    id: medio.id,
    nombre: medio.nombre,
    estado: medio.estado,
    municipioCodigo: medio.municipio_codigo.trim(),
    municipio: ubicacionDe(medio.municipio_codigo),
    creadoAt: medio.created_at,
  }))
}

async function capacidadesDe(usuario: UsuarioSesion): Promise<{
  capacidades: CapacidadesCola
  roles: RolMedioAsignable[]
}> {
  const registrarMedio = tieneAlgunPermiso(usuario, ["medios.editar"])
  if (!tieneAlgunPermiso(usuario, ["usuarios.invitar"])) {
    return {
      capacidades: {
        invitar: false,
        registrarMedio,
        motivoSinInvitar: MENSAJES_VINCULACION.sinPermisoInvitar,
      },
      roles: [],
    }
  }
  const roles = (await rolesAsignables())
    .filter((rol) => rol.tipo === "MEDIO")
    .map((rol) => ({ id: rol.id, nombre: rol.nombre }))
  return {
    capacidades: {
      invitar: roles.length > 0,
      registrarMedio,
      motivoSinInvitar:
        roles.length > 0 ? null : MENSAJES_VINCULACION.sinRolMedio,
    },
    roles,
  }
}

/**
 * Todo lo que necesita la cola: pendientes (las más antiguas primero, con
 * los medios de igual nombre), atendidas recientes y qué puede hacer quien
 * la abre. Quien la llama ya autorizó con el DAL.
 */
export async function colaSolicitudes(
  usuario: UsuarioSesion
): Promise<DatosColaSolicitudes> {
  const supabase = await crearClienteServidor()
  const [pendientes, atendidas, total, permisos, umbral] = await Promise.all([
    supabase
      .from("solicitudes_vinculacion")
      .select(COLUMNAS_SOLICITUD)
      .eq("estado", "PENDIENTE")
      .order("created_at", { ascending: true })
      .limit(LIMITE_PENDIENTES)
      .overrideTypes<FilaSolicitud[], { merge: false }>(),
    supabase
      .from("solicitudes_vinculacion")
      .select(COLUMNAS_SOLICITUD)
      .neq("estado", "PENDIENTE")
      .order("resuelta_at", { ascending: false })
      .limit(LIMITE_ATENDIDAS)
      .overrideTypes<FilaSolicitud[], { merge: false }>(),
    supabase
      .from("solicitudes_vinculacion")
      .select("id", { count: "exact", head: true })
      .eq("estado", "PENDIENTE"),
    capacidadesDe(usuario),
    umbralSeguidores(supabase),
  ])
  if (pendientes.error)
    fallar("leer las solicitudes pendientes", pendientes.error)
  if (atendidas.error) fallar("leer las solicitudes atendidas", atendidas.error)
  if (total.error) fallar("contar las solicitudes pendientes", total.error)

  const porAtender = pendientes.data.map(aSolicitud)
  const medios = await mediosConNombres(
    supabase,
    porAtender.map((solicitud) => solicitud.nombreMedio)
  )

  return {
    pendientes: porAtender.map((solicitud) => ({
      ...solicitud,
      coincidencias: coincidenciasDeMedio(solicitud, medios),
    })),
    atendidas: atendidas.data.map(aSolicitud),
    totalPendientes: total.count ?? porAtender.length,
    capacidades: permisos.capacidades,
    roles: permisos.roles,
    smtpConfigurado: getEnvServidor().AMO_SMTP_CONFIGURADO,
    umbralSeguidores: umbral,
    urlFormulario: `${envCliente.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "")}${RUTA_FORMULARIO}`,
  }
}
