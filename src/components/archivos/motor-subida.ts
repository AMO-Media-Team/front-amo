/**
 * Motor de una subida, independiente de React: procesa el archivo
 * (compresión, validación, medidas, hash, miniatura), pide el destino al
 * servidor (`preparar`), lo sube por URL firmada o TUS con reintentos de espera
 * creciente, se pausa mientras no hay conexión y se reanuda sola, y confirma
 * con el servidor (`confirmar`). Si algo falla, `iniciar()` retoma desde la
 * etapa que falló (no repite la compresión ni una subida ya terminada).
 */
import type { BucketStorage } from "@/lib/archivos/buckets"
import type { OpcionesCompresion } from "@/lib/archivos/compresion"
import { categoriaDe, mimeDeArchivo } from "@/lib/archivos/mime"
import {
  ErrorSubida,
  errorCancelada,
  esperaReintento,
  POLITICA_REINTENTOS,
  type PoliticaReintentos,
} from "@/lib/archivos/reintentos"
import { metodoSubida, progresoConjunto } from "@/lib/archivos/subida"
import type {
  ArchivoSubido,
  DescripcionArchivo,
  DestinoSubida,
  Dimensiones,
  SubidaPreparada,
} from "@/lib/archivos/tipos"
import type { ReglasArchivo, ResultadoValidacion } from "@/lib/archivos/validar"
import type { ResultadoAccion } from "@/lib/result"

import type { AlProgresar } from "./transporte-firmado"
import type { SubidaReanudable } from "./transporte-tus"

export type EstadoSubida =
  | "en-cola"
  | "procesando"
  | "preparando"
  | "subiendo"
  | "pausada"
  | "reintentando"
  | "confirmando"
  | "completada"
  | "error"
  | "cancelada"

/** Estados con trabajo en marcha (p. ej. el botón de enviar espera). */
export const ESTADOS_ACTIVOS: ReadonlySet<EstadoSubida> = new Set([
  "procesando",
  "preparando",
  "subiendo",
  "pausada",
  "reintentando",
  "confirmando",
])

export interface InstantaneaSubida {
  estado: EstadoSubida
  /** 0–1: bytes enviados de archivo y miniatura. */
  progreso: number
  error: string | null
  /** Reintento automático en curso (0 = primer intento). */
  intento: number
  /** Cuándo se reintenta (ms de época), mientras `estado` es "reintentando". */
  reanudaEn: number | null
}

export const INSTANTANEA_INICIAL: InstantaneaSubida = {
  estado: "en-cola",
  progreso: 0,
  error: null,
  intento: 0,
  reanudaEn: null,
}

export interface OpcionesSubida<T> {
  /**
   * Server Action que autoriza, construye la ruta y llama a
   * `prepararSubidaFirmada`. Recibe solo la descripción del archivo.
   */
  preparar: (
    descripcion: DescripcionArchivo
  ) => Promise<ResultadoAccion<SubidaPreparada>>
  /**
   * Server Action que comprueba la ruta (`archivoPerteneceA`), verifica el
   * objeto (`confirmarObjeto`) y guarda la fila. DEBE ser idempotente por
   * `ruta`: si la respuesta se pierde (red, cancelación) el motor la vuelve a
   * llamar con el mismo archivo, y la segunda vez ha de devolver la misma
   * fila en lugar de duplicarla o fallar.
   */
  confirmar: (archivo: ArchivoSubido) => Promise<ResultadoAccion<T>>
  /**
   * Recomprime imágenes antes de subir (capturas, documentos fotografiados).
   * Los creativos originales no se recomprimen.
   */
  comprimir?: OpcionesCompresion | ((archivo: File) => Promise<File>)
  /** Se comprueban sobre el archivo final (ya comprimido). */
  reglas?: ReglasArchivo
  /** Genera y sube una miniatura de ≤ 320 px (imágenes y videos). */
  miniatura?: boolean
  /** Calcula el SHA-256 del archivo final. */
  hash?: boolean
  /** Lee dimensiones (imagen o video) y duración (video). */
  medidas?: boolean
  /** Reintentos automáticos por etapa (4 por defecto). */
  reintentos?: number
  /** `false` fuerza la URL firmada aunque pese más de 6 MB. */
  usarTus?: boolean
}

