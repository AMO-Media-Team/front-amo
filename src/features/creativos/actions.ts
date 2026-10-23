"use server"

/**
 * Server Actions del paquete creativo (ANU-008, ANU-010). Subida directa a
 * Storage (docs/modelo-datos.md §8) sin recomprimir los originales:
 *
 * 1. DAL antes que nada: cambiar exige `ofertas.gestionar_propias` (el
 *    anunciante dueño) u `ofertas.gestionar` (modo asistido); consultar y
 *    firmar, además, `ofertas.ver`.
 * 2. zod: el MISMO esquema que usa el navegador.
 * 3. La fila `creativos` existe antes de subir (la política de Storage la
 *    consulta). `prepararArchivoCreativo` revalida el archivo contra el formato
 *    y los topes vigentes y firma `oferta/{oferta}/{creativo}/{uuid}.{ext}` con
 *    la sesión (Storage evalúa ya su política de INSERT).
 * 4. `confirmarArchivoCreativo` comprueba la ruta (`archivoPerteneceA`), el
 *    objeto (`confirmarObjeto`), vuelve a validar e inserta con la sesión (RLS,
 *    trigger que exige SHA-256, medidas y el objeto en Storage, y bitácora con
 *    el actor). Es idempotente por ruta (índice único `archivo_path`).
 * 5. Las escrituras de `creativos` y `creativo_archivos` van con la sesión
 *    (el orden es un UPDATE de `orden`; descartar una versión pendiente, un
 *    DELETE); el servicio solo borra o copia objetos de Storage cuya ruta salió
 *    de una fila que la sesión pudo leer o borrar, o de la carpeta de la
 *    versión que la sesión borró. Activar una versión es
 *    `activar_creativo_srv` con `contextoDelActor`.
 */
import "server-only"

import { refresh } from "next/cache"

import { contextoDelActor } from "@/lib/auth/contexto-actor"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"
import type { ClavePermiso } from "@/lib/auth/permisos"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { esMimeConocido, extensionDeMime } from "@/lib/archivos/mime"
import type { SubidaPreparada, UrlFirmada } from "@/lib/archivos/tipos"
import { desdeErrorZod, exito, fallo, type ResultadoAccion } from "@/lib/result"
import {
  firmarDescarga,
  firmarDescargas,
  MENSAJES_DESCARGA,
} from "@/lib/storage/descargas"
import {
  archivoPerteneceA,
  carpetaCreativo,
  nuevaRuta,
  rutaMiniatura,
} from "@/lib/storage/rutas"
import {
  confirmarObjeto,
  MENSAJES_SUBIDA,
  prepararSubidaFirmada,
} from "@/lib/storage/subidas"
import { crearClienteServidor } from "@/lib/supabase/server"
import type { Json } from "@/types/database.types"

import {
  esRutaYaRegistrada,
  MENSAJES_CREATIVO,
  mensajeValidacion,
} from "./errores"
import {
  aArchivoCreativo,
  aVersionCreativo,
  COLUMNAS_ARCHIVO,
  COLUMNAS_CREATIVO,
  esSinPublicar,
  type FilaCreativo,
} from "./filas"
import { tipoAdmitido, tipoInicial } from "./formatos"
import { datosCreativo } from "./queries"
import {
  type EntradaActivarVersion,
  type EntradaConfirmarArchivo,
  type EntradaCrearVersion,
  type EntradaDescartarVersion,
  type EntradaFirmarArchivo,
  type EntradaFirmarVersion,
  type EntradaGuardarCreativo,
  type EntradaLeerCreativo,
  type EntradaOrdenarArchivos,
  type EntradaPrepararArchivo,
  type EntradaQuitarArchivo,
  esquemaActivarVersion,
  esquemaConfirmarArchivo,
  esquemaCrearVersion,
  esquemaDescartarVersion,
  esquemaFirmarArchivo,
  esquemaFirmarVersion,
  esquemaGuardarCreativo,
  esquemaLeerCreativo,
  esquemaOrdenarArchivos,
  esquemaPrepararArchivo,
  esquemaQuitarArchivo,
  MAX_ORDEN,
} from "./schemas"
import {
  type ClienteUsuario,
  falloBd,
  falloInesperado,
  informar,
  leerEdicion,
  problemaArchivo,
} from "./servidor"
import type {
  ArchivoCreativo,
  DatosCreativo,
  FirmasVersion,
  TextosCreativo,
  TipoCreativo,
  VersionActivada,
  VersionCreativo,
  VersionDescartada,
  VersionPreparada,
} from "./tipos"

