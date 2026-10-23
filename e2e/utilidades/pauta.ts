/**
 * La pauta del «Medio E2E» para las pruebas E2E: ofertas que puede aceptar
 * hoy, y cada paso de la ejecución (aceptar, descargar, publicar, cargar
 * métricas) y de la revisión del equipo AMO, por las fábricas de
 * `scripts/bootstrap/fabricas-pauta.ts`: sesión real del medio para lo suyo
 * (RPC con actor y sesión, métricas con RLS), capturas reales en Storage y un
 * operador temporal para lo del equipo AMO. Nada de SQL directo; nunca en
 * producción.
 *
 * Reglas para que los specs no se pisen:
 *
 * - Los specs `pauta-medio-*` (proyecto `pauta-medio`, en serie) crean sus
 *   ofertas con `crearOfertaPautaE2E` (campañas «Pauta E2E…» del «Anunciante
 *   E2E») y llaman a `restablecerPautaMedioE2E()` en su `beforeAll`: limpia
 *   esas campañas y deja al medio sin asignaciones abiertas de pruebas
 *   anteriores (las que descargaron contenido quedan canceladas).
 * - Un spec del anunciante que necesite asignaciones del Medio E2E (corre en
 *   paralelo) usa `prefijo: PREFIJO_PAUTA_ANUNCIANTE` y en su `afterAll`
 *   `borrarPautaE2E({ prefijo: PREFIJO_PAUTA_ANUNCIANTE })`: el
 *   restablecimiento del medio no toca esas campañas.
 *
 * Cada oferta tiene un título único («Oferta E2E <formato> <sufijo>»): ubícala
 * por su título, no por su posición (en la base local también hay ofertas demo
 * visibles para el medio).
 */
import {
  publicarNuevaVersionCreativo,
  type VersionCreativoCreada,
} from "../../scripts/bootstrap/fabricas-negocio"
import {
  type AceptacionCreada,
  aceptarOferta,
  aprobarMetrica,
  type AsignacionDeMedio,
  type AsignacionDePrueba,
  type AsignacionPreparada,
  asignacionesDeMedio,
  type AvisoDePrueba,
  avisosDeMedio,
  borrarPauta,
  cargarMetrica,
  type CuposDeOferta,
  desistirAsignacion,
  entregarContenido,
  type EvidenciaPublicada,
  leerAsignacion,
  leerCuposOferta,
  type MedioPauta,
  type MetricaCargada,
  type PautaBorrada,
  prepararAsignacion,
  publicarEvidencia,
  rechazarEvidencia,
  rechazarMetrica,
  rechazarOferta,
  restablecerPautaMedio,
  validarEvidencia,
  verificarAsignacion,
} from "../../scripts/bootstrap/fabricas-pauta"
import { sufijoUnico } from "../../scripts/bootstrap/negocio-e2e"
import {
  type ContenidoEntregado,
  CORTES_FIJOS,
  diasAtrasParaCorte,
  diasAtrasParaCortes,
  ETAPAS_PAUTA,
  type EtapaPauta,
  HORAS_CORTE,
  llegaA,
  PREFIJO_PAUTA,
  PREFIJO_PAUTA_ANUNCIANTE,
  type ValoresMetrica,
  valoresMetricaE2E,
} from "../../scripts/bootstrap/pauta-e2e"
import { clienteComoSuperadmin } from "../../scripts/bootstrap/provision-e2e"
import { crearClienteServicio } from "../../scripts/bootstrap/supabase"
import {
  anuncianteDe,
  type CuentaAnunciante,
  usuarioAnunciante,
} from "./anunciantes"
import { entorno } from "./cuentas"
import {
  credencialesMedio,
  MEDIO_SUSPENSION,
  MEDIO_VERIFICADO,
  type MedioDePrueba,
} from "./medios"
import {
  type CampanaE2E,
  type CorteMetrica,
  crearCampanaE2E,
  crearOfertaE2E,
  type OfertaE2E,
  type PlataformaE2E,
  type SegmentacionOferta,
} from "./negocio"

