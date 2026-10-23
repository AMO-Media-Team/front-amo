/**
 * Escrituras del aprovisionamiento de los medios E2E (qué se garantiza:
 * `medios-e2e.ts` y `medio-verificado-e2e.ts`): el «Medio E2E» y el «Medio
 * Suspensión E2E» verificados, y el «Medio Nuevo E2E» recién registrado. Todo va por la API, como el
 * resto de `pnpm bootstrap:e2e`: PostgREST y Storage con el cliente de
 * servicio que actúa como el superadministrador (bitácora con actor), y los
 * cambios de estado por la máquina de estados (`transicionar_srv` y las
 * `*_srv`) con un operador temporal en aal2. Nada de SQL directo.
 */
import Module, { createRequire } from "node:module"

import type * as ModuloCifrado from "../../src/lib/cifrado"
import type * as ModuloRutas from "../../src/lib/storage/rutas"
import { TIPOS_DOCUMENTO_MEDIO } from "../../src/features/operacion/estados"
import { serializarFecha } from "../../src/lib/fechas"
import type { Json } from "../../src/types/database.types"
import { type ColorRgb, pdfDeMuestra, pngDeMuestra } from "./archivos-prueba"
import {
  type CifradorPago,
  cuentaAlDia,
  datosPagoE2E,
  describirPaso,
  documentosExigidos,
  type EstadoMedioVerificado,
  formatoDocumento,
  MEDIO_VERIFICADO_E2E,
  type MedioVerificadoE2E,
  pagoAlDia,
  type PasoMedio,
  planMedioVerificado,
  type TipoDocumentoMedio,
  tiposVigentes,
  vigenciaDocumento,
} from "./medio-verificado-e2e"
import {
  type AccionMedioNuevo,
  accionMedioNuevo,
  cambiosMedio,
  type DatosBaseMedio,
  diferencia,
  MEDIO_E2E,
  MEDIO_E2E_ID,
  MEDIO_NUEVO_E2E,
  MEDIO_NUEVO_E2E_ID,
  MEDIO_SUSPENSION_E2E,
} from "./medios-e2e"
import { conOperadorTemporal, type OperadorTemporal } from "./operador-temporal"
import {
  actualizarPerfil,
  type ClienteSupabase,
  crearClientePublico,
  type EntornoBootstrap,
  ErrorBootstrap,
} from "./supabase"

interface ErrorApi {
  message: string
  details?: string | null
}

function fallo(accion: string, error: ErrorApi): never {
  throw new ErrorBootstrap(
    `${accion}: ${error.message}${error.details ? ` (${error.details})` : ""}`
  )
}

/**
 * Carga un módulo de `src/lib` protegido con `import "server-only"`. Ese
 * marcador lanza al cargarse fuera del entorno react-server de Next, pero este
 * script ES código de servidor (corre en el equipo del operador y nunca llega a
 * un navegador): se registra antes un módulo vacío en su lugar, el mismo efecto
 * que la condición `react-server` con la que Next lo resuelve. Los scripts
 * corren como CommonJS (`tsx` sin `"type": "module"`).
 */
function cargarModuloDeServidor<T>(especificador: string): T {
  const requerir = createRequire(__filename)
  const marcador = requerir.resolve("server-only")
  if (!requerir.cache[marcador]) {
    const vacio = new Module(marcador)
    vacio.loaded = true
    requerir.cache[marcador] = vacio
  }
  return requerir(especificador) as T
}

/** Cifrado de `src/lib/cifrado.ts` con las llaves de `.env.local` (`AMO_CIFRADO_KEY`). */
export function cifradorDelEntorno(): CifradorPago {
  const { cifrar, descifrar, huella, enmascarar } = cargarModuloDeServidor<
    typeof ModuloCifrado
  >("../../src/lib/cifrado")
  return { cifrar, descifrar, huella, enmascarar }
}