// ── Utilidades internas (no exportadas: no son acciones) ─────────────────────

/** Cambiar el creativo: el anunciante dueño o el equipo AMO en modo asistido. */
const GESTIONAR: readonly ClavePermiso[] = [
  "ofertas.gestionar_propias",
  "ofertas.gestionar",
]
/** Consultar y ver los archivos: también quien revisa ofertas. */
const CONSULTAR: readonly ClavePermiso[] = [...GESTIONAR, "ofertas.ver"]

const BUCKET = "creativos"

const TEXTOS_EN_BLANCO: TextosCreativo = {
  copySugerido: null,
  hashtags: [],
  menciones: [],
  enlaceDestino: null,
}

function columnasTextos(textos: TextosCreativo) {
  return {
    copy_sugerido: textos.copySugerido,
    hashtags: textos.hashtags,
    menciones: textos.menciones,
    enlace_destino: textos.enlaceDestino,
  }
}

function textosDe(version: VersionCreativo): TextosCreativo {
  return {
    copySugerido: version.copySugerido,
    hashtags: version.hashtags,
    menciones: version.menciones,
    enlaceDestino: version.enlaceDestino,
  }
}

/** Inserta una versión con la sesión (el trigger decide número y vigencia). */
async function insertarVersion(
  supabase: ClienteUsuario,
  ofertaId: string,
  tipo: TipoCreativo,
  textos: TextosCreativo
): Promise<ResultadoAccion<VersionCreativo>> {
  const { data, error } = await supabase
    .from("creativos")
    .insert({ oferta_id: ofertaId, tipo, ...columnasTextos(textos) })
    .select(COLUMNAS_CREATIVO)
    .single()
  if (error) return falloBd("crear la versión del creativo", error)
  return exito(aVersionCreativo(data as FilaCreativo))
}

async function leerVersion(
  supabase: ClienteUsuario,
  creativoId: string
): Promise<ResultadoAccion<VersionCreativo>> {
  const { data, error } = await supabase
    .from("creativos")
    .select(COLUMNAS_CREATIVO)
    .eq("id", creativoId)
    .maybeSingle()
  if (error) return falloBd("leer el creativo", error)
  return data
    ? exito(aVersionCreativo(data as FilaCreativo))
    : fallo(MENSAJES_CREATIVO.creativoNoEncontrado)
}

/** La fila que ya registró esta ruta (reintento de una confirmación). */
async function archivoPorRuta(
  supabase: ClienteUsuario,
  creativoId: string,
  ruta: string
) {
  return supabase
    .from("creativo_archivos")
    .select(COLUMNAS_ARCHIVO)
    .eq("creativo_id", creativoId)
    .eq("archivo_path", ruta)
    .limit(1)
    .maybeSingle()
}

/** `numeric(8,2)`: la BD redondea igual; así la fila devuelta es la guardada. */
function duracionGuardada(segundos: number | null): number | null {
  return segundos === null ? null : Math.round(segundos * 100) / 100
}

/** Objeto y miniatura (`{uuid}-min.webp`, si se generó) de una ruta. */
function rutasDeObjeto(ruta: string): string[] {
  try {
    return [ruta, rutaMiniatura(ruta)]
  } catch {
    return [ruta]
  }
}

/** «creativo-v2-3.mp4» para descargar un archivo. */
function nombreDescarga(version: number, orden: number, mime: string): string {
  const extension = esMimeConocido(mime) ? `.${extensionDeMime(mime)}` : ""
  return `creativo-v${version}-${orden + 1}${extension}`
}

// ── Lecturas ─────────────────────────────────────────────────────────────────

