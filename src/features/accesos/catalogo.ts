/**
 * Vocabulario del registro de accesos (módulo puro): eventos de
 * autenticación, resultado, dispositivos, motivos de sospecha y banderas.
 */
import type { TonoEvento } from "@/features/auditoria/catalogo"
import { Constants, type Database } from "@/types/database.types"

export type EventoAcceso = Database["public"]["Enums"]["acceso_evento"]
export const EVENTOS_ACCESO = Constants.public.Enums.acceso_evento

/**
 * Intentos mínimos para mostrar una tasa (valor por defecto de la clave
 * `analitica.n_minimo_tasas`, docs/kpis.md §0.4): con menos, una tasa engaña.
 */
export const N_MINIMO_TASAS = 20

export type ResultadoAcceso = "EXITO" | "FALLO" | "BLOQUEO" | "INFO"

export const RESULTADOS: Readonly<
  Record<ResultadoAcceso, { etiqueta: string; tono: TonoEvento }>
> = {
  EXITO: { etiqueta: "Exitoso", tono: "exito" },
  FALLO: { etiqueta: "Fallido", tono: "peligro" },
  BLOQUEO: { etiqueta: "Bloqueado", tono: "aviso" },
  INFO: { etiqueta: "Informativo", tono: "neutro" },
}

export const EVENTOS: Readonly<
  Record<EventoAcceso, { etiqueta: string; resultado: ResultadoAcceso }>
> = {
  LOGIN_EXITOSO: { etiqueta: "Ingreso", resultado: "EXITO" },
  LOGIN_FALLIDO: { etiqueta: "Contraseña incorrecta", resultado: "FALLO" },
  LOGIN_BLOQUEADO: { etiqueta: "Ingreso bloqueado", resultado: "BLOQUEO" },
  MFA_EXITOSO: { etiqueta: "Verificación en dos pasos", resultado: "EXITO" },
  MFA_FALLIDO: {
    etiqueta: "Código de verificación inválido",
    resultado: "FALLO",
  },
  CIERRE_SESION: { etiqueta: "Cierre de sesión", resultado: "INFO" },
  SESION_EXPIRADA: { etiqueta: "Sesión expirada", resultado: "INFO" },
  SESION_REVOCADA: { etiqueta: "Sesión revocada", resultado: "BLOQUEO" },
  USUARIO_SUSPENDIDO: { etiqueta: "Usuario suspendido", resultado: "BLOQUEO" },
  RECUPERACION_SOLICITADA: {
    etiqueta: "Recuperación solicitada",
    resultado: "INFO",
  },
  CONTRASENA_CAMBIADA: { etiqueta: "Contraseña cambiada", resultado: "INFO" },
}

export const DISPOSITIVOS = ["ESCRITORIO", "MOVIL", "TABLETA", "OTRO"] as const
export type DispositivoAcceso = (typeof DISPOSITIVOS)[number]

export const ETIQUETAS_DISPOSITIVO: Readonly<
  Record<DispositivoAcceso, string>
> = {
  ESCRITORIO: "Escritorio",
  MOVIL: "Móvil",
  TABLETA: "Tableta",
  OTRO: "Otro",
}

export function esDispositivo(
  valor: string | null
): valor is DispositivoAcceso {
  return (DISPOSITIVOS as readonly (string | null)[]).includes(valor)
}

/** Motivos que marca `registrar_acceso_srv` (docs/modelo-datos.md §5.5). */
export const MOTIVOS_SOSPECHA = [
  "PAIS_INUSUAL",
  "MULTIPLES_FALLOS",
  "IP_BLOQUEADA",
] as const
export type MotivoSospecha = (typeof MOTIVOS_SOSPECHA)[number]

export const ETIQUETAS_MOTIVO: Readonly<Record<MotivoSospecha, string>> = {
  PAIS_INUSUAL: "País inusual",
  MULTIPLES_FALLOS: "Múltiples fallos",
  IP_BLOQUEADA: "IP bloqueada",
}

function esMotivoConocido(motivo: string): motivo is MotivoSospecha {
  return (MOTIVOS_SOSPECHA as readonly string[]).includes(motivo)
}

export function etiquetaMotivoSospecha(motivo: string | null): string {
  if (!motivo) return "Actividad sospechosa"
  if (esMotivoConocido(motivo)) return ETIQUETAS_MOTIVO[motivo]
  return motivo.charAt(0) + motivo.slice(1).toLowerCase().replace(/_/g, " ")
}

const INDICADOR_REGIONAL_A = 0x1f1e6

/** "CO" → "🇨🇴" (símbolos indicadores regionales); `null` si no es ISO2. */
export function banderaEmoji(iso2: string | null): string | null {
  if (!iso2 || !/^[A-Za-z]{2}$/.test(iso2)) return null
  return [...iso2.toUpperCase()]
    .map((letra) =>
      String.fromCodePoint(INDICADOR_REGIONAL_A + letra.charCodeAt(0) - 65)
    )
    .join("")
}