/** Rutas de Storage de `src/lib/storage/rutas.ts`: las mismas carpetas y nombres que la app. */
export function rutasStorage(): typeof ModuloRutas {
  return cargarModuloDeServidor<typeof ModuloRutas>(
    "../../src/lib/storage/rutas"
  )
}

// ── Lecturas de catálogos ────────────────────────────────────────────────────

/** El municipio preferido si está activo (y su departamento); si no, el primero activo. */
export async function municipioActivo(
  servicio: ClienteSupabase,
  preferido: string
): Promise<string> {
  const activos = () =>
    servicio
      .from("municipios")
      .select(
        "codigo, departamento:departamentos!municipios_departamento_codigo_fkey!inner(activo)"
      )
      .eq("activo", true)
      .eq("departamento.activo", true)
  const { data: elegido, error } = await activos()
    .eq("codigo", preferido)
    .maybeSingle()
  if (error) fallo("No se pudo leer el municipio", error)
  if (elegido) return elegido.codigo
  const { data: primero, error: errorPrimero } = await activos()
    .order("codigo")
    .limit(1)
    .maybeSingle()
  if (errorPrimero) fallo("No se pudieron leer los municipios", errorPrimero)
  if (!primero) {
    throw new ErrorBootstrap(
      "No hay municipios activos: activa al menos uno en Configuración."
    )
  }
  return primero.codigo
}

/** Id de la categoría activa con ese nombre o, si ya no existe, de la primera activa. */
async function categoriaActiva(
  servicio: ClienteSupabase,
  nombre: string
): Promise<string | null> {
  const activas = () =>
    servicio
      .from("categorias")
      .select("id")
      .eq("activo", true)
      .is("deleted_at", null)
  const { data: porNombre, error } = await activas()
    .eq("nombre", nombre)
    .maybeSingle()
  if (error) fallo("No se pudo leer la categoría", error)
  if (porNombre) return porNombre.id
  const { data: primera, error: errorPrimera } = await activas()
    .order("orden")
    .limit(1)
    .maybeSingle()
  if (errorPrimera) fallo("No se pudieron leer las categorías", errorPrimera)
  return primera?.id ?? null
}

// ── Datos base de un medio ───────────────────────────────────────────────────

async function asegurarCategorias(
  servicio: ClienteSupabase,
  datos: DatosBaseMedio
): Promise<void> {
  const deseada = datos.categoria
    ? await categoriaActiva(servicio, datos.categoria)
    : null
  const { data, error } = await servicio
    .from("medio_categorias")
    .select("categoria_id")
    .eq("medio_id", datos.id)
  if (error) fallo("No se pudieron leer las categorías del medio", error)
  const { agregar, quitar } = diferencia(
    data.map((fila) => fila.categoria_id),
    deseada ? [deseada] : []
  )
  if (quitar.length > 0) {
    const { error: errorQuitar } = await servicio
      .from("medio_categorias")
      .delete()
      .eq("medio_id", datos.id)
      .in("categoria_id", quitar)
    if (errorQuitar) fallo("No se pudieron quitar categorías", errorQuitar)
  }
  if (agregar.length > 0) {
    const { error: errorAgregar } = await servicio
      .from("medio_categorias")
      .insert(
        agregar.map((categoriaId) => ({
          medio_id: datos.id,
          categoria_id: categoriaId,
        }))
      )
    if (errorAgregar) fallo("No se pudo asignar la categoría", errorAgregar)
  }
}

/**
 * Registra el medio (nace PENDIENTE, `es_demo`) o le devuelve los datos base
 * (nombre, tipo, municipio, descripción y categoría) si una prueba los cambió.
 */
