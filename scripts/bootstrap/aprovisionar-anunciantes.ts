/**
 * Escrituras del aprovisionamiento de los anunciantes E2E (qué se garantiza:
 * `anunciantes-e2e.ts`). Todo va por la API, como el resto de `pnpm
 * bootstrap:e2e`: PostgREST y Storage con el cliente de servicio (bitácora con
 * actor), los cambios de estado por la máquina de estados con un operador
 * temporal en aal2 y lo que solo hace la empresa («Enviar a verificación») con
 * la sesión de su usuario. Nada de SQL directo.
 */
import type * as ModuloRutas from "../../src/lib/storage/rutas"
import { serializarFecha } from "../../src/lib/fechas"
import {
  type ActorConSesion,
  conSesionDeUsuario,
  errorDeApi,
  transicionarComo,
} from "./acciones-actor"
import {
  type AccionAnuncianteNuevo,
  accionAnuncianteNuevo,
  ANUNCIANTE_E2E,
  ANUNCIANTE_NUEVO_E2E,
  ANUNCIANTE_NUEVO_E2E_ID,
  cambiosAnunciante,
  type DatosBaseAnunciante,
  describirPasoAnunciante,
  DOCUMENTOS_EXIGIDOS_CO,
  filaBaseAnunciante,
  NOMBRES_DOCUMENTO,
  type PasoAnunciante,
  planAnuncianteVerificado,
  type TipoDocumentoAnunciante,
  tiposVigentes,
  vigenciaDocumentoAnunciante,
} from "./anunciantes-e2e"
import { pdfPrueba } from "./archivos-e2e"
import {
  listarArchivos,
  municipioActivo,
  rutasStorage,
} from "./aprovisionar-medios"
import { borrarNegocioDeAnunciante } from "./fabricas-negocio"
import { conOperadorTemporal } from "./operador-temporal"
import { exigirFueraDeProduccion } from "./produccion"
import {
  actualizarPerfil,
  type ClienteSupabase,
  crearClienteServicio,
  type EntornoBootstrap,
  ErrorBootstrap,
} from "./supabase"

/** Correo y contraseña de la persona de la empresa (y su id de perfil). */
export interface CredencialesAnunciante {
  id: string
  email: string
  password: string
}

const MOTIVO_RESTAURACION = "Restauración del anunciante de prueba E2E"
/** Holgura entre el reloj del equipo y el de la base al filtrar avisos por fecha. */
const MARGEN_RELOJ_MS = 5_000
const OBSERVACION_MUESTRA =
  "Documento de muestra del aprovisionamiento E2E (no es un documento real)."

function fallo(
  accion: string,
  error: { message: string; details?: string | null }
): never {
  throw errorDeApi(accion, error)
}

// ── Catálogos ────────────────────────────────────────────────────────────────

/** Id del sector activo con ese nombre o, si ya no existe, del primero activo. */
async function sectorActivo(
  servicio: ClienteSupabase,
  nombre: string
): Promise<string> {
  const activos = () =>
    servicio
      .from("sectores")
      .select("id")
      .eq("activo", true)
      .is("deleted_at", null)
  const { data: porNombre, error } = await activos()
    .eq("nombre", nombre)
    .maybeSingle()
  if (error) fallo("No se pudo leer el sector", error)
  if (porNombre) return porNombre.id
  const { data: primero, error: errorPrimero } = await activos()
    .order("nombre")
    .limit(1)
    .maybeSingle()
  if (errorPrimero) fallo("No se pudieron leer los sectores", errorPrimero)
  if (!primero) {
    throw new ErrorBootstrap(
      "No hay sectores activos: activa uno en Configuración."
    )
  }
  return primero.id
}

// ── Datos base ───────────────────────────────────────────────────────────────

/**
 * Registra el anunciante (nace PENDIENTE, `es_demo`) o le devuelve los datos
 * base si una prueba los cambió. Con `reiniciarEnvio`, además lo saca de la
 * cola de verificación.
 */
