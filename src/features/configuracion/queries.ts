import "server-only"

import { cache } from "react"

import {
  condicionesBusqueda,
  patronBusqueda,
} from "@/features/auditoria/filtros-postgrest"
import {
  listarDepartamentos,
  municipiosDeDepartamento,
  obtenerDepartamento,
  obtenerMunicipio,
} from "@/lib/geo/catalogo"
import { normalizarNombreGeo } from "@/lib/geo/normalizar"
import { crearClienteServidor } from "@/lib/supabase/server"
import type { Json } from "@/types/database.types"

import { detalleAnunciante, filtroAnunciantes } from "./busqueda"
import { LIMITE_BUSQUEDA_OBJETIVOS } from "./schemas"

import type {
  DatosCatalogos,
  DatosPrecios,
  DatosTributario,
  ElementoCatalogo,
  EventoHistorial,
  ExcepcionComision,
  MunicipioTerritorio,
  NivelVerificacion,
  ObjetivoComision,
  Parametro,
  Plantilla,
  RequisitosFormato,
  VersionTerminos,
} from "./tipos"
import { leerValor } from "./valores"

/**
 * Consultas de Configuración con el cliente del USUARIO (JWT + RLS): la BD
 * decide qué ve cada quien (`configuracion.ver` para casi todo; tarifas,
 * franjas, formatos y niveles son públicos para usuarios activos). Un error
 * se lanza: lo recoge el límite de error de la sección.
 */

function fallar(operacion: string, error: { code?: string | null }): never {
  throw new Error(`No se pudo ${operacion} (${error.code ?? "sin código"}).`)
}

function comoObjeto(valor: Json | null): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {}
}

function textos(valor: unknown): string[] {
  return Array.isArray(valor)
    ? valor.filter((x): x is string => typeof x === "string")
    : []
}

function enteroONulo(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null
}

/**
 * Tope de filas por respuesta de la API (`max_rows` de PostgREST): pedir más
 * con `.limit()` no trae más. Lo que puede superarlo se ordena para que el
 * recorte caiga en lo menos importante o se pide por páginas.
 */
const FILAS_POR_RESPUESTA = 1000

// ── Parámetros ──────────────────────────────────────────────────────────────

export const listarParametros = cache(async (): Promise<Parametro[]> => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from("configuracion")
    .select(
      "clave, valor, tipo, minimo, maximo, opciones, modulo, descripcion, unidad, es_publica, pendiente_validacion, updated_at"
    )
    .order("clave")
  if (error) fallar("leer los parámetros", error)
  return data.map((fila) => ({
    clave: fila.clave,
    tipo: fila.tipo,
    valor: leerValor(fila.tipo, fila.valor),
    minimo: fila.minimo,
    maximo: fila.maximo,
    opciones: fila.opciones,
    modulo: fila.modulo,
    descripcion: fila.descripcion,
    unidad: fila.unidad,
    esPublica: fila.es_publica,
    pendienteValidacion: fila.pendiente_validacion,
    actualizadoAt: fila.updated_at,
  }))
})

// ── Precios ─────────────────────────────────────────────────────────────────

export function leerRequisitos(json: Json | null): RequisitosFormato {
  const objeto = comoObjeto(json)
  return {
    relacionesAspecto: textos(objeto.relaciones_aspecto),
    mime: textos(objeto.mime),
    duracionMaxS: enteroONulo(objeto.duracion_max_s),
    pesoMaxMb: enteroONulo(objeto.peso_max_mb),
    maxArchivos: enteroONulo(objeto.max_archivos),
  }
}

/** Nombres de quienes crearon registros; la RLS solo deja ver perfiles con `usuarios.ver`. */
async function nombresDePerfiles(
  ids: readonly string[]
): Promise<Map<string, string>> {
  const unicos = [...new Set(ids)]
  if (unicos.length === 0) return new Map()
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from("perfiles")
    .select("id, nombre, email")
    .in("id", unicos.slice(0, 200))
  if (error) return new Map()
  return new Map(data.map((p) => [p.id, p.nombre?.trim() || p.email]))
}

