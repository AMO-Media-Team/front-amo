/**
 * Secciones de la página de configuración y su estado en la URL
 * (`?seccion=precios`). Módulo puro: lo usan la página (servidor) y la
 * navegación (cliente) con el MISMO parser.
 */
import {
  createLoader,
  createSerializer,
  parseAsStringLiteral,
} from "nuqs/server"

export const SECCIONES = [
  "comercial",
  "precios",
  "medios",
  "metricas",
  "calidad",
  "seguridad",
  "tributario",
  "catalogos",
  "legal",
  "plantillas",
] as const

export type Seccion = (typeof SECCIONES)[number]

export const SECCION_POR_DEFECTO: Seccion = "comercial"

export interface InfoSeccion {
  titulo: string
  /** Una línea para la navegación lateral. */
  resumen: string
  /** Párrafo del encabezado de la sección. */
  descripcion: string
}

export const INFO_SECCIONES: Readonly<Record<Seccion, InfoSeccion>> = {
  comercial: {
    titulo: "Comercial",
    resumen: "Comisión, topes y excepciones",
    descripcion:
      "Cuánto cobra AMO por cada negocio, cuánto puede recibir un mismo medio y las reglas de ofertas y disputas.",
  },
  precios: {
    titulo: "Precios",
    resumen: "Tarifas, franjas y formatos",
    descripcion:
      "Tarifario por franja de seguidores, plataforma y formato. Las tarifas son versionadas: nunca se sobrescriben, se programa una nueva vigencia.",
  },
  medios: {
    titulo: "Medios",
    resumen: "Elegibilidad y verificación",
    descripcion:
      "Quién puede participar en el marketplace, cada cuánto se reverifica una cuenta y los topes de cada nivel de verificación.",
  },
  metricas: {
    titulo: "Métricas e integridad",
    resumen: "Cortes y detección de anomalías",
    descripcion:
      "Qué cortes de métricas se exigen, en qué plazo y cuándo una cifra reportada se marca para revisión.",
  },
  calidad: {
    titulo: "Calidad",
    resumen: "Multiplicador de calidad",
    descripcion:
      "Rango y cálculo del multiplicador que ajusta el precio de cada cuenta según su desempeño verificado.",
  },
  seguridad: {
    titulo: "Seguridad",
    resumen: "Sesiones, ingreso y retención",
    descripcion:
      "Inactividad de sesión por tipo de usuario, límites de intentos de ingreso, países habituales y conservación de registros.",
  },
  tributario: {
    titulo: "Tributario",
    resumen: "UVT, retenciones y DIAN",
    descripcion:
      "Parámetros por año, retenciones, ReteICA municipal, numeración DIAN y reglas de facturación y liquidación.",
  },
  catalogos: {
    titulo: "Catálogos",
    resumen: "Sectores, categorías y territorio",
    descripcion:
      "Listas que usan los formularios: sectores de anunciantes, categorías de medios y departamentos y municipios habilitados.",
  },
  legal: {
    titulo: "Legal",
    resumen: "Términos y política de datos",
    descripcion:
      "Versiones de los términos y de la política de tratamiento de datos (Ley 1581). Una versión publicada no se modifica.",
  },
  plantillas: {
    titulo: "Plantillas",
    resumen: "Textos de notificaciones",
    descripcion:
      "Textos de los avisos que reciben las personas en la aplicación y por correo, con sus variables.",
  },
}

export function esSeccion(valor: unknown): valor is Seccion {
  return (SECCIONES as readonly unknown[]).includes(valor)
}

/** `?seccion=`: un valor desconocido cae en la sección por defecto. */
export const parseAsSeccion =
  parseAsStringLiteral(SECCIONES).withDefault(SECCION_POR_DEFECTO)

export const parsersSeccion = { seccion: parseAsSeccion }

/** Lectura de `?seccion=` en la página (servidor). */
export const cargarSeccion = createLoader(parsersSeccion)

const serializar = createSerializer(parsersSeccion)

/** `?seccion=…` para enlaces (la sección por defecto no ensucia la URL). */
export function consultaSeccion(seccion: Seccion): string {
  return serializar({
    seccion: seccion === SECCION_POR_DEFECTO ? null : seccion,
  })
}

export const RUTA_CONFIGURACION = "/administracion/configuracion"

/** Ruta absoluta a una sección (para otros módulos y la bitácora). */
export function rutaSeccion(seccion: Seccion): string {
  return `${RUTA_CONFIGURACION}${consultaSeccion(seccion)}`
}
