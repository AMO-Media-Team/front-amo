import "server-only"

import { cache } from "react"

import type { RangoFechas } from "@/lib/fechas"
import type { Database } from "@/types/database.types"

import {
  CAUSAS_CANCELACION,
  type Corte,
  ESTADOS_POR_GRUPO,
  type EstadoAsignacion,
  GRUPOS_ASIGNACION,
  type GrupoAsignacion,
  MOTIVOS_DISPUTA,
  ORIGENES_COMISION,
  PARTES_DISPUTA,
} from "../estados"
import type { EstadoTablaAsignaciones } from "../estado-tablas"
import { normalizarBusqueda, patronContiene, textoParaFiltro } from "../formato"
import {
  calcularProgreso,
  construirLineaTiempo,
  type MarcasAsignacion,
  type TransicionRegistrada,
} from "../linea-tiempo"
import {
  type CorteMetrica,
  leerDetalleAlertas,
  ordenarCortes,
} from "../metricas"
import { ventanaOpcional } from "../periodo"
import type {
  AsignacionDetalle,
  AsignacionFila,
  OpcionCatalogo,
  PaginaFilas,
  PublicacionEvidencia,
  ResumenAsignaciones,
} from "../tipos"
import {
  catalogos,
  type ClienteServidor,
  clienteSolicitud,
  fallar,
  leerPagina,
  leerTodo,
  SIN_COINCIDENCIAS,
} from "./comun"

type Tablas = Database["public"]["Tables"]

type FilaAsignacionBd = Pick<
  Tablas["asignaciones"]["Row"],
  | "id"
  | "estado"
  | "estado_previo_disputa"
  | "plataforma"
  | "franja_clave"
  | "monto_bruto"
  | "created_at"
  | "aceptada_at"
  | "fecha_limite_publicacion"
  | "medio_id"
  | "oferta_id"
  | "campana_id"
> & {
  medio: { nombre: string } | null
  oferta: { titulo: string; formato_id: string } | null
  campana: { nombre: string } | null
  anunciante: { nombre_comercial: string } | null
}

const SELECCION_LISTADO = `
  id, estado, estado_previo_disputa, plataforma, franja_clave, monto_bruto, created_at, aceptada_at,
  fecha_limite_publicacion, medio_id, oferta_id, campana_id,
  medio:medios ( nombre ), oferta:ofertas ( titulo, formato_id ), campana:campanas ( nombre ),
  anunciante:anunciantes ( nombre_comercial )
`

/** Métricas con alerta de integridad que siguen sin validar (cola de revisión). */
const ALIAS_ALERTA = "con_alerta"
const SELECCION_ALERTA = `${ALIAS_ALERTA}:metricas!inner ( id )`
const FILTRO_ALERTA = "alerta_desviacion.eq.true,alerta_multiplo.eq.true"

const COLUMNAS_ORDEN: Readonly<
  Record<EstadoTablaAsignaciones["orden"]["campo"], string>
> = {
  creado: "created_at",
  monto: "monto_bruto",
  limite: "fecha_limite_publicacion",
  estado: "estado",
}

/** Máximo de medios o campañas que la búsqueda de texto traduce a ids. */
const LIMITE_COINCIDENCIAS = 100

interface ContextoFiltros {
  estado: EstadoTablaAsignaciones
  rango: RangoFechas | null
  /** Ids de medios y campañas cuyo nombre coincide con la búsqueda. */
  coincidencias: { medios: string[]; campanas: string[] } | null
}

/** La búsqueda de texto se resuelve contra nombres de medios y campañas. */
async function resolverBusqueda(
  supabase: ClienteServidor,
  texto: string
): Promise<ContextoFiltros["coincidencias"]> {
  const patron = patronContiene(normalizarBusqueda(texto))
  const literal = textoParaFiltro(texto)
  if (!patron || !literal) return null
  const [medios, campanas] = await Promise.all([
    supabase
      .from("medios")
      .select("id")
      .ilike("nombre_normalizado", patron)
      .limit(LIMITE_COINCIDENCIAS),
    supabase
      .from("campanas")
      .select("id")
      .or(`nombre.ilike.%${literal}%,marca.ilike.%${literal}%`)
      .limit(LIMITE_COINCIDENCIAS),
  ])
  if (medios.error) fallar("buscar medios", medios.error)
  if (campanas.error) fallar("buscar campañas", campanas.error)
  return {
    medios: medios.data.map((fila) => fila.id),
    campanas: campanas.data.map((fila) => fila.id),
  }
}