export const datosPrecios = cache(async (): Promise<DatosPrecios> => {
  const supabase = await crearClienteServidor()
  const [franjas, formatos, tarifas] = await Promise.all([
    supabase
      .from("franjas")
      .select(
        "id, clave, nombre, seguidores_min, seguidores_max, orden, activa, updated_at"
      )
      .order("orden"),
    supabase
      .from("formatos")
      .select(
        "id, plataforma, clave, nombre, requisitos, activo, orden, updated_at"
      )
      .order("orden"),
    supabase
      .from("tarifas")
      .select(
        "id, formato_id, plataforma, franja_id, valor_base, vigente_desde, vigente_hasta, pendiente_validacion, creada_por, created_at"
      )
      // Primero las abiertas (sin fin: vigentes y programadas), luego las que
      // terminan más tarde: si el historial supera el tope de la API, lo que
      // se recorta son las versiones finalizadas más antiguas, nunca la
      // tarifa vigente de una celda (la matriz diría «Sin tarifa»).
      .order("vigente_hasta", { ascending: false, nullsFirst: true })
      .order("vigente_desde", { ascending: false })
      .limit(FILAS_POR_RESPUESTA),
  ])
  if (franjas.error) fallar("leer las franjas", franjas.error)
  if (formatos.error) fallar("leer los formatos", formatos.error)
  if (tarifas.error) fallar("leer las tarifas", tarifas.error)

  const autores = await nombresDePerfiles(
    tarifas.data.flatMap((t) => (t.creada_por ? [t.creada_por] : []))
  )

  return {
    franjas: franjas.data.map((f) => ({
      id: f.id,
      clave: f.clave,
      nombre: f.nombre,
      seguidoresMin: f.seguidores_min,
      seguidoresMax: f.seguidores_max,
      orden: f.orden,
      activa: f.activa,
      actualizadoAt: f.updated_at,
    })),
    formatos: formatos.data.map((f) => ({
      id: f.id,
      plataforma: f.plataforma,
      clave: f.clave,
      nombre: f.nombre,
      requisitos: leerRequisitos(f.requisitos),
      activo: f.activo,
      orden: f.orden,
      actualizadoAt: f.updated_at,
    })),
    tarifas: tarifas.data.map((t) => ({
      id: t.id,
      formatoId: t.formato_id,
      plataforma: t.plataforma,
      franjaId: t.franja_id,
      valorBase: t.valor_base,
      vigenteDesde: t.vigente_desde,
      vigenteHasta: t.vigente_hasta,
      pendienteValidacion: t.pendiente_validacion,
      creadaAt: t.created_at,
      creadaPor: t.creada_por ? (autores.get(t.creada_por) ?? null) : null,
    })),
  }
})

// ── Comisiones de excepción ─────────────────────────────────────────────────

type FilaExcepcion = {
  id: string
  porcentaje: number
  vigente_desde: string
  vigente_hasta: string | null
  motivo: string
  created_at: string
  updated_at: string
  anunciante_id: string | null
  campana_id: string | null
  anunciante: { nombre_comercial: string; razon_social: string } | null
  campana: {
    nombre: string
    anunciante: { nombre_comercial: string } | null
  } | null
}

function objetivoDe(fila: FilaExcepcion): ObjetivoComision {
  if (fila.campana_id) {
    return {
      tipo: "campana",
      id: fila.campana_id,
      nombre: fila.campana?.nombre ?? "Campaña no disponible",
      detalle: fila.campana?.anunciante?.nombre_comercial ?? null,
    }
  }
  return {
    tipo: "anunciante",
    id: fila.anunciante_id ?? "",
    nombre: fila.anunciante?.nombre_comercial ?? "Anunciante no disponible",
    detalle:
      fila.anunciante &&
      fila.anunciante.razon_social !== fila.anunciante.nombre_comercial
        ? fila.anunciante.razon_social
        : null,
  }
}