async function asegurarFilaMedio(
  servicio: ClienteSupabase,
  datos: DatosBaseMedio
): Promise<void> {
  const municipio = await municipioActivo(servicio, datos.municipioPreferido)
  const { data: fila, error } = await servicio
    .from("medios")
    .select("nombre, tipo, municipio_codigo, descripcion_audiencia, deleted_at")
    .eq("id", datos.id)
    .maybeSingle()
  if (error) fallo(`No se pudo leer «${datos.nombre}»`, error)

  if (!fila) {
    const { error: errorAlta } = await servicio.from("medios").insert({
      id: datos.id,
      nombre: datos.nombre,
      tipo: datos.tipo,
      municipio_codigo: municipio,
      descripcion_audiencia: datos.descripcionAudiencia,
      es_demo: true,
    })
    if (errorAlta) fallo(`No se pudo registrar «${datos.nombre}»`, errorAlta)
  } else {
    const cambios = cambiosMedio(fila, datos, municipio)
    if (cambios) {
      const { error: errorCambio } = await servicio
        .from("medios")
        .update(cambios)
        .eq("id", datos.id)
      if (errorCambio) {
        fallo(`No se pudo restaurar «${datos.nombre}»`, errorCambio)
      }
    }
  }
  await asegurarCategorias(servicio, datos)
}

// ── Medio Nuevo E2E ──────────────────────────────────────────────────────────

/** Lo que el alta de un medio le agrega, en orden de dependencias (FK). */
async function vaciarMedio(
  servicio: ClienteSupabase,
  medioId: string
): Promise<void> {
  const borrar = [
    () =>
      servicio.from("verificaciones_cuenta").delete().eq("medio_id", medioId),
    () => servicio.from("cuentas_sociales").delete().eq("medio_id", medioId),
    () => servicio.from("documentos_medio").delete().eq("medio_id", medioId),
    () => servicio.from("medios_privado").delete().eq("medio_id", medioId),
    () => servicio.from("medio_categorias").delete().eq("medio_id", medioId),
    () =>
      servicio.from("medio_audiencia_paises").delete().eq("medio_id", medioId),
    () =>
      servicio
        .from("medio_pertinencia_geografica")
        .delete()
        .eq("medio_id", medioId),
  ]
  for (const consulta of borrar) {
    const { error } = await consulta()
    if (error) fallo("No se pudo vaciar el medio nuevo E2E", error)
  }
}

/** Rutas de todos los archivos bajo `carpeta` (Storage lista un nivel por llamada). */
export async function listarArchivos(
  servicio: ClienteSupabase,
  bucket: string,
  carpeta: string
): Promise<string[]> {
  const { data, error } = await servicio.storage
    .from(bucket)
    .list(carpeta, { limit: 1000 })
  if (error) fallo(`No se pudo listar ${bucket}/${carpeta}`, error)
  const rutas: string[] = []
  for (const entrada of data) {
    const ruta = `${carpeta}/${entrada.name}`
    // Las carpetas llegan sin id.
    if (entrada.id === null) {
      rutas.push(...(await listarArchivos(servicio, bucket, ruta)))
    } else {
      rutas.push(ruta)
    }
  }
  return rutas
}

/** Documentos, capturas y logo que las pruebas le subieron al medio. */
async function borrarArchivosDelMedio(
  servicio: ClienteSupabase,
  medioId: string
): Promise<void> {
  for (const bucket of ["documentos", "avatares"]) {
    const rutas = await listarArchivos(servicio, bucket, `medio/${medioId}`)
    if (rutas.length === 0) continue
    const { error } = await servicio.storage.from(bucket).remove(rutas)
    if (error) fallo(`No se pudieron borrar los archivos de ${bucket}`, error)
  }
}

interface PerfilMedio {
  id: string
  medio_id: string | null
}

/**
 * Antes de borrar el medio hay que sacar de él a su usuario (un perfil MEDIO
 * activo no puede quedar sin medio): se estaciona en el Medio E2E y al final
 * vuelve. Si hay otras personas vinculadas no se toca nada: no son nuestras.
 */
