"use server"

/**
 * Server Actions de «Mi empresa» (ANU-001, ADM-003 del lado del anunciante).
 *
 * 1. DAL (`requerirPermiso("anunciantes.editar_propio")`) antes que nada. La
 *    empresa sale SIEMPRE de la sesión (`usuario.anuncianteId`), nunca de la
 *    entrada.
 * 2. zod: el MISMO esquema que el formulario. Con la empresa verificada, la
 *    identificación se toma de la BD (el navegador no puede cambiarla; el
 *    trigger `trg_anunciantes_b_identificacion` lo exige de nuevo).
 * 3. Escrituras con el cliente del USUARIO (RLS «propio» + bitácora con el
 *    actor): `anunciantes` (solo lo que cambió, con bloqueo optimista sobre
 *    las columnas que se escriben), `anunciantes_privado` (insert o update
 *    propio) y el logo (`avatares`, ruta construida aquí). El envío a
 *    verificación es `enviar_anunciante_a_verificacion_srv` con el actor y
 *    su sesión.
 * 4. `refresh()` para que la página muestre lo guardado en la misma respuesta.
 *
 * Los errores esperados se devuelven como `ResultadoAccion` (nunca se lanzan).
 */
import "server-only"

import { refresh } from "next/cache"

import { contextoDelActor } from "@/lib/auth/contexto-actor"
import { requerirPermiso } from "@/lib/auth/dal"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import type { SubidaPreparada } from "@/lib/archivos/tipos"
import { normalizarNit } from "@/lib/colombia/nit"
import { type ErrorBd, MENSAJE_INESPERADO } from "@/lib/errores-bd"
import { obtenerMunicipio, obtenerPais } from "@/lib/geo/catalogo"
import {
  desdeErrorZod,
  exito,
  fallo,
  type ResultadoAccion,
  type ResultadoFallo,
} from "@/lib/result"
import { informarStorage } from "@/lib/storage/cliente"
import { archivoPerteneceA, carpetaLogo, nuevaRuta } from "@/lib/storage/rutas"
import { confirmarObjeto, prepararSubidaFirmada } from "@/lib/storage/subidas"
import { crearClienteServidor } from "@/lib/supabase/server"
import { SECTOR_NO_DISPONIBLE } from "@/features/gestion-anunciantes/errores"
import type { DatosAnunciante } from "@/features/gestion-anunciantes/schemas"

import {
  CONTACTO_DESACTUALIZADO,
  CONTACTO_INCOMPLETO,
  EMPRESA_DESACTUALIZADA,
  IDENTIFICACION_YA_VERIFICADA,
  interpretarErrorContacto,
  interpretarErrorEmpresa,
  interpretarErrorGeneral,
  LOGO_NO_COINCIDE,
  SIN_EMPRESA,
  SIN_PERMISO_EMPRESA,
} from "./errores"
import {
  cambiosContacto,
  cambiosMiEmpresa,
  columnasContacto,
  conIdentificacionGuardada,
  type FilaEmpresaEditable,
  hayCambios,
} from "./filas"
import {
  type EntradaConfirmarLogo,
  type EntradaContactoEmpresa,
  type EntradaMiEmpresa,
  type EntradaPrepararLogo,
  esquemaConfirmarLogo,
  esquemaContactoEmpresa,
  esquemaMiEmpresa,
  esquemaPrepararLogo,
} from "./schemas"
import { contactoCompleto, identificacionBloqueada } from "./verificacion"

// ── Utilidades internas (no exportadas: no son acciones) ─────────────────────

type ClienteUsuario = Awaited<ReturnType<typeof crearClienteServidor>>

/** Log de servidor sin datos de la empresa: operación y código. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[empresa] ${operacion} falló (${codigo})`)
}

function falloInesperado(operacion: string, error: unknown): ResultadoFallo {
  informar(operacion, error)
  return fallo(MENSAJE_INESPERADO)
}

function falloEmpresa(operacion: string, error: ErrorBd): ResultadoFallo {
  const { mensaje, campo, esperado } = interpretarErrorEmpresa(error)
  if (!esperado) informar(operacion, error)
  return campo ? fallo(mensaje, { [campo]: [mensaje] }) : fallo(mensaje)
}

function falloGeneral(operacion: string, error: ErrorBd): ResultadoFallo {
  const { mensaje, esperado } = interpretarErrorGeneral(error)
  if (!esperado) informar(operacion, error)
  return fallo(mensaje)
}

/**
 * País y municipio existen en el diccionario (el cliente no lo carga: son
 * miles de filas). Que el municipio esté habilitado lo decide la BD.
 */
