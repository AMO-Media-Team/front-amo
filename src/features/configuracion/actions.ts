"use server"

/**
 * Server Actions de Configuración. Patrón de cada acción:
 *
 * 1. DAL (`requerirPermiso`): sesión al día + el permiso de la tabla.
 * 2. zod: el MISMO esquema que la interfaz.
 * 3. Escritura con el cliente del USUARIO (JWT + cabecera de contexto
 *    confiable): la RLS vuelve a exigir el permiso, las restrictivas exigen
 *    que la escritura venga del servidor y los triggers validan y auditan
 *    con el actor real. Las ediciones llevan bloqueo optimista
 *    (`updated_at`): si otra persona cambió el registro, no se pisa.
 * 4. `refresh()` para que la página muestre el cambio en la misma respuesta.
 *
 * Los errores esperados se devuelven como `ResultadoAccion` (nunca se lanzan).
 */
import "server-only"

import { refresh } from "next/cache"

import { MENSAJE_INESPERADO } from "@/features/usuarios/errores"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"
import { obtenerMunicipio, obtenerPais } from "@/lib/geo/catalogo"
import {
  desdeErrorZod,
  exito,
  fallo,
  type ResultadoAccion,
  type ResultadoFallo,
} from "@/lib/result"
import { crearClienteServidor } from "@/lib/supabase/server"
import type { Json, TablesInsert } from "@/types/database.types"

import {
  CAMBIO_CONCURRENTE,
  esErrorEsperado,
  interpretarErrorConfiguracion,
  REGISTRO_DESACTUALIZADO,
  REGISTRO_INEXISTENTE,
  SIN_PERMISO,
} from "./errores"
import {
  CLAVE_MUNICIPIO_PLATAFORMA,
  CLAVE_PAISES_HABITUALES,
  exigeComisiones,
} from "./parametros"
import {
  buscarAnunciantes,
  buscarCampanas,
  buscarMunicipiosPorTexto,
  contenidoVersion,
  historialEntidad,
  municipiosTerritorio,
  type OpcionMunicipio,
} from "./queries"
import {
  type EntradaExcepcion,
  type EntradaFormato,
  type EntradaFranja,
  type EntradaGuardarParametro,
  type EntradaNivel,
  type EntradaParametrosAnio,
  type EntradaPlantilla,
  type EntradaProgramarTarifa,
  type EntradaPublicarTerminos,
  type EntradaResolucion,
  type EntradaRetencion,
  type EntradaReteica,
  type EntradaVersionTerminos,
  type EntradaElementoCatalogo,
  esquemaActivoDepartamento,
  esquemaActivoMunicipios,
  esquemaArchivarCatalogo,
  esquemaBuscarMunicipio,
  esquemaBuscarObjetivo,
  esquemaDepartamento,
  esquemaElementoCatalogo,
  esquemaExcepcion,
  esquemaFormato,
  esquemaFranja,
  esquemaGuardarParametro,
  esquemaHistorial,
  esquemaId,
  esquemaIdExcepcion,
  esquemaIdTarifa,
  esquemaNivel,
  esquemaParametrosAnio,
  esquemaPlantilla,
  esquemaProgramarTarifa,
  esquemaPublicarTerminos,
  esquemaResolucion,
  esquemaRetencion,
  esquemaReteica,
  esquemaValidarTarifas,
  esquemaValorParametro,
  esquemaVersionTerminos,
  MARGEN_INICIO_MS,
} from "./schemas"
import type {
  EventoHistorial,
  MunicipioTerritorio,
  ObjetivoComision,
  TipoDocumentoElectronico,
  ValorParametro,
} from "./tipos"
import { leerValor, sonIguales } from "./valores"
import {
  diaSiguiente,
  finExclusivoDelDia,
  inicioPreset,
  instanteBogota,
} from "./vigencias"

// ── Utilidades internas (no exportadas: no son acciones) ─────────────────────

type ClienteUsuario = Awaited<ReturnType<typeof crearClienteServidor>>

interface ErrorConCodigo {
  code?: string | null
  message?: string | null
  details?: string | null
}

/** Log de servidor sin datos personales: operación y código. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[configuracion] ${operacion} falló (${codigo})`)
}

function falloBd(operacion: string, error: ErrorConCodigo): ResultadoFallo {
  if (!esErrorEsperado(error)) informar(operacion, error)
  const { mensaje, campo } = interpretarErrorConfiguracion(error)
  return campo ? fallo(mensaje, { [campo]: [mensaje] }) : fallo(mensaje)
}

function falloInesperado(operacion: string, error: unknown): ResultadoFallo {
  informar(operacion, error)
  return fallo(MENSAJE_INESPERADO)
}

/**
 * Lo que la persona tenía a la vista ya no es lo que hay en la BD. La página
 * se vuelve a pintar en la misma respuesta: sin esto, «revisa el valor
 * actual» obligaba a recargar a mano y reintentar fallaba siempre con la
 * marca de versión vieja.
 */
