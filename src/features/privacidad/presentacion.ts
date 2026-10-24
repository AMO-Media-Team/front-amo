/**
 * Presentación de los derechos del titular (CTA-007), módulo puro: qué es
 * cada tipo de solicitud y su plazo legal, el estado en voz del titular y del
 * equipo, el semáforo del vencimiento, qué acciones admite cada estado, qué
 * datos trata AMO según el rol y la IP enmascarada de una autorización.
 *
 * Plazos (Ley 1581 de 2012): consulta, 10 días hábiles prorrogables 5
 * (art. 14); reclamo de actualización, rectificación, supresión o revocatoria,
 * 15 días hábiles prorrogables 8 (art. 15). La BD los cuenta con los festivos
 * de Colombia; aquí solo se presentan.
 */
import type { Route } from "next"

import type { PresentacionEstado, Tono } from "@/features/operacion/estados"
import type { ClavePermiso } from "@/lib/auth/permisos"
import { formatearFecha, formatearNumero, type EstiloFecha } from "@/lib/format"

import type {
  AccionContacto,
  AccionMedio,
  BorradoArchivos,
  DatoAfectado,
  DecisionSolicitud,
  EstadoSolicitud,
  RolTitular,
  SolicitudBase,
  TipoSolicitud,
} from "./tipos"
import { DATOS_AFECTADOS } from "./tipos"

// ── Tipos de solicitud ───────────────────────────────────────────────────────

export type ClaseSolicitud = "consulta" | "reclamo"

export interface PresentacionTipo {
  /** Rótulo en la bandeja y en la ficha («Supresión de datos»). */
  etiqueta: string
  /** Lo que pide el titular, en primera persona («Suprimir mis datos»). */
  opcion: string
  /** El derecho en una frase, dicho al titular. */
  derecho: string
  clase: ClaseSolicitud
}

export const TIPOS: Readonly<Record<TipoSolicitud, PresentacionTipo>> = {
  CONSULTA: {
    etiqueta: "Consulta de datos",
    opcion: "Consultar mis datos",
    derecho:
      "Te informamos qué datos tuyos tratamos, para qué los usamos y con quién los compartimos.",
    clase: "consulta",
  },
  PRUEBA_AUTORIZACION: {
    etiqueta: "Prueba de la autorización",
    opcion: "Pedir la prueba de mi autorización",
    derecho:
      "Te enviamos la constancia de la autorización que nos diste para tratar tus datos.",
    clase: "consulta",
  },
  ACTUALIZACION: {
    etiqueta: "Actualización de datos",
    opcion: "Actualizar mis datos",
    derecho:
      "Ponemos al día datos que cambiaron y que no puedes editar tú mismo, como el correo.",
    clase: "reclamo",
  },
  RECTIFICACION: {
    etiqueta: "Rectificación de datos",
    opcion: "Corregir mis datos",
    derecho: "Corregimos datos tuyos que estén incompletos o sean inexactos.",
    clase: "reclamo",
  },
  SUPRESION: {
    etiqueta: "Supresión de datos",
    opcion: "Suprimir mis datos",
    derecho:
      "Borramos tu cuenta y tus datos. Conservamos solo lo que la ley nos obliga a guardar, como los soportes contables.",
    clase: "reclamo",
  },
  REVOCATORIA: {
    etiqueta: "Revocatoria de la autorización",
    opcion: "Revocar mi autorización",
    derecho:
      "Retiras tu autorización: dejamos de tratar tus datos y, si procede, los suprimimos.",
    clase: "reclamo",
  },
}

/** Orden del formulario: primero las consultas, luego los reclamos. */
export const ORDEN_TIPOS: readonly TipoSolicitud[] = [
  "CONSULTA",
  "PRUEBA_AUTORIZACION",
  "ACTUALIZACION",
  "RECTIFICACION",
  "SUPRESION",
  "REVOCATORIA",
]