export type {
  AceptacionCreada,
  AsignacionDeMedio,
  AsignacionDePrueba,
  AvisoDePrueba,
  ContenidoEntregado,
  CuposDeOferta,
  EtapaPauta,
  EvidenciaPublicada,
  MetricaCargada,
  PautaBorrada,
  ValoresMetrica,
  VersionCreativoCreada,
}
export {
  CORTES_FIJOS,
  diasAtrasParaCorte,
  diasAtrasParaCortes,
  ETAPAS_PAUTA,
  HORAS_CORTE,
  PREFIJO_PAUTA,
  PREFIJO_PAUTA_ANUNCIANTE,
  valoresMetricaE2E,
}

function medioPauta(medio: MedioDePrueba = MEDIO_VERIFICADO): MedioPauta {
  return { id: medio.id, credenciales: credencialesMedio(medio.cuenta) }
}

// ── Campañas y ofertas ───────────────────────────────────────────────────────

/**
 * Campaña ACTIVA de la pauta («Pauta E2E <sufijo>» por omisión) del
 * «Anunciante E2E», con 20.000.000 de presupuesto: desde hoy, o desde hace
 * `diasAtras` días para ofertas cuya ventana ya abrió.
 */
export async function crearCampanaPautaE2E(
  opciones: {
    diasAtras?: number
    prefijo?: string
    presupuesto?: number
    cuenta?: CuentaAnunciante
  } = {}
): Promise<CampanaE2E> {
  return crearCampanaE2E({
    estado: "ACTIVA",
    nombre: `${opciones.prefijo ?? PREFIJO_PAUTA} ${sufijoUnico()}`,
    diasAtras: opciones.diasAtras ?? 0,
    presupuesto: opciones.presupuesto,
    cuenta: opciones.cuenta,
  })
}

export interface OpcionesOfertaPauta {
  /** Campaña donde crearla (por omisión, una nueva de la pauta con los mismos `diasAtras`). */
  campana?: CampanaE2E
  /** Prefijo de la campaña nueva (`PREFIJO_PAUTA_ANUNCIANTE` en los specs del anunciante). */
  prefijo?: string
  /**
   * La ventana abrió hace estos días (0 por omisión: hoy). Para cargar un
   * corte, `diasAtrasParaCorte(corte)`: H24 → 2, H72 → 4, D7 → 8.
   */
  diasAtras?: number
  /**
   * `true`: la ventana empieza después de la fecha límite, como la arma el
   * asistente (el medio acepta pero aún no puede publicar; al llenarse los
   * cupos la oferta pasa a CUPOS_COMPLETOS).
   */
  ventanaFutura?: boolean
  /** PUBLICADA por omisión. */
  estado?: "BORRADOR" | "EN_REVISION" | "PUBLICADA"
  formato?: { plataforma: PlataformaE2E; clave: string }
  /** Cupos en F1, la franja del Medio E2E (2 por omisión). */
  cupos?: number
  /** Cortes que pide (por omisión, los de la configuración: H24, H72 y D7). */
  cortes?: CorteMetrica[]
  publicacionesPorMedio?: number
  permiteMultiplesCupos?: boolean
  permanenciaMinimaDias?: number
  exclusividadDias?: number
  presupuesto?: number
  titulo?: string
  fechaLimite?: Date
  /**
   * Dirigida al Medio E2E (su municipio y sus categorías) por omisión;
   * `"NINGUNA"` para todo el país, o una segmentación explícita (p. ej.
   * `{ mediosExcluidos: [MEDIO_VERIFICADO.id] }` para una que no le llega).
   */
  segmentacion?: "MEDIO_E2E" | "NINGUNA" | SegmentacionOferta
}

export interface OfertaPautaE2E extends OfertaE2E {
  campana: CampanaE2E
}

/**
 * Oferta PUBLICADA que el «Medio E2E» puede aceptar hoy: ventana abierta
 * (desde hoy o desde hace `diasAtras` días), dirigida a él, 2 cupos en su
 * franja (F1) y creativo con archivos reales. Crea su campaña de la pauta si
 * no se le da una.
 */
