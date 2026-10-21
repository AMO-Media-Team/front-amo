/**
 * Resumen del User-Agent para el registro de accesos (`accesos.navegador`,
 * `sistema_operativo`, `dispositivo`). Heurística deliberadamente simple: sirve
 * para agrupar en reportes, no para decisiones de seguridad.
 */

export type Dispositivo = "ESCRITORIO" | "MOVIL" | "TABLETA" | "OTRO"

export interface AgenteUsuario {
  navegador: string | null
  sistemaOperativo: string | null
  dispositivo: Dispositivo
}

type Regla = readonly [patron: RegExp, nombre: string]

// El orden importa: Edge y Opera también dicen "Chrome"; Chrome también dice "Safari".
const NAVEGADORES: readonly Regla[] = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\bOPR\/|\bOpera\b/, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\bChrome\/|\bCriOS\//, "Chrome"],
  [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
]

const SISTEMAS: readonly Regla[] = [
  [/\bWindows NT\b/, "Windows"],
  [/\b(?:iPhone|iPad|iPod)\b/, "iOS"],
  [/\bAndroid\b/, "Android"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bLinux\b/, "Linux"],
]

function primeraCoincidencia(
  ua: string,
  reglas: readonly Regla[]
): string | null {
  return reglas.find(([patron]) => patron.test(ua))?.[1] ?? null
}

function dispositivoDe(ua: string, sistema: string | null): Dispositivo {
  if (/\bbot\b|crawler|spider/i.test(ua)) return "OTRO"
  if (/\biPad\b|\bTablet\b/i.test(ua)) return "TABLETA"
  if (sistema === "Android") return /\bMobile\b/.test(ua) ? "MOVIL" : "TABLETA"
  if (/\bMobi|\biPhone\b|\biPod\b/.test(ua)) return "MOVIL"
  if (sistema) return "ESCRITORIO"
  return "OTRO"
}

export function describirAgente(ua: string | null | undefined): AgenteUsuario {
  if (!ua) {
    return { navegador: null, sistemaOperativo: null, dispositivo: "OTRO" }
  }
  const sistemaOperativo = primeraCoincidencia(ua, SISTEMAS)
  return {
    navegador: primeraCoincidencia(ua, NAVEGADORES),
    sistemaOperativo,
    dispositivo: dispositivoDe(ua, sistemaOperativo),
  }
}
