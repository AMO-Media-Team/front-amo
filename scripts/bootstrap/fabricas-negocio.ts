/**
 * Fábricas de campañas y ofertas para las pruebas E2E (el plan está en
 * `negocio-e2e.ts`). Todo va por la API, como lo haría la app:
 *
 * - Filas con el cliente de servicio a nombre de la persona de la empresa
 *   (`x-amo-actor`): la bitácora y `creada_por` la registran a ella.
 * - El creativo con archivos reales: el objeto se sube a Storage y la fila
 *   declara su SHA-256, medidas y duración (la BD los revalida contra el
 *   formato y el objeto).
 * - Los cambios de estado por `transicionar_srv` con actor y sesión reales: la
 *   empresa activa la campaña y envía la oferta con su sesión; la publicación
 *   la hace un operador temporal con verificación en dos pasos.
 *
 * Nada de SQL directo. Solo fuera de producción (`clienteComoSuperadmin` aplica
 * la guarda).
 */
import type * as ModuloRutas from "../../src/lib/storage/rutas"
import type { Database, Json } from "../../src/types/database.types"
import {
  type ActorConSesion,
  conSesionDeUsuario,
  errorDeApi,
  transicionarComo,
} from "./acciones-actor"
import { FONDO_MUESTRA, FRANJA_MUESTRA } from "./archivos-prueba"
import {
  type ArchivoPrueba,
  huellaSha256,
  imagenPrueba,
  videoPrueba,
} from "./archivos-e2e"
import { listarArchivos, rutasStorage } from "./aprovisionar-medios"
import {
  calendarioOferta,
  disponibleCampana,
  esperaPorCron,
  fechasCampana,
  FORMATO_POR_OMISION,
  type FormatoE2E,
  leerRequisitos,
  limitesCampana,
  planCreativo,
  PREFIJO_CAMPANA,
  PREFIJO_OFERTA,
  sufijoUnico,
} from "./negocio-e2e"
import { conOperadorTemporal } from "./operador-temporal"
import { calendarioPauta } from "./pauta-e2e"
import { exigirFueraDeProduccion } from "./produccion"
import { clienteComoSuperadmin } from "./provision-e2e"
import {
  type ClienteSupabase,
  crearClienteServicio,
  type EntornoBootstrap,
  ErrorBootstrap,
} from "./supabase"

type Enums = Database["public"]["Enums"]

/** La persona de la empresa que crea y envía (su perfil y su contraseña). */
export interface UsuarioAnunciante {
  id: string
  email: string
  password: string
}

const PRESUPUESTO_CAMPANA = 20_000_000
const PRESUPUESTO_OFERTA = 2_000_000
const CUPOS_POR_OMISION = 2
const FRANJA_PREFERIDA = "F1"
/** Cuánto antes de vencer queda la fecha límite de una oferta «vencida» al enviarla. */
const VENCE_EN_MS = 6_000
/** Una fecha límite más cercana que esto se trata como vencida. */
const MARGEN_VENCIDA_MS = 30_000

function fallo(
  accion: string,
  error: { message: string; details?: string | null; hint?: string | null }
): never {
  throw errorDeApi(accion, error)
}

const esperar = (ms: number) =>
  new Promise<void>((resolver) => setTimeout(resolver, Math.max(0, ms)))

/** Espera hasta que el reloj pase `instante` (sin pausas arbitrarias). */
async function esperarHasta(instante: number): Promise<void> {
  while (Date.now() <= instante) await esperar(instante - Date.now() + 50)
}

// ── Configuración ────────────────────────────────────────────────────────────

async function valorConfiguracion(
  servicio: ClienteSupabase,
  clave: string
): Promise<Json> {
  const { data, error } = await servicio
    .from("configuracion")
    .select("valor")
    .eq("clave", clave)
    .single()
  if (error) fallo(`No se pudo leer ${clave}`, error)
  return data.valor
}

async function numeroConfiguracion(
  servicio: ClienteSupabase,
  clave: string
): Promise<number> {
  const valor = Number(await valorConfiguracion(servicio, clave))
  if (!Number.isFinite(valor)) {
    throw new ErrorBootstrap(`${clave} no es un número.`)
  }
  return valor
}

