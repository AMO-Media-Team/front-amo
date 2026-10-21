import "server-only"

import { cache } from "react"

import type { Database } from "@/types/database.types"

import { vigenciaVerificacion } from "../calculos"
import {
  ESTADOS_CUMPLIDOS,
  FUENTES_AUDIENCIA,
  METODOS_VERIFICACION,
  ORDEN_PLATAFORMAS,
  TIPOS_DOCUMENTO_MEDIO,
} from "../estados"
import type { EstadoTablaMedios } from "../estado-tablas"
import { normalizarBusqueda, patronContiene } from "../formato"
import type {
  AudienciaPais,
  CuentaCompacta,
  CuentaSocialDetalle,
  DocumentoMetadatos,
  MedioDetalle,
  MedioFila,
  PaginaFilas,
  PertinenciaGeografica,
  ResumenMedios,
  TopeAnual,
  VerificacionCuenta,
} from "../tipos"
import {
  catalogos,
  clienteSolicitud,
  configuracionOperacion,
  departamentoJuntoAMunicipio,
  enLotes,
  fallar,
  leerPagina,
  leerTodo,
  nombreMunicipio,
  nombrePais,
  SIN_COINCIDENCIAS,
} from "./comun"

type Tablas = Database["public"]["Tables"]
type FilaMedioBd = Pick<
  Tablas["medios"]["Row"],
  | "id"
  | "nombre"
  | "tipo"
  | "estado"
  | "nivel_verificacion"
  | "municipio_codigo"
  | "departamento_codigo"
  | "tasa_cumplimiento"
  | "n_cumplimiento"
  | "calificacion_promedio"
  | "created_at"
> & {
  cuentas: Pick<
    Tablas["cuentas_sociales"]["Row"],
    | "id"
    | "plataforma"
    | "handle"
    | "seguidores_verificados"
    | "verificada"
    | "franja_id"
  >[]
}

const SELECCION_LISTADO = `
  id, nombre, tipo, estado, nivel_verificacion, municipio_codigo, departamento_codigo,
  tasa_cumplimiento, n_cumplimiento, calificacion_promedio, created_at,
  cuentas:cuentas_sociales ( id, plataforma, handle, seguidores_verificados, verificada, franja_id, deleted_at )
`

const COLUMNAS_ORDEN: Readonly<
  Record<EstadoTablaMedios["orden"]["campo"], string>
> = {
  nombre: "nombre",
  estado: "estado",
  nivel: "nivel_verificacion",
  cumplimiento: "tasa_cumplimiento",
  calificacion: "calificacion_promedio",
  creado: "created_at",
}

/** Las uniones `!inner` solo se agregan cuando filtran: sin ellas no excluyen medios. */
function seleccionListado(estado: EstadoTablaMedios): string {
  const partes = [SELECCION_LISTADO]
  if (estado.plataforma.length > 0) {
    partes.push("con_plataforma:cuentas_sociales!inner ( id )")
  }
  if (estado.categoria.length > 0) {
    partes.push("con_categoria:medio_categorias!inner ( categoria_id )")
  }
  return partes.join(", ")
}

/** Ids de los medios en riesgo de abandono (activos en 90 d sin aceptar en 30 d). */
async function idsEnRiesgo(): Promise<string[]> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase.rpc("medios_en_riesgo", {
    p_limite: 1000,
  })
  // Sin `inicio.admin` la señal no está disponible: el filtro no devuelve medios.
  if (error?.message === "AMO_NO_AUTORIZADO") return []
  if (error) fallar("calcular los medios en riesgo", error)
  return data.map((fila) => fila.medio_id)
}

function cuentasCompactas(
  cuentas: FilaMedioBd["cuentas"],
  franjas: ReadonlyMap<string, { clave: string }>
): CuentaCompacta[] {
  return cuentas
    .map((cuenta) => ({
      id: cuenta.id,
      plataforma: cuenta.plataforma,
      handle: cuenta.handle,
      seguidores: cuenta.seguidores_verificados,
      franja: cuenta.franja_id
        ? (franjas.get(cuenta.franja_id)?.clave ?? null)
        : null,
      verificada: cuenta.verificada,
    }))
    .sort(
      (a, b) =>
        ORDEN_PLATAFORMAS.indexOf(a.plataforma) -
          ORDEN_PLATAFORMAS.indexOf(b.plataforma) ||
        (b.seguidores ?? 0) - (a.seguidores ?? 0)
    )
}