export const listarExcepciones = cache(
  async (): Promise<ExcepcionComision[]> => {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("comisiones_excepcion")
      .select(
        "id, porcentaje, vigente_desde, vigente_hasta, motivo, created_at, updated_at, anunciante_id, campana_id, anunciante:anunciantes ( nombre_comercial, razon_social ), campana:campanas ( nombre, anunciante:anunciantes ( nombre_comercial ) )"
      )
      .order("vigente_desde", { ascending: false })
      .limit(500)
      .overrideTypes<FilaExcepcion[], { merge: false }>()
    if (error) fallar("leer las comisiones de excepción", error)
    return data.map((fila) => ({
      id: fila.id,
      objetivo: objetivoDe(fila),
      porcentaje: fila.porcentaje,
      vigenteDesde: fila.vigente_desde,
      vigenteHasta: fila.vigente_hasta,
      motivo: fila.motivo,
      creadaAt: fila.created_at,
      actualizadoAt: fila.updated_at,
    }))
  }
)

export async function buscarAnunciantes(
  q: string
): Promise<ObjetivoComision[]> {
  const supabase = await crearClienteServidor()
  let consulta = supabase
    .from("anunciantes")
    .select("id, nombre_comercial, razon_social, nit, digito_verificacion")
    .is("deleted_at", null)
    .order("nombre_comercial")
    .limit(LIMITE_BUSQUEDA_OBJETIVOS)
  const filtro = filtroAnunciantes(q)
  if (filtro.nombre && filtro.nit) {
    consulta = consulta.or(
      `nombre_normalizado.ilike.${filtro.nombre},nit.ilike.%${filtro.nit}%`
    )
  } else if (filtro.nombre) {
    consulta = consulta.ilike("nombre_normalizado", filtro.nombre)
  }
  const { data, error } = await consulta
  if (error) fallar("buscar anunciantes", error)
  return data.map((a) => ({
    tipo: "anunciante",
    id: a.id,
    nombre: a.nombre_comercial,
    detalle: detalleAnunciante(a),
  }))
}

export async function buscarCampanas(q: string): Promise<ObjetivoComision[]> {
  const supabase = await crearClienteServidor()
  let consulta = supabase
    .from("campanas")
    .select("id, nombre, marca, anunciante:anunciantes ( nombre_comercial )")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(LIMITE_BUSQUEDA_OBJETIVOS)
  const patron = patronBusqueda(q)
  if (patron) {
    consulta = consulta.or(
      condicionesBusqueda(["nombre", "marca"], patron).join(",")
    )
  }
  const { data, error } = await consulta
  if (error) fallar("buscar campañas", error)
  return data.map((c) => ({
    tipo: "campana",
    id: c.id,
    nombre: c.nombre,
    detalle: c.anunciante?.nombre_comercial ?? c.marca,
  }))
}

// ── Niveles de verificación ─────────────────────────────────────────────────

export const listarNiveles = cache(async (): Promise<NivelVerificacion[]> => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from("niveles_verificacion")
    .select(
      "nivel, nombre, requisitos, documentos_requeridos, tope_anual, porcentaje_alerta, porcentaje_bloqueo, pendiente_validacion, updated_at"
    )
    .order("nivel")
  if (error) fallar("leer los niveles de verificación", error)
  return data.map((n) => ({
    nivel: n.nivel,
    nombre: n.nombre,
    requisitos: n.requisitos,
    documentosRequeridos: n.documentos_requeridos,
    topeAnual: n.tope_anual,
    porcentajeAlerta: n.porcentaje_alerta,
    porcentajeBloqueo: n.porcentaje_bloqueo,
    pendienteValidacion: n.pendiente_validacion,
    actualizadoAt: n.updated_at,
  }))
})

// ── Tributario ──────────────────────────────────────────────────────────────