/**
 * Ejecuta `accion` con `ofertas.anticipacion_minima_horas` en `horas` y la
 * devuelve a su valor al terminar (también si falla). Es la única forma, sin
 * SQL directo, de enviar una oferta cuya fecha límite está más cerca que la
 * anticipación: el cambio dura lo que tarda el envío y queda en la bitácora a
 * nombre del superadministrador. Solo para ofertas vencidas o muy próximas.
 */
async function conAnticipacion<T>(
  superadmin: ClienteSupabase,
  horas: number,
  accion: () => Promise<T>
): Promise<T> {
  const clave = "ofertas.anticipacion_minima_horas"
  const anterior = await valorConfiguracion(superadmin, clave)
  if (Number(anterior) === horas) return accion()
  const fijar = async (valor: Json) => {
    const { error } = await superadmin
      .from("configuracion")
      .update({ valor })
      .eq("clave", clave)
    if (error) fallo(`No se pudo ajustar ${clave}`, error)
  }
  await fijar(horas)
  try {
    return await accion()
  } finally {
    await fijar(anterior)
  }
}

// ── Campañas ─────────────────────────────────────────────────────────────────

export interface CampanaCreada {
  id: string
  nombre: string
  anuncianteId: string
  estado: "BORRADOR" | "ACTIVA"
  presupuesto: number
  /** `YYYY-MM-DD` en Bogotá. */
  fechaInicio: string
  fechaFin: string
}

export interface OpcionesCampana {
  anuncianteId: string
  estado?: "BORRADOR" | "ACTIVA"
  presupuesto?: number
  nombre?: string
  /** Días de calendario desde hoy (30 por omisión). */
  dias?: number
  /**
   * La campaña empezó hace estos días (0 por omisión): lo necesita una oferta
   * cuya ventana de publicación abrió en el pasado (`ventanaDesdeHoy`).
   */
  diasAtras?: number
}

/**
 * Campaña de la empresa con nombre único («Campaña E2E <sufijo>»), desde hoy
 * (o desde hace `diasAtras` días) y por `dias`. ACTIVA la activa la empresa
 * con su sesión (exige estar verificada: con el Anunciante Nuevo E2E falla con
 * el mensaje de la BD).
 */
export async function crearCampana(
  entorno: EntornoBootstrap,
  usuario: UsuarioAnunciante,
  opciones: OpcionesCampana
): Promise<CampanaCreada> {
  exigirFueraDeProduccion(entorno.url, "Las fábricas de campañas E2E")
  const estado = opciones.estado ?? "ACTIVA"
  const presupuesto = opciones.presupuesto ?? PRESUPUESTO_CAMPANA
  const nombre = opciones.nombre ?? `${PREFIJO_CAMPANA} ${sufijoUnico()}`
  const fechas = fechasCampana(new Date(), opciones.dias, opciones.diasAtras)
  const comoEmpresa = crearClienteServicio(entorno, usuario.id)
  const { data, error } = await comoEmpresa
    .from("campanas")
    .insert({
      anunciante_id: opciones.anuncianteId,
      nombre,
      objetivo: "Campaña creada por las pruebas automatizadas de AMO.",
      marca: "Marca E2E",
      fecha_inicio: fechas.fechaInicio,
      fecha_fin: fechas.fechaFin,
      presupuesto_total: presupuesto,
    })
    .select("id")
    .single()
  if (error) fallo(`No se pudo crear la campaña «${nombre}»`, error)
  if (estado === "ACTIVA") {
    try {
      await conSesionDeUsuario(entorno, usuario, (actor) =>
        transicionarComo(comoEmpresa, actor, {
          entidad: "campanas",
          id: data.id,
          hacia: "ACTIVA",
        })
      )
    } catch (falla) {
      // No deja un borrador que nadie pidió (p. ej. empresa sin verificar).
      await comoEmpresa.from("campanas").delete().eq("id", data.id)
      throw falla
    }
  }
  return {
    id: data.id,
    nombre,
    anuncianteId: opciones.anuncianteId,
    estado,
    presupuesto,
    ...fechas,
  }
}

// ── Ofertas ──────────────────────────────────────────────────────────────────

export type EstadoOfertaE2E = Extract<
  Enums["oferta_estado"],
  "BORRADOR" | "EN_REVISION" | "PUBLICADA"
>

export interface ArchivoCreado {
  ruta: string
  nombre: string
  mime: string
  sha256: string
  tamanoBytes: number
  ancho: number
  alto: number
  duracionSegundos: number | null
}