export async function crearOfertaPautaE2E(
  opciones: OpcionesOfertaPauta = {}
): Promise<OfertaPautaE2E> {
  const diasAtras = opciones.diasAtras ?? 0
  const campana =
    opciones.campana ??
    (await crearCampanaPautaE2E({ diasAtras, prefijo: opciones.prefijo }))
  const oferta = await crearOfertaE2E({
    campanaId: campana.id,
    estado: opciones.estado ?? "PUBLICADA",
    formato: opciones.formato,
    ventanaDesdeHoy: opciones.ventanaFutura ? undefined : { diasAtras },
    segmentacion:
      opciones.segmentacion === "NINGUNA"
        ? undefined
        : (opciones.segmentacion ?? "MEDIO_E2E"),
    cupos: opciones.cupos,
    cortes: opciones.cortes,
    publicacionesPorMedio: opciones.publicacionesPorMedio,
    permiteMultiplesCupos: opciones.permiteMultiplesCupos,
    permanenciaMinimaDias: opciones.permanenciaMinimaDias,
    exclusividadDias: opciones.exclusividadDias,
    presupuesto: opciones.presupuesto,
    titulo: opciones.titulo,
    fechaLimite: opciones.fechaLimite,
  })
  return { ...oferta, campana }
}

/**
 * Versión nueva del creativo de una oferta publicada, activada por la empresa:
 * quien aceptó y aún no publica ve «Descarga la versión nueva» y recibe el
 * aviso `creativo.actualizado`.
 */
export async function publicarNuevaVersionCreativoE2E({
  ofertaId,
  cuenta = "ANUNCIANTE",
}: {
  ofertaId: string
  cuenta?: CuentaAnunciante
}): Promise<VersionCreativoCreada> {
  return publicarNuevaVersionCreativo(
    entorno,
    await usuarioAnunciante(cuenta),
    { ofertaId }
  )
}

// ── Lo que hace el medio ─────────────────────────────────────────────────────

/**
 * El medio acepta la oferta con su sesión (`reservar_cupo_srv`, clave de
 * idempotencia nueva salvo que se pase una). Devuelve la asignación con el
 * precio congelado.
 */
export async function aceptarOfertaE2E(opciones: {
  ofertaId: string
  medio?: MedioDePrueba
  cuentaSocialId?: string
  claveIdempotencia?: string
}): Promise<AceptacionCreada> {
  return aceptarOferta(entorno, medioPauta(opciones.medio), opciones)
}

/** «No me interesa»: la oferta sale del listado del medio (y aparece en «Ver las que rechacé»). */
export async function rechazarOfertaE2E(opciones: {
  ofertaId: string
  motivo?: string
  medio?: MedioDePrueba
}): Promise<string> {
  return rechazarOferta(entorno, medioPauta(opciones.medio), opciones)
}

/** El medio desiste de una asignación aceptada sin descargar (libera el cupo). */
export async function desistirAsignacionE2E(opciones: {
  asignacionId: string
  motivo: string
  medio?: MedioDePrueba
}): Promise<void> {
  await desistirAsignacion(entorno, medioPauta(opciones.medio), opciones)
}

/** El medio descarga el contenido: la asignación pasa a CONTENIDO_ENTREGADO. */
export async function entregarContenidoE2E(opciones: {
  asignacionId: string
  medio?: MedioDePrueba
}): Promise<ContenidoEntregado> {
  return entregarContenido(entorno, medioPauta(opciones.medio), opciones)
}

/**
 * El medio carga la evidencia de una publicación con una captura real: URL
 * única del post, fecha de hace `haceHoras` horas (0 por omisión) y etiqueta
 * de publicidad confirmada. Con todas, la asignación pasa a PUBLICADA.
 */
export async function publicarEvidenciaE2E(opciones: {
  asignacionId: string
  numero?: number
  haceHoras?: number
  url?: string
  medio?: MedioDePrueba
}): Promise<EvidenciaPublicada> {
  return publicarEvidencia(entorno, medioPauta(opciones.medio), opciones)
}

/**
 * El medio carga un corte con su sesión (RLS), captura real y valores
 * coherentes para la plataforma (los de `valores` reemplazan los de
 * `valoresMetricaE2E`). El corte debe haberse cumplido: publica antes con
 * `haceHoras` ≥ sus horas.
 */
export async function cargarMetricaE2E(opciones: {
  asignacionId: string
  numero?: number
  corte: CorteMetrica
  valores?: Partial<ValoresMetrica>
  fechaCorte?: Date
  periodo?: { desde: Date; hasta: Date }
  medio?: MedioDePrueba
}): Promise<MetricaCargada> {
  return cargarMetrica(entorno, medioPauta(opciones.medio), opciones)
}