function conflicto(mensaje: string): ResultadoFallo {
  refresh()
  return fallo(mensaje)
}

/**
 * Una edición con bloqueo optimista no tocó filas: el registro desapareció,
 * otra persona lo cambió o la RLS no dejó escribir (sin error explícito).
 */
async function motivoSinFilas(
  leer: () => PromiseLike<{
    data: { updated_at: string } | null
    error: ErrorConCodigo | null
  }>,
  actualizadoAt: string,
  mensajeConflicto: string = REGISTRO_DESACTUALIZADO
): Promise<ResultadoFallo> {
  const { data, error } = await leer()
  if (error) return falloBd("releer registro", error)
  if (!data) return conflicto(REGISTRO_INEXISTENTE)
  if (data.updated_at !== actualizadoAt) return conflicto(mensajeConflicto)
  return fallo(SIN_PERMISO)
}

function existenciaPara(
  clave: string
): ((valor: string) => boolean) | undefined {
  if (clave === CLAVE_PAISES_HABITUALES) return (iso2) => !!obtenerPais(iso2)
  if (clave === CLAVE_MUNICIPIO_PLATAFORMA) {
    return (codigo) => !!obtenerMunicipio(codigo)
  }
  return undefined
}

function ahoraIso(): string {
  return new Date().toISOString()
}

// ── Parámetros ──────────────────────────────────────────────────────────────

/**
 * Guarda el valor de un parámetro. Revalida con las reglas que la BD tiene
 * HOY (tipo, rango, opciones) y no pisa un cambio ajeno: si el parámetro se
 * modificó después de que la persona lo abrió, pide revisar.
 */
export async function guardarParametro(
  entrada: EntradaGuardarParametro
): Promise<ResultadoAccion<{ actualizadoAt: string }>> {
  const usuario = await requerirPermiso("configuracion.editar")
  const validacion = esquemaGuardarParametro.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { clave, valor, actualizadoAt } = validacion.data
  if (
    exigeComisiones(clave) &&
    !tieneAlgunPermiso(usuario, ["configuracion.comisiones"])
  ) {
    return fallo(
      "Para cambiar la comisión también necesitas el permiso «Editar la comisión global y sus excepciones»."
    )
  }

  try {
    const supabase = await crearClienteServidor()
    const { data: actual, error } = await supabase
      .from("configuracion")
      .select("clave, tipo, minimo, maximo, opciones, valor, updated_at")
      .eq("clave", clave)
      .maybeSingle()
    if (error) return falloBd("leer parámetro", error)
    if (!actual) return conflicto("Este parámetro ya no existe.")
    if (actual.updated_at !== actualizadoAt) {
      return conflicto(CAMBIO_CONCURRENTE)
    }

    const reglas = {
      clave,
      tipo: actual.tipo,
      minimo: actual.minimo,
      maximo: actual.maximo,
      opciones: actual.opciones,
    }
    const valorValido = esquemaValorParametro(reglas, {
      existe: existenciaPara(clave),
    }).safeParse(valor)
    if (!valorValido.success) {
      const mensaje = valorValido.error.issues[0]?.message ?? "Valor inválido."
      return fallo(mensaje, { valor: [mensaje] })
    }
    const nuevo: ValorParametro = valorValido.data
    if (sonIguales(leerValor(actual.tipo, actual.valor), nuevo)) {
      return exito({ actualizadoAt })
    }

    const { data, error: errorGuardar } = await supabase
      .from("configuracion")
      .update({ valor: nuevo as Json })
      .eq("clave", clave)
      .eq("updated_at", actualizadoAt)
      .select("updated_at")
    if (errorGuardar) return falloBd("guardar parámetro", errorGuardar)
    if (data.length === 0) {
      return motivoSinFilas(
        () =>
          supabase
            .from("configuracion")
            .select("updated_at")
            .eq("clave", clave)
            .maybeSingle(),
        actualizadoAt,
        CAMBIO_CONCURRENTE
      )
    }
    refresh()
    return exito({ actualizadoAt: data[0].updated_at })
  } catch (error) {
    return falloInesperado("guardarParametro", error)
  }
}

// ── Tarifas ─────────────────────────────────────────────────────────────────

function inicioDeTarifa(
  datos: Pick<
    ReturnType<typeof esquemaProgramarTarifa.parse>,
    "inicio" | "dia" | "hora"
  >
): Date | null {
  switch (datos.inicio) {
    case "pronto":
      return new Date(Date.now() + MARGEN_INICIO_MS)
    case "fecha":
      return instanteBogota(datos.dia, datos.hora || "00:00")
    default:
      return inicioPreset(datos.inicio)
  }
}

