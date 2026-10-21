/**
 * Datos de la prueba de carrera, creados por las vías normales (inserciones
 * con la secret key + `transicionar_srv` con el operador): anunciante
 * verificado, medios de nivel 1 con una cuenta de Instagram vigente en la
 * franja F1, y campañas activas con ofertas publicadas. Todo es `es_demo` y
 * lleva el identificador de la corrida en el nombre para poder limpiarlo.
 */
import type { Json } from "../../../src/types/database.types"
import type { ClienteSupabase } from "../../bootstrap/supabase"
import type { Actor } from "./cuentas"

export const PREFIJO_NOMBRE = "Carrera "
const MUNICIPIO = "11001"
const SEGUIDORES = 40_000
const DOCUMENTOS_NIVEL_1 = [
  "CEDULA_FRENTE",
  "CEDULA_REVERSO",
  "PRUEBA_VIDA",
  "CERT_BANCARIA",
] as const
const DIA_MS = 86_400_000

/** Ids creados en esta corrida (la limpieza los borra en orden inverso de dependencias). */
export interface Registro {
  usuarios: string[]
  anunciantes: string[]
  medios: string[]
  campanas: string[]
  ofertas: string[]
}

export function registroVacio(): Registro {
  return {
    usuarios: [],
    anunciantes: [],
    medios: [],
    campanas: [],
    ofertas: [],
  }
}

export interface Preparacion {
  servicio: ClienteSupabase
  corrida: string
  registro: Registro
  operador: Actor
}

/** Formato y franja de todas las ofertas: Instagram, publicación en el feed, F1. */
export interface Catalogo {
  formatoId: string
  franjaId: string
  sectorId: string
  /** Tarifa vigente de la franja para el formato (precio base de una publicación). */
  tarifaBase: number
}

function fallar(
  contexto: string,
  error: { message: string; details?: string | null }
): never {
  throw new Error(
    `${contexto}: ${error.message}${error.details ? ` (${error.details})` : ""}`
  )
}

export async function transicionar(
  prep: Preparacion,
  entidad: string,
  id: string,
  hacia: string,
  datos: Record<string, Json> = {}
): Promise<void> {
  const { error } = await prep.servicio.rpc("transicionar_srv", {
    p_entidad: entidad,
    p_id: id,
    p_hacia: hacia,
    p_actor_id: prep.operador.usuarioId,
    p_session_id: prep.operador.sesionId,
    p_datos: datos,
  })
  if (error) fallar(`${entidad} ${id} → ${hacia}`, error)
}

export async function leerCatalogo(
  servicio: ClienteSupabase
): Promise<Catalogo> {
  const [formato, franja, sector] = await Promise.all([
    servicio
      .from("formatos")
      .select("id")
      .eq("plataforma", "INSTAGRAM")
      .eq("clave", "POST_FEED")
      .single(),
    servicio
      .from("franjas")
      .select("id")
      .eq("clave", "F1")
      .eq("activa", true)
      .single(),
    servicio
      .from("sectores")
      .select("id")
      .eq("activo", true)
      .is("deleted_at", null)
      .limit(1)
      .single(),
  ])
  if (formato.error) fallar("formato POST_FEED", formato.error)
  if (franja.error) fallar("franja F1", franja.error)
  if (sector.error) fallar("sector", sector.error)
  const ahora = new Date().toISOString()
  const tarifa = await servicio
    .from("tarifas")
    .select("valor_base")
    .eq("formato_id", formato.data.id)
    .eq("franja_id", franja.data.id)
    .lte("vigente_desde", ahora)
    .or(`vigente_hasta.is.null,vigente_hasta.gt.${ahora}`)
    .single()
  if (tarifa.error) fallar("tarifa vigente F1", tarifa.error)
  return {
    formatoId: formato.data.id,
    franjaId: franja.data.id,
    sectorId: sector.data.id,
    tarifaBase: Number(tarifa.data.valor_base),
  }
}

