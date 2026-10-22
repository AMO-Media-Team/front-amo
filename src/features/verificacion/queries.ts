import "server-only"

/**
 * Consultas de la verificación (ADM-001, ADM-006). Todo se lee con el cliente
 * del USUARIO (JWT + RLS): la BD decide qué ve cada rol (`medios.verificar`;
 * los documentos, además `datos_sensibles.ver`). Las rutas de Storage se
 * leen aquí solo para deducir el MIME y nunca salen hacia el navegador. Un
 * error de lectura se lanza y lo recoge el límite de error de la sección.
 */
import { cache } from "react"

import {
  clienteSolicitud,
  departamentoJuntoAMunicipio,
  enLotes,
  fallar,
  nombreMunicipio,
} from "@/features/operacion/queries/comun"
import { cuentasDelMedio } from "@/features/operacion/queries/medios"
import type { MedioDetalle } from "@/features/operacion/tipos"
import { mimeDeArchivo } from "@/lib/archivos/mime"
import { serializarFecha } from "@/lib/fechas"
import type { Database } from "@/types/database.types"

import {
  type AccesoColas,
  type Cola,
  paginaAcotada,
  rangoPagina,
} from "./colas"
import { type FilaPertinencia, ordenarPertinencia } from "./pertinencia"
import type { TipoDocumentoMedio } from "./requisitos"
import type { RangoFranja } from "./seguidores"
import type {
  ColaCuentas,
  ColaMedios,
  ContadoresColas,
  CuentaExpediente,
  DocumentoEnCola,
  DocumentoExpediente,
  ExpedienteMedio,
  MedioEnCola,
  NivelExpediente,
  Pagina,
  VerificacionEnCola,
} from "./tipos"

type Tablas = Database["public"]["Tables"]

/** Medios que muestra la sección «aún no envían su perfil». */
const PRIMEROS_SIN_ENVIAR = 8

/** MIME de un objeto por su extensión; la ruta no sale de aquí. */
function mimeDeRuta(ruta: string | null): string | null {
  return ruta ? mimeDeArchivo({ name: ruta, type: "" }) : null
}

/** Día de calendario de Bogotá con que se evalúan las vigencias. */
export function hoyBogota(): string {
  return serializarFecha(new Date())
}

/** La página pedida dentro del total (si ya no existe, la última). */
function paginaDe<T>(
  filas: T[],
  total: number,
  pagina: number
): Pagina<T> {
  return { filas, total, pagina: paginaAcotada(pagina, total) }
}

// ── Contadores ───────────────────────────────────────────────────────────────

async function contarMediosEnviados(): Promise<number> {
  const supabase = await clienteSolicitud()
  const { count, error } = await supabase
    .from("medios")
    .select("id", { count: "exact", head: true })
    .eq("estado", "PENDIENTE")
    .not("enviado_verificacion_at", "is", null)
    .is("deleted_at", null)
  if (error) fallar("contar los medios por verificar", error)
  return count ?? 0
}

async function contarVerificacionesConCaptura(): Promise<number> {
  const supabase = await clienteSolicitud()
  const { count, error } = await supabase
    .from("verificaciones_cuenta")
    .select("id, cuenta:cuentas_sociales!inner ( id )", {
      count: "exact",
      head: true,
    })
    .eq("estado_validacion", "PENDIENTE")
    .not("captura_path", "is", null)
    .is("cuenta.deleted_at", null)
  if (error) fallar("contar las cuentas por verificar", error)
  return count ?? 0
}

async function contarDocumentosPorRevisar(): Promise<number> {
  const supabase = await clienteSolicitud()
  const { count, error } = await supabase
    .from("documentos_medio")
    .select("id, medio:medios!inner ( id )", { count: "exact", head: true })
    .eq("estado_validacion", "PENDIENTE")
    .is("medio.deleted_at", null)
  if (error) fallar("contar los documentos por revisar", error)
  return count ?? 0
}

async function contarSolicitudesPendientes(): Promise<number> {
  const supabase = await clienteSolicitud()
  const { count, error } = await supabase
    .from("solicitudes_vinculacion")
    .select("id", { count: "exact", head: true })
    .eq("estado", "PENDIENTE")
  if (error) fallar("contar las solicitudes de vinculación", error)
  return count ?? 0
}