export type ResultadoSubida<T> =
  | { ok: true; datos: T; archivo: ArchivoSubido }
  | { ok: false; error: string; cancelada: boolean }

/** Todo lo que el motor toca fuera de sí mismo (en pruebas se sustituye). */
export interface EntornoSubida {
  subirFirmada(opciones: {
    bucket: BucketStorage
    destino: DestinoSubida
    archivo: File
    senal: AbortSignal
    alProgresar: AlProgresar
  }): Promise<void>
  crearTus(opciones: {
    bucket: BucketStorage
    ruta: string
    archivo: File
  }): SubidaReanudable
  enLinea(): boolean
  /** Suscribe a los cambios de conexión; devuelve la baja. */
  alCambiarConexion(oyente: (enLinea: boolean) => void): () => void
  esperar(ms: number, senal: AbortSignal): Promise<void>
  ahora(): number
  aleatorio(): number
  validarArchivo(
    archivo: File,
    reglas: ReglasArchivo
  ): Promise<ResultadoValidacion>
  comprimirImagen(archivo: File, opciones: OpcionesCompresion): Promise<File>
  generarMiniatura(archivo: File, senal: AbortSignal): Promise<File>
  sha256Hex(archivo: File, senal: AbortSignal): Promise<string>
  leerDimensiones(archivo: File): Promise<Dimensiones>
  leerDuracionVideo(archivo: File): Promise<number>
}

export interface ControladorSubida<T> {
  /** Inicia o, tras un error o una cancelación, retoma la subida. */
  iniciar(): Promise<ResultadoSubida<T>>
  cancelar(): void
  instantanea(): InstantaneaSubida
}

export const MENSAJES_MOTOR = {
  procesar:
    "No pudimos preparar el archivo en este dispositivo. Prueba con otro.",
  servidor:
    "No pudimos comunicarnos con el servidor. Revisa tu conexión e inténtalo de nuevo.",
  cancelada: "Subida cancelada.",
} as const

/**
 * Un 409 que sigue tras los reintentos (TUS: el objeto ya existe o su subida
 * quedó bloqueada) no se arregla insistiendo en el mismo destino.
 */
const CONFLICTO = 409

/** Fallo que no se arregla repitiendo (lo devolvió el servidor o la validación). */
class ErrorDefinitivo extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "ErrorDefinitivo"
  }
}

function esReintentable(error: unknown): boolean {
  if (error instanceof ErrorSubida) return error.reintentable
  return !(error instanceof ErrorDefinitivo)
}

function mensajeDe(error: unknown): string {
  if (error instanceof ErrorSubida || error instanceof ErrorDefinitivo) {
    return error.message
  }
  return MENSAJES_MOTOR.servidor
}

/**
 * Las Server Actions no aceptan `AbortSignal`: si se cancela o se pierde la
 * conexión, se deja de esperar su respuesta (lo que el servidor haga después
 * es idempotente: firmar o confirmar otra vez la misma ruta).
 */
function conSenal<R>(promesa: Promise<R>, senal: AbortSignal): Promise<R> {
  if (senal.aborted) return Promise.reject(errorCancelada())
  return new Promise((resolver, rechazar) => {
    const alAbortar = () => rechazar(errorCancelada())
    senal.addEventListener("abort", alAbortar, { once: true })
    promesa.then(resolver, rechazar).finally(() => {
      senal.removeEventListener("abort", alAbortar)
    })
  })
}

