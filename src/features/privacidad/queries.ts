import "server-only"

/**
 * Consultas de los derechos del titular (CTA-007), con el cliente del USUARIO
 * (JWT + RLS): el titular lee sus solicitudes y sus aceptaciones; quien tiene
 * `privacidad.gestionar` lee todas las solicitudes, y la bitácora si además
 * tiene `auditoria.ver`. Un error de lectura se lanza y lo recoge el límite
 * de error de la sección. Las rutas de Storage (`evidencia_path`) se quedan en
 * el servidor: a la interfaz solo llega si hay soporte.
 */
import { cache } from "react"

import type { TipoTerminos } from "@/lib/auth/compuertas"
import {
  clienteSolicitud,
  fallar,
  leerPagina,
  SIN_COINCIDENCIAS,
} from "@/features/operacion/queries/comun"
import { patronLiteral } from "@/features/operacion/formato"
import type { Json } from "@/types/database.types"

import {
  COLUMNA_ORDEN,
  type EstadoTablaSolicitudes,
  filtroVencimiento,
  radicadoBuscado,
} from "./bandeja"
import { construirLineaTiempo, type RegistroBitacora } from "./linea-tiempo"
import {
  ESTADOS_ABIERTOS,
  ESTADOS_CON_PLAZO,
  enmascararIp,
  esReclamo,
  type Semaforo,
  SEMAFOROS,
} from "./presentacion"
import { leerResultadoSupresion } from "./supresion"
import {
  type AutorizacionPropia,
  DATOS_AFECTADOS,
  type DatoAfectado,
  type DecisionSolicitud,
  type EstadoSolicitud,
  type PaginaSolicitudes,
  type RolTitular,
  type SolicitudBase,
  type SolicitudFila,
  type SolicitudInterna,
  type SolicitudPropia,
  TIPOS_SOLICITUD,
  type TipoSolicitud,
} from "./tipos"

// ── Filas ────────────────────────────────────────────────────────────────────

const COLUMNAS_BASE =
  "id, numero, tipo, estado, descripcion, datos_afectados, recibida_at, plazo_vence, alerta_desde, en_tramite_at, requerimiento, requerida_at, informacion_aportada, informacion_at, prorroga_motivo, prorrogada_at, decision, respuesta, respondida_at, evidencia_path, desistida_at, supresion_ejecutada_at"

interface FilaBaseBd {
  id: string
  numero: number
  tipo: TipoSolicitud
  estado: EstadoSolicitud
  descripcion: string
  datos_afectados: string[]
  recibida_at: string
  plazo_vence: string
  alerta_desde: string
  en_tramite_at: string | null
  requerimiento: string | null
  requerida_at: string | null
  informacion_aportada: string | null
  informacion_at: string | null
  prorroga_motivo: string | null
  prorrogada_at: string | null
  decision: DecisionSolicitud | null
  respuesta: string | null
  respondida_at: string | null
  evidencia_path: string | null
  desistida_at: string | null
  supresion_ejecutada_at: string | null
}

const DATOS_CONOCIDOS = new Set<string>(DATOS_AFECTADOS)

function datosAfectados(valores: readonly string[]): DatoAfectado[] {
  return DATOS_AFECTADOS.filter(
    (dato) => valores.includes(dato) && DATOS_CONOCIDOS.has(dato)
  )
}

function aBase(fila: FilaBaseBd): SolicitudBase {
  return {
    id: fila.id,
    numero: fila.numero,
    tipo: fila.tipo,
    estado: fila.estado,
    descripcion: fila.descripcion,
    datosAfectados: datosAfectados(fila.datos_afectados),
    recibidaAt: fila.recibida_at,
    plazoVence: fila.plazo_vence,
    alertaDesde: fila.alerta_desde,
    enTramiteAt: fila.en_tramite_at,
    requerimiento: fila.requerimiento,
    requeridaAt: fila.requerida_at,
    informacionAportada: fila.informacion_aportada,
    informacionAt: fila.informacion_at,
    prorrogaMotivo: fila.prorroga_motivo,
    prorrogadaAt: fila.prorrogada_at,
    decision: fila.decision,
    respuesta: fila.respuesta,
    respondidaAt: fila.respondida_at,
    tieneSoporte: fila.evidencia_path !== null,
    desistidaAt: fila.desistida_at,
    supresionEjecutadaAt: fila.supresion_ejecutada_at,
  }
}