async function asegurarFilaAnunciante(
  servicio: ClienteSupabase,
  datos: DatosBaseAnunciante,
  { reiniciarEnvio = false }: { reiniciarEnvio?: boolean } = {}
): Promise<void> {
  const deseada = filaBaseAnunciante(
    datos,
    await sectorActivo(servicio, datos.sector),
    await municipioActivo(servicio, datos.municipioPreferido)
  )
  const { data: fila, error } = await servicio
    .from("anunciantes")
    .select(
      "razon_social, nombre_comercial, nit, digito_verificacion, identificacion_extranjera, sector_id, pais_iso2, municipio_codigo, ciudad_extranjera, datos_facturacion, logo_path, deleted_at, enviado_verificacion_at"
    )
    .eq("id", datos.id)
    .maybeSingle()
  if (error) fallo(`No se pudo leer «${datos.nombreComercial}»`, error)

  if (!fila) {
    const { error: errorAlta } = await servicio
      .from("anunciantes")
      .insert({ id: datos.id, ...deseada, es_demo: true })
    if (errorAlta)
      fallo(`No se pudo registrar «${datos.nombreComercial}»`, errorAlta)
    return
  }
  const cambios = {
    ...cambiosAnunciante(fila, deseada),
    ...(reiniciarEnvio && fila.enviado_verificacion_at
      ? { enviado_verificacion_at: null }
      : {}),
  }
  if (Object.keys(cambios).length === 0) return
  const { error: errorCambio } = await servicio
    .from("anunciantes")
    .update(cambios)
    .eq("id", datos.id)
  if (errorCambio)
    fallo(`No se pudo restaurar «${datos.nombreComercial}»`, errorCambio)
  // El logo que subió una prueba ya no lo referencia nadie.
  if (fila.logo_path && "logo_path" in cambios) {
    const { error: errorLogo } = await servicio.storage
      .from("avatares")
      .remove([fila.logo_path])
    if (errorLogo) fallo("No se pudo borrar el logo de prueba", errorLogo)
  }
}

// ── Anunciante Nuevo E2E ─────────────────────────────────────────────────────

/** Documentos, datos de contacto y campañas (con sus ofertas) de la empresa. */
async function vaciarAnunciante(
  servicio: ClienteSupabase,
  anuncianteId: string
): Promise<void> {
  await borrarNegocioDeAnunciante(servicio, anuncianteId)
  const { data: documentos, error } = await servicio
    .from("documentos_anunciante")
    .select("id")
    .eq("anunciante_id", anuncianteId)
  if (error) fallo("No se pudieron leer los documentos del anunciante", error)
  const avisos = [anuncianteId, ...documentos.map((documento) => documento.id)]
  const borrar = [
    () =>
      servicio
        .from("documentos_anunciante")
        .delete()
        .eq("anunciante_id", anuncianteId),
    () =>
      servicio
        .from("anunciantes_privado")
        .delete()
        .eq("anunciante_id", anuncianteId),
    // Avisos de la cola de verificación a otras personas (equipo AMO).
    () =>
      servicio
        .from("notificaciones")
        .delete()
        .in("entidad", ["anunciantes", "documentos_anunciante"])
        .in("entidad_id", avisos),
  ]
  for (const consulta of borrar) {
    const { error: errorBorrado } = await consulta()
    if (errorBorrado)
      fallo("No se pudo vaciar el anunciante nuevo E2E", errorBorrado)
  }
}

/** Documentos y logo que las pruebas le subieron a la empresa. */
async function borrarArchivosDelAnunciante(
  servicio: ClienteSupabase,
  anuncianteId: string
): Promise<void> {
  for (const bucket of ["documentos", "avatares"]) {
    const rutas = await listarArchivos(
      servicio,
      bucket,
      `anunciante/${anuncianteId}`
    )
    if (rutas.length === 0) continue
    const { error } = await servicio.storage.from(bucket).remove(rutas)
    if (error) fallo(`No se pudieron borrar los archivos de ${bucket}`, error)
  }
}

interface PerfilAnunciante {
  id: string
  anunciante_id: string | null
}

/**
 * Antes de borrar la empresa hay que sacar de ella a su usuario (un perfil
 * ANUNCIANTE activo no puede quedar sin empresa): se estaciona en el
 * Anunciante E2E y al final vuelve. Si hay otras personas vinculadas no se
 * toca nada: no son nuestras.
 */
async function estacionarUsuario(
  servicio: ClienteSupabase,
  usuario: PerfilAnunciante | null
): Promise<boolean> {
  let personas = servicio
    .from("perfiles")
    .select("email")
    .eq("anunciante_id", ANUNCIANTE_NUEVO_E2E_ID)
  if (usuario) personas = personas.neq("id", usuario.id)
  const { data, error } = await personas
  if (error)
    fallo("No se pudieron leer las personas del anunciante nuevo", error)
  if (data.length > 0) {
    throw new ErrorBootstrap(
      `«${ANUNCIANTE_NUEVO_E2E.nombreComercial}» tiene otras personas vinculadas (${data.map((fila) => fila.email).join(", ")}): bórralas desde Usuarios y vuelve a ejecutar.`
    )
  }
  if (usuario?.anunciante_id !== ANUNCIANTE_NUEVO_E2E_ID) return false
  await actualizarPerfil(servicio, usuario.id, {
    anunciante_id: ANUNCIANTE_E2E.id,
  })
  return true
}