function validarGeografia(datos: DatosAnunciante): ResultadoFallo | null {
  if (!obtenerPais(datos.paisIso2)) {
    const mensaje = "Elige un país de la lista."
    return fallo(mensaje, { paisIso2: [mensaje] })
  }
  const { identificacion } = datos
  if (
    identificacion.tipo === "NIT" &&
    !obtenerMunicipio(identificacion.municipioCodigo)
  ) {
    const mensaje = "Elige un municipio de la lista."
    return fallo(mensaje, { municipioCodigo: [mensaje] })
  }
  return null
}

/** El sector nuevo sigue activo (la FK admite uno inactivo o dado de baja). */
async function falloSector(
  supabase: ClienteUsuario,
  sectorId: string
): Promise<ResultadoFallo | null> {
  const { data, error } = await supabase
    .from("sectores")
    .select("id")
    .eq("id", sectorId)
    .eq("activo", true)
    .is("deleted_at", null)
    .maybeSingle()
  if (error) return falloEmpresa("validar el sector", error)
  return data
    ? null
    : fallo(SECTOR_NO_DISPONIBLE, { sectorId: [SECTOR_NO_DISPONIBLE] })
}

const COLUMNAS_EMPRESA = `razon_social, nombre_comercial, sector_id, pais_iso2, nit, digito_verificacion,
  municipio_codigo, identificacion_extranjera, ciudad_extranjera, datos_facturacion,
  estado_verificacion, updated_at, deleted_at`