async function estacionarUsuario(
  servicio: ClienteSupabase,
  usuario: PerfilMedio | null
): Promise<boolean> {
  let personas = servicio
    .from("perfiles")
    .select("email")
    .eq("medio_id", MEDIO_NUEVO_E2E_ID)
  if (usuario) personas = personas.neq("id", usuario.id)
  const { data, error } = await personas
  if (error) fallo("No se pudieron leer las personas del medio nuevo", error)
  if (data.length > 0) {
    throw new ErrorBootstrap(
      `«${MEDIO_NUEVO_E2E.nombre}» tiene otras personas vinculadas (${data.map((fila) => fila.email).join(", ")}): bórralas desde Usuarios y vuelve a ejecutar.`
    )
  }
  if (usuario?.medio_id !== MEDIO_NUEVO_E2E_ID) return false
  await actualizarPerfil(servicio, usuario.id, { medio_id: MEDIO_E2E_ID })
  return true
}

async function borrarNotificaciones(
  servicio: ClienteSupabase,
  usuarioId: string
): Promise<void> {
  const { error } = await servicio
    .from("notificaciones")
    .delete()
    .eq("usuario_id", usuarioId)
  if (error) fallo("No se pudieron borrar las notificaciones", error)
}

/**
 * Devuelve el «Medio Nuevo E2E» a recién registrado (PENDIENTE, sin cuentas,
 * documentos, pago, archivos ni avisos) para que las pruebas de alta lo
 * recorran desde cero. Si ya pasó por una decisión del equipo AMO, lo borra y
 * lo registra de nuevo con el mismo id. Devuelve lo que hizo.
 */
export async function restablecerMedioNuevo(
  servicio: ClienteSupabase,
  emailUsuario: string
): Promise<AccionMedioNuevo> {
  const [{ data: fila, error }, { data: usuario, error: errorUsuario }] =
    await Promise.all([
      servicio
        .from("medios")
        .select(
          "estado, verificado_at, rechazado_at, suspendido_at, motivo_estado, deleted_at, enviado_verificacion_at"
        )
        .eq("id", MEDIO_NUEVO_E2E_ID)
        .maybeSingle(),
      servicio
        .from("perfiles")
        .select("id, medio_id")
        .eq("email", emailUsuario)
        .maybeSingle(),
    ])
  if (error) fallo("No se pudo leer el medio nuevo E2E", error)
  if (errorUsuario) fallo("No se pudo leer su usuario", errorUsuario)

  const accion = accionMedioNuevo(fila)
  let estacionado = false
  if (accion === "RECREAR") {
    await asegurarFilaMedio(servicio, MEDIO_E2E)
    estacionado = await estacionarUsuario(servicio, usuario)
    await vaciarMedio(servicio, MEDIO_NUEVO_E2E_ID)
    const { error: errorBorrado } = await servicio
      .from("medios")
      .delete()
      .eq("id", MEDIO_NUEVO_E2E_ID)
    if (errorBorrado)
      fallo("No se pudo borrar el medio nuevo E2E", errorBorrado)
  } else if (accion === "LIMPIAR") {
    await vaciarMedio(servicio, MEDIO_NUEVO_E2E_ID)
    if (fila?.enviado_verificacion_at) {
      const { error: errorEnvio } = await servicio
        .from("medios")
        .update({ enviado_verificacion_at: null })
        .eq("id", MEDIO_NUEVO_E2E_ID)
      if (errorEnvio)
        fallo("No se pudo sacar de la cola de verificación", errorEnvio)
    }
  }
  await asegurarFilaMedio(servicio, MEDIO_NUEVO_E2E)
  await borrarArchivosDelMedio(servicio, MEDIO_NUEVO_E2E_ID)
  if (usuario) {
    if (estacionado) {
      await actualizarPerfil(servicio, usuario.id, {
        medio_id: MEDIO_NUEVO_E2E_ID,
      })
    }
    await borrarNotificaciones(servicio, usuario.id)
  }
  return accion
}

/**
 * Deja listos los medios antes de preparar sus cuentas (un perfil MEDIO
 * activo exige su medio): el Medio E2E y el Medio Suspensión E2E con sus
 * datos base, y el Medio Nuevo E2E reiniciado.
 */