/** GMV verificado histórico por medio (asignaciones cumplidas). */
async function gmvVerificadoPorMedio(
  ids: readonly string[]
): Promise<Map<string, number>> {
  const supabase = await clienteSolicitud()
  const gmv = new Map<string, number>()
  for (const lote of enLotes(ids)) {
    const filas = await leerTodo(
      "calcular el GMV de los medios",
      (desde, hasta) =>
        supabase
          .from("asignaciones")
          .select("id, medio_id, monto_bruto")
          .in("medio_id", lote)
          .in("estado", [...ESTADOS_CUMPLIDOS])
          .order("id")
          .range(desde, hasta)
    )
    for (const fila of filas) {
      gmv.set(
        fila.medio_id,
        (gmv.get(fila.medio_id) ?? 0) + (fila.monto_bruto ?? 0)
      )
    }
  }
  return gmv
}

/**
 * Una página del listado de medios según la URL. El GMV se calcula solo para
 * la página (no existe una RPC de listado con agregados; ver pendientes).
 */
export async function listarMedios(
  estado: EstadoTablaMedios,
  { verAsignaciones }: { verAsignaciones: boolean }
): Promise<PaginaFilas<MedioFila>> {
  const supabase = await clienteSolicitud()
  const [{ franjas }, enRiesgo] = await Promise.all([
    catalogos(),
    estado.segmento.includes("en_riesgo") ? idsEnRiesgo() : null,
  ])
  const patron = patronContiene(normalizarBusqueda(estado.q))
  const columnaOrden = COLUMNAS_ORDEN[estado.orden.campo]
  const seleccion = seleccionListado(estado)

  const pagina = await leerPagina(
    "listar los medios",
    estado.pagina,
    estado.tamano,
    (desde, hasta) => {
      let consulta = supabase
        .from("medios")
        .select(seleccion, { count: "exact" })
        .is("deleted_at", null)
        .is("cuentas.deleted_at", null)
      if (patron) consulta = consulta.ilike("nombre_normalizado", patron)
      if (estado.estado.length > 0)
        consulta = consulta.in("estado", estado.estado)
      if (estado.nivel.length > 0) {
        consulta = consulta.in("nivel_verificacion", estado.nivel.map(Number))
      }
      if (estado.departamento.length > 0) {
        consulta = consulta.in("departamento_codigo", estado.departamento)
      }
      if (estado.tipo.length > 0) consulta = consulta.in("tipo", estado.tipo)
      if (estado.plataforma.length > 0) {
        consulta = consulta
          .in("con_plataforma.plataforma", estado.plataforma)
          .is("con_plataforma.deleted_at", null)
      }
      if (estado.categoria.length > 0) {
        consulta = consulta.in("con_categoria.categoria_id", estado.categoria)
      }
      if (enRiesgo) {
        consulta = consulta.in(
          "id",
          enRiesgo.length > 0 ? enRiesgo : SIN_COINCIDENCIAS
        )
      }
      return consulta
        .order(columnaOrden, {
          ascending: !estado.orden.descendente,
          nullsFirst: false,
        })
        .order("id")
        .range(desde, hasta)
        .overrideTypes<FilaMedioBd[], { merge: false }>()
    }
  )

  const gmv = verAsignaciones
    ? await gmvVerificadoPorMedio(pagina.filas.map((fila) => fila.id))
    : null

  return {
    total: pagina.total,
    filas: pagina.filas.map((fila) => ({
      id: fila.id,
      nombre: fila.nombre,
      tipo: fila.tipo,
      estado: fila.estado,
      nivel: fila.nivel_verificacion,
      municipio: nombreMunicipio(fila.municipio_codigo),
      departamento: departamentoJuntoAMunicipio(fila.departamento_codigo, {
        corto: true,
      }),
      cuentas: cuentasCompactas(fila.cuentas, franjas),
      tasaCumplimiento: fila.tasa_cumplimiento,
      nCumplimiento: fila.n_cumplimiento,
      calificacion: fila.calificacion_promedio,
      gmvVerificado: gmv ? (gmv.get(fila.id) ?? 0) : null,
      creadoAt: fila.created_at,
    })),
  }
}