/** Días hábiles del plazo legal y de su prórroga, y el artículo que los fija. */
export const PLAZOS_LEGALES: Readonly<
  Record<ClaseSolicitud, { dias: number; prorroga: number; norma: string }>
> = {
  consulta: { dias: 10, prorroga: 5, norma: "Ley 1581 de 2012, art. 14" },
  reclamo: { dias: 15, prorroga: 8, norma: "Ley 1581 de 2012, art. 15" },
}

export function claseDe(tipo: TipoSolicitud): ClaseSolicitud {
  return TIPOS[tipo].clase
}

/** Los reclamos (art. 15) muestran la leyenda «Reclamo en trámite». */
export function esReclamo(tipo: TipoSolicitud): boolean {
  return claseDe(tipo) === "reclamo"
}

/** Solo una supresión o una revocatoria terminan en la supresión de datos. */
export function admiteSupresion(tipo: TipoSolicitud): boolean {
  return tipo === "SUPRESION" || tipo === "REVOCATORIA"
}

/** «Respondemos en máximo 10 días hábiles (Ley 1581 de 2012, art. 14).» */
export function textoPlazoLegal(tipo: TipoSolicitud): string {
  const { dias, norma } = PLAZOS_LEGALES[claseDe(tipo)]
  return `Respondemos en máximo ${dias} días hábiles (${norma}).`
}

export const TIPOS_RECLAMO: readonly TipoSolicitud[] = ORDEN_TIPOS.filter(
  (tipo) => esReclamo(tipo)
)

// ── Estados ──────────────────────────────────────────────────────────────────

/** El estado como lo lee el titular. */
export const ESTADOS_TITULAR: Readonly<
  Record<EstadoSolicitud, PresentacionEstado>
> = {
  RADICADA: {
    etiqueta: "Recibida",
    tono: "info",
    descripcion: "La recibimos y está en la fila del equipo.",
  },
  EN_TRAMITE: {
    etiqueta: "En trámite",
    tono: "info",
    descripcion: "El equipo de AMO la está atendiendo.",
  },
  REQUIERE_INFORMACION: {
    etiqueta: "Te pedimos información",
    tono: "aviso",
    descripcion: "Necesitamos más datos para atenderla: respóndenos.",
  },
  RESPONDIDA: {
    etiqueta: "Respondida",
    tono: "exito",
    descripcion: "Ya tiene respuesta: léela abajo.",
  },
  DESISTIDA: {
    etiqueta: "Cerrada",
    tono: "neutro",
    descripcion: "Se cerró sin respuesta de fondo.",
  },
}

/** El estado como lo lee el equipo AMO. */
export const ESTADOS_INTERNO: Readonly<
  Record<EstadoSolicitud, PresentacionEstado>
> = {
  RADICADA: {
    etiqueta: "Radicada",
    tono: "info",
    descripcion: "Nadie del equipo la ha tomado todavía.",
  },
  EN_TRAMITE: {
    etiqueta: "En trámite",
    tono: "info",
    descripcion: "El equipo la está atendiendo.",
  },
  REQUIERE_INFORMACION: {
    etiqueta: "Esperando al titular",
    tono: "aviso",
    descripcion:
      "Se le pidió información; el plazo vuelve a contar cuando responda.",
  },
  RESPONDIDA: {
    etiqueta: "Respondida",
    tono: "exito",
    descripcion: "Tiene respuesta de fondo.",
  },
  DESISTIDA: {
    etiqueta: "Desistida",
    tono: "neutro",
    descripcion:
      "El titular desistió o no respondió el requerimiento a tiempo.",
  },
}

export const ESTADOS_ABIERTOS: readonly EstadoSolicitud[] = [
  "RADICADA",
  "EN_TRAMITE",
  "REQUIERE_INFORMACION",
]

/** Estados en que corre el plazo legal (en «Requiere información» se espera al titular). */
export const ESTADOS_CON_PLAZO: readonly EstadoSolicitud[] = [
  "RADICADA",
  "EN_TRAMITE",
]