export async function prepararMediosBase(
  servicio: ClienteSupabase,
  emailUsuarioNuevo: string
): Promise<AccionMedioNuevo> {
  await asegurarFilaMedio(servicio, MEDIO_E2E)
  await asegurarFilaMedio(servicio, MEDIO_SUSPENSION_E2E)
  return restablecerMedioNuevo(servicio, emailUsuarioNuevo)
}

// ── Medio E2E verificado ─────────────────────────────────────────────────────

async function diasReverificacion(servicio: ClienteSupabase): Promise<number> {
  const { data, error } = await servicio
    .from("configuracion")
    .select("valor")
    .eq("clave", "medios.reverificacion_dias")
    .single()
  if (error) fallo("No se pudo leer medios.reverificacion_dias", error)
  const dias = Number(data.valor)
  if (!Number.isInteger(dias) || dias <= 0) {
    throw new ErrorBootstrap(
      "medios.reverificacion_dias no es un entero positivo."
    )
  }
  return dias
}

interface LecturaMedioVerificado {
  estado: EstadoMedioVerificado
  cuentaId: string | null
}

async function leerMedioVerificado(
  servicio: ClienteSupabase,
  cifrador: CifradorPago,
  ahora: Date,
  { datos, cuenta: cuentaE2E, nivel: nivelE2E, pago }: MedioVerificadoE2E
): Promise<LecturaMedioVerificado> {
  const [medio, cuenta, privado, aprobados, nivel, dias] = await Promise.all([
    servicio
      .from("medios")
      .select("estado, nivel_verificacion")
      .eq("id", datos.id)
      .single(),
    servicio
      .from("cuentas_sociales")
      .select(
        "id, verificada, fecha_ultima_verificacion, seguidores_verificados, verificaciones:verificaciones_cuenta(id, estado_validacion)"
      )
      .eq("medio_id", datos.id)
      .eq("plataforma", cuentaE2E.plataforma)
      .eq("handle", cuentaE2E.handle)
      .is("deleted_at", null)
      .maybeSingle(),
    servicio
      .from("medios_privado")
      .select(
        "titular_nombre, tipo_documento, numero_documento_cifrado, numero_documento_hash, numero_documento_resumen, metodo_pago, datos_pago_cifrados, datos_pago_resumen, es_declarante, obligado_facturar, responsable_iva, celular, email_contacto, direccion"
      )
      .eq("medio_id", datos.id)
      .maybeSingle(),
    servicio
      .from("documentos_medio")
      .select("tipo, fecha_vencimiento")
      .eq("medio_id", datos.id)
      .eq("estado_validacion", "APROBADO"),
    servicio
      .from("niveles_verificacion")
      .select("documentos_requeridos")
      .eq("nivel", nivelE2E)
      .single(),
    diasReverificacion(servicio),
  ])
  for (const { error } of [medio, cuenta, privado, aprobados, nivel]) {
    if (error) fallo(`No se pudo leer «${datos.nombre}»`, error)
  }
  if (!medio.data || !nivel.data || !aprobados.data) {
    throw new ErrorBootstrap(`«${datos.nombre}» no existe: vuelve a ejecutar.`)
  }

  const filaCuenta = cuenta.data
  return {
    cuentaId: filaCuenta?.id ?? null,
    estado: {
      estado: medio.data.estado,
      nivel: medio.data.nivel_verificacion,
      cuenta: filaCuenta
        ? {
            alDia: cuentaAlDia(filaCuenta, dias, ahora),
            seguidores: filaCuenta.seguidores_verificados,
            verificacionPendienteId:
              filaCuenta.verificaciones.find(
                (verificacion) => verificacion.estado_validacion === "PENDIENTE"
              )?.id ?? null,
          }
        : null,
      pagoAlDia: pagoAlDia(privado.data, datos.id, cifrador, pago),
      documentosVigentes: tiposVigentes(aprobados.data, serializarFecha(ahora)),
      documentosExigidos: documentosExigidos(
        nivel.data.documentos_requeridos,
        pago.metodo
      ),
    },
  }
}