export const datosTributario = cache(async (): Promise<DatosTributario> => {
  const supabase = await crearClienteServidor()
  const [anios, retenciones, reteica, resoluciones] = await Promise.all([
    supabase
      .from("parametros_tributarios")
      .select(
        "anio, uvt, smlmv, umbral_seg_social_smlmv, pendiente_validacion, updated_at"
      )
      .order("anio", { ascending: false }),
    supabase
      .from("retenciones_config")
      .select(
        "id, tipo, concepto, aplica_declarante, tarifa, base_minima_uvt, vigente_desde, vigente_hasta, pendiente_validacion, updated_at"
      )
      .order("vigente_desde", { ascending: false })
      .limit(500),
    supabase
      .from("reteica_municipal")
      .select(
        "id, municipio_codigo, tarifa_por_mil, base_minima_uvt, vigente_desde, vigente_hasta, pendiente_validacion, updated_at"
      )
      .order("vigente_desde", { ascending: false })
      .limit(FILAS_POR_RESPUESTA),
    supabase
      .from("resoluciones_dian")
      .select(
        "id, tipo, prefijo, numero_resolucion, fecha_resolucion, rango_desde, rango_hasta, consecutivo_actual, vigente_desde, vigente_hasta, activa, updated_at"
      )
      .order("vigente_desde", { ascending: false }),
  ])
  if (anios.error) fallar("leer los parámetros tributarios", anios.error)
  if (retenciones.error) fallar("leer las retenciones", retenciones.error)
  if (reteica.error) fallar("leer las tarifas de ReteICA", reteica.error)
  if (resoluciones.error)
    fallar("leer las resoluciones DIAN", resoluciones.error)

  return {
    anios: anios.data.map((a) => ({
      anio: a.anio,
      uvt: a.uvt,
      smlmv: a.smlmv,
      umbralSegSocialSmlmv: a.umbral_seg_social_smlmv,
      pendienteValidacion: a.pendiente_validacion,
      actualizadoAt: a.updated_at,
    })),
    retenciones: retenciones.data.map((r) => ({
      id: r.id,
      tipo: r.tipo,
      concepto: r.concepto,
      aplicaDeclarante: r.aplica_declarante,
      tarifa: r.tarifa,
      baseMinimaUvt: r.base_minima_uvt,
      vigenteDesde: r.vigente_desde,
      vigenteHasta: r.vigente_hasta,
      pendienteValidacion: r.pendiente_validacion,
      actualizadoAt: r.updated_at,
    })),
    reteica: reteica.data.map((r) => {
      const municipio = obtenerMunicipio(r.municipio_codigo)
      return {
        id: r.id,
        municipioCodigo: r.municipio_codigo,
        municipioNombre: municipio?.nombre ?? r.municipio_codigo,
        departamentoNombre: municipio
          ? (obtenerDepartamento(municipio.departamentoCodigo)?.nombreCorto ??
            null)
          : null,
        tarifaPorMil: r.tarifa_por_mil,
        baseMinimaUvt: r.base_minima_uvt,
        vigenteDesde: r.vigente_desde,
        vigenteHasta: r.vigente_hasta,
        pendienteValidacion: r.pendiente_validacion,
        actualizadoAt: r.updated_at,
      }
    }),
    resoluciones: resoluciones.data.map((r) => ({
      id: r.id,
      tipo: r.tipo,
      prefijo: r.prefijo,
      numeroResolucion: r.numero_resolucion,
      fechaResolucion: r.fecha_resolucion,
      rangoDesde: r.rango_desde,
      rangoHasta: r.rango_hasta,
      consecutivoActual: r.consecutivo_actual,
      vigenteDesde: r.vigente_desde,
      vigenteHasta: r.vigente_hasta,
      activa: r.activa,
      actualizadoAt: r.updated_at,
    })),
  }
})

export interface OpcionMunicipio {
  codigo: string
  nombre: string
  departamento: string
}