export function estaAbierta(estado: EstadoSolicitud): boolean {
  return ESTADOS_ABIERTOS.includes(estado)
}

// ── Decisiones ───────────────────────────────────────────────────────────────

export const DECISIONES: Readonly<
  Record<
    DecisionSolicitud,
    { etiqueta: string; tono: Tono; ayuda: string; titular: string }
  >
> = {
  PROCEDE: {
    etiqueta: "Procede",
    tono: "exito",
    ayuda: "Se atiende todo lo que pidió el titular.",
    titular: "Atendimos tu solicitud.",
  },
  PROCEDE_PARCIAL: {
    etiqueta: "Procede en parte",
    tono: "aviso",
    ayuda:
      "Se atiende una parte; explica qué no y por qué (p. ej. un deber legal de conservar).",
    titular: "Atendimos una parte de tu solicitud.",
  },
  NO_PROCEDE: {
    etiqueta: "No procede",
    tono: "peligro",
    ayuda: "No se atiende; explica el motivo legal o contractual.",
    titular: "No pudimos atender tu solicitud.",
  },
}

export const ORDEN_DECISIONES: readonly DecisionSolicitud[] = [
  "PROCEDE",
  "PROCEDE_PARCIAL",
  "NO_PROCEDE",
]

// ── Datos afectados ──────────────────────────────────────────────────────────

export const DATOS: Readonly<
  Record<
    DatoAfectado,
    { etiqueta: string; ayuda: string; roles?: readonly RolTitular[] }
  >
> = {
  IDENTIFICACION: {
    etiqueta: "Identificación",
    ayuda: "Nombre y documento",
  },
  CONTACTO: { etiqueta: "Contacto", ayuda: "Correo, celular y dirección" },
  PAGO: {
    etiqueta: "Pago",
    ayuda: "Cuenta de pago y datos tributarios",
    roles: ["MEDIO"],
  },
  DOCUMENTOS: {
    etiqueta: "Documentos",
    ayuda: "Cédula, RUT, prueba de vida y certificaciones",
    roles: ["MEDIO"],
  },
  CUENTAS_SOCIALES: {
    etiqueta: "Cuentas sociales",
    ayuda: "Usuarios, seguidores y capturas",
    roles: ["MEDIO"],
  },
  ACCESOS: { etiqueta: "Accesos", ayuda: "Ingresos y sesiones" },
  ACTIVIDAD: { etiqueta: "Actividad", ayuda: "Lo que haces en AMO" },
  AUTORIZACIONES: {
    etiqueta: "Autorizaciones",
    ayuda: "Términos y política de datos aceptados",
  },
  OTROS: { etiqueta: "Otros", ayuda: "Explícalo en la descripción" },
}

/** Los datos que puede señalar un titular según su tipo de rol. */
export function datosParaRol(rol: RolTitular): DatoAfectado[] {
  return DATOS_AFECTADOS.filter((dato) => {
    const roles = DATOS[dato].roles
    return !roles || roles.includes(rol)
  })
}

export function listaDatos(datos: readonly DatoAfectado[]): string {
  return datos.map((dato) => DATOS[dato].etiqueta).join(", ")
}

// ── Fechas y semáforo ────────────────────────────────────────────────────────

/** Un día 'YYYY-MM-DD' como el mediodía de Bogotá (no se corre al día anterior). */
export function formatearDia(
  dia: string,
  estilo: EstiloFecha = "medio"
): string {
  return formatearFecha(`${dia}T12:00:00-05:00`, estilo)
}

export const SEMAFOROS = ["vencida", "hoy", "por_vencer", "en_plazo"] as const

export type Semaforo = (typeof SEMAFOROS)[number]

/** Situación del plazo: el semáforo o, sin plazo corriendo, por qué. */
export type SituacionPlazo = Semaforo | "esperando" | "cerrada"