/** Lo que pinta el panel creativo de una oferta (React Query en el navegador). */
export async function leerCreativoEditable(
  entrada: EntradaLeerCreativo
): Promise<ResultadoAccion<DatosCreativo>> {
  const usuario = await requerirPermiso(CONSULTAR)
  const validacion = esquemaLeerCreativo.safeParse(entrada)
  if (!validacion.success) return fallo(MENSAJES_CREATIVO.ofertaNoEncontrada)
  try {
    const datos = await datosCreativo(
      validacion.data.ofertaId,
      tieneAlgunPermiso(usuario, GESTIONAR),
      usuario.rol.tipo === "ANUNCIANTE"
    )
    return datos ? exito(datos) : fallo(MENSAJES_CREATIVO.ofertaNoEncontrada)
  } catch (error) {
    return falloInesperado("leer el creativo editable", error)
  }
}

/**
 * URL firmada de un archivo para verlo (o descargarlo). La ruta sale de la
 * fila que la sesión puede leer y se firma como usuario: el bucket lo leen el
 * dueño de la oferta y quien tiene `ofertas.ver`.
 */
export async function firmarArchivoCreativo(
  entrada: EntradaFirmarArchivo
): Promise<ResultadoAccion<UrlFirmada>> {
  await requerirPermiso(CONSULTAR)
  const validacion = esquemaFirmarArchivo.safeParse(entrada)
  if (!validacion.success) return fallo(MENSAJES_DESCARGA.noEncontrado)
  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("creativo_archivos")
      .select("archivo_path, mime, orden, creativo:creativos ( version )")
      .eq("id", validacion.data.archivoId)
      .maybeSingle()
    if (error) return falloBd("leer el archivo del creativo", error)
    if (!data) return fallo(MENSAJES_DESCARGA.noEncontrado)
    return await firmarDescarga({
      bucket: BUCKET,
      ruta: data.archivo_path,
      firmante: { como: "usuario", cliente: supabase },
      descarga: validacion.data.descargar
        ? nombreDescarga(data.creativo?.version ?? 1, data.orden, data.mime)
        : undefined,
    })
  } catch (error) {
    return falloInesperado("firmar el archivo del creativo", error)
  }
}

/** URL firmadas de los archivos de una versión y de sus miniaturas, en una sola firma. */
export async function firmarArchivosVersion(
  entrada: EntradaFirmarVersion
): Promise<ResultadoAccion<FirmasVersion>> {
  await requerirPermiso(CONSULTAR)
  const validacion = esquemaFirmarVersion.safeParse(entrada)
  if (!validacion.success) return fallo(MENSAJES_DESCARGA.noEncontrado)
  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("creativo_archivos")
      .select("id, archivo_path")
      .eq("creativo_id", validacion.data.creativoId)
    if (error) return falloBd("leer los archivos del creativo", error)
    const firmadas = await firmarDescargas({
      bucket: BUCKET,
      rutas: data.flatMap((fila) => rutasDeObjeto(fila.archivo_path)),
      firmante: { como: "usuario", cliente: supabase },
    })
    if (!firmadas.ok) return firmadas
    const { urls, vigenciaSegundos } = firmadas.datos
    const archivos: FirmasVersion["archivos"] = {}
    for (const fila of data) {
      const url = urls[fila.archivo_path]
      if (!url) continue
      const [, miniatura] = rutasDeObjeto(fila.archivo_path)
      archivos[fila.id] = {
        url,
        miniatura: miniatura ? (urls[miniatura] ?? null) : null,
      }
    }
    return exito({ archivos, vigenciaSegundos })
  } catch (error) {
    return falloInesperado("firmar los archivos del creativo", error)
  }
}

// ── Versión editable y textos ────────────────────────────────────────────────

/**
 * Crea la versión editable si falta (con su tipo) y guarda los textos si
 * vienen. En una oferta sin publicar, cambiar el tipo de una versión sin
 * archivos crea otra versión (la BD deja vigente la nueva); el tipo de una
 * versión pendiente no cambia.
 */