/** Programa una nueva vigencia (`programar_tarifa`): cierra la vigente en esa fecha y crea la nueva. */
export async function programarTarifa(
  entrada: EntradaProgramarTarifa
): Promise<ResultadoAccion<{ id: string; desde: string }>> {
  await requerirPermiso("configuracion.tarifas")
  const validacion = esquemaProgramarTarifa.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const datos = validacion.data
  const desde = inicioDeTarifa(datos)
  if (!desde)
    return fallo("Elige cuándo empieza la nueva tarifa.", {
      dia: ["Elige el día."],
    })

  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase.rpc("programar_tarifa", {
      p_formato_id: datos.formatoId,
      p_franja_id: datos.franjaId,
      p_valor: datos.valor,
      p_desde: desde.toISOString(),
    })
    if (error) return falloBd("programar tarifa", error)
    refresh()
    return exito({ id: data, desde: desde.toISOString() })
  } catch (error) {
    return falloInesperado("programarTarifa", error)
  }
}

/** Cancela una tarifa programada y devuelve su tramo a la vigencia anterior. */
export async function cancelarTarifaProgramada(entrada: {
  tarifaId: string
}): Promise<ResultadoAccion> {
  await requerirPermiso("configuracion.tarifas")
  const validacion = esquemaIdTarifa.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const supabase = await crearClienteServidor()
    const { error } = await supabase.rpc("cancelar_tarifa_programada", {
      p_tarifa_id: validacion.data.tarifaId,
    })
    if (error) return falloBd("cancelar tarifa", error)
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("cancelarTarifaProgramada", error)
  }
}

/** Marca cifras sugeridas como confirmadas por negocio (solo de pendiente a validada). */
export async function validarTarifas(entrada: {
  tarifaIds: string[]
}): Promise<ResultadoAccion<{ validadas: number }>> {
  await requerirPermiso("configuracion.tarifas")
  const validacion = esquemaValidarTarifas.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("tarifas")
      .update({ pendiente_validacion: false })
      .in("id", validacion.data.tarifaIds)
      .eq("pendiente_validacion", true)
      .select("id")
    if (error) return falloBd("validar tarifas", error)
    refresh()
    return exito({ validadas: data.length })
  } catch (error) {
    return falloInesperado("validarTarifas", error)
  }
}

// ── Franjas y formatos ──────────────────────────────────────────────────────

export async function guardarFranja(
  entrada: EntradaFranja
): Promise<ResultadoAccion> {
  await requerirPermiso("configuracion.catalogos")
  const validacion = esquemaFranja.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const datos = validacion.data
  const cambios = {
    nombre: datos.nombre,
    seguidores_min: datos.seguidoresMin,
    seguidores_max: datos.seguidoresMax,
    orden: datos.orden,
    activa: datos.activa,
  }

  try {
    const supabase = await crearClienteServidor()
    if (datos.id === null) {
      const { error } = await supabase
        .from("franjas")
        .insert({ ...cambios, clave: datos.clave })
      if (error) return falloBd("crear franja", error)
    } else {
      const id = datos.id
      const marca = datos.actualizadoAt ?? ""
      const { data, error } = await supabase
        .from("franjas")
        .update(cambios)
        .eq("id", id)
        .eq("updated_at", marca)
        .select("id")
      if (error) return falloBd("editar franja", error)
      if (data.length === 0) {
        return motivoSinFilas(
          () =>
            supabase
              .from("franjas")
              .select("updated_at")
              .eq("id", id)
              .maybeSingle(),
          marca
        )
      }
    }
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("guardarFranja", error)
  }
}

export async function guardarFormato(
  entrada: EntradaFormato
): Promise<ResultadoAccion> {
  await requerirPermiso("configuracion.catalogos")
  const validacion = esquemaFormato.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const datos = validacion.data

  try {
    const supabase = await crearClienteServidor()
    let previos: Record<string, Json | undefined> = {}
    if (datos.id !== null) {
      const { data, error } = await supabase
        .from("formatos")
        .select("requisitos")
        .eq("id", datos.id)
        .maybeSingle()
      if (error) return falloBd("leer formato", error)
      if (!data) return conflicto(REGISTRO_INEXISTENTE)
      if (
        data.requisitos &&
        typeof data.requisitos === "object" &&
        !Array.isArray(data.requisitos)
      ) {
        previos = data.requisitos
      }
    }
    // Se conservan las claves de `requisitos` que esta pantalla no administra.
    const requisitos: Record<string, Json | undefined> = { ...previos }
    const fijar = (clave: string, valor: Json | null) => {
      if (valor === null || (Array.isArray(valor) && valor.length === 0)) {
        delete requisitos[clave]
      } else {
        requisitos[clave] = valor
      }
    }
    fijar("relaciones_aspecto", datos.relacionesAspecto)
    fijar("mime", datos.mime)
    fijar("duracion_max_s", datos.duracionMaxS)
    fijar("peso_max_mb", datos.pesoMaxMb)
    fijar("max_archivos", datos.maxArchivos)

    const cambios = {
      nombre: datos.nombre,
      requisitos,
      activo: datos.activo,
      orden: datos.orden,
    }
    if (datos.id === null) {
      const { error } = await supabase.from("formatos").insert({
        ...cambios,
        plataforma: datos.plataforma,
        clave: datos.clave,
      })
      if (error) return falloBd("crear formato", error)
    } else {
      const id = datos.id
      const marca = datos.actualizadoAt ?? ""
      const { data, error } = await supabase
        .from("formatos")
        .update(cambios)
        .eq("id", id)
        .eq("updated_at", marca)
        .select("id")
      if (error) return falloBd("editar formato", error)
      if (data.length === 0) {
        return motivoSinFilas(
          () =>
            supabase
              .from("formatos")
              .select("updated_at")
              .eq("id", id)
              .maybeSingle(),
          marca
        )
      }
    }
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("guardarFormato", error)
  }
}