export interface OfertaCreada {
  id: string
  titulo: string
  campanaId: string
  anuncianteId: string
  estado: EstadoOfertaE2E
  formato: FormatoE2E
  fechaLimite: Date
  ventanaInicio: Date
  ventanaFin: Date
  presupuesto: number
  creativoId: string | null
  archivos: ArchivoCreado[]
}

/** Segmentación de la oferta (vacía: todos los medios elegibles del país). */
export interface SegmentacionOferta {
  /** Códigos DANE de departamento (2 dígitos). */
  departamentos?: string[]
  /** Códigos DIVIPOLA de municipio (5 dígitos). */
  municipios?: string[]
  /** Ids de `categorias`. */
  categorias?: string[]
  seguidoresMinimos?: number
  /** Medios que no deben verla. */
  mediosExcluidos?: string[]
}

export interface OpcionesOferta {
  campanaId: string
  estado: EstadoOfertaE2E
  formato?: FormatoE2E
  /**
   * La ventana de publicación ya abrió: desde las 00:00 (Bogotá) de hoy, o de
   * hace `diasAtras` días para publicar con fecha pasada y cargar cortes
   * (`diasAtrasParaCorte`). La campaña debe haber empezado ese día o antes.
   * Sin esta opción la ventana empieza el día siguiente a la fecha límite.
   */
  ventanaDesdeHoy?: boolean | { diasAtras: number }
  /**
   * Segmentación explícita, o `{ paraMedio }`: el municipio y las categorías
   * de ese medio (la oferta le llega a él, como a un medio real de la zona).
   */
  segmentacion?: SegmentacionOferta | { paraMedio: string }
  /** Cortes de métricas que pide (por omisión, los de `metricas.cortes_requeridos`). */
  cortes?: Enums["corte_metrica"][]
  /** Publicaciones por medio (1 por omisión). */
  publicacionesPorMedio?: number
  permiteMultiplesCupos?: boolean
  /** Días que la publicación debe seguir en línea (el valor de la BD por omisión). */
  permanenciaMinimaDias?: number
  exclusividadDias?: number
  /**
   * Fecha límite de aceptación. Si ya pasó (o faltan menos de 30 s) y la
   * oferta se envía, se envía con la límite unos segundos adelante y se
   * espera a que venza: la oferta queda EN_REVISION o PUBLICADA con la límite
   * vencida (ver `crearOferta`).
   */
  fechaLimite?: Date
  presupuesto?: number
  /** Cupos en la franja F1 (2 por omisión). */
  cupos?: number
  titulo?: string
  /** `false`: sin creativo (solo BORRADOR; enviarla fallaría en el paso creativo). */
  conCreativo?: boolean
}

interface Catalogo {
  formatoId: string
  formatoNombre: string
  requisitos: ReturnType<typeof leerRequisitos>
  franjaId: string
  anticipacionHoras: number
  tope: number
  cortes: Enums["corte_metrica"][]
}

async function leerCatalogo(
  servicio: ClienteSupabase,
  formato: FormatoE2E
): Promise<Catalogo> {
  const [filaFormato, franjas, anticipacion, tope, cortes] = await Promise.all([
    servicio
      .from("formatos")
      .select("id, nombre, requisitos")
      .eq("plataforma", formato.plataforma)
      .eq("clave", formato.clave)
      .eq("activo", true)
      .maybeSingle(),
    servicio
      .from("franjas")
      .select("id, clave")
      .eq("activa", true)
      .order("orden"),
    numeroConfiguracion(servicio, "ofertas.anticipacion_minima_horas"),
    numeroConfiguracion(servicio, "campanas.tope_porcentaje_por_medio"),
    valorConfiguracion(servicio, "metricas.cortes_requeridos"),
  ])
  if (filaFormato.error) fallo("No se pudo leer el formato", filaFormato.error)
  if (franjas.error) fallo("No se pudieron leer las franjas", franjas.error)
  if (!filaFormato.data) {
    throw new ErrorBootstrap(
      `El formato ${formato.clave} de ${formato.plataforma} no existe o no está activo.`
    )
  }
  const franja =
    franjas.data.find((fila) => fila.clave === FRANJA_PREFERIDA) ??
    franjas.data[0]
  if (!franja) throw new ErrorBootstrap("No hay franjas activas.")
  return {
    formatoId: filaFormato.data.id,
    formatoNombre: filaFormato.data.nombre,
    requisitos: leerRequisitos(filaFormato.data.requisitos),
    franjaId: franja.id,
    anticipacionHoras: anticipacion,
    tope,
    cortes: (Array.isArray(cortes)
      ? cortes
      : ["H24"]) as Enums["corte_metrica"][],
  }
}