// ── Lo que hace el equipo AMO ────────────────────────────────────────────────

/**
 * Aprueba las evidencias pendientes como el equipo AMO (`validar_evidencia_srv`):
 * con la última aprobada, la asignación queda validada.
 */
export async function validarEvidenciaE2E(opciones: {
  asignacionId: string
}): Promise<void> {
  await validarEvidencia(entorno, opciones)
}

/**
 * Rechaza la evidencia con observaciones (`validar_evidencia_srv`): el medio la
 * corrige (CORREGIR_EVIDENCIA) y tiene al menos 24 h para cargar otra.
 */
export async function rechazarEvidenciaE2E(opciones: {
  asignacionId: string
  numero?: number
  observaciones: string
}): Promise<void> {
  await rechazarEvidencia(entorno, opciones)
}

/**
 * Aprueba una métrica (o las pendientes de una asignación) con
 * `validar_metrica_srv`, anotando la revisión si tiene alerta; devuelve cuántas.
 */
export async function aprobarMetricaE2E(
  filtro: { metricaId: string } | { asignacionId: string }
): Promise<number> {
  return aprobarMetrica(entorno, filtro)
}

/**
 * Rechaza una métrica con observaciones (`validar_metrica_srv`): el medio la
 * corrige (CORREGIR_METRICAS).
 */
export async function rechazarMetricaE2E(opciones: {
  metricaId: string
  observaciones: string
}): Promise<void> {
  await rechazarMetrica(entorno, opciones)
}

/** Verifica la asignación (exige todas las métricas aprobadas). */
export async function verificarAsignacionE2E(opciones: {
  asignacionId: string
}): Promise<void> {
  await verificarAsignacion(entorno, opciones)
}

// ── Una asignación lista en el estado que pide la prueba ─────────────────────

export interface AsignacionPreparadaE2E extends AsignacionPreparada {
  /** La oferta creada para la prueba (`null` si se dio `ofertaId`). */
  oferta: OfertaPautaE2E | null
}

/**
 * Asignación del Medio E2E en el estado pedido por el camino real (aceptar →
 * descargar → publicar → cargar cortes → validar → verificar). Sin `ofertaId`
 * crea una oferta de la pauta con lo que haga falta: para METRICAS_CARGADAS o
 * VERIFICADA pide solo el corte H24 y abre la ventana hace 2 días (sus
 * evidencias quedan publicadas hace 25 h). Tarda unos segundos por etapa.
 */
export async function prepararAsignacionE2E(opciones: {
  hasta: EtapaPauta
  ofertaId?: string
  oferta?: OpcionesOfertaPauta
  medio?: MedioDePrueba
}): Promise<AsignacionPreparadaE2E> {
  const conMetricas = llegaA(opciones.hasta, "METRICAS_CARGADAS")
  let oferta: OfertaPautaE2E | null = null
  if (!opciones.ofertaId) {
    const cortes: CorteMetrica[] | undefined =
      opciones.oferta?.cortes ?? (conMetricas ? ["H24"] : undefined)
    oferta = await crearOfertaPautaE2E({
      ...opciones.oferta,
      cortes,
      diasAtras:
        opciones.oferta?.diasAtras ??
        (conMetricas ? diasAtrasParaCortes(cortes ?? CORTES_FIJOS) : 0),
    })
  }
  const ofertaId = opciones.ofertaId ?? oferta?.id
  if (!ofertaId) throw new Error("Falta la oferta de la asignación.")
  const preparada = await prepararAsignacion(
    entorno,
    medioPauta(opciones.medio),
    { ofertaId, hasta: opciones.hasta }
  )
  return { ...preparada, oferta }
}

// ── Limpieza ─────────────────────────────────────────────────────────────────

export interface PautaRestablecidaE2E {
  /** Campañas de la pauta borradas enteras. */
  campanas: number
  /** Campañas con descargas (la BD no deja borrarlas): canceladas y archivadas. */
  archivadas: number
  asignaciones: number
  /**
   * Asignaciones que siguen ahí y por qué: de un spec del anunciante en curso,
   * con descargas (quedan CANCELADAS, sin cupo) o liquidadas.
   */
  conservadas: { id: string; motivo: string }[]
}