function seleccionDe(estado: EstadoTablaAsignaciones, base: string): string {
  return estado.alerta.length > 0 ? `${base}, ${SELECCION_ALERTA}` : base
}

/**
 * Consulta con los filtros de la URL. `estados` sustituye al filtro de estado
 * (los conteos por grupo usan los demás filtros con los estados de cada grupo).
 */
function consultaFiltrada(
  supabase: ClienteServidor,
  seleccion: string,
  { estado, rango, coincidencias }: ContextoFiltros,
  opciones: { head?: boolean; estados?: readonly EstadoAsignacion[] } = {}
) {
  let consulta = supabase
    .from("asignaciones")
    .select(seleccion, { count: "exact", head: opciones.head ?? false })
  const estados = opciones.estados ?? estado.estado
  if (estados.length > 0) consulta = consulta.in("estado", [...estados])
  if (estado.plataforma.length > 0) {
    consulta = consulta.in("plataforma", estado.plataforma)
  }
  if (estado.campana.length > 0)
    consulta = consulta.in("campana_id", estado.campana)
  if (estado.medio.length > 0) consulta = consulta.in("medio_id", estado.medio)
  if (estado.anunciante.length > 0) {
    consulta = consulta.in("anunciante_id", estado.anunciante)
  }
  const ventana = ventanaOpcional(rango)
  if (ventana) {
    consulta = consulta
      .gte("created_at", ventana.desde)
      .lt("created_at", ventana.hastaExclusivo)
  }
  if (coincidencias) {
    const medios = coincidencias.medios.length
      ? coincidencias.medios
      : SIN_COINCIDENCIAS
    const campanas = coincidencias.campanas.length
      ? coincidencias.campanas
      : SIN_COINCIDENCIAS
    consulta = consulta.or(
      `medio_id.in.(${medios.join(",")}),campana_id.in.(${campanas.join(",")})`
    )
  }
  if (estado.alerta.length > 0) {
    consulta = consulta
      .eq(`${ALIAS_ALERTA}.estado_validacion`, "PENDIENTE")
      .or(FILTRO_ALERTA, { referencedTable: ALIAS_ALERTA })
  }
  return consulta
}

export async function listarAsignaciones(
  estado: EstadoTablaAsignaciones,
  rango: RangoFechas | null
): Promise<PaginaFilas<AsignacionFila>> {
  const supabase = await clienteSolicitud()
  const [coincidencias, { formatos }] = await Promise.all([
    resolverBusqueda(supabase, estado.q),
    catalogos(),
  ])
  const contexto: ContextoFiltros = { estado, rango, coincidencias }
  const seleccion = seleccionDe(estado, SELECCION_LISTADO)

  const pagina = await leerPagina(
    "listar las asignaciones",
    estado.pagina,
    estado.tamano,
    (desde, hasta) =>
      consultaFiltrada(supabase, seleccion, contexto)
        .order(COLUMNAS_ORDEN[estado.orden.campo], {
          ascending: !estado.orden.descendente,
          nullsFirst: false,
        })
        .order("id")
        .range(desde, hasta)
        .overrideTypes<FilaAsignacionBd[], { merge: false }>()
  )

  return {
    total: pagina.total,
    filas: pagina.filas.map((fila) => ({
      id: fila.id,
      estado: fila.estado,
      estadoPrevioDisputa: fila.estado_previo_disputa,
      plataforma: fila.plataforma,
      formato: fila.oferta
        ? (formatos.get(fila.oferta.formato_id)?.nombre ?? null)
        : null,
      franja: fila.franja_clave,
      medioId: fila.medio_id,
      medio: fila.medio?.nombre ?? null,
      ofertaId: fila.oferta_id,
      oferta: fila.oferta?.titulo ?? null,
      campanaId: fila.campana_id,
      campana: fila.campana?.nombre ?? null,
      anunciante: fila.anunciante?.nombre_comercial ?? null,
      montoBruto: fila.monto_bruto,
      creadaAt: fila.created_at,
      aceptadaAt: fila.aceptada_at,
      fechaLimite: fila.fecha_limite_publicacion,
    })),
  }
}

