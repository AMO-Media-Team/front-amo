/**
 * Plantillas de notificación (módulo puro): variables usadas en el texto,
 * avisos de variables desconocidas, valores de ejemplo para la vista previa y
 * agrupación por dominio de la clave (`oferta.devuelta` → «Ofertas»).
 */
import type { Plantilla } from "./tipos"

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
}

export function ejemploDe(variable: string): string {
  return EJEMPLOS_VARIABLE[variable] ?? variable.replace(/_/g, " ")
}

export const DOMINIOS_PLANTILLA: Readonly<Record<string, string>> = {
  usuario: "Cuentas de usuario",
  oferta: "Ofertas",
  asignacion: "Asignaciones",
  evidencia: "Evidencias",
  metricas: "Métricas",
  creativo: "Contenido",
  cuenta: "Cuentas sociales",
  multiplicador: "Multiplicador de calidad",
  liquidacion: "Liquidaciones",
  disputa: "Disputas",
  seguridad: "Seguridad",
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