/**
 * Deja al «Medio E2E» sin la pauta de pruebas anteriores: borra las campañas
 * «Pauta E2E…» (con sus ofertas, asignaciones, evidencias y avisos), libera y
 * borra sus asignaciones en ofertas ajenas (demo), sus «No me interesa» y sus
 * vistas. Va en el `beforeAll` de cada spec `pauta-medio-*`.
 *
 * Lo que ya descargó contenido o tiene mensajes de disputa no se puede borrar
 * (la BD los guarda como bitácora de solo inserción): sus disputas abiertas se
 * cierran, la asignación queda CANCELADA, sin cupo, y su campaña cancelada y
 * archivada; una vencida que aún podría reclamar se cierra con su sesión. Ya
 * no aparece en el marketplace ni en las próximas acciones, pero sí en «Mis
 * campañas › Vencidas o canceladas»: no cuentes esas filas, ubica las tuyas
 * por el título de su oferta.
 */
export async function restablecerPautaMedioE2E(
  medio: MedioDePrueba = MEDIO_VERIFICADO
): Promise<PautaRestablecidaE2E> {
  const servicio = await clienteComoSuperadmin(entorno)
  const resultado = await restablecerPautaMedio(
    entorno,
    servicio,
    medioPauta(medio)
  )
  return {
    campanas: resultado.campanas,
    archivadas: resultado.archivadas,
    asignaciones: resultado.asignaciones,
    conservadas: resultado.conservadas,
  }
}

/**
 * Borra las campañas de la empresa que empiezan por `prefijo` con todo lo
 * suyo, también las asignaciones de los medios (p. ej. en el `afterAll` de un
 * spec del anunciante: `prefijo: PREFIJO_PAUTA_ANUNCIANTE`). Lo que la BD no
 * deja borrar (descargas, mensajes de disputa) queda con sus disputas
 * cerradas, cancelado y archivado.
 */
export async function borrarPautaE2E({
  prefijo,
  cuenta = "ANUNCIANTE",
}: {
  prefijo: string
  cuenta?: CuentaAnunciante
}): Promise<PautaBorrada> {
  const servicio = await clienteComoSuperadmin(entorno)
  return borrarPauta(entorno, servicio, {
    anuncianteId: anuncianteDe(cuenta).id,
    prefijo,
    medios: mediosConCredenciales(),
  })
}

/** Los medios verificados E2E cuyas credenciales están en `.env.local` (para cerrar sus reclamos). */
function mediosConCredenciales(): MedioPauta[] {
  return [MEDIO_VERIFICADO, MEDIO_SUSPENSION].flatMap((medio) => {
    try {
      return [medioPauta(medio)]
    } catch {
      return []
    }
  })
}

// ── Lectores de estado ───────────────────────────────────────────────────────

/** Estado de la asignación con sus publicaciones y cortes. */
export async function leerAsignacionE2E(
  asignacionId: string
): Promise<AsignacionDePrueba> {
  return leerAsignacion(crearClienteServicio(entorno), asignacionId)
}

/** Estado, cupos ocupados y presupuesto comprometido de la oferta. */
export async function leerCuposOfertaE2E(
  ofertaId: string
): Promise<CuposDeOferta> {
  return leerCuposOferta(crearClienteServicio(entorno), ofertaId)
}

/** Asignaciones del medio (también sus «No me interesa»), de la más reciente a la más antigua. */
export async function asignacionesMedioE2E(
  medio: MedioDePrueba = MEDIO_VERIFICADO
): Promise<AsignacionDeMedio[]> {
  return asignacionesDeMedio(crearClienteServicio(entorno), medio.id)
}

/** Avisos de las personas del medio, por tipo (`creativo.actualizado`…) y entidad. */
export async function avisosMedioE2E(
  opciones: { tipo?: string; entidadId?: string; medio?: MedioDePrueba } = {}
): Promise<AvisoDePrueba[]> {
  return avisosDeMedio(
    crearClienteServicio(entorno),
    (opciones.medio ?? MEDIO_VERIFICADO).id,
    opciones
  )
}