/** El MIME del `File` es el que Storage usa como `Content-Type`. */
function conTipoNormalizado(archivo: File): File {
  const tipo = mimeDeArchivo(archivo)
  return archivo.type === tipo
    ? archivo
    : new File([archivo], archivo.name, {
        type: tipo,
        lastModified: archivo.lastModified,
      })
}

interface Procesado {
  archivo: File
  miniatura: File | null
  descripcion: DescripcionArchivo
}

interface Bytes {
  enviados: number
  total: number
}

export function crearSubida<T>(
  original: File,
  opciones: OpcionesSubida<T>,
  entorno: EntornoSubida,
  alCambiar: (instantanea: InstantaneaSubida) => void
): ControladorSubida<T> {
  const politica: PoliticaReintentos = {
    ...POLITICA_REINTENTOS,
    intentos: opciones.reintentos ?? POLITICA_REINTENTOS.intentos,
  }
  let actual = INSTANTANEA_INICIAL
  let procesado: Procesado | null = null
  let preparada: SubidaPreparada | null = null
  let tus: SubidaReanudable | null = null
  let principalSubido = false
  let miniaturaSubida = false
  let resultado: ResultadoSubida<T> | null = null
  let enCurso: Promise<ResultadoSubida<T>> | null = null
  let cancelacion: AbortController | null = null
  const bytes: { principal: Bytes; miniatura: Bytes } = {
    principal: { enviados: 0, total: 0 },
    miniatura: { enviados: 0, total: 0 },
  }

  function emitir(cambios: Partial<InstantaneaSubida>) {
    actual = { ...actual, ...cambios }
    alCambiar(actual)
  }

  function progreso(): number {
    return progresoConjunto([bytes.principal, bytes.miniatura])
  }

  /** Olvida el destino: el siguiente intento pide uno nuevo y sube de cero. */
  function olvidarDestino() {
    preparada = null
    principalSubido = false
    miniaturaSubida = false
    const anterior = tus
    tus = null
    void anterior?.descartar()
    bytes.principal.enviados = 0
    bytes.miniatura.enviados = 0
  }

  function esperarConexion(senal: AbortSignal): Promise<void> {
    // Una señal ya abortada no vuelve a disparar `abort`: sin esto, cancelar
    // mientras se procesaba el archivo no detenía la subida.
    if (senal.aborted) return Promise.reject(errorCancelada())
    if (entorno.enLinea()) return Promise.resolve()
    emitir({ estado: "pausada", reanudaEn: null })
    return new Promise((resolver, rechazar) => {
      const alAbortar = () => {
        baja()
        rechazar(errorCancelada())
      }
      const baja = entorno.alCambiarConexion((enLinea) => {
        if (!enLinea) return
        baja()
        senal.removeEventListener("abort", alAbortar)
        resolver()
      })
      senal.addEventListener("abort", alAbortar, { once: true })
    })
  }

  /**
   * Ejecuta `tarea` con reintentos de espera creciente. Si se pierde la
   * conexión durante un intento, lo detiene y espera a que vuelva sin
   * contarlo como fallo (al volver, TUS reanuda desde el último bloque).
   */
  async function conReintentos<R>(
    estado: EstadoSubida,
    senal: AbortSignal,
    tarea: (senalIntento: AbortSignal) => Promise<R>
  ): Promise<R> {
    let intento = 0
    for (;;) {
      await esperarConexion(senal)
      emitir({ estado, intento, reanudaEn: null, progreso: progreso() })
      const intentoActual = new AbortController()
      const alAbortar = () => intentoActual.abort()
      senal.addEventListener("abort", alAbortar, { once: true })
      const baja = entorno.alCambiarConexion((enLinea) => {
        if (!enLinea) intentoActual.abort()
      })
      try {
        return await conSenal(tarea(intentoActual.signal), intentoActual.signal)
      } catch (error) {
        if (senal.aborted) throw errorCancelada()
        if (!entorno.enLinea()) continue
        if (!esReintentable(error) || intento >= politica.intentos) throw error
        intento += 1
        const espera = esperaReintento(intento, politica, entorno.aleatorio)
        emitir({
          estado: "reintentando",
          intento,
          reanudaEn: entorno.ahora() + espera,
        })
        await entorno.esperar(espera, senal)
      } finally {
        baja()
        senal.removeEventListener("abort", alAbortar)
      }
    }
  }

  async function medir(
    archivo: File,
    validacion: ResultadoValidacion | null
  ): Promise<Pick<DescripcionArchivo, "dimensiones" | "duracionSeg">> {
    const conocidas = validacion?.ok ? validacion : null
    let dimensiones = conocidas?.dimensiones ?? null
    let duracionSeg = conocidas?.duracionSeg ?? null
    if (!opciones.medidas) return { dimensiones, duracionSeg }
    const categoria = categoriaDe(archivo.type)
    if (!dimensiones && (categoria === "imagen" || categoria === "video")) {
      dimensiones = await entorno.leerDimensiones(archivo).catch(() => null)
    }
    if (duracionSeg === null && categoria === "video") {
      duracionSeg = await entorno.leerDuracionVideo(archivo).catch(() => null)
    }
    return { dimensiones, duracionSeg }
  }

  async function comprimir(senal: AbortSignal): Promise<File> {
    const { comprimir: compresion } = opciones
    if (!compresion) return original
    return typeof compresion === "function"
      ? compresion(original)
      : entorno.comprimirImagen(original, { ...compresion, senal })
  }

  async function procesar(senal: AbortSignal): Promise<Procesado> {
    emitir({ estado: "procesando", progreso: 0, error: null })
    try {
      const archivo = conTipoNormalizado(await comprimir(senal))
      const validacion = opciones.reglas
        ? await entorno.validarArchivo(archivo, opciones.reglas)
        : null
      if (validacion && !validacion.ok) {
        throw new ErrorDefinitivo(validacion.mensaje)
      }
      const visual = ["imagen", "video"].includes(categoriaDe(archivo.type))
      const [medidas, sha256, miniatura] = await Promise.all([
        medir(archivo, validacion),
        opciones.hash ? entorno.sha256Hex(archivo, senal) : null,
        opciones.miniatura && visual
          ? entorno.generarMiniatura(archivo, senal).catch(() => null)
          : null,
      ])
      bytes.principal.total = archivo.size
      bytes.miniatura.total = miniatura?.size ?? 0
      return {
        archivo,
        miniatura,
        descripcion: {
          nombre: original.name,
          tipo: archivo.type,
          tamano: archivo.size,
          sha256,
          ...medidas,
          conMiniatura: miniatura !== null,
        },
      }
    } catch (error) {
      if (senal.aborted || error instanceof ErrorDefinitivo) throw error
      throw new ErrorDefinitivo(MENSAJES_MOTOR.procesar)
    }
  }

  async function prepararDestino(
    datos: Procesado,
    senal: AbortSignal
  ): Promise<SubidaPreparada> {
    const respuesta = await conReintentos("preparando", senal, () =>
      opciones.preparar(datos.descripcion)
    )
    if (!respuesta.ok) throw new ErrorDefinitivo(respuesta.error)
    if (!respuesta.datos.miniatura) bytes.miniatura.total = 0
    return respuesta.datos
  }

  function contador(parte: Bytes): AlProgresar {
    return (enviados) => {
      parte.enviados = Math.max(parte.enviados, enviados)
      emitir({ progreso: progreso() })
    }
  }

  async function subirPrincipal(
    datos: Procesado,
    destino: SubidaPreparada,
    senal: AbortSignal
  ) {
    const porTus =
      metodoSubida(datos.archivo.size, opciones.usarTus ?? true) === "tus"
    await conReintentos("subiendo", senal, (senalIntento) => {
      if (!porTus) {
        return entorno.subirFirmada({
          bucket: destino.bucket,
          destino,
          archivo: datos.archivo,
          senal: senalIntento,
          alProgresar: contador(bytes.principal),
        })
      }
      tus ??= entorno.crearTus({
        bucket: destino.bucket,
        ruta: destino.ruta,
        archivo: datos.archivo,
      })
      return tus.subir(senalIntento, contador(bytes.principal))
    })
    principalSubido = true
  }

  async function subirMiniatura(
    miniatura: File,
    destino: SubidaPreparada,
    senal: AbortSignal
  ) {
    const destinoMiniatura = destino.miniatura
    if (!destinoMiniatura) return
    await conReintentos("subiendo", senal, (senalIntento) =>
      entorno.subirFirmada({
        bucket: destino.bucket,
        destino: destinoMiniatura,
        archivo: miniatura,
        senal: senalIntento,
        alProgresar: contador(bytes.miniatura),
      })
    )
    miniaturaSubida = true
  }

  function archivoSubido(
    datos: Procesado,
    destino: SubidaPreparada
  ): ArchivoSubido {
    const rutaMiniatura =
      miniaturaSubida && destino.miniatura ? destino.miniatura.ruta : null
    return {
      ...datos.descripcion,
      conMiniatura: rutaMiniatura !== null,
      bucket: destino.bucket,
      ruta: destino.ruta,
      rutaMiniatura,
    }
  }

  async function ejecutar(senal: AbortSignal): Promise<ResultadoSubida<T>> {
    try {
      procesado ??= await procesar(senal)
      const datos = procesado
      preparada ??= await prepararDestino(datos, senal)
      const destino = preparada
      if (!principalSubido) await subirPrincipal(datos, destino, senal)
      if (datos.miniatura && !miniaturaSubida) {
        await subirMiniatura(datos.miniatura, destino, senal)
      }
      const archivo = archivoSubido(datos, destino)
      const confirmacion = await conReintentos("confirmando", senal, () =>
        opciones.confirmar(archivo)
      )
      if (!confirmacion.ok) {
        // El objeto queda huérfano; reintentar vuelve a pedir destino y subir.
        olvidarDestino()
        throw new ErrorDefinitivo(confirmacion.error)
      }
      emitir({
        estado: "completada",
        progreso: 1,
        error: null,
        reanudaEn: null,
      })
      return { ok: true, datos: confirmacion.datos, archivo }
    } catch (error) {
      // Solo la persona cancela: un AbortError suelto (p. ej. de una conexión
      // que va y viene) es un fallo más, no una cancelación.
      if (senal.aborted) {
        emitir({ estado: "cancelada", error: null, reanudaEn: null })
        return { ok: false, error: MENSAJES_MOTOR.cancelada, cancelada: true }
      }
      // Un 4xx en la subida (token vencido, permiso) o un conflicto que no
      // cede: el reintento manual pide un destino nuevo en vez de insistir.
      if (
        error instanceof ErrorSubida &&
        (!error.reintentable || error.estado === CONFLICTO)
      ) {
        olvidarDestino()
      }
      const mensaje = mensajeDe(error)
      emitir({ estado: "error", error: mensaje, reanudaEn: null })
      return { ok: false, error: mensaje, cancelada: false }
    }
  }

  return {
    iniciar() {
      if (resultado?.ok) return Promise.resolve(resultado)
      if (enCurso) return enCurso
      cancelacion = new AbortController()
      enCurso = ejecutar(cancelacion.signal).then((final) => {
        resultado = final
        enCurso = null
        return final
      })
      return enCurso
    },
    cancelar() {
      if (resultado?.ok || !cancelacion || cancelacion.signal.aborted) return
      cancelacion.abort()
      // TUS: libera en Storage lo subido a medias; la URL firmada no deja nada.
      if (!principalSubido) olvidarDestino()
    },
    instantanea: () => actual,
  }
}