// ── Comisiones de excepción ─────────────────────────────────────────────────

/** Crea o edita una excepción. Una excepción que ya empezó conserva su inicio. */
export async function guardarExcepcion(
  entrada: EntradaExcepcion
): Promise<ResultadoAccion> {
  await requerirPermiso("configuracion.comisiones")
  const validacion = esquemaExcepcion.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const datos = validacion.data
  const hasta = datos.hasta ? finExclusivoDelDia(datos.hasta) : null

  try {
    const supabase = await crearClienteServidor()
    let desde = datos.desdeAhora ? new Date() : instanteBogota(datos.desde)
    if (datos.id !== null) {
      const { data: previa, error } = await supabase
        .from("comisiones_excepcion")
        .select("vigente_desde")
        .eq("id", datos.id)
        .maybeSingle()
      if (error) return falloBd("leer excepción", error)
      if (!previa) return conflicto(REGISTRO_INEXISTENTE)
      if (new Date(previa.vigente_desde).getTime() <= Date.now()) {
        desde = new Date(previa.vigente_desde)
      }
    }
    if (!desde)
      return fallo("Elige desde cuándo aplica.", { desde: ["Elige el día."] })
    if (hasta && hasta.getTime() <= desde.getTime()) {
      return fallo("El fin debe ser posterior al inicio.", {
        hasta: ["Debe ser posterior al inicio."],
      })
    }

    const cambios = {
      porcentaje: datos.porcentaje,
      vigente_desde: desde.toISOString(),
      vigente_hasta: hasta ? hasta.toISOString() : null,
      motivo: datos.motivo,
    }
    if (datos.id === null) {
      const { error } = await supabase.from("comisiones_excepcion").insert({
        ...cambios,
        anunciante_id:
          datos.objetivo === "anunciante" ? datos.objetivoId : null,
        campana_id: datos.objetivo === "campana" ? datos.objetivoId : null,
      })
      if (error) return falloBd("crear excepción", error)
    } else {
      const id = datos.id
      const marca = datos.actualizadoAt ?? ""
      const { data, error } = await supabase
        .from("comisiones_excepcion")
        .update(cambios)
        .eq("id", id)
        .eq("updated_at", marca)
        .select("id")
      if (error) return falloBd("editar excepción", error)
      if (data.length === 0) {
        return motivoSinFilas(
          () =>
            supabase
              .from("comisiones_excepcion")
              .select("updated_at")
              .eq("id", id)
              .maybeSingle(),
          marca
        )
      }
    }
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("guardarExcepcion", error)
  }
}

/** Termina hoy una excepción vigente (las asignaciones ya aceptadas no cambian). */
export async function finalizarExcepcion(entrada: {
  id: string
  actualizadoAt: string
}): Promise<ResultadoAccion> {
  await requerirPermiso("configuracion.comisiones")
  const validacion = esquemaIdExcepcion.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { id, actualizadoAt } = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const ahora = ahoraIso()
    const { data, error } = await supabase
      .from("comisiones_excepcion")
      .update({ vigente_hasta: ahora })
      .eq("id", id)
      .eq("updated_at", actualizadoAt)
      .lte("vigente_desde", ahora)
      .or(`vigente_hasta.is.null,vigente_hasta.gt.${ahora}`)
      .select("id")
    if (error) return falloBd("finalizar excepción", error)
    if (data.length === 0) {
      return conflicto(
        "La excepción ya no está vigente o cambió mientras la mirabas. Cierra y revisa la lista actualizada."
      )
    }
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("finalizarExcepcion", error)
  }
}