async function leerCampana(servicio: ClienteSupabase, campanaId: string) {
  const { data, error } = await servicio
    .from("campanas")
    .select(
      "id, anunciante_id, estado, fecha_inicio, fecha_fin, presupuesto_total, deleted_at, ofertas(estado, presupuesto_maximo, presupuesto_comprometido, deleted_at)"
    )
    .eq("id", campanaId)
    .maybeSingle()
  if (error) fallo("No se pudo leer la campaña", error)
  if (!data || data.deleted_at) {
    throw new ErrorBootstrap(
      `La campaña ${campanaId} no existe o está archivada.`
    )
  }
  return data
}

/**
 * Segmentación que le llega a un medio como a uno real de su zona: su
 * municipio y sus categorías temáticas (si tiene).
 */
async function segmentacionParaMedio(
  servicio: ClienteSupabase,
  medioId: string
): Promise<SegmentacionOferta> {
  const [medio, categorias] = await Promise.all([
    servicio
      .from("medios")
      .select("municipio_codigo")
      .eq("id", medioId)
      .maybeSingle(),
    servicio
      .from("medio_categorias")
      .select("categoria_id")
      .eq("medio_id", medioId),
  ])
  if (medio.error) fallo("No se pudo leer el medio", medio.error)
  if (categorias.error)
    fallo("No se pudieron leer las categorías del medio", categorias.error)
  if (!medio.data) {
    throw new ErrorBootstrap(`El medio ${medioId} no existe.`)
  }
  return {
    municipios: [medio.data.municipio_codigo],
    categorias: categorias.data.map((fila) => fila.categoria_id),
  }
}

/**
 * Sube el archivo a `creativos/oferta/{oferta}/{creativo}/…` (ruta construida
 * como en la app) y registra la fila con su huella y medidas. Si la fila no
 * entra (la BD revalida el formato), borra el objeto.
 */
async function subirArchivoCreativo(
  servicio: ClienteSupabase,
  rutas: typeof ModuloRutas,
  destino: { ofertaId: string; creativoId: string; orden: number },
  archivo: ArchivoPrueba,
  medidas: { ancho: number; alto: number; duracionSegundos: number | null }
): Promise<ArchivoCreado> {
  const { bucket, ruta } = rutas.nuevaRuta(
    rutas.carpetaCreativo(destino.ofertaId, destino.creativoId),
    archivo.mimeType
  )
  const almacen = servicio.storage.from(bucket)
  const { error: errorSubida } = await almacen.upload(ruta, archivo.buffer, {
    contentType: archivo.mimeType,
    upsert: false,
  })
  if (errorSubida) fallo(`No se pudo subir ${ruta}`, errorSubida)
  const creado: ArchivoCreado = {
    ruta,
    nombre: archivo.name,
    mime: archivo.mimeType,
    sha256: huellaSha256(archivo),
    tamanoBytes: archivo.buffer.length,
    ...medidas,
  }
  const { error } = await servicio.from("creativo_archivos").insert({
    creativo_id: destino.creativoId,
    archivo_path: ruta,
    mime: creado.mime,
    tamano_bytes: creado.tamanoBytes,
    ancho: creado.ancho,
    alto: creado.alto,
    duracion_segundos: creado.duracionSegundos,
    orden: destino.orden,
    sha256: creado.sha256,
  })
  if (error) {
    await almacen.remove([ruta])
    fallo("No se pudo registrar el archivo del creativo", error)
  }
  return creado
}

/**
 * Creativo con los archivos que pide el formato (`planCreativo`). En una
 * oferta en borrador queda vigente; en una publicada, pendiente hasta que se
 * active. `variante` (la versión que se espera crear) cambia el copy y los
 * archivos, para que cada versión tenga otra huella.
 */