export async function guardarCreativo(
  entrada: EntradaGuardarCreativo
): Promise<ResultadoAccion<VersionCreativo>> {
  await requerirPermiso(GESTIONAR)
  const validacion = esquemaGuardarCreativo.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { ofertaId, tipo, textos } = validacion.data
  try {
    const datos = await datosCreativo(ofertaId, true)
    if (!datos) return fallo(MENSAJES_CREATIVO.ofertaNoEncontrada)
    if (!tipoAdmitido(datos.formato, tipo)) {
      return fallo(MENSAJES_CREATIVO.tipoNoAdmitido)
    }
    if (datos.bloqueo) return fallo(datos.bloqueo)
    const supabase = await crearClienteServidor()
    const editable = datos.editable
    if (!editable) {
      return await insertarVersion(
        supabase,
        ofertaId,
        tipo,
        textos ?? TEXTOS_EN_BLANCO
      )
    }
    if (editable.tipo !== tipo) {
      if (editable.archivos.length > 0) {
        return fallo(MENSAJES_CREATIVO.tipoConArchivos)
      }
      if (editable.pendiente) return fallo(MENSAJES_CREATIVO.tipoPendiente)
      return await insertarVersion(
        supabase,
        ofertaId,
        tipo,
        textos ?? textosDe(editable)
      )
    }
    if (!textos) return exito(editable)
    const { data, error } = await supabase
      .from("creativos")
      .update(columnasTextos(textos))
      .eq("id", editable.id)
      .select(COLUMNAS_CREATIVO)
      .maybeSingle()
    if (error) return falloBd("guardar los textos del creativo", error)
    return data
      ? exito(aVersionCreativo(data as FilaCreativo))
      : fallo(MENSAJES_CREATIVO.noEditable)
  } catch (error) {
    return falloInesperado("guardar el creativo", error)
  }
}

// ── Archivos ─────────────────────────────────────────────────────────────────

/** Destino firmado para subir un archivo a la versión editable. */
export async function prepararArchivoCreativo(
  entrada: EntradaPrepararArchivo
): Promise<ResultadoAccion<SubidaPreparada>> {
  await requerirPermiso(GESTIONAR)
  const validacion = esquemaPrepararArchivo.safeParse(entrada)
  if (!validacion.success) return fallo(mensajeValidacion(validacion.error))
  const { ofertaId, creativoId, archivo } = validacion.data
  try {
    const supabase = await crearClienteServidor()
    const lectura = await leerEdicion(supabase, creativoId, ofertaId)
    if (!lectura.ok) return lectura
    const problema = problemaArchivo(lectura.edicion, archivo)
    if (problema) return fallo(problema)
    const destino = nuevaRuta(
      carpetaCreativo(ofertaId, creativoId),
      archivo.tipo
    )
    return await prepararSubidaFirmada({
      cliente: supabase,
      ...destino,
      miniatura: archivo.conMiniatura,
    })
  } catch (error) {
    return falloInesperado("preparar la subida del creativo", error)
  }
}