export const PRESENTACION_SEMAFORO: Readonly<
  Record<Semaforo, { etiqueta: string; tono: Tono; descripcion: string }>
> = {
  vencida: {
    etiqueta: "Vencida",
    tono: "peligro",
    descripcion: "El plazo legal ya venció: respóndela cuanto antes.",
  },
  hoy: {
    etiqueta: "Vence hoy",
    tono: "peligro",
    descripcion: "Hoy es el último día del plazo legal.",
  },
  por_vencer: {
    etiqueta: "Por vencer",
    tono: "aviso",
    descripcion: "Quedan pocos días hábiles del plazo legal.",
  },
  en_plazo: {
    etiqueta: "En plazo",
    tono: "exito",
    descripcion: "El plazo legal corre con holgura.",
  },
}

/**
 * Semáforo del vencimiento (`hoy` es el día de Bogotá, 'YYYY-MM-DD'): vencida
 * si hoy > `plazoVence`, vence hoy si es el último día, por vencer desde
 * `alertaDesde` (la BD lo fija unos días hábiles antes) y en plazo antes.
 * Solo corre en Radicada y En trámite.
 */
export function situacionPlazo(
  solicitud: Pick<SolicitudBase, "estado" | "plazoVence" | "alertaDesde">,
  hoy: string
): SituacionPlazo {
  if (solicitud.estado === "REQUIERE_INFORMACION") return "esperando"
  if (!ESTADOS_CON_PLAZO.includes(solicitud.estado)) return "cerrada"
  if (hoy > solicitud.plazoVence) return "vencida"
  if (hoy === solicitud.plazoVence) return "hoy"
  if (hoy >= solicitud.alertaDesde) return "por_vencer"
  return "en_plazo"
}

export function esSemaforo(situacion: SituacionPlazo): situacion is Semaforo {
  return (SEMAFOROS as readonly string[]).includes(situacion)
}

/** «Vence el 9 nov 2026», «Vence hoy» o «Venció el 3 nov 2026». */
export function textoVencimiento(plazoVence: string, hoy: string): string {
  if (hoy === plazoVence) return "Vence hoy"
  return hoy > plazoVence
    ? `Venció el ${formatearDia(plazoVence)}`
    : `Vence el ${formatearDia(plazoVence)}`
}

/** «N.º 41». */
export function textoRadicado(numero: number): string {
  return `N.º ${numero.toLocaleString("es-CO", { useGrouping: false })}`
}

// ── Acciones según el estado ─────────────────────────────────────────────────

export interface AccionesEquipo {
  tramitar: boolean
  requerir: boolean
  prorrogar: boolean
  responder: boolean
  /** «Ver datos del titular»: solo con la solicitud abierta y el titular con cuenta. */
  verDatos: boolean
  simularSupresion: boolean
  ejecutarSupresion: boolean
}

export interface ContextoAccionesEquipo {
  /** Día de Bogotá ('YYYY-MM-DD'). */
  hoy: string
  /** Nadie suprime sus propios datos (la BD lo exige igual). */
  actorEsTitular: boolean
  /** La cuenta del titular sigue existiendo. */
  conCuenta: boolean
}

/**
 * Lo que el equipo puede hacer con la solicitud (`privacidad.gestionar`); la
 * BD vuelve a comprobarlo todo. Pedir información, prorrogar y responder van
 * desde Radicada o En trámite; la prórroga, una sola vez y antes del
 * vencimiento. Pedir información solo en un reclamo (art. 15; una consulta se
 * responde con lo que hay) y antes de prorrogarlo; la ventana de 5 días
 * hábiles desde el recibo la cuenta la BD con los festivos y, fuera de ella,
 * rechaza con su mensaje. Los datos del titular se consultan solo mientras la
 * solicitud está abierta. La supresión se simula mientras no esté cerrada sin
 * ella y se ejecuta respondida con «procede» o «procede en parte».
 */