async function crearCreativo(
  servicio: ClienteSupabase,
  ofertaId: string,
  clave: string,
  catalogo: Catalogo,
  variante = 1
): Promise<{ creativoId: string; archivos: ArchivoCreado[] }> {
  const plan = planCreativo(clave, catalogo.requisitos)
  const { data, error } = await servicio
    .from("creativos")
    .insert({
      oferta_id: ofertaId,
      tipo: plan.tipo,
      copy_sugerido:
        variante === 1
          ? "Creativo de prueba de AMO: descubre la marca E2E en tu ciudad. #Publicidad"
          : `Versión ${variante} del creativo de prueba de AMO: la marca E2E se renueva. #Publicidad`,
      hashtags: ["#AMOe2e", "#Publicidad"],
      menciones: ["@amo.e2e"],
      enlace_destino: "https://amo.test/e2e",
    })
    .select("id")
    .single()
  if (error) fallo("No se pudo crear el creativo", error)
  const rutas = rutasStorage()
  const archivos: ArchivoCreado[] = []
  for (const [orden, archivo] of plan.archivos.entries()) {
    // Otra duración en cada versión (dentro del máximo del formato).
    const segundos =
      archivo.segundos === null
        ? null
        : Math.max(1, archivo.segundos - ((variante - 1) % 2))
    const generado =
      archivo.clase === "video"
        ? videoPrueba({
            ancho: archivo.ancho,
            alto: archivo.alto,
            segundos: segundos ?? undefined,
          })
        : // Las piezas de un carrusel se distinguen (colores invertidos en la
          // 2.ª), y cada versión invierte la anterior.
          imagenPrueba({
            ancho: archivo.ancho,
            alto: archivo.alto,
            ...((orden + variante - 1) % 2 === 1
              ? { fondo: FRANJA_MUESTRA, franja: FONDO_MUESTRA }
              : {}),
          })
    archivos.push(
      await subirArchivoCreativo(
        servicio,
        rutas,
        { ofertaId, creativoId: data.id, orden },
        generado,
        {
          ancho: archivo.ancho,
          alto: archivo.alto,
          duracionSegundos: segundos,
        }
      )
    )
  }
  return { creativoId: data.id, archivos }
}

/**
 * Envía (y publica) la oferta. Si la fecha límite debe quedar vencida, espera
 * a estar lejos del cron de estados, la fija unos segundos adelante, envía con
 * la anticipación en 0 y espera a que pase. Si solo está más cerca que la
 * anticipación, envía con la anticipación en 0.
 */
async function enviarOferta(
  entorno: EntornoBootstrap,
  usuario: UsuarioAnunciante,
  oferta: {
    id: string
    estado: EstadoOfertaE2E
    vencida: boolean
    cercana: boolean
  },
  servicios: { comoEmpresa: ClienteSupabase; superadmin: ClienteSupabase }
): Promise<Date | null> {
  const { comoEmpresa, superadmin } = servicios
  // Antes de ingresar: la sesión y el operador no esperan al reloj.
  if (oferta.vencida) await esperar(esperaPorCron(Date.now()))

  const transiciones = async (
    empresa: ActorConSesion,
    moderador: ActorConSesion | null
  ): Promise<Date | null> => {
    const limite = oferta.vencida ? new Date(Date.now() + VENCE_EN_MS) : null
    if (limite) {
      const { error } = await comoEmpresa
        .from("ofertas")
        .update({ fecha_limite_aceptacion: limite.toISOString() })
        .eq("id", oferta.id)
      if (error) fallo("No se pudo ajustar la fecha límite", error)
    }
    const enviar = async () => {
      await transicionarComo(comoEmpresa, empresa, {
        entidad: "ofertas",
        id: oferta.id,
        hacia: "EN_REVISION",
      })
      if (moderador) {
        await transicionarComo(superadmin, moderador, {
          entidad: "ofertas",
          id: oferta.id,
          hacia: "PUBLICADA",
        })
      }
    }
    if (oferta.vencida || oferta.cercana) {
      await conAnticipacion(superadmin, 0, enviar)
    } else {
      await enviar()
    }
    if (limite) await esperarHasta(limite.getTime())
    return limite
  }

  return conSesionDeUsuario(entorno, usuario, (empresa) =>
    oferta.estado === "PUBLICADA"
      ? conOperadorTemporal(entorno, superadmin, (operador) =>
          transiciones(empresa, operador)
        )
      : transiciones(empresa, null)
  )
}