/** Registra el archivo ya subido en su versión; idempotente por ruta. */
export async function confirmarArchivoCreativo(
  entrada: EntradaConfirmarArchivo
): Promise<ResultadoAccion<ArchivoCreativo>> {
  await requerirPermiso(GESTIONAR)
  const validacion = esquemaConfirmarArchivo.safeParse(entrada)
  if (!validacion.success) return fallo(mensajeValidacion(validacion.error))
  const { ofertaId, creativoId, archivo, orden } = validacion.data
  try {
    const destino = carpetaCreativo(ofertaId, creativoId)
    if (!archivoPerteneceA(archivo, destino)) {
      return fallo(MENSAJES_SUBIDA.noCoincide)
    }
    const supabase = await crearClienteServidor()
    const previo = await archivoPorRuta(supabase, creativoId, archivo.ruta)
    if (previo.error) return falloBd("buscar el archivo", previo.error)
    if (previo.data) return exito(aArchivoCreativo(previo.data))

    const lectura = await leerEdicion(supabase, creativoId, ofertaId)
    if (!lectura.ok) return lectura
    const problema = problemaArchivo(lectura.edicion, archivo)
    if (problema) return fallo(problema)

    const objeto = await confirmarObjeto({
      cliente: supabase,
      bucket: destino.bucket,
      ruta: archivo.ruta,
      esperado: { tamano: archivo.tamano, tipo: archivo.tipo },
    })
    if (!objeto.ok) return objeto

    const existentes = lectura.edicion.version.archivos
    const siguiente =
      existentes.reduce((maximo, a) => Math.max(maximo, a.orden), -1) + 1
    const { data, error } = await supabase
      .from("creativo_archivos")
      .insert({
        creativo_id: creativoId,
        archivo_path: archivo.ruta,
        mime: archivo.tipo,
        tamano_bytes: objeto.datos.tamano ?? archivo.tamano,
        ancho: archivo.dimensiones?.ancho ?? null,
        alto: archivo.dimensiones?.alto ?? null,
        duracion_segundos: duracionGuardada(archivo.duracionSeg),
        orden: Math.min(orden ?? siguiente, MAX_ORDEN),
        sha256: archivo.sha256,
      })
      .select(COLUMNAS_ARCHIVO)
      .single()
    if (error && esRutaYaRegistrada(error)) {
      // Otra confirmación de la misma subida ganó la carrera: ya está registrada.
      const registrado = await archivoPorRuta(
        supabase,
        creativoId,
        archivo.ruta
      )
      if (registrado.data) return exito(aArchivoCreativo(registrado.data))
    }
    if (error) return falloBd("registrar el archivo del creativo", error)
    return exito(aArchivoCreativo(data))
  } catch (error) {
    return falloInesperado("confirmar el archivo del creativo", error)
  }
}

/**
 * Quita un archivo de la versión editable. La fila se borra con la sesión (la
 * política solo lo permite en la vigente sin publicar o en la pendiente); el
 * objeto y su miniatura se borran después como servicio, con la ruta de la
 * fila borrada.
 */
export async function quitarArchivoCreativo(
  entrada: EntradaQuitarArchivo
): Promise<ResultadoAccion<{ creativoId: string }>> {
  const usuario = await requerirPermiso(GESTIONAR)
  const validacion = esquemaQuitarArchivo.safeParse(entrada)
  if (!validacion.success) return fallo(MENSAJES_CREATIVO.archivoNoEncontrado)
  const { archivoId } = validacion.data
  try {
    const supabase = await crearClienteServidor()
    const { data: fila, error: errorLectura } = await supabase
      .from("creativo_archivos")
      .select("id, creativo_id, archivo_path")
      .eq("id", archivoId)
      .maybeSingle()
    if (errorLectura) return falloBd("leer el archivo", errorLectura)
    if (!fila) return fallo(MENSAJES_CREATIVO.archivoNoEncontrado)
    const lectura = await leerEdicion(supabase, fila.creativo_id)
    if (!lectura.ok) return lectura

    const { data: borradas, error } = await supabase
      .from("creativo_archivos")
      .delete()
      .eq("id", archivoId)
      .select("id")
    if (error) return falloBd("quitar el archivo", error)
    if (borradas.length === 0) return fallo(MENSAJES_CREATIVO.noEditable)

    await borrarObjetoSinUso(usuario, supabase, fila.archivo_path)
    return exito({ creativoId: fila.creativo_id })
  } catch (error) {
    return falloInesperado("quitar el archivo del creativo", error)
  }
}

/** Borra el objeto (y su miniatura) si ninguna fila lo usa; un fallo solo se registra. */
async function borrarObjetoSinUso(
  usuario: UsuarioSesion,
  supabase: ClienteUsuario,
  ruta: string
): Promise<void> {
  try {
    const { count } = await supabase
      .from("creativo_archivos")
      .select("id", { count: "exact", head: true })
      .eq("archivo_path", ruta)
    if (count !== 0) return
    const { admin } = await contextoDelActor(usuario)
    const { error } = await admin.storage
      .from(BUCKET)
      .remove(rutasDeObjeto(ruta))
    if (error) informar("borrar el objeto del creativo", error)
  } catch (error) {
    informar("borrar el objeto del creativo", error)
  }
}