/** Elimina una excepción que nunca se aplicó (la FK de las asignaciones lo impide si se usó). */
export async function eliminarExcepcion(entrada: {
  id: string
  actualizadoAt: string
}): Promise<ResultadoAccion> {
  await requerirPermiso("configuracion.comisiones")
  const validacion = esquemaIdExcepcion.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { id, actualizadoAt } = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("comisiones_excepcion")
      .delete()
      .eq("id", id)
      .eq("updated_at", actualizadoAt)
      .select("id")
    if (error) return falloBd("eliminar excepción", error)
    if (data.length === 0) {
      return motivoSinFilas(
        () =>
          supabase
            .from("comisiones_excepcion")
            .select("updated_at")
            .eq("id", id)
            .maybeSingle(),
        actualizadoAt
      )
    }
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("eliminarExcepcion", error)
  }
}

/** Anunciantes o campañas para el selector de una excepción. */
export async function buscarObjetivosComision(entrada: {
  objetivo: "anunciante" | "campana"
  q: string
}): Promise<ResultadoAccion<ObjetivoComision[]>> {
  await requerirPermiso("configuracion.comisiones")
  const validacion = esquemaBuscarObjetivo.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { objetivo, q } = validacion.data

  try {
    return exito(
      objetivo === "anunciante"
        ? await buscarAnunciantes(q)
        : await buscarCampanas(q)
    )
  } catch (error) {
    return falloInesperado("buscarObjetivosComision", error)
  }
}

// ── Niveles de verificación ─────────────────────────────────────────────────

export async function guardarNivel(
  entrada: EntradaNivel
): Promise<ResultadoAccion> {
  await requerirPermiso("configuracion.editar")
  const validacion = esquemaNivel.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const datos = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("niveles_verificacion")
      .update({
        nombre: datos.nombre,
        requisitos: datos.requisitos,
        documentos_requeridos: datos.documentosRequeridos,
        tope_anual: datos.sinTope ? null : datos.topeAnual,
        porcentaje_alerta: datos.porcentajeAlerta,
        porcentaje_bloqueo: datos.porcentajeBloqueo,
        pendiente_validacion: datos.pendienteValidacion,
      })
      .eq("nivel", datos.nivel)
      .eq("updated_at", datos.actualizadoAt)
      .select("nivel")
    if (error) return falloBd("guardar nivel", error)
    if (data.length === 0) {
      return motivoSinFilas(
        () =>
          supabase
            .from("niveles_verificacion")
            .select("updated_at")
            .eq("nivel", datos.nivel)
            .maybeSingle(),
        datos.actualizadoAt
      )
    }
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("guardarNivel", error)
  }
}

// ── Tributario ──────────────────────────────────────────────────────────────

export async function guardarParametrosAnio(
  entrada: EntradaParametrosAnio
): Promise<ResultadoAccion> {
  await requerirPermiso("configuracion.tributario")
  const validacion = esquemaParametrosAnio.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const datos = validacion.data
  const cambios = {
    uvt: datos.uvt,
    smlmv: datos.smlmv,
    umbral_seg_social_smlmv: datos.umbralSegSocialSmlmv,
    pendiente_validacion: datos.pendienteValidacion,
  }

  try {
    const supabase = await crearClienteServidor()
    if (datos.nuevo) {
      const { error } = await supabase
        .from("parametros_tributarios")
        .insert({ ...cambios, anio: datos.anio })
      if (error) return falloBd("crear parámetros del año", error)
    } else {
      const marca = datos.actualizadoAt ?? ""
      const { data, error } = await supabase
        .from("parametros_tributarios")
        .update(cambios)
        .eq("anio", datos.anio)
        .eq("updated_at", marca)
        .select("anio")
      if (error) return falloBd("editar parámetros del año", error)
      if (data.length === 0) {
        return motivoSinFilas(
          () =>
            supabase
              .from("parametros_tributarios")
              .select("updated_at")
              .eq("anio", datos.anio)
              .maybeSingle(),
          marca
        )
      }
    }
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("guardarParametrosAnio", error)
  }
}

/** Las columnas `date` guardan el fin exclusivo: «hasta el 31» se guarda como el 1.º. */
function finExclusivo(hastaInclusivo: string | null): string | null {
  return hastaInclusivo ? diaSiguiente(hastaInclusivo) : null
}

export async function guardarRetencion(
  entrada: EntradaRetencion
): Promise<ResultadoAccion> {
  await requerirPermiso("configuracion.tributario")
  const validacion = esquemaRetencion.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const datos = validacion.data
  const fila = {
    tipo: datos.tipo,
    concepto: datos.concepto,
    aplica_declarante: datos.aplicaDeclarante,
    tarifa: datos.tarifa,
    base_minima_uvt: datos.baseMinimaUvt,
    vigente_desde: datos.desde,
    vigente_hasta: finExclusivo(datos.hasta),
    pendiente_validacion: datos.pendienteValidacion,
  }

  try {
    const supabase = await crearClienteServidor()
    if (datos.id === null) {
      const { error } = await supabase.from("retenciones_config").insert(fila)
      if (error) return falloBd("crear retención", error)
    } else {
      const id = datos.id
      const marca = datos.actualizadoAt ?? ""
      const { data, error } = await supabase
        .from("retenciones_config")
        .update(fila)
        .eq("id", id)
        .eq("updated_at", marca)
        .select("id")
      if (error) return falloBd("editar retención", error)
      if (data.length === 0) {
        return motivoSinFilas(
          () =>
            supabase
              .from("retenciones_config")
              .select("updated_at")
              .eq("id", id)
              .maybeSingle(),
          marca
        )
      }
    }
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("guardarRetencion", error)
  }
}