interface ContextoPasos {
  entorno: EntornoBootstrap
  /** El medio que se completa (datos, cuenta, nivel y pago). */
  medio: MedioVerificadoE2E
  servicio: ClienteSupabase
  operador: OperadorTemporal
  cifrador: CifradorPago
  rutas: typeof ModuloRutas
  usuario: CredencialesMedio
  cuentaId: string | null
  ahora: Date
}

export interface CredencialesMedio {
  id: string
  email: string
  password: string
}

const MOTIVO_RESTAURACION = "Restauración del medio de prueba E2E"
const OBSERVACION_MUESTRA =
  "Documento de muestra del aprovisionamiento E2E (no es un documento real)."

/** Lila AMO 100 y 600: la muestra se reconoce a simple vista. */
const FONDO_MUESTRA: ColorRgb = [237, 231, 254]
const FRANJA_MUESTRA: ColorRgb = [117, 73, 222]

async function transicionar(
  contexto: ContextoPasos,
  entidad: string,
  id: string,
  hacia: string,
  opciones: { motivo?: string; datos?: Json } = {}
): Promise<void> {
  const { error } = await contexto.servicio.rpc("transicionar_srv", {
    p_entidad: entidad,
    p_id: id,
    p_hacia: hacia,
    p_actor_id: contexto.operador.usuarioId,
    p_session_id: contexto.operador.sesionId,
    p_motivo: opciones.motivo,
    p_datos: opciones.datos,
  })
  if (error) fallo(`No se pudo pasar ${entidad} a ${hacia}`, error)
}

/**
 * Sube un archivo de muestra y, si la fila que lo referencia no se pudo
 * crear, lo borra: no quedan objetos huérfanos en Storage.
 */
async function conArchivoSubido<T>(
  contexto: ContextoPasos,
  destino: ModuloRutas.RutaStorage,
  contenido: Buffer,
  mime: string,
  registrar: () => Promise<T>
): Promise<T> {
  const almacen = contexto.servicio.storage.from(destino.bucket)
  const { error } = await almacen.upload(destino.ruta, contenido, {
    contentType: mime,
    upsert: false,
  })
  if (error) fallo(`No se pudo subir ${destino.ruta}`, error)
  try {
    return await registrar()
  } catch (falla) {
    await almacen.remove([destino.ruta])
    throw falla
  }
}

function exigirCuenta(contexto: ContextoPasos): string {
  if (!contexto.cuentaId) {
    throw new ErrorBootstrap(
      `Falta la cuenta de Instagram de «${contexto.medio.datos.nombre}».`
    )
  }
  return contexto.cuentaId
}

async function registrarCuenta(contexto: ContextoPasos): Promise<void> {
  const { datos, cuenta } = contexto.medio
  const { data, error } = await contexto.servicio
    .from("cuentas_sociales")
    .insert({
      medio_id: datos.id,
      plataforma: cuenta.plataforma,
      handle: cuenta.handle,
      url: cuenta.url,
    })
    .select("id")
    .single()
  if (error) fallo("No se pudo registrar la cuenta de Instagram", error)
  contexto.cuentaId = data.id
}