/**
 * Cambia el orden de los archivos de la versión editable (el del carrusel):
 * un UPDATE de `orden` por cada fila que cambia de puesto, con la sesión (la
 * política «update orden» pide lo mismo que quitar un archivo y solo deja
 * tocar esa columna). Si una escritura falla, las anteriores quedan: la
 * interfaz vuelve a leer la versión para mostrar el orden guardado.
 */
export async function ordenarArchivosCreativo(
  entrada: EntradaOrdenarArchivos
): Promise<ResultadoAccion<VersionCreativo>> {
  await requerirPermiso(GESTIONAR)
  const validacion = esquemaOrdenarArchivos.safeParse(entrada)
  if (!validacion.success) return fallo(mensajeValidacion(validacion.error))
  const { creativoId, ids } = validacion.data
  try {
    const supabase = await crearClienteServidor()
    const lectura = await leerEdicion(supabase, creativoId)
    if (!lectura.ok) return lectura
    const { version } = lectura.edicion
    const actuales = version.archivos
    const ordenPorId = new Map(
      actuales.map((archivo) => [archivo.id, archivo.orden])
    )
    if (
      ids.length !== actuales.length ||
      ids.some((id) => !ordenPorId.has(id))
    ) {
      return fallo(MENSAJES_CREATIVO.ordenDistinto)
    }
    if (ids.every((id, indice) => actuales[indice].id === id)) {
      return exito(version)
    }
    const cambios = ids
      .map((id, orden) => ({ id, orden }))
      .filter(({ id, orden }) => ordenPorId.get(id) !== orden)
    for (const { id, orden } of cambios) {
      const { data, error } = await supabase
        .from("creativo_archivos")
        .update({ orden })
        .eq("id", id)
        .eq("creativo_id", creativoId)
        .select("id")
      if (error) return falloBd("ordenar los archivos", error)
      // La política no la dejó cambiar (la oferta cambió de estado) o ya no está.
      if (data.length === 0) return fallo(MENSAJES_CREATIVO.ordenFallido)
    }
    return await leerVersion(supabase, creativoId)
  } catch (error) {
    return falloInesperado("ordenar los archivos del creativo", error)
  }
}

function filaParaInsertar(
  creativoId: string,
  archivo: ArchivoCreativo,
  orden: number
) {
  return {
    creativo_id: creativoId,
    archivo_path: archivo.ruta,
    mime: archivo.mime,
    tamano_bytes: archivo.tamanoBytes,
    ancho: archivo.ancho,
    alto: archivo.alto,
    duracion_segundos: archivo.duracionSegundos,
    orden,
    sha256: archivo.sha256,
  }
}

// ── Versiones de una oferta publicada (ANU-010) ──────────────────────────────

const AVISO_COPIA =
  "La versión nueva quedó creada, pero no pudimos copiar todos los archivos de la vigente: cárgalos de nuevo antes de activarla."

/**
 * Prepara la versión nueva (pendiente) de una oferta publicada. Con
 * `conservar` parte de la vigente: copia sus textos y sus archivos (el objeto
 * se copia como servicio a la carpeta de la versión nueva y la fila se inserta
 * con la sesión, que la BD revalida). Los medios siguen viendo la vigente
 * hasta que se active.
 */