export async function guardarReteica(
  entrada: EntradaReteica
): Promise<ResultadoAccion> {
  await requerirPermiso("configuracion.tributario")
  const validacion = esquemaReteica.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const datos = validacion.data
  if (!obtenerMunicipio(datos.municipioCodigo)) {
    return fallo("El municipio no existe.", {
      municipioCodigo: ["Elige un municipio de la lista."],
    })
  }
  const fila = {
    municipio_codigo: datos.municipioCodigo,
    tarifa_por_mil: datos.tarifaPorMil,
    base_minima_uvt: datos.baseMinimaUvt,
    vigente_desde: datos.desde,
    vigente_hasta: finExclusivo(datos.hasta),
    pendiente_validacion: datos.pendienteValidacion,
  }

  try {
    const supabase = await crearClienteServidor()
    if (datos.id === null) {
      const { error } = await supabase.from("reteica_municipal").insert(fila)
      if (error) return falloBd("crear ReteICA", error)
    } else {
      const id = datos.id
      const marca = datos.actualizadoAt ?? ""
      const { data, error } = await supabase
        .from("reteica_municipal")
        .update(fila)
        .eq("id", id)
        .eq("updated_at", marca)
        .select("id")
      if (error) return falloBd("editar ReteICA", error)
      if (data.length === 0) {
        return motivoSinFilas(
          () =>
            supabase
              .from("reteica_municipal")
              .select("updated_at")
              .eq("id", id)
              .maybeSingle(),
          marca
        )
      }
    }
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("guardarReteica", error)
  }
}

async function activarResolucion(
  supabase: ClienteUsuario,
  id: string,
  tipo: TipoDocumentoElectronico
): Promise<ResultadoFallo | null> {
  const { data: otras, error } = await supabase
    .from("resoluciones_dian")
    .update({ activa: false })
    .eq("tipo", tipo)
    .eq("activa", true)
    .neq("id", id)
    .select("id")
  if (error) return falloBd("desactivar resolución anterior", error)
  const { error: errorActivar } = await supabase
    .from("resoluciones_dian")
    .update({ activa: true })
    .eq("id", id)
  if (!errorActivar) return null
  // Si no se pudo activar la nueva, la anterior vuelve a quedar activa.
  if (otras.length > 0) {
    const { error: errorRestaurar } = await supabase
      .from("resoluciones_dian")
      .update({ activa: true })
      .in(
        "id",
        otras.map((o) => o.id)
      )
    if (errorRestaurar) informar("restaurar resolución activa", errorRestaurar)
  }
  return falloBd("activar resolución", errorActivar)
}

/**
 * Crea o edita una resolución de numeración. Activarla desactiva la que
 * estaba activa para el mismo documento (solo puede haber una).
 */
export async function guardarResolucion(
  entrada: EntradaResolucion
): Promise<ResultadoAccion> {
  await requerirPermiso("configuracion.tributario")
  const validacion = esquemaResolucion.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const datos = validacion.data
  const fila = {
    numero_resolucion: datos.numeroResolucion,
    fecha_resolucion: datos.fechaResolucion,
    rango_desde: datos.rangoDesde,
    rango_hasta: datos.rangoHasta,
    vigente_desde: datos.vigenteDesde,
    vigente_hasta: datos.vigenteHasta,
  }

  try {
    const supabase = await crearClienteServidor()
    let id = datos.id
    if (id === null) {
      const { data, error } = await supabase
        .from("resoluciones_dian")
        // `consecutivo_actual` lo fija el trigger (authenticated no tiene GRANT sobre él).
        .insert({
          ...fila,
          tipo: datos.tipo,
          prefijo: datos.prefijo,
          activa: false,
        } as TablesInsert<"resoluciones_dian">)
        .select("id")
        .single()
      if (error) return falloBd("crear resolución", error)
      id = data.id
    } else {
      const idExistente = id
      const marca = datos.actualizadoAt ?? ""
      const { data, error } = await supabase
        .from("resoluciones_dian")
        .update(datos.activa ? fila : { ...fila, activa: false })
        .eq("id", idExistente)
        .eq("updated_at", marca)
        .select("id")
      if (error) return falloBd("editar resolución", error)
      if (data.length === 0) {
        return motivoSinFilas(
          () =>
            supabase
              .from("resoluciones_dian")
              .select("updated_at")
              .eq("id", idExistente)
              .maybeSingle(),
          marca
        )
      }
    }
    if (datos.activa) {
      const errorActivar = await activarResolucion(supabase, id, datos.tipo)
      if (errorActivar) {
        refresh()
        return fallo(
          `Los datos se guardaron, pero la resolución no quedó activa. ${errorActivar.error}`
        )
      }
    }
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("guardarResolucion", error)
  }
}