/**
 * Devuelve el «Anunciante Nuevo E2E» a recién registrado (PENDIENTE, con sus
 * datos base, sin documentos, contacto, logo, campañas, envío a verificación
 * ni avisos) para que las pruebas lo recorran desde cero. Si ya pasó por una
 * decisión del equipo AMO, lo borra y lo registra de nuevo con el mismo id.
 * `servicio` sale de `clienteComoSuperadmin` (actúa como el superadministrador
 * y aplica la guarda de producción). Devuelve lo que hizo.
 */
export async function restablecerAnuncianteNuevo(
  servicio: ClienteSupabase,
  emailUsuario: string
): Promise<AccionAnuncianteNuevo> {
  const [{ data: fila, error }, { data: usuario, error: errorUsuario }] =
    await Promise.all([
      servicio
        .from("anunciantes")
        .select(
          "estado_verificacion, verificado_at, rechazado_at, suspendido_at, motivo_estado, deleted_at"
        )
        .eq("id", ANUNCIANTE_NUEVO_E2E_ID)
        .maybeSingle(),
      servicio
        .from("perfiles")
        .select("id, anunciante_id")
        .eq("email", emailUsuario)
        .maybeSingle(),
    ])
  if (error) fallo("No se pudo leer el anunciante nuevo E2E", error)
  if (errorUsuario) fallo("No se pudo leer su usuario", errorUsuario)

  const accion = accionAnuncianteNuevo(fila)
  let estacionado = false
  if (accion === "RECREAR") {
    await asegurarFilaAnunciante(servicio, ANUNCIANTE_E2E)
    estacionado = await estacionarUsuario(servicio, usuario)
    await vaciarAnunciante(servicio, ANUNCIANTE_NUEVO_E2E_ID)
    const { error: errorBorrado } = await servicio
      .from("anunciantes")
      .delete()
      .eq("id", ANUNCIANTE_NUEVO_E2E_ID)
    if (errorBorrado)
      fallo("No se pudo borrar el anunciante nuevo E2E", errorBorrado)
  } else if (accion === "LIMPIAR") {
    await vaciarAnunciante(servicio, ANUNCIANTE_NUEVO_E2E_ID)
  }
  await asegurarFilaAnunciante(servicio, ANUNCIANTE_NUEVO_E2E, {
    reiniciarEnvio: true,
  })
  await borrarArchivosDelAnunciante(servicio, ANUNCIANTE_NUEVO_E2E_ID)
  if (usuario) {
    if (estacionado) {
      await actualizarPerfil(servicio, usuario.id, {
        anunciante_id: ANUNCIANTE_NUEVO_E2E_ID,
      })
    }
    const { error: errorAvisos } = await servicio
      .from("notificaciones")
      .delete()
      .eq("usuario_id", usuario.id)
    if (errorAvisos)
      fallo("No se pudieron borrar las notificaciones", errorAvisos)
  }
  return accion
}

/**
 * Deja listos los dos anunciantes antes de preparar sus cuentas (un perfil
 * ANUNCIANTE activo exige su empresa): el Anunciante E2E con sus datos base y
 * el Anunciante Nuevo E2E reiniciado.
 */
export async function prepararAnunciantesBase(
  servicio: ClienteSupabase,
  emailUsuarioNuevo: string
): Promise<AccionAnuncianteNuevo> {
  await asegurarFilaAnunciante(servicio, ANUNCIANTE_E2E)
  return restablecerAnuncianteNuevo(servicio, emailUsuarioNuevo)
}

// ── Documentos ───────────────────────────────────────────────────────────────

/**
 * Sube un PDF de muestra a `documentos/anunciante/{id}/{tipo}/…` y registra la
 * fila PENDIENTE como la carga la empresa (`subido_por`). Si la fila no se
 * pudo crear, borra el objeto: no quedan huérfanos en Storage.
 */