export async function crearVersionPendiente(
  entrada: EntradaCrearVersion
): Promise<ResultadoAccion<VersionPreparada>> {
  const usuario = await requerirPermiso(GESTIONAR)
  const validacion = esquemaCrearVersion.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { ofertaId, tipo, conservar } = validacion.data
  try {
    const datos = await datosCreativo(ofertaId, true)
    if (!datos) return fallo(MENSAJES_CREATIVO.ofertaNoEncontrada)
    if (datos.editable?.pendiente) {
      return fallo(MENSAJES_CREATIVO.pendienteExiste)
    }
    if (!datos.admiteVersionNueva) {
      return fallo(
        esSinPublicar(datos.estadoOferta)
          ? MENSAJES_CREATIVO.sinPublicar
          : (datos.bloqueo ?? MENSAJES_CREATIVO.cerrada)
      )
    }
    const base = conservar ? datos.vigente : null
    const tipoNuevo = base?.tipo ?? tipo ?? tipoInicial(datos.formato)
    if (!tipoAdmitido(datos.formato, tipoNuevo)) {
      return fallo(
        base
          ? MENSAJES_CREATIVO.tipoVigenteNoAdmitido
          : MENSAJES_CREATIVO.tipoNoAdmitido
      )
    }
    const supabase = await crearClienteServidor()
    const creada = await insertarVersion(
      supabase,
      ofertaId,
      tipoNuevo,
      base ? textosDe(base) : TEXTOS_EN_BLANCO
    )
    if (!creada.ok) return creada
    let aviso: string | null = null
    if (base && base.archivos.length > 0) {
      const copiados = await copiarArchivos(
        usuario,
        supabase,
        ofertaId,
        base.archivos,
        creada.datos.id
      )
      if (!copiados) aviso = AVISO_COPIA
    }
    const final = await leerVersion(supabase, creada.datos.id)
    refresh()
    return exito({ version: final.ok ? final.datos : creada.datos, aviso })
  } catch (error) {
    return falloInesperado("crear la versión nueva del creativo", error)
  }
}

/** `true` si todos los archivos quedaron copiados y registrados en la versión nueva. */
async function copiarArchivos(
  usuario: UsuarioSesion,
  supabase: ClienteUsuario,
  ofertaId: string,
  archivos: readonly ArchivoCreativo[],
  creativoId: string
): Promise<boolean> {
  const { admin } = await contextoDelActor(usuario)
  const almacen = admin.storage.from(BUCKET)
  const carpeta = carpetaCreativo(ofertaId, creativoId)
  const copias: ArchivoCreativo[] = []
  for (const archivo of archivos) {
    const destino = nuevaRuta(carpeta, archivo.mime)
    const { error } = await almacen.copy(archivo.ruta, destino.ruta)
    if (error) {
      informar("copiar un archivo del creativo", error)
      continue
    }
    const [, origenMiniatura] = rutasDeObjeto(archivo.ruta)
    const [, destinoMiniatura] = rutasDeObjeto(destino.ruta)
    if (origenMiniatura && destinoMiniatura) {
      // Sin miniatura (p. ej. no se generó) el panel muestra el original.
      await almacen.copy(origenMiniatura, destinoMiniatura).catch(() => null)
    }
    copias.push({ ...archivo, ruta: destino.ruta })
  }
  if (copias.length === 0) return false
  const { error } = await supabase
    .from("creativo_archivos")
    .insert(
      copias.map((archivo) =>
        filaParaInsertar(creativoId, archivo, archivo.orden)
      )
    )
  if (error) {
    informar("registrar las copias del creativo", error)
    await almacen
      .remove(copias.flatMap((archivo) => rutasDeObjeto(archivo.ruta)))
      .catch(() => null)
    return false
  }
  return copias.length === archivos.length
}

function leerActivacion(datos: Json): VersionActivada {
  const objeto: Record<string, Json | undefined> =
    datos && typeof datos === "object" && !Array.isArray(datos) ? datos : {}
  return {
    version: typeof objeto.version === "number" ? objeto.version : 0,
    reemplazaA:
      typeof objeto.reemplaza_a === "string" ? objeto.reemplaza_a : null,
  }
}

/**
 * Activa la versión pendiente (`activar_creativo_srv`): queda vigente, la
 * anterior deja de estarlo y los medios con asignaciones reciben el aviso.
 */
export async function activarVersionCreativo(
  entrada: EntradaActivarVersion
): Promise<ResultadoAccion<VersionActivada>> {
  const usuario = await requerirPermiso(GESTIONAR)
  const validacion = esquemaActivarVersion.safeParse(entrada)
  if (!validacion.success) return fallo(MENSAJES_CREATIVO.creativoNoEncontrado)
  try {
    const contexto = await contextoDelActor(usuario)
    const { data, error } = await contexto.admin.rpc("activar_creativo_srv", {
      p_creativo_id: validacion.data.creativoId,
      p_actor_id: contexto.actorId,
      p_session_id: contexto.sessionId,
    })
    if (error) return falloBd("activar la versión del creativo", error)
    refresh()
    return exito(leerActivacion(data))
  } catch (error) {
    return falloInesperado("activar la versión del creativo", error)
  }
}