/** Indicadores del listado (todos los medios visibles, sin filtros). */
export async function resumenMedios(): Promise<ResumenMedios> {
  const supabase = await clienteSolicitud()
  const [medios, cuentas] = await Promise.all([
    leerTodo("resumir los medios", (desde, hasta) =>
      supabase
        .from("medios")
        .select(
          "id, estado, nivel_verificacion, tasa_cumplimiento, n_cumplimiento"
        )
        .is("deleted_at", null)
        .order("id")
        .range(desde, hasta)
    ),
    supabase
      .from("cuentas_sociales")
      .select("id", { count: "exact", head: true })
      .eq("verificada", true)
      .is("deleted_at", null),
  ])
  if (cuentas.error) fallar("contar las cuentas verificadas", cuentas.error)

  const porNivel: [number, number, number] = [0, 0, 0]
  let sumaPonderada = 0
  let n = 0
  for (const medio of medios) {
    if (medio.estado === "VERIFICADO" && medio.nivel_verificacion >= 1) {
      porNivel[medio.nivel_verificacion - 1] += 1
    }
    if (medio.tasa_cumplimiento !== null && medio.n_cumplimiento > 0) {
      sumaPonderada += medio.tasa_cumplimiento * medio.n_cumplimiento
      n += medio.n_cumplimiento
    }
  }
  const contar = (estado: string) =>
    medios.filter((medio) => medio.estado === estado).length

  return {
    total: medios.length,
    verificados: contar("VERIFICADO"),
    porNivel,
    pendientes: contar("PENDIENTE"),
    suspendidos: contar("SUSPENDIDO"),
    rechazados: contar("RECHAZADO"),
    cuentasVerificadas: cuentas.count ?? 0,
    cumplimiento: { valor: n > 0 ? sumaPonderada / n : null, n },
  }
}

// ── Ficha ────────────────────────────────────────────────────────────────────

/** Datos base del medio (cabecera y resumen); `null` si no existe o no es visible. */
export const obtenerMedio = cache(
  async (id: string): Promise<MedioDetalle | null> => {
    const supabase = await clienteSolicitud()
    const [medio, niveles] = await Promise.all([
      supabase
        .from("medios")
        .select(
          `id, nombre, tipo, estado, nivel_verificacion, municipio_codigo, departamento_codigo, lon, lat,
           descripcion_audiencia, motivo_estado, verificado_at, suspendido_at, rechazado_at, created_at,
           updated_at, es_demo, tasa_cumplimiento, n_cumplimiento, calificacion_promedio,
           publicaciones_verificadas, deleted_at,
           verificador:perfiles!medios_verificado_por_fkey ( nombre, email )`
        )
        .eq("id", id)
        .maybeSingle(),
      nivelesVerificacion(),
    ])
    if (medio.error) fallar("leer el medio", medio.error)
    const fila = medio.data
    if (!fila || fila.deleted_at) return null
    return {
      id: fila.id,
      nombre: fila.nombre,
      tipo: fila.tipo,
      estado: fila.estado,
      nivel: fila.nivel_verificacion,
      nivelNombre: niveles.get(fila.nivel_verificacion)?.nombre ?? null,
      municipioCodigo: fila.municipio_codigo,
      municipio: nombreMunicipio(fila.municipio_codigo),
      departamentoCodigo: fila.departamento_codigo,
      departamento: departamentoJuntoAMunicipio(fila.departamento_codigo),
      lon: fila.lon,
      lat: fila.lat,
      descripcionAudiencia: fila.descripcion_audiencia,
      motivoEstado: fila.motivo_estado,
      verificadoAt: fila.verificado_at,
      verificadoPor:
        fila.verificador?.nombre ?? fila.verificador?.email ?? null,
      suspendidoAt: fila.suspendido_at,
      rechazadoAt: fila.rechazado_at,
      creadoAt: fila.created_at,
      actualizadoAt: fila.updated_at,
      esDemo: fila.es_demo,
      tasaCumplimiento: fila.tasa_cumplimiento,
      nCumplimiento: fila.n_cumplimiento,
      calificacion: fila.calificacion_promedio,
      publicacionesVerificadas: fila.publicaciones_verificadas,
    }
  }
)