export async function crearAnunciante(
  prep: Preparacion,
  catalogo: Catalogo
): Promise<string> {
  const nit = String(900_000_000 + Math.floor(Math.random() * 99_999_999))
  const { data, error } = await prep.servicio
    .from("anunciantes")
    .insert({
      razon_social: `${PREFIJO_NOMBRE}${prep.corrida} SAS`,
      nombre_comercial: `${PREFIJO_NOMBRE}${prep.corrida}`,
      nit,
      digito_verificacion: "7",
      sector_id: catalogo.sectorId,
      pais_iso2: "CO",
      municipio_codigo: MUNICIPIO,
      es_demo: true,
    })
    .select("id")
    .single()
  if (error) fallar("anunciante", error)
  prep.registro.anunciantes.push(data.id)
  await transicionar(prep, "anunciantes", data.id, "VERIFICADO")
  return data.id
}

export interface MedioPrueba {
  medioId: string
  cuentaId: string
}

async function aprobarDocumentos(
  prep: Preparacion,
  medioId: string
): Promise<void> {
  const { data, error } = await prep.servicio
    .from("documentos_medio")
    .insert(
      DOCUMENTOS_NIVEL_1.map((tipo) => ({
        medio_id: medioId,
        tipo,
        archivo_path: `medio/${medioId}/${tipo}/carrera.pdf`,
      }))
    )
    .select("id")
  if (error) fallar(`documentos del medio ${medioId}`, error)
  for (const documento of data) {
    await transicionar(prep, "documentos_medio", documento.id, "APROBADO")
  }
}

async function verificarCuenta(
  prep: Preparacion,
  medioId: string,
  indice: number
): Promise<string> {
  const handle = `carrera_${prep.corrida}_${indice}`
  const cuenta = await prep.servicio
    .from("cuentas_sociales")
    .insert({
      medio_id: medioId,
      plataforma: "INSTAGRAM",
      handle,
      url: `https://instagram.com/${handle}`,
    })
    .select("id")
    .single()
  if (cuenta.error) fallar(`cuenta del medio ${medioId}`, cuenta.error)
  const verificacion = await prep.servicio
    .from("verificaciones_cuenta")
    .insert({
      cuenta_social_id: cuenta.data.id,
      medio_id: medioId,
      metodo: "API",
      seguidores_reportados: SEGUIDORES,
    })
    .select("id")
    .single()
  if (verificacion.error)
    fallar(`verificación de la cuenta ${cuenta.data.id}`, verificacion.error)
  await transicionar(
    prep,
    "verificaciones_cuenta",
    verificacion.data.id,
    "APROBADA",
    {
      seguidores_verificados: SEGUIDORES,
    }
  )
  return cuenta.data.id
}

/** Medio VERIFICADO de nivel 1 en Bogotá con una cuenta vigente (elegible para toda oferta sin segmentación). */
export async function crearMedio(
  prep: Preparacion,
  indice: number
): Promise<MedioPrueba> {
  const { data, error } = await prep.servicio
    .from("medios")
    .insert({
      nombre: `${PREFIJO_NOMBRE}${prep.corrida} medio ${indice}`,
      tipo: "CREADOR",
      municipio_codigo: MUNICIPIO,
      es_demo: true,
    })
    .select("id")
    .single()
  if (error) fallar(`medio ${indice}`, error)
  const medioId = data.id
  prep.registro.medios.push(medioId)
  const privado = await prep.servicio
    .from("medios_privado")
    .insert({ medio_id: medioId, metodo_pago: "BANCARIO" })
  if (privado.error) fallar(`datos privados del medio ${indice}`, privado.error)
  await aprobarDocumentos(prep, medioId)
  const cuentaId = await verificarCuenta(prep, medioId, indice)
  await transicionar(prep, "medios", medioId, "VERIFICADO", { nivel: 1 })
  return { medioId, cuentaId }
}

/** Fecha civil de Bogotá (YYYY-MM-DD) desplazada `dias` desde hoy. */
function fechaBogota(dias: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
  }).format(new Date(Date.now() + dias * DIA_MS))
}

export async function crearCampana(
  prep: Preparacion,
  anuncianteId: string,
  nombre: string,
  presupuestoTotal: number
): Promise<string> {
  const { data, error } = await prep.servicio
    .from("campanas")
    .insert({
      anunciante_id: anuncianteId,
      nombre: `${PREFIJO_NOMBRE}${prep.corrida} ${nombre}`,
      marca: "Carrera",
      fecha_inicio: fechaBogota(0),
      fecha_fin: fechaBogota(30),
      presupuesto_total: presupuestoTotal,
    })
    .select("id")
    .single()
  if (error) fallar(`campaña ${nombre}`, error)
  prep.registro.campanas.push(data.id)
  await transicionar(prep, "campanas", data.id, "ACTIVA")
  return data.id
}