/** Conteo por grupo de estados con los mismos filtros (salvo el de estado). */
export async function resumenAsignaciones(
  estado: EstadoTablaAsignaciones,
  rango: RangoFechas | null
): Promise<ResumenAsignaciones> {
  const supabase = await clienteSolicitud()
  const coincidencias = await resolverBusqueda(supabase, estado.q)
  const contexto: ContextoFiltros = { estado, rango, coincidencias }
  const seleccion = seleccionDe(estado, "id")

  const conteos = await Promise.all(
    GRUPOS_ASIGNACION.map(async (grupo) => {
      const { count, error } = await consultaFiltrada(
        supabase,
        seleccion,
        contexto,
        { head: true, estados: ESTADOS_POR_GRUPO[grupo] }
      )
      if (error) fallar("contar las asignaciones", error)
      return [grupo, count ?? 0] as const
    })
  )
  const porGrupo = Object.fromEntries(conteos) as Record<
    GrupoAsignacion,
    number
  >
  return {
    total: conteos.reduce((suma, [, cantidad]) => suma + cantidad, 0),
    porGrupo,
  }
}

/** Opciones del filtro "Medio" (todos los medios visibles, por nombre). */
export const opcionesMedios = cache(async (): Promise<OpcionCatalogo[]> => {
  const supabase = await clienteSolicitud()
  return leerTodo("leer los medios", (desde, hasta) =>
    supabase
      .from("medios")
      .select("id, nombre")
      .is("deleted_at", null)
      .order("nombre")
      .order("id")
      .range(desde, hasta)
  )
})

// ── Ficha ────────────────────────────────────────────────────────────────────

const SELECCION_FICHA = `
  id, estado, estado_previo_disputa, plataforma, slot, causa_cancelacion, motivo, created_at, aceptada_at,
  contenido_descargado_at, publicada_at, evidencia_validada_at, metricas_cargadas_at, verificada_at,
  liquidada_at, pagada_at, rechazada_at, vencida_at, en_disputa_at, cancelada_at, fecha_limite_publicacion,
  franja_clave, seguidores_al_aceptar, tarifa_base_aplicada, publicaciones, multiplicador_calidad_aplicado,
  multiplicador_geografico_aplicado, multiplicador_exclusividad_aplicado, monto_bruto, medio_id, oferta_id,
  campana_id, anunciante_id,
  medio:medios ( nombre ),
  cuenta:cuentas_sociales ( plataforma, handle, url ),
  oferta:ofertas ( titulo, formato_id, ventana_inicio, ventana_fin, cortes_requeridos ),
  campana:campanas ( nombre, marca ),
  anunciante:anunciantes ( nombre_comercial ),
  montos:asignacion_montos (
    porcentaje_comision, comision_origen, monto_comision, monto_medio, monto_retenciones, monto_neto
  ),
  liquidacion:liquidaciones ( id, estado, periodo_inicio, periodo_fin, fecha_pago )
` as const

function marcasDe(fila: {
  estado: EstadoAsignacion
  estado_previo_disputa: EstadoAsignacion | null
  created_at: string
  aceptada_at: string | null
  contenido_descargado_at: string | null
  publicada_at: string | null
  evidencia_validada_at: string | null
  metricas_cargadas_at: string | null
  verificada_at: string | null
  liquidada_at: string | null
  pagada_at: string | null
  rechazada_at: string | null
  vencida_at: string | null
  en_disputa_at: string | null
  cancelada_at: string | null
}): MarcasAsignacion {
  return {
    estado: fila.estado,
    estadoPrevioDisputa: fila.estado_previo_disputa,
    creadaAt: fila.created_at,
    aceptadaAt: fila.aceptada_at,
    contenidoDescargadoAt: fila.contenido_descargado_at,
    publicadaAt: fila.publicada_at,
    evidenciaValidadaAt: fila.evidencia_validada_at,
    metricasCargadasAt: fila.metricas_cargadas_at,
    verificadaAt: fila.verificada_at,
    liquidadaAt: fila.liquidada_at,
    pagadaAt: fila.pagada_at,
    rechazadaAt: fila.rechazada_at,
    vencidaAt: fila.vencida_at,
    enDisputaAt: fila.en_disputa_at,
    canceladaAt: fila.cancelada_at,
  }
}

/** Transiciones de la bitácora (RLS: `auditoria.ver`). */
async function transicionesDe(
  supabase: ClienteServidor,
  asignacionId: string
): Promise<TransicionRegistrada[]> {
  const { data, error } = await supabase
    .from("bitacora")
    .select(
      "id, created_at, estado_anterior, estado_nuevo, actor_email, actor_rol, motivo"
    )
    .eq("entidad", "asignaciones")
    .eq("entidad_id", asignacionId)
    .eq("accion", "TRANSICION")
    .order("id")
    .limit(200)
  if (error) fallar("leer la bitácora de la asignación", error)
  return data.map((fila) => ({
    id: fila.id,
    at: fila.created_at,
    desde: fila.estado_anterior,
    hacia: fila.estado_nuevo,
    actor: fila.actor_email,
    actorRol: fila.actor_rol,
    motivo: fila.motivo,
  }))
}