/** Municipios DIVIPOLA por nombre o código (diccionario local; no consulta la BD). */
export async function buscarMunicipios(entrada: {
  q: string
}): Promise<ResultadoAccion<OpcionMunicipio[]>> {
  await requerirPermiso("configuracion.ver")
  const validacion = esquemaBuscarMunicipio.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  return exito(buscarMunicipiosPorTexto(validacion.data.q))
}

// ── Catálogos ───────────────────────────────────────────────────────────────

export async function guardarElementoCatalogo(
  entrada: EntradaElementoCatalogo
): Promise<ResultadoAccion> {
  await requerirPermiso("configuracion.catalogos")
  const validacion = esquemaElementoCatalogo.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { catalogo, id, actualizadoAt, ...datos } = validacion.data
  const fila = {
    nombre: datos.nombre,
    descripcion: datos.descripcion,
    orden: datos.orden,
    activo: datos.activo,
  }

  try {
    const supabase = await crearClienteServidor()
    if (id === null) {
      const { error } = await supabase.from(catalogo).insert(fila)
      if (error) return falloBd(`crear en ${catalogo}`, error)
    } else {
      const marca = actualizadoAt ?? ""
      const { data, error } = await supabase
        .from(catalogo)
        .update(fila)
        .eq("id", id)
        .eq("updated_at", marca)
        .select("id")
      if (error) return falloBd(`editar en ${catalogo}`, error)
      if (data.length === 0) {
        return motivoSinFilas(
          () =>
            supabase
              .from(catalogo)
              .select("updated_at")
              .eq("id", id)
              .maybeSingle(),
          marca
        )
      }
    }
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("guardarElementoCatalogo", error)
  }
}

/** Archiva (borrado lógico) o restaura un sector o una categoría. */
export async function archivarElementoCatalogo(entrada: {
  catalogo: "sectores" | "categorias"
  id: string
  archivar: boolean
  actualizadoAt: string
}): Promise<ResultadoAccion> {
  await requerirPermiso("configuracion.catalogos")
  const validacion = esquemaArchivarCatalogo.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { catalogo, id, archivar, actualizadoAt } = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from(catalogo)
      .update({ deleted_at: archivar ? ahoraIso() : null })
      .eq("id", id)
      .eq("updated_at", actualizadoAt)
      .select("id")
    if (error) return falloBd(`archivar en ${catalogo}`, error)
    if (data.length === 0) {
      return motivoSinFilas(
        () =>
          supabase
            .from(catalogo)
            .select("updated_at")
            .eq("id", id)
            .maybeSingle(),
        actualizadoAt
      )
    }
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("archivarElementoCatalogo", error)
  }
}

export async function cambiarActivoDepartamento(entrada: {
  codigo: string
  activo: boolean
}): Promise<ResultadoAccion> {
  await requerirPermiso("configuracion.catalogos")
  const validacion = esquemaActivoDepartamento.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { codigo, activo } = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("departamentos")
      .update({ activo })
      .eq("codigo", codigo)
      .select("codigo")
    if (error) return falloBd("cambiar departamento", error)
    if (data.length === 0) return fallo(SIN_PERMISO)
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("cambiarActivoDepartamento", error)
  }
}

export async function municipiosDeDepartamento(entrada: {
  codigo: string
}): Promise<ResultadoAccion<MunicipioTerritorio[]>> {
  await requerirPermiso("configuracion.ver")
  const validacion = esquemaDepartamento.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    return exito(await municipiosTerritorio(validacion.data.codigo))
  } catch (error) {
    return falloInesperado("municipiosDeDepartamento", error)
  }
}

/** Activa o desactiva municipios (un municipio activo exige su departamento activo). */
export async function cambiarActivoMunicipios(entrada: {
  codigos: string[]
  activo: boolean
}): Promise<ResultadoAccion<{ cambiados: number }>> {
  await requerirPermiso("configuracion.catalogos")
  const validacion = esquemaActivoMunicipios.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { codigos, activo } = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("municipios")
      .update({ activo })
      .in("codigo", codigos)
      .neq("activo", activo)
      .select("codigo")
    if (error) return falloBd("cambiar municipios", error)
    refresh()
    return exito({ cambiados: data.length })
  } catch (error) {
    return falloInesperado("cambiarActivoMunicipios", error)
  }
}