/** Captura de muestra + verificación MANUAL aprobada con los seguidores de la cuenta. */
async function verificarCuenta(contexto: ContextoPasos): Promise<void> {
  const cuentaId = exigirCuenta(contexto)
  const { datos, cuenta } = contexto.medio
  const destino = contexto.rutas.nuevaRuta(
    contexto.rutas.carpetaCapturaCuentaSocial(datos.id, cuentaId),
    "image/png"
  )
  const verificacionId = await conArchivoSubido(
    contexto,
    destino,
    pngDeMuestra(360, 640, FONDO_MUESTRA, FRANJA_MUESTRA),
    "image/png",
    async () => {
      const { data, error } = await contexto.servicio
        .from("verificaciones_cuenta")
        .insert({
          cuenta_social_id: cuentaId,
          medio_id: datos.id,
          metodo: "MANUAL",
          seguidores_reportados: cuenta.seguidores,
          captura_path: destino.ruta,
        })
        .select("id")
        .single()
      if (error)
        fallo("No se pudo registrar la verificación de la cuenta", error)
      return data.id
    }
  )
  await transicionar(
    contexto,
    "verificaciones_cuenta",
    verificacionId,
    "APROBADA",
    {
      datos: {
        seguidores_verificados: cuenta.seguidores,
        observaciones: OBSERVACION_MUESTRA,
      },
    }
  )
}

async function guardarPago(contexto: ContextoPasos): Promise<void> {
  const { error } = await contexto.servicio.rpc(
    "guardar_datos_pago_medio_srv",
    {
      p_medio_id: contexto.medio.datos.id,
      p_actor_id: contexto.operador.usuarioId,
      p_session_id: contexto.operador.sesionId,
      p_datos: datosPagoE2E(
        contexto.medio.datos.id,
        contexto.cifrador,
        contexto.medio.pago
      ),
    }
  )
  if (error) fallo("No se pudieron guardar los datos de pago", error)
}

function contenidoDocumento(
  tipo: TipoDocumentoMedio,
  nombreMedio: string
): Buffer {
  return formatoDocumento(tipo) === "image/png"
    ? pngDeMuestra(640, 400, FONDO_MUESTRA, FRANJA_MUESTRA)
    : pdfDeMuestra([
        "AMO · Documento de muestra (pruebas E2E)",
        `${TIPOS_DOCUMENTO_MEDIO[tipo]} de «${nombreMedio}»`,
        "Generado por pnpm bootstrap:e2e. No es un documento real.",
      ])
}

/** Archivo de muestra + fila del documento (como lo sube el medio) + aprobación con vigencia. */
async function aprobarDocumento(
  contexto: ContextoPasos,
  tipo: TipoDocumentoMedio
): Promise<void> {
  const mime = formatoDocumento(tipo)
  const { datos } = contexto.medio
  const destino = contexto.rutas.nuevaRuta(
    contexto.rutas.carpetaDocumentoMedio(datos.id, tipo),
    mime
  )
  const documentoId = await conArchivoSubido(
    contexto,
    destino,
    contenidoDocumento(tipo, datos.nombre),
    mime,
    async () => {
      const { data, error } = await contexto.servicio
        .from("documentos_medio")
        .insert({
          medio_id: datos.id,
          tipo,
          archivo_path: destino.ruta,
          subido_por: contexto.usuario.id,
        })
        .select("id")
        .single()
      if (error) fallo(`No se pudo registrar el documento ${tipo}`, error)
      return data.id
    }
  )
  const vence = vigenciaDocumento(tipo, contexto.ahora)
  await transicionar(contexto, "documentos_medio", documentoId, "APROBADO", {
    datos: {
      observaciones: OBSERVACION_MUESTRA,
      ...(vence ? { fecha_vencimiento: vence } : {}),
    },
  })
}

async function registrarVideollamada(contexto: ContextoPasos): Promise<void> {
  const { error } = await contexto.servicio.rpc(
    "registrar_verificacion_videollamada_srv",
    {
      p_medio_id: contexto.medio.datos.id,
      p_actor_id: contexto.operador.usuarioId,
      p_session_id: contexto.operador.sesionId,
      p_observaciones:
        "Prueba de vida de muestra del aprovisionamiento E2E (videollamada simulada).",
    }
  )
  if (error) fallo("No se pudo registrar la videollamada", error)
}

/**
 * RECHAZADO → PENDIENTE solo lo hace el propio medio («Enviar a
 * verificación»): se ingresa como su usuario para tener una sesión viva.
 */