/** Búsqueda de municipios en el diccionario DIVIPOLA (sin acentos ni mayúsculas). */
export function buscarMunicipiosPorTexto(
  q: string,
  limite = 12
): OpcionMunicipio[] {
  const texto = normalizarNombreGeo(q)
  if (!texto) return []
  const resultados: (OpcionMunicipio & { puntaje: number })[] = []
  for (const departamento of listarDepartamentos()) {
    for (const municipio of municipiosDeDepartamento(departamento.codigo)) {
      const coincideCodigo = municipio.codigo.startsWith(q.trim())
      const indice = municipio.nombreNormalizado.indexOf(texto)
      if (!coincideCodigo && indice === -1) continue
      resultados.push({
        codigo: municipio.codigo,
        nombre: municipio.nombre,
        departamento: departamento.nombreCorto,
        // Primero los que empiezan por el texto, luego las capitales.
        puntaje:
          (coincideCodigo || indice === 0 ? 0 : 2) +
          (municipio.esCapital ? 0 : 1),
      })
    }
  }
  return resultados
    .sort(
      (a, b) =>
        a.puntaje - b.puntaje || a.nombre.localeCompare(b.nombre, "es-CO")
    )
    .slice(0, limite)
    .map(({ puntaje: _puntaje, ...opcion }) => opcion)
}

// ── Catálogos ───────────────────────────────────────────────────────────────

function aElemento(fila: {
  id: string
  nombre: string
  descripcion: string | null
  orden: number
  activo: boolean
  deleted_at: string | null
  updated_at: string
}): ElementoCatalogo {
  return {
    id: fila.id,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    orden: fila.orden,
    activo: fila.activo,
    archivado: fila.deleted_at !== null,
    actualizadoAt: fila.updated_at,
  }
}

export const datosCatalogos = cache(async (): Promise<DatosCatalogos> => {
  const supabase = await crearClienteServidor()
  const columnas =
    "id, nombre, descripcion, orden, activo, deleted_at, updated_at"
  // Colombia tiene 1.122 municipios: los deshabilitados pueden pasar del tope
  // de filas por respuesta, así que se piden en dos páginas (orden estable).
  const inactivosDesde = (desde: number) =>
    supabase
      .from("municipios")
      .select("departamento_codigo")
      .eq("activo", false)
      .order("codigo")
      .range(desde, desde + FILAS_POR_RESPUESTA - 1)
  const [sectores, categorias, departamentos, inactivos, masInactivos] =
    await Promise.all([
      supabase.from("sectores").select(columnas).order("orden").order("nombre"),
      supabase
        .from("categorias")
        .select(columnas)
        .order("orden")
        .order("nombre"),
      supabase
        .from("departamentos")
        .select("codigo, nombre, region, activo")
        .order("nombre"),
      inactivosDesde(0),
      inactivosDesde(FILAS_POR_RESPUESTA),
    ])
  if (sectores.error) fallar("leer los sectores", sectores.error)
  if (categorias.error) fallar("leer las categorías", categorias.error)
  if (departamentos.error) fallar("leer los departamentos", departamentos.error)
  if (inactivos.error) fallar("leer los municipios", inactivos.error)
  if (masInactivos.error) fallar("leer los municipios", masInactivos.error)

  const inactivosPorDepartamento = new Map<string, number>()
  for (const { departamento_codigo } of [
    ...inactivos.data,
    ...masInactivos.data,
  ]) {
    inactivosPorDepartamento.set(
      departamento_codigo,
      (inactivosPorDepartamento.get(departamento_codigo) ?? 0) + 1
    )
  }

  return {
    sectores: sectores.data.map(aElemento),
    categorias: categorias.data.map(aElemento),
    departamentos: departamentos.data.map((d) => ({
      codigo: d.codigo,
      nombre: d.nombre,
      region: d.region,
      activo: d.activo,
      municipios: municipiosDeDepartamento(d.codigo).length,
      municipiosInactivos: inactivosPorDepartamento.get(d.codigo) ?? 0,
    })),
  }
})

export async function municipiosTerritorio(
  departamento: string
): Promise<MunicipioTerritorio[]> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from("municipios")
    .select("codigo, nombre, tipo, es_capital, activo")
    .eq("departamento_codigo", departamento)
    .order("nombre")
  if (error) fallar("leer los municipios", error)
  return data
    .map((m) => ({
      codigo: m.codigo,
      nombre: m.nombre,
      tipo: m.tipo,
      esCapital: m.es_capital,
      activo: m.activo,
    }))
    .sort(
      (a, b) =>
        Number(b.esCapital) - Number(a.esCapital) ||
        a.nombre.localeCompare(b.nombre, "es-CO")
    )
}