export function accionesEquipo(
  solicitud: Pick<
    SolicitudBase,
    | "tipo"
    | "estado"
    | "plazoVence"
    | "prorrogadaAt"
    | "decision"
    | "supresionEjecutadaAt"
  >,
  { hoy, actorEsTitular, conCuenta }: ContextoAccionesEquipo
): AccionesEquipo {
  const conPlazo = ESTADOS_CON_PLAZO.includes(solicitud.estado)
  const supresionPosible =
    admiteSupresion(solicitud.tipo) &&
    conCuenta &&
    !actorEsTitular &&
    solicitud.supresionEjecutadaAt === null &&
    solicitud.estado !== "DESISTIDA" &&
    !(solicitud.estado === "RESPONDIDA" && solicitud.decision === "NO_PROCEDE")
  return {
    tramitar: solicitud.estado === "RADICADA",
    requerir:
      conPlazo && esReclamo(solicitud.tipo) && solicitud.prorrogadaAt === null,
    prorrogar:
      conPlazo &&
      solicitud.prorrogadaAt === null &&
      hoy <= solicitud.plazoVence,
    responder: conPlazo,
    verDatos: conCuenta && estaAbierta(solicitud.estado),
    simularSupresion: supresionPosible,
    ejecutarSupresion:
      supresionPosible &&
      solicitud.estado === "RESPONDIDA" &&
      solicitud.decision !== null,
  }
}

/** Lo que el titular puede hacer con su solicitud. */
export function accionesTitular(estado: EstadoSolicitud): {
  aportar: boolean
  desistir: boolean
} {
  return {
    aportar: estado === "REQUIERE_INFORMACION",
    desistir: estaAbierta(estado),
  }
}

// ── Supresión ────────────────────────────────────────────────────────────────

export const ACCIONES_MEDIO: Readonly<
  Record<AccionMedio, { etiqueta: string; descripcion: string; tono: Tono }>
> = {
  BORRAR: {
    etiqueta: "Se borra",
    descripcion:
      "El medio no tiene negocios: se borran el medio, sus cuentas sociales, documentos y datos de pago.",
    tono: "peligro",
  },
  ANONIMIZAR: {
    etiqueta: "Se anonimiza",
    descripcion:
      "El medio tiene historial: se borran su contacto, sus datos de pago, la prueba de vida y las certificaciones bancarias, y queda retirado. Se conservan los datos tributarios de los documentos soporte emitidos.",
    tono: "aviso",
  },
  CONSERVAR: {
    etiqueta: "Se conserva",
    descripcion:
      "Otras personas siguen vinculadas al medio: solo se suprime la cuenta de este titular.",
    tono: "info",
  },
  NINGUNA: {
    etiqueta: "Sin medio",
    descripcion: "El titular no está vinculado a un medio.",
    tono: "neutro",
  },
}

export const ACCIONES_CONTACTO: Readonly<Record<AccionContacto, string>> = {
  BORRAR:
    "Es la persona de contacto de su empresa: se borran ese nombre, correo y celular. Los datos de la empresa se conservan.",
  NINGUNO: "No es la persona de contacto de una empresa.",
}

/**
 * Los bloqueos de la simulación: los legales o contractuales del medio
 * (negocios, liquidaciones o disputas abiertas: Decreto 1377, art. 9) y los
 * demás (quién puede suprimir la cuenta: un superadministrador, o el último
 * superadministrador activo). La BD los entrega como texto listo.
 */
export function clasificarBloqueos(bloqueos: readonly string[]): {
  legales: string[]
  otros: string[]
} {
  const legales = bloqueos.filter((bloqueo) => /^El medio tiene /.test(bloqueo))
  return {
    legales,
    otros: bloqueos.filter((bloqueo) => !legales.includes(bloqueo)),
  }
}