/** Pendientes de cada cola; `null` en las que la persona no ve. */
export const contadoresColas = cache(
  async (acceso: AccesoColas): Promise<ContadoresColas> => {
    const sinAcceso = Promise.resolve(null)
    const [medios, cuentas, documentos, solicitudes] = await Promise.all([
      acceso.verificarMedios ? contarMediosEnviados() : sinAcceso,
      acceso.verificarMedios ? contarVerificacionesConCaptura() : sinAcceso,
      acceso.verDocumentos ? contarDocumentosPorRevisar() : sinAcceso,
      acceso.verificarMedios ? contarSolicitudesPendientes() : sinAcceso,
    ])
    return { medios, cuentas, documentos, solicitudes } satisfies Record<
      Cola,
      number | null
    >
  }
)

// ── Cola de medios ───────────────────────────────────────────────────────────

interface ActividadMedio {
  documentos: Map<string, number>
  cuentasPorVerificar: Map<string, number>
  cuentasVerificadas: Map<string, number>
}

function sumar(mapa: Map<string, number>, clave: string): void {
  mapa.set(clave, (mapa.get(clave) ?? 0) + 1)
}

/** Documentos y cuentas pendientes de los medios de la página. */
async function actividadDeMedios(
  ids: readonly string[],
  verDocumentos: boolean
): Promise<ActividadMedio> {
  const supabase = await clienteSolicitud()
  const actividad: ActividadMedio = {
    documentos: new Map(),
    cuentasPorVerificar: new Map(),
    cuentasVerificadas: new Map(),
  }
  for (const lote of enLotes(ids)) {
    const [documentos, verificaciones, cuentas] = await Promise.all([
      verDocumentos
        ? supabase
            .from("documentos_medio")
            .select("medio_id")
            .in("medio_id", lote)
            .eq("estado_validacion", "PENDIENTE")
        : null,
      supabase
        .from("verificaciones_cuenta")
        .select("medio_id")
        .in("medio_id", lote)
        .eq("estado_validacion", "PENDIENTE")
        .not("captura_path", "is", null),
      supabase
        .from("cuentas_sociales")
        .select("medio_id")
        .in("medio_id", lote)
        .eq("verificada", true)
        .is("deleted_at", null),
    ])
    if (documentos?.error) fallar("leer los documentos pendientes", documentos.error)
    if (verificaciones.error)
      fallar("leer las verificaciones pendientes", verificaciones.error)
    if (cuentas.error) fallar("leer las cuentas verificadas", cuentas.error)
    for (const fila of documentos?.data ?? [])
      sumar(actividad.documentos, fila.medio_id)
    for (const fila of verificaciones.data)
      sumar(actividad.cuentasPorVerificar, fila.medio_id)
    for (const fila of cuentas.data)
      sumar(actividad.cuentasVerificadas, fila.medio_id)
  }
  return actividad
}

