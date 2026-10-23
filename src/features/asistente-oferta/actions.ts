"use server"

/**
 * Server Actions del asistente de oferta (ANU-004…009).
 *
 * 1. DAL (`requerirPermiso("ofertas.gestionar_propias")`), antes que nada.
 * 2. zod: el MISMO esquema que el formulario (`esquemaOferta(null)`, lo que
 *    exige la BD para guardar). Las reglas del envío las aplica la BD al
 *    pasar a revisión y devuelve en `hint` el paso que falta.
 * 3. Borradores (`ofertas` + `oferta_cupos`, uno por formato) con el cliente
 *    del USUARIO: RLS «propio», la empresa la deriva la BD de la campaña y la
 *    bitácora queda con el actor. Bloqueo optimista con `updated_at` (no se
 *    pisa lo que guardó un compañero) y, tras un intento sin respuesta, se
 *    adoptan los borradores que alcanzó a crear (no se duplican). El envío a
 *    revisión, solo por `transicionar` (máquina de estados), y el descarte,
 *    por `archivar_oferta_srv`; ambos con el actor y su sesión.
 * 4. Estimador y buscador de exclusiones: funciones de la BD que no exponen
 *    medios individuales ni cifras por medio.
 */
import "server-only"

import { requerirPermiso } from "@/lib/auth/dal"
import { contextoDelActor } from "@/lib/auth/contexto-actor"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { type ErrorBd, MENSAJE_INESPERADO } from "@/lib/errores-bd"
import { transicionar } from "@/lib/negocio/transicionar"
import {
  desdeErrorZod,
  exito,
  fallo,
  type ResultadoAccion,
  type ResultadoExito,
  type ResultadoFallo,
} from "@/lib/result"
import { argumentosRpc } from "@/lib/supabase/rpc"
import { crearClienteServidor } from "@/lib/supabase/server"
import type { Database } from "@/types/database.types"

import {
  CAMPANA_SIN_OFERTAS,
  interpretarErrorEnvio,
  interpretarErrorGuardado,
  OFERTA_DESACTUALIZADA,
  SIN_EMPRESA,
} from "./errores"
import {
  type Cupo,
  diferenciaCupos,
  filaOferta,
  sinCambiosCupos,
} from "./persistencia"
import {
  type DatosOferta,
  esquemaBorradorOferta,
  esquemaBuscarMedios,
  esquemaDescartarOferta,
  esquemaEstimacion,
  esquemaReferenciasOfertas,
  type ParametrosEstimacion,
  type ReferenciasOfertas,
  type ValoresOferta,
} from "./schemas"
import type {
  EstadoOferta,
  EstimacionFranja,
  MedioExcluido,
  OfertaEnCurso,
  RechazoEnvio,
  ResultadoEnvio,
} from "./tipos"

// ── Utilidades internas (no exportadas: no son acciones) ─────────────────────

type ClienteUsuario = Awaited<ReturnType<typeof crearClienteServidor>>
type InsercionOferta = Database["public"]["Tables"]["ofertas"]["Insert"]

const EDITABLES: readonly EstadoOferta[] = ["BORRADOR", "DEVUELTA"]

/** Lo que el asistente necesita de cada oferta, con su versión. */
const COLUMNAS_OFERTA = "id, formato_id, estado, updated_at"

interface FilaOfertaLeida {
  id: string
  formato_id: string
  estado: EstadoOferta
  updated_at: string
}

/**
 * Margen sobre la espera que mide el navegador desde el intento sin
 * respuesta (latencia de la red y relojes del servidor y de la BD).
 */
const MARGEN_REINTENTO_S = 60

/** Log de servidor sin datos personales: operación y código. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[asistente-oferta] ${operacion} falló (${codigo})`)
}

function falloInesperado(operacion: string, error: unknown): ResultadoFallo {
  informar(operacion, error)
  return fallo(MENSAJE_INESPERADO)
}

function falloGuardado(operacion: string, error: ErrorBd): ResultadoFallo {
  const { mensaje, campo, esperado } = interpretarErrorGuardado(error)
  if (!esperado) informar(operacion, error)
  return campo ? fallo(mensaje, { [campo]: [mensaje] }) : fallo(mensaje)
}

function esEditable(estado: EstadoOferta): boolean {
  return EDITABLES.includes(estado)
}

/**
 * Resultado de guardar: si falla después de crear alguna oferta, el fallo
 * trae las ya creadas para que el asistente no las duplique al reintentar.
 */
