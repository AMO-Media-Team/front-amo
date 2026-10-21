/**
 * Vocabulario de la bitácora (módulo puro): acciones del CHECK de
 * `bitacora.accion`, orígenes, nombres legibles de las entidades auditadas,
 * qué se considera sensible o de configuración y a qué ruta de la app lleva
 * cada entidad (docs/modelo-datos.md §3.3 y §5.3).
 */
import type { Route } from "next"

import { Constants, type Database } from "@/types/database.types"

export const ACCIONES_BITACORA = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRANSICION",
  "EXPORTAR",
  "REVELAR_DATO",
  "URL_FIRMADA",
  "INVITAR",
  "GENERAR_ENLACE",
  "SUSPENDER",
  "REACTIVAR",
  "CERRAR_SESIONES",
  "CAMBIAR_ROL",
  "BORRADO_DEFINITIVO",
  "CONFIGURAR",
  "OTRO",
] as const

export type AccionBitacora = (typeof ACCIONES_BITACORA)[number]

export const ORIGENES_BITACORA = Constants.public.Enums.bitacora_origen
export type OrigenBitacora = Database["public"]["Enums"]["bitacora_origen"]

export function esAccionBitacora(valor: string): valor is AccionBitacora {
  return (ACCIONES_BITACORA as readonly string[]).includes(valor)
}

/** Tono visual de un evento (icono y distintivos). */
export type TonoEvento =
  "marca" | "exito" | "info" | "aviso" | "peligro" | "neutro"

export const ACCIONES: Readonly<
  Record<AccionBitacora, { etiqueta: string; verbo: string; tono: TonoEvento }>
> = {
  INSERT: { etiqueta: "Creación", verbo: "Creó", tono: "exito" },
  UPDATE: { etiqueta: "Edición", verbo: "Editó", tono: "marca" },
  DELETE: { etiqueta: "Eliminación", verbo: "Eliminó", tono: "peligro" },
  TRANSICION: {
    etiqueta: "Cambio de estado",
    verbo: "Cambió el estado de",
    tono: "info",
  },
  EXPORTAR: { etiqueta: "Exportación", verbo: "Exportó", tono: "aviso" },
  REVELAR_DATO: {
    etiqueta: "Dato revelado",
    verbo: "Reveló datos de",
    tono: "aviso",
  },
  URL_FIRMADA: {
    etiqueta: "Archivo abierto",
    verbo: "Abrió un archivo de",
    tono: "neutro",
  },
  INVITAR: { etiqueta: "Invitación", verbo: "Invitó a", tono: "info" },
  GENERAR_ENLACE: {
    etiqueta: "Enlace generado",
    verbo: "Generó un enlace para",
    tono: "info",
  },
  SUSPENDER: { etiqueta: "Suspensión", verbo: "Suspendió", tono: "aviso" },
  REACTIVAR: { etiqueta: "Reactivación", verbo: "Reactivó", tono: "exito" },
  CERRAR_SESIONES: {
    etiqueta: "Cierre de sesiones",
    verbo: "Cerró las sesiones de",
    tono: "aviso",
  },
  CAMBIAR_ROL: {
    etiqueta: "Cambio de rol",
    verbo: "Cambió el rol de",
    tono: "info",
  },
  BORRADO_DEFINITIVO: {
    etiqueta: "Borrado definitivo",
    verbo: "Borró definitivamente",
    tono: "peligro",
  },
  CONFIGURAR: { etiqueta: "Configuración", verbo: "Configuró", tono: "marca" },
  OTRO: { etiqueta: "Otro", verbo: "Registró un evento en", tono: "neutro" },
}

export const ORIGENES: Readonly<
  Record<OrigenBitacora, { etiqueta: string; descripcion: string }>
> = {
  APP: {
    etiqueta: "Aplicación",
    descripcion: "Acción hecha desde AMO por una persona autenticada.",
  },
  DB: {
    etiqueta: "Base de datos",
    descripcion:
      "Proceso interno de la base de datos (triggers, tareas programadas).",
  },
  API_DIRECTA: {
    etiqueta: "API directa",
    descripcion:
      "Llamada a la API sin pasar por la aplicación: revisa quién la hizo.",
  },
  DEMO: {
    etiqueta: "Demo",
    descripcion: "Registro sintético de los datos de demostración.",
  },
}

// ── Entidades ────────────────────────────────────────────────────────────────