// ── El titular ───────────────────────────────────────────────────────────────

/** Máximo de solicitudes propias en pantalla (una abierta por tipo; el resto, historia). */
const LIMITE_PROPIAS = 50

/** Las solicitudes del titular en sesión, la más reciente primero. */
export const misSolicitudes = cache(
  async (usuarioId: string): Promise<SolicitudPropia[]> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase
      .from("solicitudes_titular")
      .select(COLUMNAS_BASE)
      .eq("perfil_id", usuarioId)
      .order("recibida_at", { ascending: false })
      .order("id")
      .limit(LIMITE_PROPIAS)
      .overrideTypes<FilaBaseBd[], { merge: false }>()
    if (error) fallar("leer tus solicitudes", error)
    return data.map(aBase)
  }
)

interface FilaAceptacionBd {
  id: number
  aceptada_at: string
  ip: unknown
  version: {
    tipo: TipoTerminos
    version: string
    contenido_md: string | null
  } | null
}

/**
 * Las autorizaciones que aceptó el titular (AUT-012), la más reciente
 * primero, con el texto de esa versión. La IP se enmascara aquí con la misma
 * regla de `datos_titular()`: leerlas con esa función dejaría un `EXPORTAR`
 * en la bitácora cada vez que se abre la página.
 */
export const misAutorizaciones = cache(
  async (usuarioId: string): Promise<AutorizacionPropia[]> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase
      .from("aceptaciones_terminos")
      .select(
        "id, aceptada_at, ip, version:terminos_versiones ( tipo, version, contenido_md )"
      )
      .eq("perfil_id", usuarioId)
      .order("aceptada_at", { ascending: false })
      .order("id", { ascending: false })
      .overrideTypes<FilaAceptacionBd[], { merge: false }>()
    if (error) fallar("leer tus autorizaciones", error)
    return data.flatMap((fila) =>
      fila.version
        ? [
            {
              id: fila.id,
              tipo: fila.version.tipo,
              version: fila.version.version,
              aceptadaAt: fila.aceptada_at,
              ip: enmascararIp(typeof fila.ip === "string" ? fila.ip : null),
              textoMd: fila.version.contenido_md,
            },
          ]
        : []
    )
  }
)

// ── Bandeja del equipo ───────────────────────────────────────────────────────

const SELECCION_BANDEJA = `
  id, numero, tipo, estado, rol_tipo, recibida_at, plazo_vence, alerta_desde, prorrogada_at,
  titular:perfiles!solicitudes_titular_perfil_id_fkey ( nombre, email ),
  medio:medios ( nombre ),
  anunciante:anunciantes ( nombre_comercial, razon_social )`

interface FilaBandejaBd {
  id: string
  numero: number
  tipo: TipoSolicitud
  estado: EstadoSolicitud
  rol_tipo: RolTitular
  recibida_at: string
  plazo_vence: string
  alerta_desde: string
  prorrogada_at: string | null
  titular: { nombre: string | null; email: string } | null
  medio: { nombre: string } | null
  anunciante: {
    nombre_comercial: string | null
    razon_social: string | null
  } | null
}

function nombreEmpresa(anunciante: FilaBandejaBd["anunciante"]): string | null {
  return anunciante?.nombre_comercial ?? anunciante?.razon_social ?? null
}