export type ResultadoGuardarOfertas =
  | ResultadoExito<OfertaEnCurso[]>
  | (ResultadoFallo & { ofertas?: OfertaEnCurso[] })

export interface EntradaGuardarOfertas extends ReferenciasOfertas {
  valores: ValoresOferta
}

interface EntradaValidada {
  campanaId: string
  existentes: { formatoId: string; ofertaId: string; actualizadaAt: string }[]
  segundosDesdeFallo?: number
  datos: DatosOferta
}

function validarEntrada(
  entrada: EntradaGuardarOfertas
): EntradaValidada | ResultadoFallo {
  const referencias = esquemaReferenciasOfertas.safeParse({
    campanaId: entrada?.campanaId,
    existentes: entrada?.existentes,
    segundosDesdeFallo: entrada?.segundosDesdeFallo,
  })
  if (!referencias.success) return desdeErrorZod(referencias.error)
  // Las rutas de error quedan relativas a los valores (`cuanto.formatos.0…`),
  // las mismas del formulario.
  const valores = esquemaBorradorOferta.safeParse(entrada?.valores)
  if (!valores.success) return desdeErrorZod(valores.error)
  return { ...referencias.data, datos: valores.data }
}

function esFallo(
  valor: object
): valor is ResultadoFallo & { ofertas?: OfertaEnCurso[] } {
  return "ok" in valor && valor.ok === false
}

/** Sincroniza los cupos de cada oferta con lo pedido (solo lo que cambió). */
async function guardarCupos(
  supabase: ClienteUsuario,
  deseados: ReadonlyMap<string, Cupo[]>
): Promise<ErrorBd | null> {
  const ofertaIds = [...deseados.keys()]
  if (ofertaIds.length === 0) return null
  const { data, error } = await supabase
    .from("oferta_cupos")
    .select("oferta_id, franja_id, cupos_totales")
    .in("oferta_id", ofertaIds)
  if (error) return error
  const inserciones: {
    oferta_id: string
    franja_id: string
    cupos_totales: number
  }[] = []
  for (const [ofertaId, cupos] of deseados) {
    const guardados = data
      .filter((fila) => fila.oferta_id === ofertaId)
      .map((fila) => ({
        franjaId: fila.franja_id,
        cantidad: fila.cupos_totales,
      }))
    const diferencia = diferenciaCupos(guardados, cupos)
    if (sinCambiosCupos(diferencia)) continue
    if (diferencia.borrar.length > 0) {
      const borrado = await supabase
        .from("oferta_cupos")
        .delete()
        .eq("oferta_id", ofertaId)
        .in("franja_id", diferencia.borrar)
      if (borrado.error) return borrado.error
    }
    for (const cupo of diferencia.actualizar) {
      const cambio = await supabase
        .from("oferta_cupos")
        .update({ cupos_totales: cupo.cantidad })
        .eq("oferta_id", ofertaId)
        .eq("franja_id", cupo.franjaId)
      if (cambio.error) return cambio.error
    }
    inserciones.push(
      ...diferencia.insertar.map((cupo) => ({
        oferta_id: ofertaId,
        franja_id: cupo.franjaId,
        cupos_totales: cupo.cantidad,
      }))
    )
  }
  if (inserciones.length === 0) return null
  const insercion = await supabase.from("oferta_cupos").insert(inserciones)
  return insercion.error
}

function enCurso(fila: FilaOfertaLeida): OfertaEnCurso {
  return {
    ofertaId: fila.id,
    formatoId: fila.formato_id,
    estado: fila.estado,
    actualizadaAt: fila.updated_at,
  }
}