/**
 * Ficha completa de una asignación; `null` si no existe o no es visible.
 * `verBitacora` (`auditoria.ver`): la línea de tiempo incluye actores y motivos.
 */
export const obtenerAsignacion = cache(
  async (
    id: string,
    verBitacora: boolean
  ): Promise<AsignacionDetalle | null> => {
    const supabase = await clienteSolicitud()
    const [
      asignacion,
      publicaciones,
      metricas,
      disputas,
      descargas,
      transiciones,
      { formatos },
    ] = await Promise.all([
      supabase
        .from("asignaciones")
        .select(SELECCION_FICHA)
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("publicaciones")
        .select(
          `id, numero, url_post, fecha_publicacion, permanencia_hasta, permanencia_verificada_at,
             etiqueta_publicidad_confirmada, etiqueta_verificada, estado_validacion, validada_at,
             observaciones, retirada_detectada_at, captura_path, created_at`
        )
        .eq("asignacion_id", id)
        .order("numero"),
      supabase
        .from("metricas")
        .select(
          `id, publicacion_id, corte, fecha_corte, alcance_norm, impresiones_norm, interacciones,
             clics_enlace, estado_validacion, alerta_desviacion, alerta_multiplo, detalle_alertas,
             observaciones, validada_at, created_at, captura_path`
        )
        .eq("asignacion_id", id)
        .order("fecha_corte"),
      supabase
        .from("disputas")
        .select(
          "id, estado, motivo, parte, descripcion, resolucion, created_at, fecha_resolucion"
        )
        .eq("asignacion_id", id)
        .order("created_at"),
      supabase
        .from("descargas_contenido")
        .select("descargado_at", { count: "exact" })
        .eq("asignacion_id", id)
        .order("descargado_at", { ascending: false })
        .limit(1),
      verBitacora ? transicionesDe(supabase, id) : Promise.resolve([]),
      catalogos(),
    ])
    if (asignacion.error) fallar("leer la asignación", asignacion.error)
    if (publicaciones.error)
      fallar("leer las publicaciones", publicaciones.error)
    if (metricas.error) fallar("leer las métricas", metricas.error)
    if (disputas.error) fallar("leer las disputas", disputas.error)
    if (descargas.error) fallar("leer las descargas", descargas.error)
    const fila = asignacion.data
    if (!fila) return null

    const numeroDePublicacion = new Map(
      publicaciones.data.map((p) => [p.id, p.numero])
    )
    const cargaDeMetrica = new Map(
      metricas.data.map((m) => [m.id, m.created_at])
    )
    const cortes: (CorteMetrica & { numero: number })[] = metricas.data.map(
      (metrica) => ({
        id: metrica.id,
        publicacionId: metrica.publicacion_id,
        numero: numeroDePublicacion.get(metrica.publicacion_id) ?? 1,
        corte: metrica.corte,
        fechaCorte: metrica.fecha_corte,
        alcance: metrica.alcance_norm,
        impresiones: metrica.impresiones_norm,
        interacciones: metrica.interacciones,
        clics: metrica.clics_enlace,
        estado: metrica.estado_validacion,
        alertaDesviacion: metrica.alerta_desviacion,
        alertaMultiplo: metrica.alerta_multiplo,
        detalleAlertas: leerDetalleAlertas(metrica.detalle_alertas),
        observaciones: metrica.observaciones,
        validadaAt: metrica.validada_at,
        conImagen: Boolean(metrica.captura_path),
      })
    )

    const evidencias: PublicacionEvidencia[] = publicaciones.data.map((p) => ({
      id: p.id,
      numero: p.numero,
      url: p.url_post,
      fechaPublicacion: p.fecha_publicacion,
      permanenciaHasta: p.permanencia_hasta,
      permanenciaVerificadaAt: p.permanencia_verificada_at,
      etiquetaConfirmada: p.etiqueta_publicidad_confirmada,
      etiquetaVerificada: p.etiqueta_verificada,
      estado: p.estado_validacion,
      validadaAt: p.validada_at,
      observaciones: p.observaciones,
      retiradaDetectadaAt: p.retirada_detectada_at,
      conImagen: Boolean(p.captura_path),
      cortes: ordenarCortes(cortes.filter((c) => c.publicacionId === p.id)),
    }))

    const marcas = marcasDe(fila)
    const montos = fila.montos
    return {
      id: fila.id,
      estado: fila.estado,
      estadoPrevioDisputa: fila.estado_previo_disputa,
      plataforma: fila.plataforma,
      formato: fila.oferta
        ? (formatos.get(fila.oferta.formato_id)?.nombre ?? null)
        : null,
      slot: fila.slot,
      causaCancelacion: fila.causa_cancelacion
        ? CAUSAS_CANCELACION[fila.causa_cancelacion]
        : null,
      motivo: fila.motivo,
      creadaAt: fila.created_at,
      aceptadaAt: fila.aceptada_at,
      fechaLimite: fila.fecha_limite_publicacion,
      ventanaInicio: fila.oferta?.ventana_inicio ?? null,
      ventanaFin: fila.oferta?.ventana_fin ?? null,
      medio: { id: fila.medio_id, nombre: fila.medio?.nombre ?? null },
      cuenta: fila.cuenta
        ? {
            plataforma: fila.cuenta.plataforma,
            handle: fila.cuenta.handle,
            url: fila.cuenta.url,
          }
        : null,
      oferta: { id: fila.oferta_id, titulo: fila.oferta?.titulo ?? null },
      campana: {
        id: fila.campana_id,
        nombre: fila.campana?.nombre ?? null,
        marca: fila.campana?.marca ?? null,
      },
      anunciante: {
        id: fila.anunciante_id,
        nombre: fila.anunciante?.nombre_comercial ?? null,
      },
      descargas: descargas.count ?? 0,
      ultimaDescargaAt: descargas.data[0]?.descargado_at ?? null,
      precio: {
        franja: fila.franja_clave,
        seguidoresAlAceptar: fila.seguidores_al_aceptar,
        tarifaBase: fila.tarifa_base_aplicada,
        publicaciones: fila.publicaciones,
        multiplicadorCalidad: fila.multiplicador_calidad_aplicado,
        multiplicadorGeografico: fila.multiplicador_geografico_aplicado,
        multiplicadorExclusividad: fila.multiplicador_exclusividad_aplicado,
        montoBruto: fila.monto_bruto,
        montos: montos
          ? {
              porcentajeComision: montos.porcentaje_comision,
              origenComision: ORIGENES_COMISION[montos.comision_origen],
              montoComision: montos.monto_comision,
              montoMedio:
                montos.monto_medio ??
                (fila.monto_bruto ?? 0) - montos.monto_comision,
              retenciones: montos.monto_retenciones,
              montoNeto: montos.monto_neto,
            }
          : null,
      },
      progreso: calcularProgreso(marcas),
      eventos: construirLineaTiempo({
        marcas,
        transiciones,
        publicaciones: publicaciones.data.map((p) => ({
          id: p.id,
          numero: p.numero,
          creadaAt: p.created_at,
          estado: p.estado_validacion,
          validadaAt: p.validada_at,
          observaciones: p.observaciones,
        })),
        metricas: cortes.map((c) => ({
          id: c.id,
          numero: c.numero,
          creadaAt: cargaDeMetrica.get(c.id) ?? c.fechaCorte,
          estado: c.estado,
          validadaAt: c.validadaAt,
          observaciones: c.observaciones,
          corte: c.corte,
          conAlerta: c.alertaDesviacion || c.alertaMultiplo,
        })),
        disputas: disputas.data.map((d) => ({
          id: d.id,
          creadaAt: d.created_at,
          motivo: d.motivo,
          parte: d.parte,
          estado: d.estado,
          resueltaAt: d.fecha_resolucion,
          resolucion: d.resolucion,
        })),
      }),
      conBitacora: verBitacora,
      publicaciones: evidencias,
      cortesRequeridos: (fila.oferta?.cortes_requeridos ?? []) as Corte[],
      disputas: disputas.data.map((d) => ({
        id: d.id,
        estado: d.estado,
        motivo: MOTIVOS_DISPUTA[d.motivo],
        parte: PARTES_DISPUTA[d.parte],
        descripcion: d.descripcion,
        resolucion: d.resolucion,
        creadaAt: d.created_at,
        resueltaAt: d.fecha_resolucion,
      })),
      liquidacion: fila.liquidacion
        ? {
            id: fila.liquidacion.id,
            estado: fila.liquidacion.estado,
            periodoInicio: fila.liquidacion.periodo_inicio,
            periodoFin: fila.liquidacion.periodo_fin,
            fechaPago: fila.liquidacion.fecha_pago,
          }
        : null,
    }
  }
)
