/**
 * DTO del registro de accesos. La IP llega enmascarada salvo con
 * `datos_sensibles.ver`; los nombres de país y municipio se resuelven en el
 * servidor (los diccionarios geográficos no viajan al navegador).
 */
import type { CeldaActividad } from "@/components/charts/datos"
import type { IndicadorComparado } from "@/features/auditoria/tipos"

import type {
  DispositivoAcceso,
  EventoAcceso,
  ResultadoAcceso,
} from "./catalogo"

export type UsuarioAcceso = {
  id: string
  nombre: string
  email: string
  rol: string | null
  color: string | null
}

export type AccesoFila = {
  id: number
  at: string
  evento: EventoAcceso
  etiquetaEvento: string
  resultado: ResultadoAcceso
  /** `null`: correo sin cuenta en AMO o perfil no visible. */
  usuario: UsuarioAcceso | null
  paisIso2: string | null
  pais: string | null
  bandera: string | null
  ciudad: string | null
  /** Departamento (Colombia) o país, para acompañar la ciudad. */
  region: string | null
  dispositivo: DispositivoAcceso | null
  navegador: string | null
  sistemaOperativo: string | null
  ip: string | null
  aal: string | null
  sospechoso: boolean
  motivoSospecha: string | null
}

export type PaginaAccesos = {
  filas: AccesoFila[]
  total: number
}

export type ResumenAccesos = {
  exitosos: IndicadorComparado
  fallidos: IndicadorComparado
  bloqueados: IndicadorComparado
  sospechosos: IndicadorComparado
  /** Países distintos de los ingresos exitosos. */
  paises: number
  usuariosUnicos: number
  /** Fallidos / (fallidos + exitosos); `null` sin intentos. */
  tasaFallo: number | null
  serieExitosos: number[]
  muestraCompleta: boolean
  comparacion: string
}

export type ElementoRanking = {
  clave: string
  etiqueta: string
  detalle: string | null
  /** País de la fila (para la bandera); `null` en "Otros". */
  iso2: string | null
  bandera: string | null
  cantidad: number
  /** Fracción del total del ranking (0–1). */
  proporcion: number
}

export type RankingsAccesos = {
  paises: ElementoRanking[]
  ciudades: ElementoRanking[]
  /** Ingresos exitosos analizados. */
  total: number
  /** De ellos, cuántos no traen ubicación (desarrollo local, VPN…). */
  sinUbicacion: number
}

export type OpcionPais = {
  iso2: string
  nombre: string
  bandera: string | null
  cantidad: number
}

export type ActividadAccesos = {
  /** Celdas día × hora con ingresos (las vacías las completa el gráfico). */
  celdas: CeldaActividad[]
  /** Ingresos exitosos analizados. */
  total: number
  muestraCompleta: boolean
}