/** «1 carpeta o archivo», «3 carpetas o archivos». */
export function cantidadArchivos(cantidad: number): string {
  return `${formatearNumero(cantidad)} ${cantidad === 1 ? "carpeta o archivo" : "carpetas o archivos"}`
}

/** Las solicitudes del formulario público «Vincular mi medio» que se borran. */
export function textoSolicitudesVinculacion(cantidad: number): string {
  if (cantidad === 0) {
    return "No hay solicitudes del formulario «Vincular mi medio» con su correo ni de su medio."
  }
  return cantidad === 1
    ? "Se borra 1 solicitud del formulario «Vincular mi medio» (con su correo o de su medio)."
    : `Se borran ${formatearNumero(cantidad)} solicitudes del formulario «Vincular mi medio» (con su correo o de su medio).`
}

/** Lo que se borra de Storage, según la simulación. */
export function textoArchivosSimulacion(cantidad: number): string {
  if (cantidad === 0) return "No hay archivos que borrar."
  return `${cantidadArchivos(cantidad)} ${cantidad === 1 ? "se borra" : "se borran"} de Storage (foto de perfil y documentos).`
}

/** Lo que pasó en Storage al ejecutar la supresión o al reintentar el borrado. */
export function textoBorrado({
  archivosBorrados,
  archivosPendientes,
  archivosRechazados,
}: BorradoArchivos): string {
  const borrados =
    archivosBorrados === 0
      ? archivosPendientes > 0
        ? "No se borró ningún archivo de Storage."
        : "No quedaban archivos en Storage."
      : `${formatearNumero(archivosBorrados)} ${archivosBorrados === 1 ? "archivo borrado" : "archivos borrados"} de Storage.`
  const partes = [borrados]
  if (archivosPendientes > 0) {
    partes.push(
      `${cantidadArchivos(archivosPendientes)} ${archivosPendientes === 1 ? "sigue" : "siguen"} ahí: reintenta el borrado.`
    )
  }
  if (archivosRechazados > 0) {
    partes.push(
      `${cantidadArchivos(archivosRechazados)} no ${archivosRechazados === 1 ? "corresponde" : "corresponden"} a este titular y no se ${archivosRechazados === 1 ? "tocó" : "tocaron"}: avisa a soporte.`
    )
  }
  return partes.join(" ")
}

/**
 * Los archivos de una supresión ya ejecutada: cuántos pidió borrar la BD y
 * cuántos siguen en Storage (`null`: no quedó registro).
 */
export function textoArchivosEjecutada(
  archivos: number,
  pendientes: number | null
): string {
  if (pendientes === null) return "No quedó registro del borrado en Storage."
  if (pendientes > 0) {
    return `${cantidadArchivos(pendientes)} ${pendientes === 1 ? "sigue" : "siguen"} en Storage: reintenta el borrado.`
  }
  return archivos === 0
    ? "No había archivos que borrar."
    : "Se borraron de Storage."
}

// ── IP de una autorización ───────────────────────────────────────────────────

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/

/**
 * La misma regla de `datos_titular()`: IPv4 con los dos primeros octetos
 * (`190.24.x.x`); IPv6, los primeros 9 caracteres y «…».
 */
export function enmascararIp(ip: string | null | undefined): string | null {
  const limpia = ip?.trim().replace(/\/\d+$/, "")
  if (!limpia) return null
  const v4 = IPV4.exec(limpia)
  if (v4) return `${v4[1]}.${v4[2]}.x.x`
  return `${limpia.slice(0, 9)}…`
}

// ── «Tus datos» ──────────────────────────────────────────────────────────────

export interface CategoriaDatos {
  id: string
  titulo: string
  datos: readonly string[]
  /** Dónde corregirlos uno mismo, si el rol puede (si no, se pide con una solicitud). */
  enlace: { href: Route; texto: string } | null
  nota?: string
}