async function mediosSinEnviar(): Promise<ColaMedios["sinEnviar"]> {
  const supabase = await clienteSolicitud()
  const { data, count, error } = await supabase
    .from("medios")
    .select("id, nombre, created_at", { count: "exact" })
    .eq("estado", "PENDIENTE")
    .is("enviado_verificacion_at", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(PRIMEROS_SIN_ENVIAR)
  if (error) fallar("leer los medios sin enviar", error)
  return {
    total: count ?? data.length,
    primeros: data.map((fila) => ({
      id: fila.id,
      nombre: fila.nombre,
      creadoAt: fila.created_at,
    })),
  }
}

/** Medios enviados a verificación, el envío más antiguo primero. */
export async function colaMedios(
  pagina: number,
  { verDocumentos }: Pick<AccesoColas, "verDocumentos">
): Promise<ColaMedios> {
  const supabase = await clienteSolicitud()
  const [desde, hasta] = rangoPagina(pagina)
  const [respuesta, sinEnviar] = await Promise.all([
    supabase
      .from("medios")
      .select(
        "id, nombre, tipo, municipio_codigo, departamento_codigo, enviado_verificacion_at, rechazado_at",
        { count: "exact" }
      )
      .eq("estado", "PENDIENTE")
      .not("enviado_verificacion_at", "is", null)
      .is("deleted_at", null)
      .order("enviado_verificacion_at", { ascending: true })
      .order("id")
      .range(desde, hasta),
    mediosSinEnviar(),
  ])
  // Una página que ya no existe (otro la vació) cae a la última que sí.
  if (respuesta.error?.code === "PGRST103") {
    const total = respuesta.count ?? 0
    return total > 0
      ? colaMedios(paginaAcotada(pagina, total), { verDocumentos })
      : { filas: [], total: 0, pagina: 1, sinEnviar }
  }
  if (respuesta.error) fallar("leer la cola de medios", respuesta.error)

  const filas = respuesta.data
  const actividad = await actividadDeMedios(
    filas.map((fila) => fila.id),
    verDocumentos
  )
  const medios = filas.map(
    (fila): MedioEnCola => ({
      id: fila.id,
      nombre: fila.nombre,
      tipo: fila.tipo,
      municipio: nombreMunicipio(fila.municipio_codigo),
      departamento: departamentoJuntoAMunicipio(fila.departamento_codigo, {
        corto: true,
      }),
      enviadoAt: fila.enviado_verificacion_at as string,
      reenvio: fila.rechazado_at !== null,
      documentosPorRevisar: verDocumentos
        ? (actividad.documentos.get(fila.id) ?? 0)
        : null,
      cuentasPorVerificar: actividad.cuentasPorVerificar.get(fila.id) ?? 0,
      cuentasVerificadas: actividad.cuentasVerificadas.get(fila.id) ?? 0,
    })
  )
  return {
    ...paginaDe(medios, respuesta.count ?? medios.length, pagina),
    sinEnviar,
  }
}

// ── Cola de documentos ───────────────────────────────────────────────────────

/** Documentos por revisar, el más antiguo primero. */
export async function colaDocumentos(
  pagina: number
): Promise<Pagina<DocumentoEnCola>> {
  const supabase = await clienteSolicitud()
  const [desde, hasta] = rangoPagina(pagina)
  const { data, count, error } = await supabase
    .from("documentos_medio")
    .select(
      `id, tipo, archivo_path, created_at,
       medio:medios!inner ( id, nombre, estado, nivel_verificacion, deleted_at )`,
      { count: "exact" }
    )
    .eq("estado_validacion", "PENDIENTE")
    .is("medio.deleted_at", null)
    .order("created_at", { ascending: true })
    .order("id")
    .range(desde, hasta)
  if (error?.code === "PGRST103" && (count ?? 0) > 0) {
    return colaDocumentos(paginaAcotada(pagina, count ?? 0))
  }
  if (error?.code === "PGRST103") return { filas: [], total: 0, pagina: 1 }
  if (error) fallar("leer la cola de documentos", error)
  const filas = data.map(
    (fila): DocumentoEnCola => ({
      id: fila.id,
      tipo: fila.tipo,
      subidoAt: fila.created_at,
      mime: mimeDeRuta(fila.archivo_path) ?? "application/octet-stream",
      medio: {
        id: fila.medio.id,
        nombre: fila.medio.nombre,
        estado: fila.medio.estado,
        nivel: fila.medio.nivel_verificacion,
      },
    })
  )
  return paginaDe(filas, count ?? filas.length, pagina)
}

// ── Cola de cuentas ──────────────────────────────────────────────────────────

const SELECCION_VERIFICACION = `
  id, metodo, seguidores_reportados, captura_path, codigo_expira_at, created_at, updated_at,
  cuenta:cuentas_sociales!inner ( id, plataforma, handle, url, seguidores_verificados,
    fecha_ultima_verificacion, deleted_at ),
  medio:medios!inner ( id, nombre )
`

type FilaVerificacion = Pick<
  Tablas["verificaciones_cuenta"]["Row"],
  | "id"
  | "metodo"
  | "seguidores_reportados"
  | "captura_path"
  | "codigo_expira_at"
  | "created_at"
  | "updated_at"
> & {
  cuenta: Pick<
    Tablas["cuentas_sociales"]["Row"],
    | "id"
    | "plataforma"
    | "handle"
    | "url"
    | "seguidores_verificados"
    | "fecha_ultima_verificacion"
    | "deleted_at"
  >
  medio: Pick<Tablas["medios"]["Row"], "id" | "nombre">
}

function verificacionEnCola(fila: FilaVerificacion): VerificacionEnCola {
  return {
    id: fila.id,
    metodo: fila.metodo,
    seguidoresReportados: fila.seguidores_reportados,
    creadaAt: fila.created_at,
    actualizadaAt: fila.updated_at,
    codigoExpiraAt: fila.codigo_expira_at,
    mimeCaptura: mimeDeRuta(fila.captura_path),
    cuenta: {
      id: fila.cuenta.id,
      plataforma: fila.cuenta.plataforma,
      handle: fila.cuenta.handle,
      url: fila.cuenta.url,
      seguidoresVerificados: fila.cuenta.seguidores_verificados,
      ultimaVerificacionAt: fila.cuenta.fecha_ultima_verificacion,
    },
    medio: { id: fila.medio.id, nombre: fila.medio.nombre },
  }
}

async function contarEsperandoCaptura(): Promise<number> {
  const supabase = await clienteSolicitud()
  const { count, error } = await supabase
    .from("verificaciones_cuenta")
    .select("id, cuenta:cuentas_sociales!inner ( id )", {
      count: "exact",
      head: true,
    })
    .eq("estado_validacion", "PENDIENTE")
    .is("captura_path", null)
    .is("cuenta.deleted_at", null)
  if (error) fallar("contar las verificaciones sin captura", error)
  return count ?? 0
}

/** Verificaciones de cuenta con captura, la solicitud más antigua primero. */
export async function colaCuentas(pagina: number): Promise<ColaCuentas> {
  const supabase = await clienteSolicitud()
  const [desde, hasta] = rangoPagina(pagina)
  const [respuesta, esperandoCaptura] = await Promise.all([
    supabase
      .from("verificaciones_cuenta")
      .select(SELECCION_VERIFICACION, { count: "exact" })
      .eq("estado_validacion", "PENDIENTE")
      .not("captura_path", "is", null)
      .is("cuenta.deleted_at", null)
      .order("created_at", { ascending: true })
      .order("id")
      .range(desde, hasta)
      .overrideTypes<FilaVerificacion[], { merge: false }>(),
    contarEsperandoCaptura(),
  ])
  if (respuesta.error?.code === "PGRST103") {
    const total = respuesta.count ?? 0
    return total > 0
      ? colaCuentas(paginaAcotada(pagina, total))
      : { filas: [], total: 0, pagina: 1, esperandoCaptura }
  }
  if (respuesta.error) fallar("leer la cola de cuentas", respuesta.error)
  const filas = respuesta.data.map(verificacionEnCola)
  return {
    ...paginaDe(filas, respuesta.count ?? filas.length, pagina),
    esperandoCaptura,
  }
}

// ── Catálogos de la decisión ─────────────────────────────────────────────────

export const nivelesConRequisitos = cache(
  async (): Promise<NivelExpediente[]> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase
      .from("niveles_verificacion")
      .select("nivel, nombre, documentos_requeridos, tope_anual")
      .order("nivel")
    if (error) fallar("leer los niveles de verificación", error)
    return data.map((fila) => ({
      nivel: fila.nivel,
      nombre: fila.nombre,
      documentosRequeridos: fila.documentos_requeridos,
      tope: fila.tope_anual,
    }))
  }
)