interface NivelVerificacion {
  nombre: string
  tope: number | null
  alerta: number
  bloqueo: number
}

export const nivelesVerificacion = cache(
  async (): Promise<Map<number, NivelVerificacion>> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase
      .from("niveles_verificacion")
      .select(
        "nivel, nombre, tope_anual, porcentaje_alerta, porcentaje_bloqueo"
      )
      .order("nivel")
    if (error) fallar("leer los niveles de verificación", error)
    return new Map(
      data.map((nivel) => [
        nivel.nivel,
        {
          nombre: nivel.nombre,
          tope: nivel.tope_anual,
          alerta: nivel.porcentaje_alerta,
          bloqueo: nivel.porcentaje_bloqueo,
        },
      ])
    )
  }
)

/** Cuentas sociales con su vigencia y, si se puede, su historial de verificaciones. */
export async function cuentasDelMedio(
  medioId: string,
  { verVerificaciones }: { verVerificaciones: boolean }
): Promise<CuentaSocialDetalle[]> {
  const supabase = await clienteSolicitud()
  const [cuentas, verificaciones, { franjas }, configuracion] =
    await Promise.all([
      supabase
        .from("cuentas_sociales")
        .select(
          `id, plataforma, handle, url, seguidores_verificados, franja_id, verificada, metodo_verificacion,
           fecha_ultima_verificacion, multiplicador_calidad, multiplicador_proximo, multiplicador_proximo_desde,
           multiplicador_calculado_at, alcance_mediano, indice_calidad, publicaciones_verificadas_count,
           tarifa_referencia, created_at`
        )
        .eq("medio_id", medioId)
        .is("deleted_at", null)
        .order("created_at"),
      verVerificaciones
        ? supabase
            .from("verificaciones_cuenta")
            .select(
              "id, cuenta_social_id, metodo, estado_validacion, seguidores_reportados, seguidores_verificados, observaciones, created_at, validada_at"
            )
            .eq("medio_id", medioId)
            .order("created_at", { ascending: false })
            .limit(200)
        : null,
      catalogos(),
      configuracionOperacion(),
    ])
  if (cuentas.error) fallar("leer las cuentas sociales", cuentas.error)
  if (verificaciones?.error) {
    fallar("leer las verificaciones de cuentas", verificaciones.error)
  }

  const historial = new Map<string, VerificacionCuenta[]>()
  for (const fila of verificaciones?.data ?? []) {
    const lista = historial.get(fila.cuenta_social_id) ?? []
    lista.push({
      id: fila.id,
      metodo: METODOS_VERIFICACION[fila.metodo],
      estado: fila.estado_validacion,
      seguidoresReportados: fila.seguidores_reportados,
      seguidoresVerificados: fila.seguidores_verificados,
      observaciones: fila.observaciones,
      creadaAt: fila.created_at,
      validadaAt: fila.validada_at,
    })
    historial.set(fila.cuenta_social_id, lista)
  }

  return cuentas.data
    .map((cuenta): CuentaSocialDetalle => {
      const franja = cuenta.franja_id ? franjas.get(cuenta.franja_id) : null
      const vigencia = vigenciaVerificacion(
        cuenta.verificada ? cuenta.fecha_ultima_verificacion : null,
        configuracion.diasVigenciaVerificacion,
        configuracion.diasGraciaVerificacion
      )
      return {
        id: cuenta.id,
        plataforma: cuenta.plataforma,
        handle: cuenta.handle,
        url: cuenta.url,
        seguidores: cuenta.seguidores_verificados,
        franja: franja ? { clave: franja.clave, nombre: franja.nombre } : null,
        verificada: cuenta.verificada,
        metodo: cuenta.metodo_verificacion
          ? METODOS_VERIFICACION[cuenta.metodo_verificacion]
          : null,
        ultimaVerificacionAt: cuenta.fecha_ultima_verificacion,
        vigencia: vigencia.vigencia,
        venceAt: vigencia.venceAt?.toISOString() ?? null,
        elegibleHasta: vigencia.elegibleHasta?.toISOString() ?? null,
        multiplicador: cuenta.multiplicador_calidad,
        multiplicadorProximo: cuenta.multiplicador_proximo,
        multiplicadorProximoDesde: cuenta.multiplicador_proximo_desde,
        multiplicadorCalculadoAt: cuenta.multiplicador_calculado_at,
        alcanceMediano: cuenta.alcance_mediano,
        indiceCalidad: cuenta.indice_calidad,
        publicacionesVerificadas: cuenta.publicaciones_verificadas_count,
        tarifaReferencia: cuenta.tarifa_referencia,
        verificaciones: verVerificaciones
          ? (historial.get(cuenta.id) ?? [])
          : null,
      }
    })
    .sort(
      (a, b) =>
        ORDEN_PLATAFORMAS.indexOf(a.plataforma) -
          ORDEN_PLATAFORMAS.indexOf(b.plataforma) ||
        (b.seguidores ?? 0) - (a.seguidores ?? 0)
    )
}