/**
 * Estado y versión vigentes de las ofertas, en el mismo orden: los cupos y
 * las transiciones cambian `updated_at` después de escribir la fila. Si la
 * lectura falla se devuelven como estaban (el próximo guardado lo dirá).
 */
async function versionesVigentes(
  supabase: ClienteUsuario,
  ofertas: readonly OfertaEnCurso[]
): Promise<OfertaEnCurso[]> {
  if (ofertas.length === 0) return []
  const { data, error } = await supabase
    .from("ofertas")
    .select(COLUMNAS_OFERTA)
    .in(
      "id",
      ofertas.map((oferta) => oferta.ofertaId)
    )
  if (error) {
    informar("releer las ofertas", error)
    return [...ofertas]
  }
  const porId = new Map(data.map((fila) => [fila.id, fila]))
  return ofertas.map((oferta) => {
    const fila = porId.get(oferta.ofertaId)
    return fila ? enCurso(fila) : oferta
  })
}

/**
 * Borradores que un intento anterior alcanzó a crear aunque su respuesta no
 * llegó (falló la red): de la misma campaña, creados por el mismo actor para
 * los formatos que faltan, desde que empezó ese intento. Del más reciente al
 * más antiguo.
 */
function borradoresSinRespuesta(
  supabase: ClienteUsuario,
  {
    campanaId,
    actorId,
    formatoIds,
    segundos,
  }: {
    campanaId: string
    actorId: string
    formatoIds: string[]
    segundos: number
  }
) {
  const desde = new Date(
    Date.now() - (segundos + MARGEN_REINTENTO_S) * 1000
  ).toISOString()
  return supabase
    .from("ofertas")
    .select(COLUMNAS_OFERTA)
    .eq("campana_id", campanaId)
    .eq("creada_por", actorId)
    .in("formato_id", formatoIds)
    .gte("created_at", desde)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
}

/**
 * Crea o actualiza una oferta por formato, en el orden del asistente. Las
 * ofertas que ya no son editables (enviadas en un intento anterior) no se
 * tocan: se devuelven con su estado. Una editable que otra persona guardó
 * después de que el asistente la leyera (otro `updated_at`) no se pisa.
 */