async function cargarDocumento(
  servicio: ClienteSupabase,
  rutas: typeof ModuloRutas,
  anunciante: DatosBaseAnunciante,
  tipo: TipoDocumentoAnunciante,
  subidoPor: string
): Promise<string> {
  const archivo = pdfPrueba({
    titulo: `${NOMBRES_DOCUMENTO[tipo as keyof typeof NOMBRES_DOCUMENTO] ?? tipo} de «${anunciante.razonSocial}»`,
  })
  const destino = rutas.nuevaRuta(
    rutas.carpetaDocumentoAnunciante(anunciante.id, tipo),
    archivo.mimeType
  )
  const almacen = servicio.storage.from(destino.bucket)
  const { error: errorSubida } = await almacen.upload(
    destino.ruta,
    archivo.buffer,
    {
      contentType: archivo.mimeType,
      upsert: false,
    }
  )
  if (errorSubida) fallo(`No se pudo subir ${destino.ruta}`, errorSubida)
  const { data, error } = await servicio
    .from("documentos_anunciante")
    .insert({
      anunciante_id: anunciante.id,
      tipo,
      archivo_path: destino.ruta,
      subido_por: subidoPor,
    })
    .select("id")
    .single()
  if (error) {
    await almacen.remove([destino.ruta])
    fallo(`No se pudo registrar el documento ${tipo}`, error)
  }
  return data.id
}

// ── Anunciante E2E verificado ────────────────────────────────────────────────

async function leerAnuncianteVerificado(servicio: ClienteSupabase) {
  const [anunciante, aprobados] = await Promise.all([
    servicio
      .from("anunciantes")
      .select("estado_verificacion")
      .eq("id", ANUNCIANTE_E2E.id)
      .maybeSingle(),
    servicio
      .from("documentos_anunciante")
      .select("tipo, fecha_vencimiento")
      .eq("anunciante_id", ANUNCIANTE_E2E.id)
      .eq("estado_validacion", "APROBADO"),
  ])
  if (anunciante.error)
    fallo("No se pudo leer el Anunciante E2E", anunciante.error)
  if (aprobados.error)
    fallo("No se pudieron leer sus documentos", aprobados.error)
  if (!anunciante.data) {
    throw new ErrorBootstrap("El Anunciante E2E no existe: vuelve a ejecutar.")
  }
  return {
    estado: anunciante.data.estado_verificacion,
    documentosVigentes: tiposVigentes(
      aprobados.data,
      serializarFecha(new Date())
    ),
  }
}

interface ContextoPasos {
  entorno: EntornoBootstrap
  servicio: ClienteSupabase
  operador: ActorConSesion
  rutas: typeof ModuloRutas
  usuario: CredencialesAnunciante
  ahora: Date
}

async function ejecutarPaso(
  contexto: ContextoPasos,
  paso: PasoAnunciante
): Promise<void> {
  const { servicio, operador } = contexto
  const empresa = { entidad: "anunciantes", id: ANUNCIANTE_E2E.id }
  switch (paso.paso) {
    case "APROBAR_DOCUMENTO": {
      const documentoId = await cargarDocumento(
        servicio,
        contexto.rutas,
        ANUNCIANTE_E2E,
        paso.documento,
        contexto.usuario.id
      )
      const vence = vigenciaDocumentoAnunciante(paso.documento, contexto.ahora)
      return transicionarComo(
        servicio,
        operador,
        {
          entidad: "documentos_anunciante",
          id: documentoId,
          hacia: "APROBADO",
        },
        {
          datos: {
            observaciones: OBSERVACION_MUESTRA,
            ...(vence ? { fecha_vencimiento: vence } : {}),
          },
        }
      )
    }
    case "REENVIAR_A_VERIFICACION":
      return enviarAVerificacion(
        contexto.entorno,
        servicio,
        ANUNCIANTE_E2E.id,
        contexto.usuario
      )
    case "VERIFICAR":
      return transicionarComo(servicio, operador, {
        ...empresa,
        hacia: "VERIFICADO",
      })
    case "REACTIVAR":
      return transicionarComo(
        servicio,
        operador,
        { ...empresa, hacia: "VERIFICADO" },
        { motivo: MOTIVO_RESTAURACION }
      )
  }
}

/**
 * Completa lo que le falte al Anunciante E2E (RUT y Cámara de Comercio
 * aprobados y vigentes, estado VERIFICADO). Solo crea el operador temporal si
 * hay algo que hacer. Devuelve lo hecho, en palabras, para el registro.
 */