interface Entidad {
  /** Nombre corto para columnas y filtros ("Usuario"). */
  nombre: string
  /** Complemento del verbo en el título ("Editó un usuario"). */
  complemento: string
}

const ENTIDADES: Readonly<Record<string, Entidad>> = {
  perfiles: { nombre: "Usuario", complemento: "un usuario" },
  perfiles_privado: {
    nombre: "Datos privados de usuario",
    complemento: "los datos privados de un usuario",
  },
  roles: { nombre: "Rol", complemento: "un rol" },
  rol_permisos: {
    nombre: "Permisos de rol",
    complemento: "los permisos de un rol",
  },
  permisos: { nombre: "Permiso", complemento: "un permiso" },
  configuracion: { nombre: "Parámetro", complemento: "un parámetro" },
  terminos_versiones: {
    nombre: "Términos y condiciones",
    complemento: "una versión de los términos",
  },
  aceptaciones_terminos: {
    nombre: "Aceptación de términos",
    complemento: "una aceptación de términos",
  },
  sectores: { nombre: "Sector", complemento: "un sector" },
  categorias: { nombre: "Categoría", complemento: "una categoría" },
  departamentos: { nombre: "Departamento", complemento: "un departamento" },
  municipios: { nombre: "Municipio", complemento: "un municipio" },
  anunciantes: { nombre: "Anunciante", complemento: "un anunciante" },
  anunciantes_privado: {
    nombre: "Datos privados de anunciante",
    complemento: "los datos privados de un anunciante",
  },
  documentos_anunciante: {
    nombre: "Documento de anunciante",
    complemento: "un documento de anunciante",
  },
  medios: { nombre: "Medio", complemento: "un medio" },
  medios_privado: {
    nombre: "Datos privados de medio",
    complemento: "los datos privados de un medio",
  },
  documentos_medio: {
    nombre: "Documento de medio",
    complemento: "un documento de medio",
  },
  medio_categorias: {
    nombre: "Categorías de medio",
    complemento: "las categorías de un medio",
  },
  medio_pertinencia_geografica: {
    nombre: "Pertinencia geográfica",
    complemento: "la pertinencia geográfica de un medio",
  },
  medio_audiencia_paises: {
    nombre: "Audiencia por país",
    complemento: "la audiencia de un medio",
  },
  cuentas_sociales: {
    nombre: "Cuenta social",
    complemento: "una cuenta social",
  },
  verificaciones_cuenta: {
    nombre: "Verificación de cuenta",
    complemento: "una verificación de cuenta",
  },
  campanas: { nombre: "Campaña", complemento: "una campaña" },
  ofertas: { nombre: "Oferta", complemento: "una oferta" },
  oferta_cupos: {
    nombre: "Cupos de oferta",
    complemento: "los cupos de una oferta",
  },
  creativos: { nombre: "Creativo", complemento: "un creativo" },
  creativo_archivos: {
    nombre: "Archivo de creativo",
    complemento: "un archivo de creativo",
  },
  asignaciones: { nombre: "Asignación", complemento: "una asignación" },
  asignacion_montos: {
    nombre: "Montos de asignación",
    complemento: "los montos de una asignación",
  },
  publicaciones: { nombre: "Publicación", complemento: "una publicación" },
  metricas: { nombre: "Métricas", complemento: "un corte de métricas" },
  liquidaciones: { nombre: "Liquidación", complemento: "una liquidación" },
  dispersiones: { nombre: "Dispersión", complemento: "una dispersión" },
  facturas: { nombre: "Factura", complemento: "una factura" },
  documentos_soporte: {
    nombre: "Documento soporte",
    complemento: "un documento soporte",
  },
  pagos_anunciante: {
    nombre: "Pago de anunciante",
    complemento: "un pago de anunciante",
  },
  disputas: { nombre: "Disputa", complemento: "una disputa" },
  tarifas: { nombre: "Tarifa", complemento: "una tarifa" },
  franjas: { nombre: "Franja", complemento: "una franja" },
  formatos: { nombre: "Formato", complemento: "un formato" },
  comisiones_excepcion: {
    nombre: "Comisión de excepción",
    complemento: "una comisión de excepción",
  },
  niveles_verificacion: {
    nombre: "Nivel de verificación",
    complemento: "un nivel de verificación",
  },
  parametros_tributarios: {
    nombre: "Parámetro tributario",
    complemento: "un parámetro tributario",
  },
  retenciones_config: { nombre: "Retención", complemento: "una retención" },
  reteica_municipal: {
    nombre: "ReteICA municipal",
    complemento: "una tarifa de ReteICA",
  },
  resoluciones_dian: {
    nombre: "Resolución DIAN",
    complemento: "una resolución DIAN",
  },
  plantillas_notificacion: {
    nombre: "Plantilla de notificación",
    complemento: "una plantilla de notificación",
  },
  // Dominios de los eventos de aplicación (`registrar_evento_srv`).
  usuarios: { nombre: "Usuarios", complemento: "el listado de usuarios" },
  bitacora: { nombre: "Bitácora", complemento: "la bitácora" },
  accesos: { nombre: "Accesos", complemento: "el registro de accesos" },
  reportes: { nombre: "Reportes", complemento: "un reporte" },
  sesion: { nombre: "Sesión", complemento: "la sesión" },
}