/**
 * Oferta de la campaña en el estado pedido, con nombre único («Oferta E2E
 * <formato> <sufijo>»), sin segmentación, 2 cupos en F1, el presupuesto que
 * quepa (2.000.000 o lo disponible) y su creativo con archivos reales que
 * cumplen el formato. EN_REVISION la envía la empresa con su sesión;
 * PUBLICADA, además, la publica un operador temporal.
 *
 * Para la pauta del medio: `ventanaDesdeHoy` abre la ventana de publicación
 * hoy (o hace unos días, en una campaña que empezó antes) y
 * `segmentacion: { paraMedio }` la dirige al municipio y las categorías del
 * medio; `cortes`, `publicacionesPorMedio` y las demás condiciones se fijan
 * como en el asistente.
 *
 * Con una `fechaLimite` pasada y estado EN_REVISION o PUBLICADA la llamada
 * puede tardar hasta ~1 minuto: espera a que el cron de estados no vaya a
 * correr en los próximos 45 s (la devolvería o vencería) y a que la límite
 * venza. Durante el envío, la anticipación mínima queda en 0 h un instante.
 */
export async function crearOferta(
  entorno: EntornoBootstrap,
  usuario: UsuarioAnunciante,
  opciones: OpcionesOferta
): Promise<OfertaCreada> {
  exigirFueraDeProduccion(entorno.url, "Las fábricas de ofertas E2E")
  const formato = opciones.formato ?? FORMATO_POR_OMISION
  const conCreativo = opciones.conCreativo ?? true
  if (!conCreativo && opciones.estado !== "BORRADOR") {
    throw new ErrorBootstrap(
      "Una oferta sin creativo solo puede quedar en BORRADOR."
    )
  }
  const superadmin = await clienteComoSuperadmin(entorno)
  const comoEmpresa = crearClienteServicio(entorno, usuario.id)
  const [campana, catalogo] = await Promise.all([
    leerCampana(superadmin, opciones.campanaId),
    leerCatalogo(superadmin, formato),
  ])
  if (opciones.estado !== "BORRADOR" && campana.estado !== "ACTIVA") {
    throw new ErrorBootstrap(
      `Para enviar la oferta la campaña debe estar ACTIVA (está ${campana.estado}).`
    )
  }
  const ahora = new Date()
  const envia = opciones.estado !== "BORRADOR"
  const vencida =
    envia &&
    opciones.fechaLimite !== undefined &&
    opciones.fechaLimite.getTime() <= ahora.getTime() + MARGEN_VENCIDA_MS
  const cercana =
    envia &&
    !vencida &&
    opciones.fechaLimite !== undefined &&
    opciones.fechaLimite.getTime() <
      ahora.getTime() + catalogo.anticipacionHoras * 3_600_000
  const parametrosCalendario = {
    ahora,
    anticipacionHoras: catalogo.anticipacionHoras,
    // La límite de una vencida se fija justo antes del envío.
    fechaLimite: vencida ? undefined : opciones.fechaLimite,
    campana: limitesCampana({
      fechaInicio: campana.fecha_inicio,
      fechaFin: campana.fecha_fin,
    }),
  }
  const { ventanaDesdeHoy } = opciones
  const calendario = ventanaDesdeHoy
    ? calendarioPauta({
        ...parametrosCalendario,
        diasAtras: ventanaDesdeHoy === true ? 0 : ventanaDesdeHoy.diasAtras,
      })
    : calendarioOferta(parametrosCalendario)
  const segmentacion =
    opciones.segmentacion && "paraMedio" in opciones.segmentacion
      ? await segmentacionParaMedio(superadmin, opciones.segmentacion.paraMedio)
      : (opciones.segmentacion ?? {})
  const disponible = disponibleCampana(
    Number(campana.presupuesto_total),
    campana.ofertas
  )
  const presupuesto =
    opciones.presupuesto ?? Math.min(PRESUPUESTO_OFERTA, disponible)
  if (presupuesto <= 0) {
    throw new ErrorBootstrap(
      "La campaña no tiene presupuesto disponible para otra oferta."
    )
  }

  const titulo =
    opciones.titulo ??
    `${PREFIJO_OFERTA} ${catalogo.formatoNombre} ${sufijoUnico()}`
  const { data, error } = await comoEmpresa
    .from("ofertas")
    .insert({
      campana_id: campana.id,
      anunciante_id: campana.anunciante_id,
      titulo,
      formato_id: catalogo.formatoId,
      plataforma: formato.plataforma,
      presupuesto_maximo: presupuesto,
      tope_porcentaje_por_medio: catalogo.tope,
      cortes_requeridos: opciones.cortes ?? catalogo.cortes,
      fecha_limite_aceptacion: calendario.fechaLimite.toISOString(),
      ventana_inicio: calendario.ventanaInicio.toISOString(),
      ventana_fin: calendario.ventanaFin.toISOString(),
      publicaciones_por_medio: opciones.publicacionesPorMedio,
      permite_multiples_cupos: opciones.permiteMultiplesCupos,
      permanencia_minima_dias: opciones.permanenciaMinimaDias,
      exclusividad_dias: opciones.exclusividadDias,
      departamentos_objetivo: segmentacion.departamentos,
      municipios_objetivo: segmentacion.municipios,
      categorias_objetivo: segmentacion.categorias,
      seguidores_minimos: segmentacion.seguidoresMinimos,
      medios_excluidos: segmentacion.mediosExcluidos,
      instrucciones:
        "Publica el creativo tal cual, con el copy sugerido y la etiqueta de publicidad.",
      restricciones: "No edites el video ni cambies el enlace de destino.",
    })
    .select("id")
    .single()
  if (error) fallo(`No se pudo crear la oferta «${titulo}»`, error)
  const ofertaId = data.id

  const { error: errorCupos } = await comoEmpresa.from("oferta_cupos").insert({
    oferta_id: ofertaId,
    franja_id: catalogo.franjaId,
    cupos_totales: opciones.cupos ?? CUPOS_POR_OMISION,
  })
  if (errorCupos) fallo("No se pudieron crear los cupos", errorCupos)

  const creativo = conCreativo
    ? await crearCreativo(comoEmpresa, ofertaId, formato.clave, catalogo)
    : { creativoId: null, archivos: [] }

  let fechaLimite = calendario.fechaLimite
  if (envia) {
    const limiteVencida = await enviarOferta(
      entorno,
      usuario,
      { id: ofertaId, estado: opciones.estado, vencida, cercana },
      { comoEmpresa, superadmin }
    )
    fechaLimite = limiteVencida ?? fechaLimite
  }
  return {
    id: ofertaId,
    titulo,
    campanaId: campana.id,
    anuncianteId: campana.anunciante_id,
    estado: opciones.estado,
    formato,
    fechaLimite,
    ventanaInicio: calendario.ventanaInicio,
    ventanaFin: calendario.ventanaFin,
    presupuesto,
    ...creativo,
  }
}