function aFila(fila: FilaBandejaBd): SolicitudFila {
  return {
    id: fila.id,
    numero: fila.numero,
    tipo: fila.tipo,
    estado: fila.estado,
    rolTipo: fila.rol_tipo,
    recibidaAt: fila.recibida_at,
    plazoVence: fila.plazo_vence,
    alertaDesde: fila.alerta_desde,
    prorrogada: fila.prorrogada_at !== null,
    titular: fila.titular?.nombre ?? null,
    correo: fila.titular?.email ?? null,
    organizacion: fila.medio?.nombre ?? nombreEmpresa(fila.anunciante),
  }
}

/** Máximo de personas que la búsqueda por nombre o correo traduce a ids. */
const LIMITE_COINCIDENCIAS = 100

/**
 * La búsqueda: un radicado («41», «N.º 41») o el nombre o el correo del
 * titular. `null` sin búsqueda; una lista vacía, sin coincidencias.
 */
async function resolverBusqueda(
  texto: string
): Promise<{ numero: number } | { perfiles: string[] } | null> {
  if (!texto.trim()) return null
  const numero = radicadoBuscado(texto)
  if (numero !== null) return { numero }
  const literal = patronLiteral(texto)
  if (!literal) return null
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("perfiles")
    .select("id")
    .or(`nombre.ilike.${literal},email.ilike.${literal}`)
    .limit(LIMITE_COINCIDENCIAS)
  if (error) fallar("buscar titulares", error)
  return { perfiles: data.map((fila) => fila.id) }
}

/**
 * Estados que filtra la vista: con semáforo, solo los que tienen plazo
 * corriendo. `null` si la combinación no deja ninguno (p. ej. «Respondida» y
 * «Vencida»): la lista queda vacía sin consultar.
 */
function estadosFiltrados(
  estado: EstadoTablaSolicitudes
): readonly EstadoSolicitud[] | null {
  if (estado.vence.length === 0) return estado.estado
  const elegidos = estado.estado.length > 0 ? estado.estado : ESTADOS_CON_PLAZO
  const conPlazo = elegidos.filter((valor) => ESTADOS_CON_PLAZO.includes(valor))
  return conPlazo.length > 0 ? conPlazo : null
}

/**
 * Una página de la bandeja con los filtros de la URL. Por defecto, las
 * abiertas primero (el orden del enum) y, en cada estado, la que vence antes.
 */
export async function listarSolicitudes(
  estado: EstadoTablaSolicitudes,
  hoy: string
): Promise<PaginaSolicitudes> {
  const supabase = await clienteSolicitud()
  const busqueda = await resolverBusqueda(estado.q)
  const estados = estadosFiltrados(estado)
  if (!estados) return { total: 0, filas: [] }
  const vence = filtroVencimiento(estado.vence, hoy)
  const { campo, descendente } = estado.orden

  const pagina = await leerPagina(
    "listar las solicitudes de titulares",
    estado.pagina,
    estado.tamano,
    (desde, hasta) => {
      let consulta = supabase
        .from("solicitudes_titular")
        .select(SELECCION_BANDEJA, { count: "exact" })
      if (estados.length > 0) consulta = consulta.in("estado", [...estados])
      if (estado.tipo.length > 0) consulta = consulta.in("tipo", estado.tipo)
      if (vence) consulta = consulta.or(vence)
      if (busqueda && "numero" in busqueda) {
        consulta = consulta.eq("numero", busqueda.numero)
      } else if (busqueda) {
        consulta = consulta.in(
          "perfil_id",
          busqueda.perfiles.length > 0 ? busqueda.perfiles : SIN_COINCIDENCIAS
        )
      }
      consulta = consulta.order(COLUMNA_ORDEN[campo], {
        ascending: !descendente,
        nullsFirst: false,
      })
      // En un mismo estado, la que vence antes; luego, la más antigua.
      if (campo !== "vence") {
        consulta = consulta.order("plazo_vence", { ascending: true })
      }
      return consulta
        .order("numero", { ascending: true })
        .range(desde, hasta)
        .overrideTypes<FilaBandejaBd[], { merge: false }>()
    }
  )
  return { total: pagina.total, filas: pagina.filas.map(aFila) }
}