/**
 * Palabras frecuentes de los identificadores de la BD (sin tildes ni eñes)
 * con su ortografía: así una columna nueva se lee bien aunque nadie le haya
 * puesto etiqueta («Es pública», «Máximo», «Número de…»).
 */
const ORTOGRAFIA: Readonly<Record<string, string>> = {
  anio: "año",
  automatica: "automática",
  automatico: "automático",
  calculo: "cálculo",
  categoria: "categoría",
  categorias: "categorías",
  codigo: "código",
  codigos: "códigos",
  credito: "crédito",
  debito: "débito",
  dias: "días",
  electronica: "electrónica",
  electronico: "electrónico",
  limite: "límite",
  limites: "límites",
  maxima: "máxima",
  maximo: "máximo",
  maximos: "máximos",
  metrica: "métrica",
  metricas: "métricas",
  minima: "mínima",
  minimo: "mínimo",
  minimos: "mínimos",
  modulo: "módulo",
  modulos: "módulos",
  numero: "número",
  numeros: "números",
  pais: "país",
  paises: "países",
  publica: "pública",
  publico: "público",
  razon: "razón",
  regimen: "régimen",
  telefono: "teléfono",
  titulo: "título",
  titulos: "títulos",
  ultima: "última",
  ultimas: "últimas",
  ultimo: "último",
  ultimos: "últimos",
  unica: "única",
  unico: "único",
}

/**
 * "reteica_municipal" → "Reteica municipal". Recupera la ortografía que los
 * identificadores pierden: "-cion"/"-sion" y las palabras de `ORTOGRAFIA`.
 */
export function humanizar(identificador: string): string {
  const texto = identificador
    .toLocaleLowerCase("es-CO")
    .replace(/_/g, " ")
    .replace(/\b(\p{L}+)(c|s)ion\b/gu, "$1$2ión")
    .replace(/\p{L}+/gu, (palabra) => ORTOGRAFIA[palabra] ?? palabra)
    .replace(/\s+/g, " ")
    .trim()
  return texto.charAt(0).toLocaleUpperCase("es-CO") + texto.slice(1)
}

/**
 * Títulos que no salen bien de "verbo + complemento" ("Creó los permisos de
 * un rol" es en realidad otorgar un permiso). Clave: `entidad:accion`.
 */
const TITULOS_PROPIOS: Readonly<Record<string, string>> = {
  "rol_permisos:INSERT": "Otorgó un permiso a un rol",
  "rol_permisos:DELETE": "Retiró un permiso de un rol",
  "aceptaciones_terminos:INSERT": "Aceptó los términos y condiciones",
  "perfiles:CAMBIAR_ROL": "Cambió el rol de un usuario",
}

export function tituloPropio(entidad: string, accion: string): string | null {
  return TITULOS_PROPIOS[`${entidad}:${accion}`] ?? null
}

export function nombreEntidad(entidad: string): string {
  return ENTIDADES[entidad]?.nombre ?? humanizar(entidad)
}

export function complementoEntidad(entidad: string): string {
  return ENTIDADES[entidad]?.complemento ?? humanizar(entidad).toLowerCase()
}