export interface VersionCreativoCreada {
  creativoId: string
  version: number
  archivos: ArchivoCreado[]
}

/**
 * Versión nueva del creativo de una oferta publicada, activada por la empresa
 * con su sesión (`activar_creativo_srv`): queda vigente y avisa a los medios
 * que aún no publican (NOT-006). Sus archivos y su copy cambian frente a la
 * versión anterior.
 */
export async function publicarNuevaVersionCreativo(
  entorno: EntornoBootstrap,
  usuario: UsuarioAnunciante,
  { ofertaId }: { ofertaId: string }
): Promise<VersionCreativoCreada> {
  exigirFueraDeProduccion(entorno.url, "Las fábricas de ofertas E2E")
  const servicio = crearClienteServicio(entorno)
  const comoEmpresa = crearClienteServicio(entorno, usuario.id)
  const { data: oferta, error } = await servicio
    .from("ofertas")
    .select("plataforma, formato:formatos ( clave ), creativos ( version )")
    .eq("id", ofertaId)
    .single()
  if (error) fallo("No se pudo leer la oferta", error)
  if (!oferta.formato) {
    throw new ErrorBootstrap(`La oferta ${ofertaId} no tiene formato.`)
  }
  const catalogo = await leerCatalogo(servicio, {
    plataforma: oferta.plataforma,
    clave: oferta.formato.clave,
  })
  const version =
    Math.max(0, ...oferta.creativos.map((creativo) => creativo.version)) + 1
  const creado = await crearCreativo(
    comoEmpresa,
    ofertaId,
    oferta.formato.clave,
    catalogo,
    version
  )
  try {
    await conSesionDeUsuario(entorno, usuario, async (actor) => {
      const { error: errorActivar } = await comoEmpresa.rpc(
        "activar_creativo_srv",
        {
          p_creativo_id: creado.creativoId,
          p_actor_id: actor.usuarioId,
          p_session_id: actor.sesionId,
        }
      )
      if (errorActivar) {
        fallo("No se pudo activar la versión nueva", errorActivar)
      }
    })
  } catch (falla) {
    // Una versión pendiente impide crear otra: no se deja a medias.
    await servicio.storage
      .from("creativos")
      .remove(creado.archivos.map((archivo) => archivo.ruta))
    await servicio.from("creativos").delete().eq("id", creado.creativoId)
    throw falla
  }
  return { ...creado, version }
}