// ── Legal ───────────────────────────────────────────────────────────────────

async function contarAceptaciones(
  ids: readonly string[]
): Promise<Map<string, number>> {
  const supabase = await crearClienteServidor()
  const conteos = await Promise.all(
    ids.map(async (id) => {
      const { count, error } = await supabase
        .from("aceptaciones_terminos")
        .select("id", { count: "exact", head: true })
        .eq("termino_version_id", id)
      return [id, error ? null : (count ?? 0)] as const
    })
  )
  return new Map(
    conteos.filter((c): c is readonly [string, number] => c[1] !== null)
  )
}

/** Versiones sin el contenido (que puede pesar cientos de KB): se lee al abrir una. */
export const listarVersionesTerminos = cache(
  async (contar: boolean): Promise<VersionTerminos[]> => {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("terminos_versiones")
      .select(
        "id, tipo, version, hash_sha256, publicada, vigente_desde, created_at, updated_at"
      )
      .order("created_at", { ascending: false })
      .limit(200)
    if (error) fallar("leer las versiones de términos", error)
    const publicadas = data.filter((v) => v.publicada).map((v) => v.id)
    const aceptaciones = contar
      ? await contarAceptaciones(publicadas.slice(0, 40))
      : new Map<string, number>()
    return data.map((v) => ({
      id: v.id,
      tipo: v.tipo,
      version: v.version,
      contenido: "",
      hash: v.hash_sha256,
      publicada: v.publicada,
      vigenteDesde: v.vigente_desde,
      creadaAt: v.created_at,
      actualizadoAt: v.updated_at,
      aceptaciones:
        contar && v.publicada ? (aceptaciones.get(v.id) ?? 0) : null,
    }))
  }
)

export async function contenidoVersion(id: string): Promise<string | null> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from("terminos_versiones")
    .select("contenido_md")
    .eq("id", id)
    .maybeSingle()
  if (error) fallar("leer la versión", error)
  return data?.contenido_md ?? null
}

// ── Plantillas ──────────────────────────────────────────────────────────────

export const listarPlantillas = cache(async (): Promise<Plantilla[]> => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from("plantillas_notificacion")
    .select(
      "clave, canal, nombre, asunto, cuerpo, variables, activa, updated_at"
    )
    .order("clave")
  if (error) fallar("leer las plantillas", error)
  return data.map((p) => ({
    clave: p.clave,
    canal: p.canal,
    nombre: p.nombre,
    asunto: p.asunto,
    cuerpo: p.cuerpo,
    variables: p.variables,
    activa: p.activa,
    actualizadoAt: p.updated_at,
  }))
})

// ── Historial (bitácora) ────────────────────────────────────────────────────

export const LIMITE_HISTORIAL = 50

export async function historialEntidad(
  entidad: string,
  entidadId: string
): Promise<EventoHistorial[]> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from("bitacora")
    .select("id, created_at, accion, actor_id, actor_email, origen, cambios")
    .eq("entidad", entidad)
    .eq("entidad_id", entidadId)
    .order("id", { ascending: false })
    .limit(LIMITE_HISTORIAL)
  if (error) fallar("leer el historial", error)
  // El nombre de quien hizo el cambio, si la RLS deja verlo; si no, el correo
  // enmascarado que guardó la bitácora.
  const nombres = await nombresDePerfiles(
    data.flatMap((fila) => (fila.actor_id ? [fila.actor_id] : []))
  )
  return data.map((fila) => ({
    id: fila.id,
    at: fila.created_at,
    accion: fila.accion,
    actor:
      (fila.actor_id ? nombres.get(fila.actor_id) : undefined) ??
      fila.actor_email,
    origen: fila.origen,
    cambios: fila.cambios,
  }))
}