export interface OpcionesOferta {
  titulo: string
  cupos: number
  presupuestoMaximo: number
  tope: number
  publicaciones?: number
  multiplesCupos?: boolean
}

async function cargarCreativo(
  prep: Preparacion,
  ofertaId: string
): Promise<void> {
  const creativo = await prep.servicio
    .from("creativos")
    .insert({
      oferta_id: ofertaId,
      tipo: "IMAGEN",
      copy_sugerido: "Prueba de carrera",
    })
    .select("id")
    .single()
  if (creativo.error) fallar(`creativo de ${ofertaId}`, creativo.error)
  const archivo = await prep.servicio.from("creativo_archivos").insert({
    creativo_id: creativo.data.id,
    archivo_path: `oferta/${ofertaId}/${creativo.data.id}/pieza.png`,
    mime: "image/png",
    tamano_bytes: 1024,
  })
  if (archivo.error)
    fallar(`archivo del creativo de ${ofertaId}`, archivo.error)
}

/** Oferta PUBLICADA sin segmentación, con todos sus cupos en F1 y la ventana dentro de 3 días. */
export async function publicarOferta(
  prep: Preparacion,
  catalogo: Catalogo,
  campanaId: string,
  anuncianteId: string,
  opciones: OpcionesOferta
): Promise<string> {
  const ahora = Date.now()
  const { data, error } = await prep.servicio
    .from("ofertas")
    .insert({
      campana_id: campanaId,
      anunciante_id: anuncianteId,
      titulo: `${PREFIJO_NOMBRE}${prep.corrida} ${opciones.titulo}`,
      formato_id: catalogo.formatoId,
      plataforma: "INSTAGRAM",
      publicaciones_por_medio: opciones.publicaciones ?? 1,
      permite_multiples_cupos: opciones.multiplesCupos ?? false,
      presupuesto_maximo: opciones.presupuestoMaximo,
      tope_porcentaje_por_medio: opciones.tope,
      fecha_limite_aceptacion: new Date(ahora + 2 * DIA_MS).toISOString(),
      ventana_inicio: new Date(ahora + 3 * DIA_MS).toISOString(),
      ventana_fin: new Date(ahora + 10 * DIA_MS).toISOString(),
      cortes_requeridos: ["H24"],
    })
    .select("id")
    .single()
  if (error) fallar(`oferta ${opciones.titulo}`, error)
  const ofertaId = data.id
  prep.registro.ofertas.push(ofertaId)
  const cupos = await prep.servicio.from("oferta_cupos").insert({
    oferta_id: ofertaId,
    franja_id: catalogo.franjaId,
    cupos_totales: opciones.cupos,
  })
  if (cupos.error) fallar(`cupos de ${opciones.titulo}`, cupos.error)
  await cargarCreativo(prep, ofertaId)
  await transicionar(prep, "ofertas", ofertaId, "EN_REVISION")
  await transicionar(prep, "ofertas", ofertaId, "PUBLICADA")
  return ofertaId
}

/** Precio de una aceptación con multiplicadores neutros (§5.7): tarifa × publicaciones, redondeado a 100. */
export function precioEsperado(catalogo: Catalogo, publicaciones = 1): number {
  return Math.round((catalogo.tarifaBase * publicaciones) / 100) * 100
}

/** Ejecuta `tarea` sobre cada elemento con como máximo `limite` en paralelo (preparación, no la carrera). */
export async function enLotes<T, R>(
  elementos: readonly T[],
  limite: number,
  tarea: (elemento: T, indice: number) => Promise<R>
): Promise<R[]> {
  const resultados: R[] = new Array(elementos.length)
  let siguiente = 0
  const trabajador = async () => {
    while (siguiente < elementos.length) {
      const indice = siguiente++
      resultados[indice] = await tarea(elementos[indice], indice)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limite, elementos.length) }, trabajador)
  )
  return resultados
}