export const franjasActivas = cache(async (): Promise<RangoFranja[]> => {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("franjas")
    .select("clave, nombre, seguidores_min, seguidores_max, orden")
    .eq("activa", true)
    .order("orden")
  if (error) fallar("leer las franjas", error)
  return data.map((fila) => ({
    clave: fila.clave,
    nombre: fila.nombre,
    minimo: fila.seguidores_min,
    maximo: fila.seguidores_max,
  }))
})

// ── Expediente de un medio (pestaña «Verificación» de la ficha) ──────────────

async function documentosExpediente(
  medioId: string
): Promise<DocumentoExpediente[]> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("documentos_medio")
    .select(
      "id, tipo, metodo, archivo_path, estado_validacion, fecha_vencimiento, observaciones, validado_at, created_at"
    )
    .eq("medio_id", medioId)
    .order("created_at", { ascending: false })
  if (error) fallar("leer los documentos del medio", error)
  return data.map((fila) => ({
    id: fila.id,
    tipo: fila.tipo as TipoDocumentoMedio,
    estado: fila.estado_validacion,
    metodo: fila.metodo === "VIDEOLLAMADA" ? "VIDEOLLAMADA" : "ARCHIVO",
    venceAt: fila.fecha_vencimiento,
    subidoAt: fila.created_at,
    observaciones: fila.observaciones,
    validadoAt: fila.validado_at,
    mime: mimeDeRuta(fila.archivo_path),
  }))
}