async function reenviarComoMedio(contexto: ContextoPasos): Promise<void> {
  const cliente = crearClientePublico(contexto.entorno)
  const { email, password, id } = contexto.usuario
  const ingreso = await cliente.auth.signInWithPassword({ email, password })
  const { nombre, id: medioId } = contexto.medio.datos
  if (ingreso.error)
    fallo(`El usuario de «${nombre}» no pudo ingresar`, ingreso.error)
  try {
    const { data, error } = await cliente.auth.getClaims()
    if (error || !data) {
      throw new ErrorBootstrap(`No se pudo leer la sesión de «${nombre}».`)
    }
    const { error: errorEnvio } = await contexto.servicio.rpc(
      "enviar_medio_a_verificacion_srv",
      {
        p_medio_id: medioId,
        p_actor_id: id,
        p_session_id: data.claims.session_id,
      }
    )
    if (errorEnvio)
      fallo("No se pudo reenviar el medio a verificación", errorEnvio)
  } finally {
    await cliente.auth.signOut({ scope: "local" })
  }
}

async function ejecutarPaso(
  contexto: ContextoPasos,
  paso: PasoMedio
): Promise<void> {
  switch (paso.paso) {
    case "REGISTRAR_CUENTA":
      return registrarCuenta(contexto)
    case "DESCARTAR_VERIFICACION":
      return transicionar(
        contexto,
        "verificaciones_cuenta",
        paso.verificacionId,
        "RECHAZADA",
        { motivo: MOTIVO_RESTAURACION }
      )
    case "VERIFICAR_CUENTA":
      return verificarCuenta(contexto)
    case "GUARDAR_PAGO":
      return guardarPago(contexto)
    case "APROBAR_DOCUMENTO":
      return aprobarDocumento(contexto, paso.documento)
    case "VIDEOLLAMADA":
      return registrarVideollamada(contexto)
    case "REENVIAR_A_VERIFICACION":
      return reenviarComoMedio(contexto)
    case "REACTIVAR":
      return transicionar(
        contexto,
        "medios",
        contexto.medio.datos.id,
        "VERIFICADO",
        { motivo: MOTIVO_RESTAURACION }
      )
    case "VERIFICAR_MEDIO":
      return transicionar(
        contexto,
        "medios",
        contexto.medio.datos.id,
        "VERIFICADO",
        { datos: { nivel: paso.nivel } }
      )
    case "CAMBIAR_NIVEL":
      return transicionar(
        contexto,
        "medios",
        contexto.medio.datos.id,
        "VERIFICADO",
        { motivo: MOTIVO_RESTAURACION, datos: { nivel: paso.nivel } }
      )
  }
}

/**
 * Completa lo que le falte al medio (por omisión, el Medio E2E; también el
 * Medio Suspensión E2E): cuenta verificada, pago, documentos y estado
 * VERIFICADO en su nivel (si quedó suspendido, lo reactiva). Solo crea el
 * operador temporal si hay algo que hacer. Devuelve lo hecho, en palabras,
 * para el registro de la corrida.
 */
export async function completarMedioVerificado(
  entorno: EntornoBootstrap,
  servicio: ClienteSupabase,
  usuario: CredencialesMedio,
  medio: MedioVerificadoE2E = MEDIO_VERIFICADO_E2E
): Promise<string[]> {
  const ahora = new Date()
  const cifrador = cifradorDelEntorno()
  const { estado, cuentaId } = await leerMedioVerificado(
    servicio,
    cifrador,
    ahora,
    medio
  )
  const pasos = planMedioVerificado(estado, medio)
  if (pasos.length === 0) return []

  await conOperadorTemporal(entorno, servicio, async (operador) => {
    const contexto: ContextoPasos = {
      entorno,
      medio,
      servicio,
      operador,
      cifrador,
      rutas: rutasStorage(),
      usuario,
      cuentaId,
      ahora,
    }
    for (const paso of pasos) await ejecutarPaso(contexto, paso)
  })
  return pasos.map((paso) => describirPaso(paso, medio.cuenta))
}