export type ResumenPlazos = Record<Semaforo | "esperando", number>

/**
 * Cuántas solicitudes hay en cada punto del semáforo (Radicadas y En
 * trámite) y cuántas esperan al titular. Para el resumen de la bandeja.
 */
export async function resumenPlazos(hoy: string): Promise<ResumenPlazos> {
  const supabase = await clienteSolicitud()
  const contar = async (filtro: string | null, estados: readonly string[]) => {
    let consulta = supabase
      .from("solicitudes_titular")
      .select("id", { count: "exact", head: true })
      .in("estado", [...estados] as EstadoSolicitud[])
    if (filtro) consulta = consulta.or(filtro)
    const { count, error } = await consulta
    if (error) fallar("contar las solicitudes de titulares", error)
    return count ?? 0
  }
  const [conteos, esperando] = await Promise.all([
    Promise.all(
      SEMAFOROS.map(async (semaforo) => {
        const filtro = filtroVencimiento([semaforo], hoy)
        return [semaforo, await contar(filtro, ESTADOS_CON_PLAZO)] as const
      })
    ),
    contar(null, ["REQUIERE_INFORMACION"]),
  ])
  return {
    ...(Object.fromEntries(conteos) as Record<Semaforo, number>),
    esperando,
  }
}

// ── Ficha interna ────────────────────────────────────────────────────────────

const SELECCION_FICHA = `${COLUMNAS_BASE},
  perfil_id, rol_tipo, medio_id, anunciante_id, supresion_resultado,
  titular:perfiles!solicitudes_titular_perfil_id_fkey ( nombre, email, rol:roles ( nombre ) ),
  tramitador:perfiles!solicitudes_titular_tramitada_por_fkey ( nombre ),
  respondedor:perfiles!solicitudes_titular_respondida_por_fkey ( nombre ),
  medio:medios ( id, nombre ),
  anunciante:anunciantes ( id, nombre_comercial, razon_social )`

interface FilaFichaBd extends FilaBaseBd {
  perfil_id: string | null
  rol_tipo: RolTitular
  medio_id: string | null
  anunciante_id: string | null
  supresion_resultado: Json | null
  titular: {
    nombre: string | null
    email: string
    rol: { nombre: string } | null
  } | null
  tramitador: { nombre: string | null } | null
  respondedor: { nombre: string | null } | null
  medio: { id: string; nombre: string } | null
  anunciante: {
    id: string
    nombre_comercial: string | null
    razon_social: string | null
  } | null
}

interface FilaBitacoraBd {
  id: number
  created_at: string
  accion: string
  estado_anterior: string | null
  estado_nuevo: string | null
  actor_id: string | null
  actor_email: string | null
  actor_rol: string | null
  cambios: Json | null
}

/** Bitácora de la solicitud (vacía sin `auditoria.ver`: la RLS no la entrega). */
async function bitacoraDeSolicitud(id: string): Promise<RegistroBitacora[]> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("bitacora")
    .select(
      "id, created_at, accion, estado_anterior, estado_nuevo, actor_id, actor_email, actor_rol, cambios"
    )
    .eq("entidad", "solicitudes_titular")
    .eq("entidad_id", id)
    .order("id", { ascending: true })
    .limit(200)
    .overrideTypes<FilaBitacoraBd[], { merge: false }>()
  if (error) fallar("leer la bitácora de la solicitud", error)
  return data.map((fila) => ({
    id: fila.id,
    at: fila.created_at,
    accion: fila.accion,
    estadoAnterior: fila.estado_anterior,
    estadoNuevo: fila.estado_nuevo,
    actorId: fila.actor_id,
    actorEmail: fila.actor_email,
    actorRol: fila.actor_rol,
    cambios: fila.cambios,
  }))
}