async function verificacionesAbiertas(
  medioId: string
): Promise<Map<string, VerificacionEnCola>> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("verificaciones_cuenta")
    .select(SELECCION_VERIFICACION)
    .eq("medio_id", medioId)
    .eq("estado_validacion", "PENDIENTE")
    .overrideTypes<FilaVerificacion[], { merge: false }>()
  if (error) fallar("leer las verificaciones abiertas del medio", error)
  return new Map(
    data.map((fila) => [fila.cuenta.id, verificacionEnCola(fila)] as const)
  )
}

async function datosDeVerificacion(
  medioId: string
): Promise<{ enviadoAt: string | null }> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("medios")
    .select("enviado_verificacion_at")
    .eq("id", medioId)
    .maybeSingle()
  if (error) fallar("leer el envío a verificación", error)
  return { enviadoAt: data?.enviado_verificacion_at ?? null }
}

/**
 * Todo lo que necesita quien verifica un medio: documentos (si puede verlos),
 * cuentas con su verificación abierta, niveles y franjas.
 */
export async function expedienteMedio(
  medio: MedioDetalle,
  { verDocumentos }: { verDocumentos: boolean }
): Promise<ExpedienteMedio> {
  const [documentos, cuentas, abiertas, niveles, franjas, envio] =
    await Promise.all([
      verDocumentos ? documentosExpediente(medio.id) : null,
      cuentasDelMedio(medio.id, { verVerificaciones: false }),
      verificacionesAbiertas(medio.id),
      nivelesConRequisitos(),
      franjasActivas(),
      datosDeVerificacion(medio.id),
    ])
  return {
    medio: {
      id: medio.id,
      nombre: medio.nombre,
      estado: medio.estado,
      nivel: medio.nivel,
      enviadoAt: envio.enviadoAt,
      motivoEstado: medio.motivoEstado,
    },
    documentos,
    cuentas: cuentas.map(
      (cuenta): CuentaExpediente => ({
        id: cuenta.id,
        plataforma: cuenta.plataforma,
        handle: cuenta.handle,
        url: cuenta.url,
        seguidoresVerificados: cuenta.seguidores,
        ultimaVerificacionAt: cuenta.ultimaVerificacionAt,
        verificada: cuenta.verificada,
        vigencia: cuenta.vigencia,
        venceAt: cuenta.venceAt,
        franja: cuenta.franja?.nombre ?? null,
        pendiente: abiertas.get(cuenta.id) ?? null,
      })
    ),
    niveles,
    franjas,
    hoy: hoyBogota(),
  }
}

// ── Pertinencia geográfica ───────────────────────────────────────────────────

/** Municipios clasificados del medio, el multiplicador más alto primero. */
export async function pertinenciaDelMedio(
  medioId: string
): Promise<FilaPertinencia[]> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("medio_pertinencia_geografica")
    .select(
      `municipio_codigo, multiplicador, notas, clasificado_at,
       clasificador:perfiles!medio_pertinencia_geografica_clasificado_por_fkey ( nombre, email )`
    )
    .eq("medio_id", medioId)
  if (error) fallar("leer la pertinencia geográfica", error)
  return ordenarPertinencia(
    data.map((fila) => ({
      municipioCodigo: fila.municipio_codigo,
      municipio:
        nombreMunicipio(fila.municipio_codigo) ?? fila.municipio_codigo,
      departamento: departamentoJuntoAMunicipio(
        fila.municipio_codigo.slice(0, 2)
      ),
      multiplicador: fila.multiplicador,
      notas: fila.notas,
      clasificadoPor:
        fila.clasificador?.nombre ?? fila.clasificador?.email ?? null,
      clasificadoAt: fila.clasificado_at,
    }))
  )
}