interface CategoriaBase extends Omit<CategoriaDatos, "enlace"> {
  roles?: readonly RolTitular[]
  enlace: { href: Route; texto: string; permiso: ClavePermiso } | null
}

const r = (valor: `/${string}`): Route => valor as Route

const CATEGORIAS: readonly CategoriaBase[] = [
  {
    id: "identidad",
    titulo: "Identificación y contacto",
    datos: ["Nombre", "Correo", "Celular", "Foto de perfil"],
    enlace: {
      href: r("/cuenta/perfil"),
      texto: "Corregir en Mi perfil",
      permiso: "cuenta.gestionar",
    },
    nota: "El correo no se cambia desde aquí: pídelo con una solicitud de actualización.",
  },
  {
    id: "medio",
    titulo: "Tu medio",
    datos: ["Nombre y tipo", "Ubicación", "Audiencia y categorías"],
    roles: ["MEDIO"],
    enlace: {
      href: r("/mi-medio/perfil"),
      texto: "Corregir en Mi medio",
      permiso: "medios.editar_propio",
    },
  },
  {
    id: "pago",
    titulo: "Pago y datos tributarios",
    datos: [
      "Titular y documento",
      "Contacto y dirección de pagos",
      "Cuenta de pago (cifrada)",
      "Condición tributaria",
    ],
    roles: ["MEDIO"],
    enlace: {
      href: r("/mi-medio/pago"),
      texto: "Corregir en Pago",
      permiso: "medios.editar_propio",
    },
  },
  {
    id: "documentos",
    titulo: "Documentos",
    datos: [
      "Cédula",
      "RUT",
      "Prueba de vida (dato biométrico)",
      "Certificaciones",
    ],
    roles: ["MEDIO"],
    enlace: {
      href: r("/mi-medio/documentos"),
      texto: "Ver mis documentos",
      permiso: "medios.editar_propio",
    },
  },
  {
    id: "cuentas",
    titulo: "Cuentas sociales",
    datos: [
      "Usuario y enlace",
      "Seguidores verificados",
      "Capturas de verificación",
    ],
    roles: ["MEDIO"],
    enlace: {
      href: r("/mi-medio/cuentas"),
      texto: "Ver mis cuentas",
      permiso: "medios.editar_propio",
    },
  },
  {
    id: "empresa",
    titulo: "Contacto de tu empresa",
    datos: ["Nombre, correo y celular, si eres la persona de contacto"],
    roles: ["ANUNCIANTE"],
    enlace: {
      href: r("/empresa"),
      texto: "Corregir en Mi empresa",
      permiso: "anunciantes.editar_propio",
    },
    nota: "Los datos de la empresa (razón social, NIT) no son datos personales tuyos.",
  },
  {
    id: "accesos",
    titulo: "Accesos y seguridad",
    datos: ["Ingresos (fecha, ciudad y navegador)", "Sesiones abiertas"],
    enlace: {
      href: r("/cuenta/seguridad"),
      texto: "Ver en Seguridad",
      permiso: "cuenta.gestionar",
    },
  },
  {
    id: "actividad",
    titulo: "Actividad",
    datos: ["Lo que haces en AMO, en la bitácora de auditoría"],
    enlace: null,
    nota: "La bitácora guarda tu correo enmascarado y no se modifica: es la evidencia de cada operación.",
  },
]

/**
 * Lo que AMO trata del titular según su tipo de rol, con el enlace para
 * corregirlo él mismo cuando su rol tiene ese permiso.
 */
export function categoriasDatos(
  rol: RolTitular,
  permisos: readonly ClavePermiso[]
): CategoriaDatos[] {
  return CATEGORIAS.filter(
    (categoria) => !categoria.roles || categoria.roles.includes(rol)
  ).map(({ roles: _roles, enlace, ...categoria }) => ({
    ...categoria,
    enlace:
      enlace && permisos.includes(enlace.permiso)
        ? { href: enlace.href, texto: enlace.texto }
        : null,
  }))
}