// ── Legal ───────────────────────────────────────────────────────────────────

/** Crea un borrador o edita el contenido de uno (una versión publicada no se toca). */
export async function guardarVersionTerminos(
  entrada: EntradaVersionTerminos
): Promise<ResultadoAccion<{ id: string }>> {
  await requerirPermiso("configuracion.catalogos")
  const validacion = esquemaVersionTerminos.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const datos = validacion.data

  try {
    const supabase = await crearClienteServidor()
    if (datos.id === null) {
      const { data, error } = await supabase
        .from("terminos_versiones")
        .insert({
          tipo: datos.tipo,
          version: datos.version,
          contenido_md: datos.contenido,
        })
        .select("id")
        .single()
      if (error) return falloBd("crear versión", error)
      refresh()
      return exito({ id: data.id })
    }
    const id = datos.id
    const marca = datos.actualizadoAt ?? ""
    const { data, error } = await supabase
      .from("terminos_versiones")
      .update({ contenido_md: datos.contenido })
      .eq("id", id)
      .eq("publicada", false)
      .eq("updated_at", marca)
      .select("id")
    if (error) return falloBd("editar versión", error)
    if (data.length === 0) {
      return motivoSinFilas(
        () =>
          supabase
            .from("terminos_versiones")
            .select("updated_at")
            .eq("id", id)
            .maybeSingle(),
        marca
      )
    }
    refresh()
    return exito({ id })
  } catch (error) {
    return falloInesperado("guardarVersionTerminos", error)
  }
}

export async function leerVersionTerminos(entrada: {
  id: string
}): Promise<ResultadoAccion<string>> {
  await requerirPermiso("configuracion.ver")
  const validacion = esquemaId.safeParse(entrada)
  if (!validacion.success) return fallo("Versión desconocida.")

  try {
    const contenido = await contenidoVersion(validacion.data.id)
    return contenido === null
      ? fallo("La versión ya no existe.")
      : exito(contenido)
  } catch (error) {
    return falloInesperado("leerVersionTerminos", error)
  }
}

/** Publica un borrador. Desde ese momento es inmutable y las personas deberán aceptarlo. */
export async function publicarVersionTerminos(
  entrada: EntradaPublicarTerminos
): Promise<ResultadoAccion> {
  await requerirPermiso("configuracion.catalogos")
  const validacion = esquemaPublicarTerminos.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const datos = validacion.data
  const desde = datos.inmediata
    ? null
    : instanteBogota(datos.dia, datos.hora || "00:00")

  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("terminos_versiones")
      .update({
        publicada: true,
        // Sin fecha, el trigger fija la vigencia en el instante de publicar.
        vigente_desde: desde ? desde.toISOString() : null,
      })
      .eq("id", datos.id)
      .eq("publicada", false)
      .eq("updated_at", datos.actualizadoAt)
      .select("id")
    if (error) return falloBd("publicar versión", error)
    if (data.length === 0) {
      return motivoSinFilas(
        () =>
          supabase
            .from("terminos_versiones")
            .select("updated_at")
            .eq("id", datos.id)
            .maybeSingle(),
        datos.actualizadoAt
      )
    }
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("publicarVersionTerminos", error)
  }
}

// ── Plantillas ──────────────────────────────────────────────────────────────

export async function guardarPlantilla(
  entrada: EntradaPlantilla
): Promise<ResultadoAccion> {
  await requerirPermiso("configuracion.catalogos")
  const validacion = esquemaPlantilla.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const datos = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("plantillas_notificacion")
      .update({
        nombre: datos.nombre,
        asunto: datos.asunto,
        cuerpo: datos.cuerpo,
        activa: datos.activa,
      })
      .eq("clave", datos.clave)
      .eq("canal", datos.canal)
      .eq("updated_at", datos.actualizadoAt)
      .select("clave")
    if (error) return falloBd("guardar plantilla", error)
    if (data.length === 0) {
      return motivoSinFilas(
        () =>
          supabase
            .from("plantillas_notificacion")
            .select("updated_at")
            .eq("clave", datos.clave)
            .eq("canal", datos.canal)
            .maybeSingle(),
        datos.actualizadoAt
      )
    }
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("guardarPlantilla", error)
  }
}

// ── Historial ───────────────────────────────────────────────────────────────

/** Cambios de un registro en la bitácora (la RLS exige `auditoria.ver`). */
export async function historialCambios(entrada: {
  entidad: string
  entidadId: string
}): Promise<ResultadoAccion<EventoHistorial[]>> {
  await requerirPermiso("auditoria.ver")
  const validacion = esquemaHistorial.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const { entidad, entidadId } = validacion.data
    return exito(await historialEntidad(entidad, entidadId))
  } catch (error) {
    return falloInesperado("historialCambios", error)
  }
}