/** Tablas cuyo cambio es configuración de la plataforma (incluye roles y permisos). */
export const ENTIDADES_CONFIGURACION = [
  "configuracion",
  "tarifas",
  "franjas",
  "formatos",
  "comisiones_excepcion",
  "niveles_verificacion",
  "parametros_tributarios",
  "retenciones_config",
  "reteica_municipal",
  "resoluciones_dian",
  "plantillas_notificacion",
  "terminos_versiones",
  "sectores",
  "categorias",
  "departamentos",
  "municipios",
  "roles",
  "rol_permisos",
] as const

/**
 * Acciones que exponen datos o cambian el acceso de alguien. Junto con el
 * origen `API_DIRECTA` (alguien escribió sin pasar por la app) forman los
 * «eventos sensibles» que el equipo de seguridad revisa primero.
 */
export const ACCIONES_SENSIBLES = [
  "EXPORTAR",
  "REVELAR_DATO",
  "URL_FIRMADA",
  "GENERAR_ENLACE",
  "CERRAR_SESIONES",
  "SUSPENDER",
  "CAMBIAR_ROL",
  "BORRADO_DEFINITIVO",
] as const satisfies readonly AccionBitacora[]

export function esEventoSensible(evento: {
  accion: string
  origen: string
}): boolean {
  return (
    (ACCIONES_SENSIBLES as readonly string[]).includes(evento.accion) ||
    evento.origen === "API_DIRECTA"
  )
}

export function esCambioDeConfiguracion(evento: {
  accion: string
  entidad: string
}): boolean {
  return (
    evento.accion === "CONFIGURAR" ||
    (ENTIDADES_CONFIGURACION as readonly string[]).includes(evento.entidad)
  )
}

export const GRUPOS_BITACORA = ["SENSIBLES", "CONFIGURACION"] as const
export type GrupoBitacora = (typeof GRUPOS_BITACORA)[number]

export const ETIQUETAS_GRUPO: Readonly<Record<GrupoBitacora, string>> = {
  SENSIBLES: "Sensibles",
  CONFIGURACION: "Configuración",
}

// ── Enlaces a la entidad ────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Entidades con ficha propia: la ruta lleva el id. */
const FICHAS: Readonly<Record<string, string>> = {
  perfiles: "/administracion/usuarios",
  roles: "/administracion/roles",
  // `entidad_id` de rol_permisos es el id del rol (docs/modelo-datos.md §5.3).
  rol_permisos: "/administracion/roles",
  medios: "/operacion/medios",
  anunciantes: "/operacion/anunciantes",
  campanas: "/operacion/campanas",
  asignaciones: "/operacion/asignaciones",
}

/** Entidades sin ficha: se enlaza al listado o a la sección que las administra. */
const SECCIONES: Readonly<Record<string, string>> = {
  usuarios: "/administracion/usuarios",
  roles: "/administracion/roles",
  rol_permisos: "/administracion/roles",
  accesos: "/administracion/accesos",
  bitacora: "/administracion/auditoria",
  reportes: "/reportes",
  ...Object.fromEntries(
    ENTIDADES_CONFIGURACION.filter((e) => !e.startsWith("rol")).map((e) => [
      e,
      "/administracion/configuracion",
    ])
  ),
}

/**
 * Ruta de la app que muestra la entidad afectada, si existe. Las fichas solo
 * se enlazan con un id válido; un id borrado lleva a un 404 amable de la ficha.
 */
export function rutaEntidad(
  entidad: string,
  entidadId: string | null
): Route | null {
  const ficha = FICHAS[entidad]
  if (ficha && entidadId && UUID.test(entidadId)) {
    return `${ficha}/${entidadId.toLowerCase()}` as Route
  }
  const seccion = SECCIONES[entidad]
  return seccion ? (seccion as Route) : null
}

const TEXTOS_ENLACE: Readonly<Record<string, string>> = {
  // Roles es configuración, pero su enlace lleva a la ficha del rol.
  roles: "Ver el rol",
  rol_permisos: "Ver el rol",
  usuarios: "Ver usuarios",
  bitacora: "Ver la bitácora",
  accesos: "Ver accesos",
  reportes: "Ver reportes",
}

/** Texto del botón que lleva a la entidad ("Ver usuario", "Ver el rol"). */
export function textoEnlaceEntidad(entidad: string): string {
  const propio = TEXTOS_ENLACE[entidad]
  if (propio) return propio
  if ((ENTIDADES_CONFIGURACION as readonly string[]).includes(entidad)) {
    return "Ver configuración"
  }
  return `Ver ${nombreEntidad(entidad).toLocaleLowerCase("es-CO")}`
}