export async function completarAnuncianteVerificado(
  entorno: EntornoBootstrap,
  servicio: ClienteSupabase,
  usuario: CredencialesAnunciante
): Promise<string[]> {
  exigirFueraDeProduccion(entorno.url, "Restaurar el Anunciante E2E")
  const pasos = planAnuncianteVerificado(
    await leerAnuncianteVerificado(servicio)
  )
  if (pasos.length === 0) return []
  const desde = new Date(Date.now() - MARGEN_RELOJ_MS).toISOString()
  await conOperadorTemporal(entorno, servicio, async (operador) => {
    const contexto: ContextoPasos = {
      entorno,
      servicio,
      operador,
      rutas: rutasStorage(),
      usuario,
      ahora: new Date(),
    }
    for (const paso of pasos) await ejecutarPaso(contexto, paso)
  })
  await borrarAvisosDeRestauracion(servicio, desde)
  return pasos.map(describirPasoAnunciante)
}

/**
 * Los avisos que dispara la restauración (documentos a la cola de
 * verificación, documento aprobado, empresa verificada o reactivada) no son
 * de ninguna prueba ni de nadie del equipo AMO: se borran para que las
 * bandejas de las cuentas E2E y del equipo no acumulen ruido del aprovisionamiento.
 */
async function borrarAvisosDeRestauracion(
  servicio: ClienteSupabase,
  desde: string
): Promise<void> {
  const { data: documentos, error } = await servicio
    .from("documentos_anunciante")
    .select("id")
    .eq("anunciante_id", ANUNCIANTE_E2E.id)
  if (error) fallo("No se pudieron leer los documentos del anunciante", error)
  const { error: errorAvisos } = await servicio
    .from("notificaciones")
    .delete()
    .in("entidad", ["anunciantes", "documentos_anunciante"])
    .in("entidad_id", [
      ANUNCIANTE_E2E.id,
      ...documentos.map((documento) => documento.id),
    ])
    .gte("created_at", desde)
  if (errorAvisos) fallo("No se pudieron borrar los avisos", errorAvisos)
}

// ── Envío a verificación ─────────────────────────────────────────────────────

/**
 * «Enviar a verificación» como lo hace la empresa: con la sesión de su usuario.
 * La BD exige la persona de contacto (nombre y correo), que se deja cargada antes.
 */
async function enviarAVerificacion(
  entorno: EntornoBootstrap,
  servicio: ClienteSupabase,
  anuncianteId: string,
  usuario: CredencialesAnunciante
): Promise<void> {
  const { error: errorContacto } = await servicio
    .from("anunciantes_privado")
    .upsert({
      anunciante_id: anuncianteId,
      contacto_nombre: "Contacto E2E",
      contacto_email: usuario.email,
    })
  if (errorContacto) fallo("No se pudo cargar el contacto", errorContacto)
  await conSesionDeUsuario(entorno, usuario, async (actor) => {
    const { error } = await servicio.rpc(
      "enviar_anunciante_a_verificacion_srv",
      {
        p_anunciante_id: anuncianteId,
        p_actor_id: actor.usuarioId,
        p_session_id: actor.sesionId,
      }
    )
    if (error) fallo("No se pudo enviar la empresa a verificación", error)
  })
}

/**
 * El «Anunciante Nuevo E2E» con su RUT y su Cámara de Comercio cargados
 * (PENDIENTE, archivos PDF reales en Storage) y enviado a verificación por su
 * usuario: lo que el equipo AMO encuentra en la cola. Parte siempre del
 * anunciante recién registrado. `servicio` sale de `clienteComoSuperadmin`.
 */
export async function prepararAnuncianteEnVerificacion(
  entorno: EntornoBootstrap,
  servicio: ClienteSupabase,
  usuario: CredencialesAnunciante
): Promise<{ anuncianteId: string; nombre: string }> {
  exigirFueraDeProduccion(entorno.url, "Preparar el anunciante en verificación")
  await restablecerAnuncianteNuevo(servicio, usuario.email)
  // La carga queda en la bitácora a nombre de la persona de la empresa.
  const comoEmpresa = crearClienteServicio(entorno, usuario.id)
  const rutas = rutasStorage()
  for (const tipo of DOCUMENTOS_EXIGIDOS_CO) {
    await cargarDocumento(
      comoEmpresa,
      rutas,
      ANUNCIANTE_NUEVO_E2E,
      tipo,
      usuario.id
    )
  }
  await enviarAVerificacion(entorno, servicio, ANUNCIANTE_NUEVO_E2E_ID, usuario)
  return {
    anuncianteId: ANUNCIANTE_NUEVO_E2E_ID,
    nombre: ANUNCIANTE_NUEVO_E2E.nombreComercial,
  }
}
