/**
 * Plantillas de notificación (módulo puro): variables usadas en el texto,
 * avisos de variables desconocidas, valores de ejemplo para la vista previa,
 * filtro por canal y texto, y agrupación por dominio de la clave
 * (`oferta.devuelta` → «Ofertas»).
 */
import { normalizarNombreGeo } from "@/lib/geo/normalizar"

import type { CanalNotificacion, Plantilla } from "./tipos"

const PATRON_VARIABLE = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi

/** Variables `{{x}}` que aparecen en el texto, sin repetir y en orden de aparición. */
export function variablesUsadas(
  ...textos: (string | null | undefined)[]
): string[] {
  const vistas = new Set<string>()
  for (const texto of textos) {
    for (const coincidencia of (texto ?? "").matchAll(PATRON_VARIABLE)) {
      vistas.add(coincidencia[1].toLowerCase())
    }
  }
  return [...vistas]
}

export interface RevisionVariables {
  /** Usadas en el texto pero no declaradas: el sistema no las reemplazará. */
  desconocidas: string[]
  /** Declaradas pero no usadas (solo informativo). */
  sinUsar: string[]
}

export function revisarVariables(
  declaradas: readonly string[],
  asunto: string | null | undefined,
  cuerpo: string
): RevisionVariables {
  const usadas = variablesUsadas(asunto, cuerpo)
  const conjunto = new Set(declaradas)
  return {
    desconocidas: usadas.filter((v) => !conjunto.has(v)),
    sinUsar: declaradas.filter((v) => !usadas.includes(v)),
  }
}

/** Valores verosímiles para la vista previa. */
export const EJEMPLOS_VARIABLE: Readonly<Record<string, string>> = {
  nombre: "Laura Gómez",
  invitador: "Andrés Ramírez",
  rol: "Operaciones",
  enlace: "https://…/auth/confirm?token=…",
  vigencia_horas: "24",
  vigencia_minutos: "60",
  anunciante: "Alimentos del Valle",
  oferta: "Lanzamiento temporada navideña",
  plataforma: "Instagram",
  fecha_limite: "15 de octubre, 6:00 p. m.",
  fecha_fin: "20 de octubre",
  motivo: "la imagen no corresponde al creativo aprobado",
  corte: "72 horas",
  plazo_disputa: "18 de octubre",
  version: "3",
  handle: "noticiasdelvalle",
  resultado: "aprobada",
  actual: "1,05×",
  proximo: "1,12×",
  fecha: "7 de octubre",
  periodo: "1 al 15 de septiembre",
  monto_neto: "$ 1.280.000",
  pais: "España",
  accion: "creó",
  campana: "Temporada navideña",
  cantidad: "4",
  consumido: "$ 24.000.000",
  decision: "procede",
  documento: "RUT",
  indice: "0,042",
  indice_franja: "0,038",
  limite: "12 de noviembre",
  medio: "Noticias del Valle",
  monto: "$ 1.450.000",
  municipio: "Pasto",
  n: "20",
  nivel: "2",
  nota: "NC-12",
  numero: "1024",
  plazo: "18 de octubre, 6:00 p. m.",
  porcentaje: "82 %",
  publicacion: " de la publicación 2",
  saldo: "$ 2.380.000",
  situacion: "vence el",
  tipo: "consulta",
  tope: "$ 30.000.000",
  total: "$ 4.760.000",
  usuario: "Laura Gómez",
  valor: "$ 500.000",
  vence: "7 de noviembre",
  vencimiento: "23 de noviembre",
}

export function ejemploDe(variable: string): string {
  return EJEMPLOS_VARIABLE[variable] ?? variable.replace(/_/g, " ")
}

/** Título de cada dominio, en el orden en que se listan. */
export const DOMINIOS_PLANTILLA: Readonly<Record<string, string>> = {
  usuario: "Cuentas de usuario",
  anunciante: "Empresas anunciantes",
  campana: "Campañas",
  oferta: "Ofertas",
  asignacion: "Asignaciones",
  evidencia: "Evidencias",
  metricas: "Métricas",
  creativo: "Contenido",
  medio: "Medios",
  documento: "Documentos",
  cuenta: "Cuentas sociales",
  multiplicador: "Multiplicador de calidad",
  liquidacion: "Liquidaciones",
  factura: "Facturas",
  disputa: "Disputas",
  titular: "Datos personales",
  cola: "Colas del equipo AMO",
  seguridad: "Seguridad",
}

/** Canales que se administran aquí (WhatsApp y push aún no existen). */
export const CANALES_PLANTILLA = [
  "APP",
  "EMAIL",
] as const satisfies readonly CanalNotificacion[]

export type CanalPlantilla = (typeof CANALES_PLANTILLA)[number]

/** Rótulo corto del filtro por canal. */
export const ETIQUETAS_CANAL_PLANTILLA: Readonly<
  Record<CanalPlantilla, string>
> = {
  APP: "Aplicación",
  EMAIL: "Correo",
}

/** Cuántas plantillas tiene cada canal del filtro. */
export function contarPorCanal(
  plantillas: readonly Plantilla[]
): Record<CanalPlantilla, number> {
  const conteo: Record<CanalPlantilla, number> = { APP: 0, EMAIL: 0 }
  for (const plantilla of plantillas) {
    if (plantilla.canal === "APP" || plantilla.canal === "EMAIL") {
      conteo[plantilla.canal] += 1
    }
  }
  return conteo
}

/**
 * Las plantillas de un canal que coinciden con lo buscado: por nombre (sin
 * tildes ni mayúsculas) o por clave técnica.
 */
export function filtrarPlantillas(
  plantillas: readonly Plantilla[],
  { canal, busqueda }: { canal: CanalPlantilla; busqueda: string }
): Plantilla[] {
  const texto = normalizarNombreGeo(busqueda)
  const clave = busqueda.trim().toLowerCase()
  return plantillas.filter(
    (plantilla) =>
      plantilla.canal === canal &&
      (!texto ||
        normalizarNombreGeo(plantilla.nombre).includes(texto) ||
        plantilla.clave.includes(clave))
  )
}

export function dominioPlantilla(clave: string): string {
  return clave.split(".")[0] ?? clave
}

export interface GrupoPlantillas {
  dominio: string
  titulo: string
  plantillas: Plantilla[]
}

/** Plantillas agrupadas por dominio, en el orden del catálogo. */
export function agruparPlantillas(
  plantillas: readonly Plantilla[]
): GrupoPlantillas[] {
  const orden = Object.keys(DOMINIOS_PLANTILLA)
  const grupos = new Map<string, Plantilla[]>()
  for (const plantilla of plantillas) {
    const dominio = dominioPlantilla(plantilla.clave)
    const lista = grupos.get(dominio)
    if (lista) lista.push(plantilla)
    else grupos.set(dominio, [plantilla])
  }
  const posicion = (dominio: string) => {
    const i = orden.indexOf(dominio)
    return i === -1 ? orden.length : i
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => posicion(a) - posicion(b) || a.localeCompare(b))
    .map(([dominio, lista]) => ({
      dominio,
      titulo:
        DOMINIOS_PLANTILLA[dominio] ??
        dominio.charAt(0).toUpperCase() + dominio.slice(1),
      plantillas: lista.sort((a, b) =>
        a.nombre.localeCompare(b.nombre, "es-CO")
      ),
    }))
}