// ── Limpieza ─────────────────────────────────────────────────────────────────

/**
 * Borra campañas de la empresa (todas, o las que empiezan por `prefijo`) con
 * sus ofertas, creativos, archivos en Storage y avisos. Una campaña con
 * asignaciones no se toca (no son datos de una fábrica): lanza. `servicio`
 * sale de `clienteComoSuperadmin` (actúa como el superadministrador y aplica
 * la guarda de producción). Devuelve cuántas campañas borró.
 */
export async function borrarNegocioDeAnunciante(
  servicio: ClienteSupabase,
  anuncianteId: string,
  { prefijo }: { prefijo?: string } = {}
): Promise<number> {
  let consulta = servicio
    .from("campanas")
    .select("id, nombre")
    .eq("anunciante_id", anuncianteId)
  if (prefijo) consulta = consulta.like("nombre", `${prefijo}%`)
  const { data: campanas, error } = await consulta
  if (error) fallo("No se pudieron leer las campañas", error)
  if (campanas.length === 0) return 0
  const campanaIds = campanas.map((campana) => campana.id)

  const asignaciones = await servicio
    .from("asignaciones")
    .select("id", { count: "exact", head: true })
    .in("campana_id", campanaIds)
  if (asignaciones.error)
    fallo("No se pudieron leer las asignaciones", asignaciones.error)
  if ((asignaciones.count ?? 0) > 0) {
    throw new ErrorBootstrap(
      "Hay campañas con asignaciones: no son de una fábrica E2E y no se borran."
    )
  }
  return borrarCampanasPorId(servicio, campanaIds)
}

/**
 * Borra esas campañas con sus ofertas, creativos, archivos en Storage y avisos.
 * Quien llama ya borró sus asignaciones (si no, la BD lo impide). Devuelve
 * cuántas campañas borró.
 */
export async function borrarCampanasPorId(
  servicio: ClienteSupabase,
  campanaIds: readonly string[]
): Promise<number> {
  if (campanaIds.length === 0) return 0
  const ofertas = await servicio
    .from("ofertas")
    .select("id")
    .in("campana_id", campanaIds)
  if (ofertas.error) fallo("No se pudieron leer las ofertas", ofertas.error)
  const ofertaIds = ofertas.data.map((oferta) => oferta.id)
  for (const ofertaId of ofertaIds) {
    const rutas = await listarArchivos(
      servicio,
      "creativos",
      `oferta/${ofertaId}`
    )
    if (rutas.length === 0) continue
    const { error: errorArchivos } = await servicio.storage
      .from("creativos")
      .remove(rutas)
    if (errorArchivos)
      fallo("No se pudieron borrar los archivos del creativo", errorArchivos)
  }
  const borrados = [
    () =>
      ofertaIds.length > 0
        ? servicio.from("creativos").delete().in("oferta_id", ofertaIds)
        : null,
    () =>
      ofertaIds.length > 0
        ? servicio.from("ofertas").delete().in("id", ofertaIds)
        : null,
    () => servicio.from("campanas").delete().in("id", campanaIds),
    // Avisos a otras personas (moderación, medios) sobre esas ofertas y campañas.
    () =>
      servicio
        .from("notificaciones")
        .delete()
        .in("entidad_id", [...ofertaIds, ...campanaIds]),
  ]
  for (const borrar of borrados) {
    const resultado = await borrar()
    if (resultado?.error)
      fallo("No se pudieron borrar las campañas de prueba", resultado.error)
  }
  return campanaIds.length
}