export interface PerfilAudiencia {
  categorias: string[]
  audiencia: AudienciaPais[]
  pertinencia: PertinenciaGeografica[]
}

export async function perfilAudiencia(
  medioId: string
): Promise<PerfilAudiencia> {
  const supabase = await clienteSolicitud()
  const [categorias, audiencia, pertinencia, { categorias: nombres }] =
    await Promise.all([
      supabase
        .from("medio_categorias")
        .select("categoria_id")
        .eq("medio_id", medioId),
      supabase
        .from("medio_audiencia_paises")
        .select("pais_iso2, porcentaje, fuente")
        .eq("medio_id", medioId)
        .order("porcentaje", { ascending: false }),
      supabase
        .from("medio_pertinencia_geografica")
        .select("municipio_codigo, multiplicador, notas")
        .eq("medio_id", medioId)
        .order("multiplicador", { ascending: false }),
      catalogos(),
    ])
  if (categorias.error)
    fallar("leer las categorías del medio", categorias.error)
  if (audiencia.error) fallar("leer la audiencia del medio", audiencia.error)
  if (pertinencia.error)
    fallar("leer la pertinencia geográfica", pertinencia.error)

  return {
    categorias: categorias.data
      .map((fila) => nombres.get(fila.categoria_id))
      .filter((nombre): nombre is string => Boolean(nombre))
      .sort((a, b) => a.localeCompare(b, "es")),
    audiencia: audiencia.data.map((fila) => ({
      iso2: fila.pais_iso2,
      nombre: nombrePais(fila.pais_iso2) ?? fila.pais_iso2,
      porcentaje: fila.porcentaje,
      fuente: FUENTES_AUDIENCIA[fila.fuente],
    })),
    pertinencia: pertinencia.data.map((fila) => ({
      municipioCodigo: fila.municipio_codigo,
      municipio:
        nombreMunicipio(fila.municipio_codigo) ?? fila.municipio_codigo,
      departamentoCodigo: fila.municipio_codigo.slice(0, 2),
      multiplicador: fila.multiplicador,
      notas: fila.notas,
    })),
  }
}

/** Consumo del tope anual del nivel (misma regla que `reservar_cupo`). */
export async function topeAnualDelMedio(
  medio: Pick<MedioDetalle, "id" | "nivel">,
  consumido: number
): Promise<TopeAnual | null> {
  if (medio.nivel < 1) return null
  const nivel = (await nivelesVerificacion()).get(medio.nivel)
  if (!nivel) return null
  return {
    nivel: medio.nivel,
    nombre: nivel.nombre,
    tope: nivel.tope,
    consumido,
    alerta: nivel.alerta,
    bloqueo: nivel.bloqueo,
  }
}

/** Metadatos de los documentos (nunca la ruta ni el archivo). */
export async function documentosDelMedio(
  medioId: string
): Promise<DocumentoMetadatos[]> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase
    .from("documentos_medio")
    .select(
      "id, tipo, estado_validacion, fecha_vencimiento, validado_at, observaciones, created_at"
    )
    .eq("medio_id", medioId)
    .order("created_at", { ascending: false })
  if (error) fallar("leer los documentos del medio", error)
  return data.map((fila) => ({
    id: fila.id,
    tipo: TIPOS_DOCUMENTO_MEDIO[fila.tipo],
    estado: fila.estado_validacion,
    venceAt: fila.fecha_vencimiento,
    validadoAt: fila.validado_at,
    subidoAt: fila.created_at,
    observaciones: fila.observaciones,
  }))
}