async function persistir(
  supabase: ClienteUsuario,
  actorId: string,
  { campanaId, existentes, segundosDesdeFallo, datos }: EntradaValidada
): Promise<OfertaEnCurso[] | (ResultadoFallo & { ofertas?: OfertaEnCurso[] })> {
  const formatoIds = datos.cuanto.formatos.map((formato) => formato.formatoId)
  const [campana, formatos, guardadas] = await Promise.all([
    supabase
      .from("campanas")
      .select("id, estado")
      .eq("id", campanaId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("formatos")
      .select("id, plataforma")
      .in("id", formatoIds)
      .eq("activo", true),
    existentes.length > 0
      ? supabase
          .from("ofertas")
          .select(COLUMNAS_OFERTA)
          .eq("campana_id", campanaId)
          .in(
            "id",
            existentes.map((existente) => existente.ofertaId)
          )
      : Promise.resolve({ data: [] as FilaOfertaLeida[], error: null }),
  ])
  if (campana.error) return falloInesperado("leer la campaña", campana.error)
  if (!campana.data) {
    return fallo(
      "No encontramos la campaña o ya no tienes acceso a ella. Actualiza la página."
    )
  }
  if (formatos.error)
    return falloInesperado("leer los formatos", formatos.error)
  if (guardadas.error) {
    return falloInesperado("leer las ofertas", guardadas.error)
  }
  const plataformaDe = new Map(formatos.data.map((f) => [f.id, f.plataforma]))
  if (guardadas.data.length < existentes.length) {
    return fallo(
      "No encontramos una de las ofertas de este asistente. Actualiza la página para ver su estado."
    )
  }
  // Bloqueo optimista: si un compañero guardó una oferta editable después de
  // que el asistente la leyera, no se escribe nada (las que ya no son
  // editables no se tocan: el asistente lo detecta por su estado).
  const versiones = new Map(
    existentes.map((existente) => [existente.ofertaId, existente.actualizadaAt])
  )
  if (
    guardadas.data.some(
      (oferta) =>
        esEditable(oferta.estado) &&
        oferta.updated_at !== versiones.get(oferta.id)
    )
  ) {
    return fallo(OFERTA_DESACTUALIZADA)
  }
  // El formato de cada oferta lo dice la BD, no la entrada.
  const previas = new Map<string, FilaOfertaLeida>(
    guardadas.data.map((oferta) => [oferta.formato_id, oferta])
  )

  // El intento anterior se quedó sin respuesta: lo que alcanzó a crear se
  // adopta (se actualiza) en vez de crear otro borrador del mismo formato.
  let adoptadas = 0
  const faltantes = formatoIds.filter((formatoId) => !previas.has(formatoId))
  if (segundosDesdeFallo !== undefined && faltantes.length > 0) {
    const huerfanas = await borradoresSinRespuesta(supabase, {
      campanaId,
      actorId,
      formatoIds: faltantes,
      segundos: segundosDesdeFallo,
    })
    if (huerfanas.error) {
      return falloInesperado(
        "buscar los borradores sin respuesta",
        huerfanas.error
      )
    }
    for (const oferta of huerfanas.data) {
      if (previas.has(oferta.formato_id)) continue
      previas.set(oferta.formato_id, oferta)
      adoptadas += 1
    }
  }

  const nuevas = datos.cuanto.formatos.filter((f) => !previas.has(f.formatoId))
  if (
    nuevas.length > 0 &&
    !["BORRADOR", "ACTIVA"].includes(campana.data.estado)
  ) {
    return fallo(CAMPANA_SIN_OFERTAS)
  }
  if (nuevas.some((formato) => !plataformaDe.has(formato.formatoId))) {
    return fallo(
      "Uno de los formatos elegidos ya no está disponible. Quítalo e intenta de nuevo.",
      {
        "que.formatoIds": [
          "Uno de los formatos elegidos ya no está disponible.",
        ],
      }
    )
  }

  const resultado = new Map<string, OfertaEnCurso>()
  for (const [formatoId, oferta] of previas) {
    resultado.set(formatoId, enCurso(oferta))
  }
  const enOrden = () =>
    formatoIds.flatMap((formatoId) => {
      const oferta = resultado.get(formatoId)
      return oferta ? [oferta] : []
    })
  // Si falla después de escribir (o de adoptar), el fallo trae las ofertas
  // con su versión vigente: el asistente no las duplica ni choca consigo
  // mismo al reintentar.
  let escribio = false
  const conOfertas = async (
    fallido: ResultadoFallo
  ): Promise<ResultadoFallo & { ofertas?: OfertaEnCurso[] }> =>
    escribio || adoptadas > 0
      ? { ...fallido, ofertas: await versionesVigentes(supabase, enOrden()) }
      : fallido

  if (nuevas.length > 0) {
    // Una sola inserción: o se crean todas las ofertas nuevas o ninguna.
    // `anunciante_id` lo deriva la BD de la campaña (sin GRANT de inserción).
    const filas = nuevas.map(
      (formato) =>
        ({
          ...filaOferta(datos, formato),
          campana_id: campanaId,
          formato_id: formato.formatoId,
          plataforma: plataformaDe.get(formato.formatoId)!,
        }) as Omit<InsercionOferta, "anunciante_id"> as InsercionOferta
    )
    const { data, error } = await supabase
      .from("ofertas")
      .insert(filas)
      .select(COLUMNAS_OFERTA)
    if (error) return conOfertas(falloGuardado("crear las ofertas", error))
    escribio = true
    for (const oferta of data) resultado.set(oferta.formato_id, enCurso(oferta))
  }

  const cupos = new Map<string, Cupo[]>()
  for (const formato of datos.cuanto.formatos) {
    const oferta = resultado.get(formato.formatoId)
    if (!oferta || !esEditable(oferta.estado)) continue
    if (previas.has(formato.formatoId)) {
      // Solo si sigue editable y en la versión leída (bloqueo optimista).
      const { data, error } = await supabase
        .from("ofertas")
        .update(filaOferta(datos, formato))
        .eq("id", oferta.ofertaId)
        .in("estado", [...EDITABLES])
        .eq("updated_at", oferta.actualizadaAt)
        .select("id")
        .maybeSingle()
      if (error) {
        return conOfertas(falloGuardado("actualizar la oferta", error))
      }
      if (!data) return conOfertas(fallo(OFERTA_DESACTUALIZADA))
      escribio = true
    }
    cupos.set(oferta.ofertaId, formato.cupos)
  }

  const errorCupos = await guardarCupos(supabase, cupos)
  if (errorCupos) {
    return conOfertas(falloGuardado("guardar los cupos", errorCupos))
  }
  return versionesVigentes(supabase, enOrden())
}

async function prepararGuardado(
  usuario: UsuarioSesion,
  entrada: EntradaGuardarOfertas
): Promise<
  | { supabase: ClienteUsuario; ofertas: OfertaEnCurso[] }
  | (ResultadoFallo & { ofertas?: OfertaEnCurso[] })
> {
  if (!usuario.anuncianteId) return fallo(SIN_EMPRESA)
  const validacion = validarEntrada(entrada)
  if ("ok" in validacion) return validacion
  const supabase = await crearClienteServidor()
  const ofertas = await persistir(supabase, usuario.id, validacion)
  if (!Array.isArray(ofertas)) return ofertas
  return { supabase, ofertas }
}

// ── Borradores ───────────────────────────────────────────────────────────────

/**
 * Crea los borradores (uno por formato) o actualiza los que el asistente ya
 * creó. Devuelve cada oferta con su estado y su versión, en el orden de los
 * formatos.
 */
export async function guardarOfertas(
  entrada: EntradaGuardarOfertas
): Promise<ResultadoGuardarOfertas> {
  const usuario = await requerirPermiso("ofertas.gestionar_propias")
  try {
    const guardado = await prepararGuardado(usuario, entrada)
    if (esFallo(guardado)) return guardado
    return exito(guardado.ofertas)
  } catch (error) {
    return falloInesperado("guardarOfertas", error)
  }
}

/**
 * Descarta el borrador de un formato que se quitó del asistente: lo archiva
 * (`archivar_oferta_srv`, sin aviso a nadie), así que deja de verse en la
 * campaña en vez de quedar como «Cancelada». La BD revalida actor, sesión,
 * empresa y estado (una oferta ya enviada no se archiva).
 */
export async function descartarOferta(entrada: {
  ofertaId: string
}): Promise<ResultadoAccion> {
  const usuario = await requerirPermiso("ofertas.gestionar_propias")
  const validacion = esquemaDescartarOferta.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  try {
    const contexto = await contextoDelActor(usuario)
    const { error } = await contexto.admin.rpc("archivar_oferta_srv", {
      p_oferta_id: validacion.data.ofertaId,
      p_actor_id: contexto.actorId,
      p_session_id: contexto.sessionId,
    })
    if (error) {
      const { mensaje, esperado } = interpretarErrorGuardado(error)
      if (!esperado) informar("descartarOferta", error)
      return fallo(mensaje)
    }
    return exito()
  } catch (error) {
    return falloInesperado("descartarOferta", error)
  }
}

// ── Envío a revisión ─────────────────────────────────────────────────────────

/**
 * Guarda lo último del asistente y envía a revisión cada oferta editable
 * (BORRADOR → EN_REVISION o DEVUELTA → EN_REVISION). La BD valida todo y, si
 * algo falta, dice en qué paso (`hint`): ese rechazo se devuelve como dato
 * para que el asistente lleve a la persona al paso con el mensaje. Las demás
 * ofertas se envían igual.
 */
export async function enviarOfertasARevision(
  entrada: EntradaGuardarOfertas
): Promise<
  | ResultadoAccion<ResultadoEnvio>
  | (ResultadoFallo & { ofertas?: OfertaEnCurso[] })
> {
  const usuario = await requerirPermiso("ofertas.gestionar_propias")
  try {
    const guardado = await prepararGuardado(usuario, entrada)
    if (esFallo(guardado)) return guardado
    const contexto = await contextoDelActor(usuario)
    const enviadas: string[] = []
    const rechazos: RechazoEnvio[] = []
    const ofertas: OfertaEnCurso[] = []
    // En orden: el presupuesto de cada una se compara con lo que dejan las anteriores.
    for (const oferta of guardado.ofertas) {
      if (!esEditable(oferta.estado)) {
        ofertas.push(oferta)
        continue
      }
      const { error } = await transicionar(contexto, {
        entidad: "ofertas",
        id: oferta.ofertaId,
        hacia: "EN_REVISION",
      })
      if (error) {
        const rechazo = interpretarErrorEnvio(error)
        if (!rechazo.esperado) informar("enviar a revisión", error)
        rechazos.push({
          ofertaId: oferta.ofertaId,
          paso: rechazo.paso,
          mensaje: rechazo.mensaje,
        })
        ofertas.push(oferta)
        continue
      }
      enviadas.push(oferta.ofertaId)
      ofertas.push({ ...oferta, estado: "EN_REVISION" })
    }
    // Cada transición cambia la versión: el asistente sigue con la vigente.
    return exito({
      ofertas: await versionesVigentes(guardado.supabase, ofertas),
      enviadas,
      rechazos,
    })
  } catch (error) {
    return falloInesperado("enviarOfertasARevision", error)
  }
}

// ── Estimador y exclusiones ──────────────────────────────────────────────────

/**
 * Estimador por franja (`estimar_oferta`): medios elegibles, precio mediano,
 * inversión y alcance. Con menos medios de los configurados la BD no dice
 * cuántos son ni da cifras (null: «Menos de N», «Sin estimación»).
 */
export async function estimarOferta(
  entrada: ParametrosEstimacion
): Promise<ResultadoAccion<EstimacionFranja[]>> {
  await requerirPermiso("ofertas.gestionar_propias")
  const validacion = esquemaEstimacion.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const p = validacion.data
  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase.rpc(
      "estimar_oferta",
      argumentosRpc<"estimar_oferta">({
        p_formato_id: p.formatoId,
        p_departamentos: p.departamentos,
        p_municipios: p.municipios,
        p_categorias: p.categorias,
        p_seguidores_minimos: p.seguidoresMinimos,
        p_cupos: p.cupos,
        p_exclusividad_dias: p.exclusividadDias,
        p_medios_excluidos: p.mediosExcluidos,
        p_publicaciones: p.publicaciones,
      })
    )
    if (error) {
      const { mensaje, esperado } = interpretarErrorGuardado(error)
      if (!esperado) informar("estimarOferta", error)
      return fallo(mensaje)
    }
    const numero = (valor: number | null | undefined) =>
      valor === null || valor === undefined ? null : Number(valor)
    return exito(
      data.map((fila) => ({
        franjaId: fila.franja_id,
        // Los tipos generados no dicen que puede venir null.
        mediosElegibles: numero(fila.medios_elegibles),
        precioMediano: numero(fila.precio_mediano),
        inversionEstimada: numero(fila.inversion_estimada),
        alcanceMediano: numero(fila.alcance_mediano_estimado),
      }))
    )
  } catch (error) {
    return falloInesperado("estimarOferta", error)
  }
}

/** Medios verificados por su nombre público, para excluirlos (sin cifras). */
export async function buscarMediosExcluibles(entrada: {
  texto: string
}): Promise<ResultadoAccion<MedioExcluido[]>> {
  await requerirPermiso("ofertas.gestionar_propias")
  const validacion = esquemaBuscarMedios.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase.rpc("medios_para_exclusion", {
      p_texto: validacion.data.texto,
      p_limite: 20,
    })
    if (error) {
      const { mensaje, esperado } = interpretarErrorGuardado(error)
      if (!esperado) informar("buscarMediosExcluibles", error)
      return fallo(mensaje)
    }
    return exito(
      data.map((medio) => ({
        id: medio.id,
        nombre: medio.nombre,
        municipio: medio.municipio ?? null,
      }))
    )
  } catch (error) {
    return falloInesperado("buscarMediosExcluibles", error)
  }
}