/** La solicitud completa para la ficha del equipo; `null` si no existe o no se ve. */
export const obtenerSolicitudInterna = cache(
  async (id: string): Promise<SolicitudInterna | null> => {
    const supabase = await clienteSolicitud()
    const [{ data, error }, registros] = await Promise.all([
      supabase
        .from("solicitudes_titular")
        .select(SELECCION_FICHA)
        .eq("id", id)
        .maybeSingle()
        .overrideTypes<FilaFichaBd | null, { merge: false }>(),
      bitacoraDeSolicitud(id),
    ])
    if (error) fallar("leer la solicitud", error)
    if (!data) return null
    const base = aBase(data)
    return {
      ...base,
      titular: {
        perfilId: data.perfil_id,
        nombre: data.titular?.nombre ?? null,
        correo: data.titular?.email ?? null,
        rol: data.titular?.rol?.nombre ?? null,
        rolTipo: data.rol_tipo,
        medio: data.medio
          ? { id: data.medio.id, nombre: data.medio.nombre }
          : data.medio_id
            ? { id: data.medio_id, nombre: "Medio" }
            : null,
        anunciante: data.anunciante
          ? {
              id: data.anunciante.id,
              nombre: nombreEmpresa(data.anunciante) ?? "Empresa",
            }
          : data.anunciante_id
            ? { id: data.anunciante_id, nombre: "Empresa" }
            : null,
      },
      tramitadaPor: data.tramitador?.nombre ?? null,
      respondidaPor: data.respondedor?.nombre ?? null,
      supresionResultado: leerResultadoSupresion(data.supresion_resultado),
      lineaTiempo: construirLineaTiempo(base, registros),
    }
  }
)

/**
 * Datos mínimos de una solicitud para las acciones: el titular, el estado, el
 * número y el soporte (la ruta no sale del servidor). Con la sesión: el
 * titular solo ve las suyas; el equipo, todas.
 */
export interface SolicitudParaAccion {
  id: string
  numero: number
  tipo: TipoSolicitud
  estado: EstadoSolicitud
  perfilId: string | null
  evidenciaPath: string | null
}

export async function solicitudParaAccion(
  id: string
): Promise<SolicitudParaAccion | null> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("solicitudes_titular")
    .select("id, numero, tipo, estado, perfil_id, evidencia_path")
    .eq("id", id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: data.id,
    numero: data.numero,
    tipo: data.tipo,
    estado: data.estado,
    perfilId: data.perfil_id,
    evidenciaPath: data.evidencia_path,
  }
}

// ── Reclamo en trámite ───────────────────────────────────────────────────────

export interface FiltroReclamo {
  medioId?: string | null
  anuncianteId?: string | null
  perfilId?: string | null
}

const RECLAMOS = TIPOS_SOLICITUD.filter((tipo) => esReclamo(tipo))

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * ¿Hay un reclamo abierto (art. 15) del medio, la empresa o la persona? Para
 * la leyenda «Reclamo en trámite» de sus fichas. Sin filtros, `false`.
 */
export async function hayReclamoEnTramite(
  filtro: FiltroReclamo
): Promise<boolean> {
  const condiciones = (
    [
      ["medio_id", filtro.medioId],
      ["anunciante_id", filtro.anuncianteId],
      ["perfil_id", filtro.perfilId],
    ] as const
  ).flatMap(([columna, valor]) =>
    valor && UUID.test(valor) ? [`${columna}.eq.${valor}`] : []
  )
  if (condiciones.length === 0) return false
  const supabase = await clienteSolicitud()
  const { count, error } = await supabase
    .from("solicitudes_titular")
    .select("id", { count: "exact", head: true })
    .in("estado", [...ESTADOS_ABIERTOS])
    .in("tipo", RECLAMOS)
    .or(condiciones.join(","))
  if (error) fallar("comprobar los reclamos en trámite", error)
  return (count ?? 0) > 0
}