/** «Andina  S.A.S.» y «andina s.a.s.» son la misma razón social escrita distinto. */
function mismoTexto(
  a: string | null | undefined,
  b: string | null | undefined
) {
  const normalizar = (texto: string | null | undefined) =>
    (texto ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase("es-CO")
  return normalizar(a) === normalizar(b)
}

/**
 * ¿El navegador intenta cambiar la identificación de una empresa verificada?
 * (p. ej. AMO la verificó mientras se editaba): se avisa en lugar de
 * descartarlo en silencio.
 */
function cambiaIdentificacion(
  entrada: EntradaMiEmpresa,
  fila: FilaEmpresaEditable
): boolean {
  return (
    !mismoTexto(entrada.razonSocial, fila.razon_social) ||
    entrada.paisIso2.trim() !== fila.pais_iso2.trim() ||
    normalizarNit(entrada.nit) !== (fila.nit ?? "") ||
    entrada.digitoVerificacion.trim() !== (fila.digito_verificacion ?? "") ||
    !mismoTexto(
      entrada.identificacionExtranjera,
      fila.identificacion_extranjera
    )
  )
}

/**
 * Otra persona cambió alguna de las columnas que edita este formulario desde
 * que se abrió. Un cambio de otras columnas (el logo, el envío a verificación)
 * mueve `updated_at` pero no es un conflicto: se compara lo que la persona
 * tenía al empezar (`original`) con lo que hay hoy.
 */
function hayConflicto(
  fila: FilaEmpresaEditable,
  original: EntradaMiEmpresa,
  bloqueada: boolean
): boolean {
  const base = esquemaMiEmpresa.safeParse(
    bloqueada ? conIdentificacionGuardada(original, fila) : original
  )
  return (
    !base.success || hayCambios(cambiosMiEmpresa(fila, base.data, bloqueada))
  )
}

// ── Datos de la empresa ──────────────────────────────────────────────────────

export interface EmpresaGuardada {
  /** Versión del registro tras guardar (o la misma si no hubo cambios). */
  actualizadoAt: string
}

/**
 * Guarda los datos de la propia empresa: nombre comercial, sector, sede,
 * correo y condición tributaria y, mientras no esté verificada, razón social e
 * identificación. Escribe solo lo que cambió y no pisa lo que otra persona
 * cambió en esas columnas desde que se abrió el formulario (`original`).
 */
export async function editarMiEmpresa(
  entrada: EntradaMiEmpresa,
  original: EntradaMiEmpresa
): Promise<ResultadoAccion<EmpresaGuardada>> {
  const usuario = await requerirPermiso("anunciantes.editar_propio")
  const anuncianteId = usuario.anuncianteId
  if (!anuncianteId) return fallo(SIN_EMPRESA)

  try {
    const supabase = await crearClienteServidor()
    const { data: fila, error: errorLectura } = await supabase
      .from("anunciantes")
      .select(COLUMNAS_EMPRESA)
      .eq("id", anuncianteId)
      .maybeSingle()
    if (errorLectura) return falloEmpresa("leer para editar", errorLectura)
    if (!fila || fila.deleted_at) return fallo(SIN_EMPRESA)

    const bloqueada = identificacionBloqueada(fila.estado_verificacion)
    if (bloqueada && cambiaIdentificacion(entrada, fila)) {
      // La página se repinta con la identificación ya de solo lectura.
      refresh()
      return fallo(IDENTIFICACION_YA_VERIFICADA)
    }
    const validacion = esquemaMiEmpresa.safeParse(
      bloqueada ? conIdentificacionGuardada(entrada, fila) : entrada
    )
    if (!validacion.success) return desdeErrorZod(validacion.error)
    const datos = validacion.data
    const errorGeografia = validarGeografia(datos)
    if (errorGeografia) return errorGeografia

    if (
      fila.updated_at !== datos.actualizadoAt &&
      hayConflicto(fila, original, bloqueada)
    ) {
      return fallo(EMPRESA_DESACTUALIZADA)
    }

    const cambios = cambiosMiEmpresa(fila, datos, bloqueada)
    // Lo escrito equivale a lo guardado (p. ej. solo espacios): nada que escribir.
    if (!hayCambios(cambios)) return exito({ actualizadoAt: fila.updated_at })
    if (cambios.sector_id) {
      const errorSector = await falloSector(supabase, cambios.sector_id)
      if (errorSector) return errorSector
    }

    const { data, error } = await supabase
      .from("anunciantes")
      .update(cambios)
      .eq("id", anuncianteId)
      .eq("updated_at", fila.updated_at)
      .is("deleted_at", null)
      .select("updated_at")
    if (error) return falloEmpresa("guardar la empresa", error)
    // Sin filas: otra escritura ganó entre la lectura y esta (o la RLS no dejó).
    if (data.length === 0) return fallo(EMPRESA_DESACTUALIZADA)
    refresh()
    return exito({ actualizadoAt: data[0].updated_at })
  } catch (error) {
    return falloInesperado("editarMiEmpresa", error)
  }
}

// ── Persona de contacto ──────────────────────────────────────────────────────

export interface ContactoGuardado {
  actualizadoAt: string
}

/**
 * Guarda la persona de contacto (`anunciantes_privado`): la crea si aún no
 * existe y, si existe, escribe solo lo que cambió con bloqueo optimista
 * (`updated_at`): no pisa lo que guardó otra persona del equipo.
 */
export async function guardarContactoEmpresa(
  entrada: EntradaContactoEmpresa
): Promise<ResultadoAccion<ContactoGuardado>> {
  const usuario = await requerirPermiso("anunciantes.editar_propio")
  const validacion = esquemaContactoEmpresa.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const anuncianteId = usuario.anuncianteId
  if (!anuncianteId) return fallo(SIN_EMPRESA)
  const datos = validacion.data
  const columnas = columnasContacto(datos)

  const falloContacto = (operacion: string, error: ErrorBd) => {
    const { mensaje, campo, esperado } = interpretarErrorContacto(error)
    if (!esperado) informar(operacion, error)
    return campo ? fallo(mensaje, { [campo]: [mensaje] }) : fallo(mensaje)
  }

  try {
    const supabase = await crearClienteServidor()
    const { data: actual, error: errorLectura } = await supabase
      .from("anunciantes_privado")
      .select(
        "contacto_nombre, contacto_email, contacto_celular, direccion, updated_at"
      )
      .eq("anunciante_id", anuncianteId)
      .maybeSingle()
    if (errorLectura) return falloContacto("leer el contacto", errorLectura)

    if (!actual) {
      // Se abrió con un contacto que ya no existe: mejor recargar que recrearlo.
      if (datos.version !== null) return fallo(CONTACTO_DESACTUALIZADO)
      const { data, error } = await supabase
        .from("anunciantes_privado")
        .insert({ anunciante_id: anuncianteId, ...columnas })
        .select("updated_at")
        .single()
      if (error) {
        // Otra persona del equipo lo creó entre la lectura y esta escritura.
        if (error.code === "23505") return fallo(CONTACTO_DESACTUALIZADO)
        return falloContacto("crear el contacto", error)
      }
      refresh()
      return exito({ actualizadoAt: data.updated_at })
    }

    if (actual.updated_at !== datos.version) {
      return fallo(CONTACTO_DESACTUALIZADO)
    }
    const cambios = cambiosContacto(actual, columnas)
    if (!hayCambios(cambios)) return exito({ actualizadoAt: actual.updated_at })
    const { data, error } = await supabase
      .from("anunciantes_privado")
      .update(cambios)
      .eq("anunciante_id", anuncianteId)
      .eq("updated_at", actual.updated_at)
      .select("updated_at")
    if (error) return falloContacto("guardar el contacto", error)
    if (data.length === 0) return fallo(CONTACTO_DESACTUALIZADO)
    refresh()
    return exito({ actualizadoAt: data[0].updated_at })
  } catch (error) {
    return falloInesperado("guardarContactoEmpresa", error)
  }
}

// ── Logo (§8: ruta del servidor, subida con URL firmada) ────────────────────

/** Destino firmado para subir el logo: `avatares/anunciante/{id}/logo-{uuid}.{ext}`. */
export async function prepararSubidaLogo(
  entrada: EntradaPrepararLogo
): Promise<ResultadoAccion<SubidaPreparada>> {
  const usuario = await requerirPermiso("anunciantes.editar_propio")
  const validacion = esquemaPrepararLogo.safeParse(entrada)
  if (!validacion.success) {
    return fallo(validacion.error.issues[0]?.message ?? MENSAJE_INESPERADO)
  }
  if (!usuario.anuncianteId) return fallo(SIN_EMPRESA)
  try {
    const destino = nuevaRuta(
      carpetaLogo("anunciante", usuario.anuncianteId),
      validacion.data.tipo
    )
    return await prepararSubidaFirmada({
      cliente: await crearClienteServidor(),
      ...destino,
    })
  } catch (error) {
    return falloInesperado("preparar el logo", error)
  }
}

/**
 * Borra el logo anterior. Storage no deja a la empresa borrar en `avatares`
 * (solo su foto de perfil): lo hace el servidor como servicio, DESPUÉS del DAL
 * y solo si la ruta (leída de la propia fila con la sesión) es un logo de esa
 * empresa. Un logo huérfano no afecta a nadie: si falla, queda en el log.
 */
async function borrarLogoAnterior(
  usuario: UsuarioSesion,
  anuncianteId: string,
  anterior: string | null,
  nuevo: string | null
): Promise<void> {
  if (!anterior || anterior === nuevo) return
  const carpeta = carpetaLogo("anunciante", anuncianteId)
  if (
    !archivoPerteneceA(
      { bucket: carpeta.bucket, ruta: anterior, rutaMiniatura: null },
      carpeta
    )
  ) {
    return
  }
  try {
    const { admin } = await contextoDelActor(usuario)
    const { error } = await admin.storage
      .from(carpeta.bucket)
      .remove([anterior])
    if (error) informarStorage("remove(logo anterior)", error)
  } catch (error) {
    informarStorage("remove(logo anterior)", error)
  }
}

/** Escribe `logo_path` (o lo quita) con la sesión y devuelve el anterior. */
async function fijarLogo(
  supabase: ClienteUsuario,
  anuncianteId: string,
  ruta: string | null
): Promise<{ anterior: string | null } | ResultadoFallo> {
  const { data: previo, error: errorLectura } = await supabase
    .from("anunciantes")
    .select("logo_path")
    .eq("id", anuncianteId)
    .maybeSingle()
  if (errorLectura) return falloGeneral("leer el logo", errorLectura)
  if (!previo) return fallo(SIN_EMPRESA)
  if (previo.logo_path === ruta) return { anterior: null }
  const { data, error } = await supabase
    .from("anunciantes")
    .update({ logo_path: ruta })
    .eq("id", anuncianteId)
    .is("deleted_at", null)
    .select("id")
  if (error) return falloGeneral("guardar el logo", error)
  if (data.length === 0) return fallo(SIN_PERMISO_EMPRESA)
  return { anterior: previo.logo_path }
}

/**
 * Tras subir el logo: la ruta debe ser un logo de ESTA empresa y el objeto
 * debe existir con el peso y el formato declarados. Idempotente por ruta: si
 * ya es el logo vigente, no hace nada.
 */
export async function confirmarLogo(
  entrada: EntradaConfirmarLogo
): Promise<ResultadoAccion> {
  const usuario = await requerirPermiso("anunciantes.editar_propio")
  const validacion = esquemaConfirmarLogo.safeParse(entrada)
  if (!validacion.success) {
    return fallo(validacion.error.issues[0]?.message ?? MENSAJE_INESPERADO)
  }
  const anuncianteId = usuario.anuncianteId
  if (!anuncianteId) return fallo(SIN_EMPRESA)
  const archivo = validacion.data
  try {
    const destino = carpetaLogo("anunciante", anuncianteId)
    if (!archivoPerteneceA(archivo, destino)) return fallo(LOGO_NO_COINCIDE)
    const supabase = await crearClienteServidor()
    const objeto = await confirmarObjeto({
      cliente: supabase,
      bucket: destino.bucket,
      ruta: archivo.ruta,
      esperado: { tamano: archivo.tamano, tipo: archivo.tipo },
    })
    if (!objeto.ok) return objeto
    const fijado = await fijarLogo(supabase, anuncianteId, archivo.ruta)
    if ("ok" in fijado) return fijado
    await borrarLogoAnterior(
      usuario,
      anuncianteId,
      fijado.anterior,
      archivo.ruta
    )
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("confirmarLogo", error)
  }
}

/** Quita el logo: la empresa vuelve a mostrarse con sus iniciales. */
export async function quitarLogo(): Promise<ResultadoAccion> {
  const usuario = await requerirPermiso("anunciantes.editar_propio")
  const anuncianteId = usuario.anuncianteId
  if (!anuncianteId) return fallo(SIN_EMPRESA)
  try {
    const supabase = await crearClienteServidor()
    const fijado = await fijarLogo(supabase, anuncianteId, null)
    if ("ok" in fijado) return fijado
    await borrarLogoAnterior(usuario, anuncianteId, fijado.anterior, null)
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("quitarLogo", error)
  }
}

// ── Envío a verificación ─────────────────────────────────────────────────────

/**
 * Envía la empresa a la cola de verificación del equipo AMO (o la reenvía tras
 * un rechazo, que la devuelve a PENDIENTE). Exige la persona de contacto; la
 * BD exige los documentos cargados y, si falta alguno, su `detail` lo nombra.
 */
export async function enviarEmpresaAVerificacion(): Promise<ResultadoAccion> {
  const usuario = await requerirPermiso("anunciantes.editar_propio")
  const anuncianteId = usuario.anuncianteId
  if (!anuncianteId) return fallo(SIN_EMPRESA)

  try {
    const supabase = await crearClienteServidor()
    const { data: contacto, error: errorContacto } = await supabase
      .from("anunciantes_privado")
      .select("contacto_nombre, contacto_email")
      .eq("anunciante_id", anuncianteId)
      .maybeSingle()
    if (errorContacto) return falloGeneral("leer el contacto", errorContacto)
    if (
      !contactoCompleto({
        nombre: contacto?.contacto_nombre ?? null,
        email: contacto?.contacto_email ?? null,
      })
    ) {
      return fallo(CONTACTO_INCOMPLETO)
    }

    const contexto = await contextoDelActor(usuario)
    const { error } = await contexto.admin.rpc(
      "enviar_anunciante_a_verificacion_srv",
      {
        p_anunciante_id: anuncianteId,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
      }
    )
    if (error) {
      // Lo que faltaba pudo cambiar en otra pestaña: la página se repinta.
      refresh()
      return falloGeneral("enviar a verificación", error)
    }
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("enviarEmpresaAVerificacion", error)
  }
}
