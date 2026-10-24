/**
 * Errores de la base de datos → mensajes para la persona (módulo puro).
 *
 * Las funciones de la BD lanzan `message = 'AMO_*'` con un `detail` ya escrito
 * para la interfaz (docs/modelo-datos.md §1.7): se usa ese detalle cuando
 * existe y, si no, el texto del catálogo. Las restricciones se reconocen por
 * su nombre y, en último término, por el SQLSTATE. Nunca se muestra el mensaje
 * técnico crudo.
 */

export interface ErrorBd {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

/** Mensaje de una restricción y, si el formulario lo tiene, el campo donde mostrarlo. */
export interface MensajeCampo {
  mensaje: string
  campo?: string
}

/** Nombre de la restricción (CHECK, UNIQUE, FK…) → mensaje para la persona. */
export type Restricciones = Readonly<Record<string, string | MensajeCampo>>

export interface ErrorBdInterpretado extends MensajeCampo {
  /** Código de negocio (`AMO_*`) si la BD lanzó uno. */
  codigo: string | null
  /**
   * Regla de negocio o restricción conocida: la persona puede corregirlo y no
   * hace falta registrarlo como fallo del sistema.
   */
  esperado: boolean
}

export const MENSAJE_INESPERADO =
  "No pudimos completar la operación. Intenta de nuevo en unos minutos."

export const MENSAJE_SIN_PERMISO =
  "No tienes permiso para esta acción o tu sesión ya no es válida. Vuelve a ingresar si el problema continúa."

/**
 * Texto de respaldo de cada código `AMO_*` que lanzan las migraciones, para
 * cuando el error llega sin `detail`. Una prueba exige que estén todos.
 */
export const MENSAJES_NEGOCIO: Readonly<Record<string, string>> = {
  AMO_NO_AUTORIZADO: MENSAJE_SIN_PERMISO,
  AMO_ESCALADA_PERMISOS:
    "No puedes gestionar usuarios ni roles con permisos que tú no tienes.",
  AMO_ROL_PROPIO: "No puedes cambiar tu propio rol.",
  AMO_ROL_SISTEMA: "Los roles de sistema no se pueden modificar.",
  AMO_SOLO_SUPERADMIN:
    "Solo un superadministrador puede asignar o quitar ese rol.",
  AMO_ULTIMO_SUPERADMIN: "Debe quedar al menos un superadministrador activo.",
  AMO_PERMISO_NO_APLICABLE:
    "Ese permiso no aplica a este tipo de rol: los roles de anunciante y de medio solo admiten los permisos de su portal.",
  AMO_TRANSICION_INVALIDA:
    "Este cambio ya no es posible en el estado actual. Actualiza la página para ver la información vigente.",
  AMO_ESTADO_SOLO_VIA_TRANSICION:
    "El estado solo cambia con las acciones que ofrece la plataforma.",
  AMO_MOTIVO_REQUERIDO: "Indica el motivo del cambio.",
  AMO_CONFIG_INVALIDA:
    "Algún dato no cumple las reglas configuradas en la plataforma. Revísalo e intenta de nuevo.",
  AMO_BITACORA_INMUTABLE:
    "Los registros de auditoría no se pueden modificar ni borrar.",
  AMO_OFERTA_NO_DISPONIBLE: "La oferta ya no está disponible.",
  AMO_NO_ELEGIBLE: "El medio no cumple los requisitos de esta oferta.",
  AMO_SIN_CUPO: "Ya no quedan cupos disponibles en esta oferta.",
  AMO_YA_ACEPTADA: "El medio ya aceptó esta oferta.",
  AMO_SIN_TARIFA:
    "No hay una tarifa vigente para este formato y franja. El equipo de AMO debe configurarla.",
  AMO_PRESUPUESTO_OFERTA:
    "La oferta ya no tiene presupuesto disponible para este cupo.",
  AMO_PRESUPUESTO_CAMPANA:
    "La campaña no tiene presupuesto disponible para este cambio.",
  AMO_TOPE_MEDIO:
    "Se superaría la participación máxima de un medio en esta campaña.",
  AMO_TOPE_NIVEL:
    "Se superaría el tope anual del nivel de verificación del medio.",
  AMO_EXCLUSIVIDAD:
    "Hay un compromiso de exclusividad con otra marca del mismo sector en esas fechas.",
  AMO_CREATIVO_DESACTUALIZADO:
    "Descarga la versión vigente del contenido antes de publicar.",
  AMO_ETIQUETA_REQUERIDA:
    "Confirma que la publicación lleva la etiqueta de publicidad.",
  AMO_URL_OTRA_CUENTA:
    "El enlace es de otra cuenta. Pega el enlace de la publicación en la cuenta de esta campaña.",
  AMO_FUERA_DE_VENTANA:
    "La fecha está fuera del plazo permitido para esta acción.",
  AMO_PERMANENCIA_PENDIENTE:
    "Aún no se cumple la permanencia mínima de la publicación.",
  AMO_METRICA_NIVEL_INVALIDO:
    "Esa métrica no está disponible para este nivel del mapa.",
  AMO_SEG_SOCIAL_PENDIENTE:
    "Seguridad social pendiente: el medio necesita la seguridad social aprobada para recibir este pago.",
  AMO_DOCUMENTO_SOPORTE_REQUERIDO:
    "Documento soporte requerido: falta el documento soporte o la factura del medio para registrar el pago.",
  AMO_RESOLUCION_AGOTADA:
    "Resolución agotada: no hay una resolución de numeración DIAN vigente con consecutivos disponibles.",
  AMO_LIMITE_SOLICITUDES:
    "Recibimos varias solicitudes seguidas. Intenta de nuevo más tarde.",
  AMO_IDEMPOTENCIA_INVALIDA:
    "Esta solicitud ya se usó. Actualiza la página y vuelve a intentarlo.",
  AMO_METRICA_INCOHERENTE:
    "Las cifras no cuadran con la publicación o con los otros cortes. Revísalas.",
  AMO_CAPTURA_REQUERIDA:
    "Carga la captura del panel de estadísticas (una imagen) antes de enviar.",
}

/**
 * Rótulos que exigen los criterios de aceptación (LIQ-004, LIQ-006, LIQ-007): el mensaje empieza con ellos
 * aunque la BD traiga su propio detalle («Seguridad social pendiente: el medio supera…»).
 */
export const ROTULOS_NEGOCIO: Readonly<Record<string, string>> = {
  AMO_SEG_SOCIAL_PENDIENTE: "Seguridad social pendiente",
  AMO_DOCUMENTO_SOPORTE_REQUERIDO: "Documento soporte requerido",
  AMO_RESOLUCION_AGOTADA: "Resolución agotada",
}

function conRotulo(codigo: string, mensaje: string): string {
  const rotulo = ROTULOS_NEGOCIO[codigo]
  if (!rotulo || mensaje.startsWith(rotulo)) return mensaje
  // «El medio supera…» → «…: el medio supera…» (respeta siglas y nombres: «DIAN», «Medio X»).
  const cuerpo = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(mensaje)
    ? mensaje.charAt(0).toLowerCase() + mensaje.slice(1)
    : mensaje
  return `${rotulo}: ${cuerpo}`
}

/**
 * Códigos que delatan un defecto del código (un UPDATE directo del estado, una
 * escritura en una tabla de solo inserción), no algo que la persona pueda
 * corregir: se registran como fallo y se responde con el texto del catálogo,
 * no con el `detail`, que nombra tablas internas.
 */
const CODIGOS_DE_SISTEMA: ReadonlySet<string> = new Set([
  "AMO_ESTADO_SOLO_VIA_TRANSICION",
  "AMO_BITACORA_INMUTABLE",
])

/** Restricciones que aparecen en más de un módulo; cada feature suma las suyas. */
const RESTRICCIONES_COMUNES: Restricciones = {
  perfiles_rol_organizacion_chk:
    "Un usuario activo necesita la organización que exige su rol.",
  perfiles_email_key: "Ya existe una cuenta con ese correo.",
  perfiles_celular_chk: "El celular no tiene un formato válido.",
  anunciantes_nit_key: "Ya hay un anunciante registrado con ese NIT.",
  publicaciones_url_post_key:
    "Ese enlace ya se registró como evidencia de otra publicación.",
  medios_privado_numero_documento_hash_key:
    "Ya hay un medio registrado con ese número de documento.",
  cuentas_sociales_plataforma_handle_key:
    "Esa cuenta ya está registrada en la plataforma.",
  cuentas_sociales_url_chk:
    "El enlace no corresponde a un perfil de esa red social.",
  publicaciones_url_chk:
    "El enlace no corresponde a una publicación de esa red social.",
  metricas_corte_key: "Ese corte de métricas ya está registrado.",
  disputas_abierta_key: "Ya hay una disputa abierta para esta asignación.",
  documentos_soporte_cuds_key:
    "Ese CUDS ya está registrado en otro documento soporte.",
  facturas_cufe_key: "Ese CUFE ya está registrado en otra factura.",
  notas_credito_numero_key: "Esa nota crédito ya está registrada.",
  notas_credito_cude_key: "Ese CUDE ya está registrado en otra nota crédito.",
  retenciones_config_vigencia_excl:
    "Ya hay una retención vigente de ese tipo para esa condición de declarante en esas fechas: cierra la vigente antes de crear otra.",
}

/**
 * Respaldo por SQLSTATE cuando la restricción no está en ningún catálogo. No
 * se considera «esperado»: suele delatar una validación que falta en el
 * formulario y conviene registrarlo.
 */
const MENSAJES_SQLSTATE: Readonly<Record<string, string>> = {
  "23505": "Ya existe un registro con esos datos.",
  "23503":
    "Uno de los datos relacionados ya no existe o el registro está en uso. Actualiza la página e intenta de nuevo.",
  "23514":
    "Algún dato no cumple las reglas de validación. Revisa el formulario.",
  "23502": "Falta un dato obligatorio. Revisa el formulario.",
  "23P01": "Se cruza con otro registro existente, por ejemplo en las fechas.",
  "22001": "Algún texto supera la longitud permitida.",
  "40001":
    "Otra persona está cambiando este registro. Intenta de nuevo en unos segundos.",
  "40P01":
    "Otra persona está cambiando este registro. Intenta de nuevo en unos segundos.",
  "55P03":
    "Otra persona está cambiando este registro. Intenta de nuevo en unos segundos.",
  "57014": "La operación tardó demasiado. Intenta de nuevo en unos minutos.",
  PGRST116:
    "No encontramos el registro o ya no tienes acceso a él. Actualiza la página.",
}

const CODIGO_NEGOCIO = /^(AMO_[A-Z0-9_]+)\b/
const IDENTIFICADOR = /[a-z0-9_]+/g
const VIOLACION_RLS = /row-level security/i

/** Código de negocio (`AMO_*`) de un error de la BD, si lo es. */
export function codigoNegocio(error: ErrorBd): string | null {
  return CODIGO_NEGOCIO.exec(error.message?.trim() ?? "")?.[1] ?? null
}

function comoMensajeCampo(valor: string | MensajeCampo): MensajeCampo {
  return typeof valor === "string" ? { mensaje: valor } : valor
}

function identificadores(texto: string | null | undefined): Set<string> {
  return new Set(texto?.toLowerCase().match(IDENTIFICADOR))
}

/**
 * Busca por nombre exacto (no por subcadena: `x_chk` no debe coincidir con
 * `x_chk2`), primero en el mensaje, que nombra la restricción violada, y solo
 * después en el detalle: este puede traer valores escritos por la persona
 * («Failing row contains (…)»). Las restricciones propias del módulo
 * prevalecen sobre las comunes.
 */
function restriccionConocida(
  error: ErrorBd,
  extra: Restricciones
): MensajeCampo | null {
  for (const nombres of [
    identificadores(error.message),
    identificadores(error.details),
  ]) {
    for (const catalogo of [extra, RESTRICCIONES_COMUNES]) {
      const nombre = Object.keys(catalogo).find((clave) => nombres.has(clave))
      if (nombre) return comoMensajeCampo(catalogo[nombre])
    }
  }
  return null
}

function mensajeSinCatalogo(error: ErrorBd): string {
  if (error.code === "42501" && VIOLACION_RLS.test(error.message ?? "")) {
    return MENSAJE_SIN_PERMISO
  }
  return MENSAJES_SQLSTATE[error.code ?? ""] ?? MENSAJE_INESPERADO
}

/** Mensaje para la persona, campo del formulario (si aplica) y si es un error esperado. */
export function interpretarErrorBd(
  error: ErrorBd,
  restriccionesExtra: Restricciones = {}
): ErrorBdInterpretado {
  const codigo = codigoNegocio(error)
  if (codigo && CODIGOS_DE_SISTEMA.has(codigo)) {
    return { codigo, esperado: false, mensaje: MENSAJES_NEGOCIO[codigo] }
  }
  if (codigo) {
    return {
      codigo,
      esperado: true,
      mensaje: conRotulo(
        codigo,
        error.details?.trim() || MENSAJES_NEGOCIO[codigo] || MENSAJE_INESPERADO
      ),
    }
  }
  const restriccion = restriccionConocida(error, restriccionesExtra)
  if (restriccion) return { codigo: null, esperado: true, ...restriccion }
  return { codigo: null, esperado: false, mensaje: mensajeSinCatalogo(error) }
}

export function mensajeErrorBd(
  error: ErrorBd,
  restriccionesExtra?: Restricciones
): string {
  return interpretarErrorBd(error, restriccionesExtra).mensaje
}