/**
 * Descarta la versión en preparación de una oferta publicada (nadie la ha
 * visto: no está activada). La fila se borra con la sesión (política
 * «creativos: delete pendiente»; sus archivos caen en cascada) y después se
 * limpia su carpeta de Storage como servicio. La vigente no cambia.
 */
export async function descartarVersionPendiente(
  entrada: EntradaDescartarVersion
): Promise<ResultadoAccion<VersionDescartada>> {
  const usuario = await requerirPermiso(GESTIONAR)
  const validacion = esquemaDescartarVersion.safeParse(entrada)
  if (!validacion.success) return fallo(MENSAJES_CREATIVO.creativoNoEncontrado)
  const { creativoId } = validacion.data
  try {
    const supabase = await crearClienteServidor()
    const lectura = await leerEdicion(supabase, creativoId)
    if (!lectura.ok) return lectura
    const { version, ofertaId } = lectura.edicion
    if (!version.pendiente) return fallo(MENSAJES_CREATIVO.soloPendiente)

    const { data: borradas, error } = await supabase
      .from("creativos")
      .delete()
      .eq("id", creativoId)
      .select("id")
    if (error) return falloBd("descartar la versión del creativo", error)
    if (borradas.length === 0) return fallo(MENSAJES_CREATIVO.noEditable)

    await limpiarCarpetaVersion(
      usuario,
      ofertaId,
      creativoId,
      version.archivos.map((archivo) => archivo.ruta)
    )
    refresh()
    return exito({ creativoId, version: version.version })
  } catch (error) {
    return falloInesperado("descartar la versión del creativo", error)
  }
}

/**
 * Borra como servicio los objetos de la carpeta de una versión ya borrada:
 * originales, miniaturas y subidas que no se llegaron a confirmar. Antes
 * comprueba que ninguna fila que quede (de otra versión) use alguno; si lo
 * usa, ese objeto y su miniatura se conservan, y si no se puede comprobar no
 * se borra nada. Un fallo solo se registra: la versión ya quedó descartada.
 */
async function limpiarCarpetaVersion(
  usuario: UsuarioSesion,
  ofertaId: string,
  creativoId: string,
  rutasFilas: readonly string[]
): Promise<void> {
  try {
    const { carpeta } = carpetaCreativo(ofertaId, creativoId)
    const dentro = (ruta: string) => ruta.startsWith(`${carpeta}/`)
    const { admin } = await contextoDelActor(usuario)
    const almacen = admin.storage.from(BUCKET)
    const listado = await almacen.list(carpeta, { limit: 1000 })
    if (listado.error)
      informar("listar la carpeta de la versión", listado.error)
    const rutas = [
      ...new Set([
        ...rutasFilas.flatMap(rutasDeObjeto),
        // Las carpetas del listado no traen id: solo se toman los objetos.
        ...(listado.data ?? [])
          .filter((objeto) => objeto.id)
          .map((objeto) => `${carpeta}/${objeto.name}`),
      ]),
    ].filter(dentro)
    if (rutas.length === 0) return

    const { data: enUso, error } = await admin
      .from("creativo_archivos")
      .select("archivo_path")
      .in("archivo_path", rutas)
    if (error) {
      informar("comprobar los objetos de la versión", error)
      return
    }
    const conservar = new Set(
      enUso.flatMap((fila) => rutasDeObjeto(fila.archivo_path))
    )
    const borrar = rutas.filter((ruta) => !conservar.has(ruta))
    if (borrar.length === 0) return
    const { error: errorBorrado } = await almacen.remove(borrar)
    if (errorBorrado) {
      informar("borrar los objetos de la versión", errorBorrado)
    }
  } catch (error) {
    informar("borrar los objetos de la versión", error)
  }
}
