/**
 * Diccionario de KPI para la UI (tooltips de definición, unidad y sentido),
 * resumido de docs/kpis.md. Las claves coinciden con `kpi_fila.kpi` de las RPC
 * de analítica; el texto es para personas de negocio, sin SQL.
 */
import type { SentidoKpi, UnidadKpi } from "./tipos"

export interface DefinicionKpi {
  nombre: string
  definicion: string
  /** Cómo se calcula, en lenguaje llano. */
  calculo: string
  /** Fecha que decide a qué periodo pertenece cada hecho. */
  ancla: string
  unidad: UnidadKpi
  sentido: SentidoKpi
  /** Exige `analitica.n_minimo_tasas` para compararse (tasas agregadas). */
  exigeMuestra?: boolean
  nota?: string
}

const COP = "COP" as const
const PORCENTAJE = "%" as const
const CONTEO = "conteo" as const

export const DEFINICIONES_KPI = {
  // ── Tablero administrativo (`kpis_admin`) ─────────────────────────────────
  gmv_comprometido: {
    nombre: "GMV comprometido",
    definicion:
      "Valor bruto de los negocios que los medios aceptaron en el periodo y que siguen en pie.",
    calculo:
      "Suma del valor bruto de las asignaciones aceptadas que aún consumen cupo.",
    ancla: "Fecha de aceptación",
    unidad: COP,
    sentido: "mayor",
    nota: "Se recalcula si una asignación del periodo se cae (vencida o cancelada).",
  },
  gmv_verificado: {
    nombre: "GMV verificado",
    definicion:
      "Valor bruto de los negocios cumplidos: sus métricas fueron validadas en el periodo. Es el GMV oficial.",
    calculo:
      "Suma del valor bruto de las asignaciones verificadas, liquidadas o pagadas.",
    ancla: "Fecha de verificación",
    unidad: COP,
    sentido: "mayor",
  },
  comision: {
    nombre: "Comisión generada",
    definicion: "Ingreso de la plataforma sobre el GMV verificado.",
    calculo:
      "Suma de la comisión congelada al aceptar cada asignación verificada.",
    ancla: "Fecha de verificación",
    unidad: COP,
    sentido: "mayor",
  },
  take_rate: {
    nombre: "Take rate",
    definicion: "Proporción del GMV verificado que queda como comisión.",
    calculo: "Comisión ÷ GMV verificado.",
    ancla: "Fecha de verificación",
    unidad: PORCENTAJE,
    sentido: "neutro",
    exigeMuestra: true,
    nota: "Debe rondar la comisión global; una caída de más de 2 pp indica peso de excepciones.",
  },
  negocios_cerrados: {
    nombre: "Negocios cerrados",
    definicion: "Número de asignaciones verificadas en el periodo.",
    calculo: "Conteo de asignaciones verificadas, liquidadas o pagadas.",
    ancla: "Fecha de verificación",
    unidad: CONTEO,
    sentido: "mayor",
  },
  ofertas_publicadas: {
    nombre: "Ofertas publicadas",
    definicion:
      "Ofertas aprobadas por moderación y publicadas en el marketplace.",
    calculo: "Conteo de ofertas por su primera publicación.",
    ancla: "Fecha de primera publicación",
    unidad: CONTEO,
    sentido: "mayor",
  },
  tasa_llenado: {
    nombre: "Tasa de llenado",
    definicion:
      "Proporción de cupos tomados en las ofertas cuya fecha límite de aceptación cerró en el periodo.",
    calculo: "Cupos tomados ÷ cupos ofrecidos.",
    ancla: "Fecha límite de aceptación",
    unidad: PORCENTAJE,
    sentido: "mayor",
    exigeMuestra: true,
    nota: "Por debajo de 60 % sugiere precio poco atractivo o segmentación estrecha.",
  },
  tiempo_medio_llenado_h: {
    nombre: "Tiempo medio de llenado",
    definicion:
      "Horas desde que se publica una oferta hasta que todos sus cupos están ocupados.",
    calculo:
      "Promedio de horas entre publicación y llenado de las ofertas que se llenaron.",
    ancla: "Fecha de llenado",
    unidad: "h",
    sentido: "neutro",
    exigeMuestra: true,
  },
  tasa_aceptacion: {
    nombre: "Tasa de aceptación",
    definicion:
      "De las ofertas que los medios vieron, cuántas terminaron aceptadas.",
    calculo: "Pares oferta-medio aceptados ÷ pares oferta-medio vistos.",
    ancla: "Fecha de primera vista",
    unidad: PORCENTAJE,
    sentido: "mayor",
    exigeMuestra: true,
  },
  tasa_cumplimiento: {
    nombre: "Tasa de cumplimiento",
    definicion:
      "De las asignaciones cuyo plazo de publicación venció, cuántas se publicaron a tiempo con evidencia validada.",
    calculo:
      "Publicadas a tiempo con evidencia validada ÷ asignaciones con resultado conocido.",
    ancla: "Fecha límite de publicación",
    unidad: PORCENTAJE,
    sentido: "mayor",
    exigeMuestra: true,
    nota: "Meta ≥ 90 %.",
  },
  alcance_total: {
    nombre: "Alcance total",
    definicion:
      "Personas alcanzadas por los negocios verificados, según el último corte validado.",
    calculo:
      "Suma del alcance normalizado del último corte aprobado de cada publicación.",
    ancla: "Fecha de verificación",
    unidad: "personas",
    sentido: "mayor",
    nota: "Acumulado: no deduplica personas entre publicaciones.",
  },
  medios_activos: {
    nombre: "Medios activos",
    definicion:
      "Medios verificados con al menos una aceptación o publicación en el periodo.",
    calculo: "Conteo de medios distintos con actividad.",
    ancla: "Fecha de aceptación o publicación",
    unidad: CONTEO,
    sentido: "mayor",
  },
  medios_nuevos: {
    nombre: "Medios nuevos",
    definicion: "Medios verificados por primera vez en el periodo.",
    calculo: "Conteo de medios por su primera verificación.",
    ancla: "Fecha de primera verificación",
    unidad: CONTEO,
    sentido: "mayor",
  },
  medios_en_riesgo: {
    nombre: "Medios en riesgo",
    definicion:
      "Medios activos en los últimos 90 días que no aceptan ofertas desde hace más de 30.",
    calculo:
      "Conteo al cierre del periodo; el GMV en juego es lo que generaron en 90 días.",
    ancla: "Cierre del periodo",
    unidad: CONTEO,
    sentido: "menor",
  },
  anunciantes_activos: {
    nombre: "Anunciantes activos",
    definicion:
      "Anunciantes con al menos una asignación aceptada en el periodo.",
    calculo:
      "Conteo de anunciantes distintos con asignaciones vigentes aceptadas.",
    ancla: "Fecha de aceptación",
    unidad: CONTEO,
    sentido: "mayor",
  },
  ticket_promedio: {
    nombre: "Ticket promedio",
    definicion: "GMV comprometido promedio por anunciante activo.",
    calculo: "GMV comprometido ÷ anunciantes activos.",
    ancla: "Fecha de aceptación",
    unidad: COP,
    sentido: "mayor",
    nota: "Con menos de 5 anunciantes se muestra con advertencia.",
  },

  // ── Desempeño (§9) ───────────────────────────────────────────────────────
  cpm_efectivo: {
    nombre: "CPM efectivo",
    definicion: "Costo por cada mil impresiones entregadas.",
    calculo: "Valor bruto ÷ impresiones × 1.000 (TikTok usa reproducciones).",
    ancla: "Fecha de verificación",
    unidad: COP,
    sentido: "menor",
    exigeMuestra: true,
  },
  costo_por_interaccion: {
    nombre: "Costo por interacción",
    definicion: "Costo de cada me gusta, comentario, compartido o guardado.",
    calculo: "Valor bruto ÷ interacciones.",
    ancla: "Fecha de verificación",
    unidad: COP,
    sentido: "menor",
    exigeMuestra: true,
  },
  engagement: {
    nombre: "Tasa de engagement",
    definicion: "Interacciones por cada persona alcanzada.",
    calculo: "Interacciones ÷ alcance.",
    ancla: "Fecha de verificación",
    unidad: PORCENTAJE,
    sentido: "mayor",
    exigeMuestra: true,
  },
  costo_por_alcance: {
    nombre: "Costo por alcance",
    definicion: "Pesos invertidos por cada persona alcanzada.",
    calculo: "Valor bruto ÷ alcance normalizado.",
    ancla: "Fecha de verificación",
    unidad: COP,
    sentido: "menor",
    exigeMuestra: true,
  },

  // ── Anunciante (`kpis_anunciante`) ─────────────────────────────────────────
  inversion_comprometida: {
    nombre: "Inversión comprometida",
    definicion:
      "Valor de tus negocios aceptados por medios en el periodo que siguen en pie.",
    calculo: "Suma del valor bruto de tus asignaciones aceptadas vigentes.",
    ancla: "Fecha de aceptación",
    unidad: COP,
    sentido: "neutro",
  },
  inversion_verificada: {
    nombre: "Inversión verificada",
    definicion:
      "Valor de tus negocios cumplidos con métricas validadas en el periodo.",
    calculo: "Suma del valor bruto de tus asignaciones verificadas.",
    ancla: "Fecha de verificación",
    unidad: COP,
    sentido: "neutro",
  },
  campanas_activas: {
    nombre: "Campañas activas",
    definicion: "Campañas en estado activo al cierre del periodo.",
    calculo: "Conteo de campañas activas.",
    ancla: "Cierre del periodo",
    unidad: CONTEO,
    sentido: "neutro",
  },
  medios_alcanzados: {
    nombre: "Medios alcanzados",
    definicion: "Medios distintos que aceptaron tus ofertas en el periodo.",
    calculo:
      "Conteo de medios distintos en tus asignaciones vigentes aceptadas.",
    ancla: "Fecha de aceptación",
    unidad: CONTEO,
    sentido: "mayor",
  },

  impresiones: {
    nombre: "Impresiones",
    definicion:
      "Veces que se mostraron las publicaciones verificadas (en TikTok, reproducciones).",
    calculo:
      "Suma de impresiones del último corte validado de cada publicación.",
    ancla: "Fecha de verificación",
    unidad: CONTEO,
    sentido: "mayor",
  },
  interacciones: {
    nombre: "Interacciones",
    definicion:
      "Me gusta, comentarios, compartidos y guardados de las publicaciones verificadas.",
    calculo:
      "Suma de interacciones del último corte validado de cada publicación.",
    ancla: "Fecha de verificación",
    unidad: CONTEO,
    sentido: "mayor",
  },
  reproducciones: {
    nombre: "Reproducciones",
    definicion: "Reproducciones de los videos, reels y TikTok verificados.",
    calculo:
      "Suma de reproducciones del último corte validado de cada publicación.",
    ancla: "Fecha de verificación",
    unidad: CONTEO,
    sentido: "mayor",
    nota: "Solo aplica a formatos de video.",
  },
  clics: {
    nombre: "Clics en el enlace",
    definicion:
      "Clics hacia el enlace de destino de las publicaciones verificadas.",
    calculo: "Suma de clics del último corte validado de cada publicación.",
    ancla: "Fecha de verificación",
    unidad: CONTEO,
    sentido: "mayor",
    nota: "Solo si el creativo tiene enlace.",
  },

  // ── Medio (`kpis_medio`) ───────────────────────────────────────────────────
  ganado_periodo: {
    nombre: "Ganado en el periodo",
    definicion:
      "Tu valor por los negocios verificados en el periodo, antes de retenciones.",
    calculo: "Suma del valor para el medio de tus asignaciones verificadas.",
    ancla: "Fecha de verificación",
    unidad: COP,
    sentido: "mayor",
  },
  pendiente_pago: {
    nombre: "Pendiente de pago",
    definicion: "Lo verificado o liquidado que aún no se te ha pagado.",
    calculo: "Neto de lo liquidado más el valor estimado de lo verificado.",
    ancla: "Al día de hoy",
    unidad: COP,
    sentido: "neutro",
    nota: "Estimado: las retenciones se calculan al liquidar.",
  },
  asignaciones_activas: {
    nombre: "Asignaciones activas",
    definicion: "Negocios en curso: aceptados y aún sin verificar.",
    calculo: "Conteo de tus asignaciones en ejecución.",
    ancla: "Al día de hoy",
    unidad: CONTEO,
    sentido: "neutro",
  },

  pagado_historico: {
    nombre: "Pagado a la fecha",
    definicion:
      "Lo que has recibido por tus negocios pagados, después de retenciones.",
    calculo: "Suma del neto de tus asignaciones pagadas.",
    ancla: "Acumulado",
    unidad: COP,
    sentido: "mayor",
  },
  retenciones_historicas: {
    nombre: "Retenciones practicadas",
    definicion: "Retenciones de ley descontadas de tus pagos.",
    calculo: "Suma de las retenciones de tus asignaciones pagadas.",
    ancla: "Acumulado",
    unidad: COP,
    sentido: "neutro",
  },
  publicaciones_realizadas: {
    nombre: "Publicaciones realizadas",
    definicion: "Publicaciones con evidencia aprobada en el periodo.",
    calculo: "Conteo de tus publicaciones aprobadas.",
    ancla: "Fecha de publicación",
    unidad: CONTEO,
    sentido: "mayor",
  },
  tope_anual: {
    nombre: "Tope anual del nivel",
    definicion:
      "Monto máximo que puedes facturar en el año con tu nivel de verificación.",
    calculo: "Tope configurado para tu nivel.",
    ancla: "Año en curso",
    unidad: COP,
    sentido: "neutro",
  },
  consumido_tope: {
    nombre: "Consumido del tope",
    definicion: "Valor para el medio de tus negocios aceptados este año.",
    calculo:
      "Suma del valor para el medio de las asignaciones aceptadas en el año.",
    ancla: "Año en curso",
    unidad: COP,
    sentido: "neutro",
  },
  porcentaje_tope: {
    nombre: "Avance del tope",
    definicion: "Qué parte del tope anual de tu nivel ya usaste.",
    calculo: "Consumido ÷ tope anual.",
    ancla: "Año en curso",
    unidad: PORCENTAJE,
    sentido: "neutro",
    nota: "Cerca del tope no podrás aceptar nuevas ofertas hasta subir de nivel.",
  },
  multiplicador_calidad: {
    nombre: "Multiplicador de calidad",
    definicion:
      "Ajuste de tu tarifa según el desempeño histórico de tus cuentas.",
    calculo: "El multiplicador vigente más bajo entre tus cuentas.",
    ancla: "Al día de hoy",
    unidad: "factor",
    sentido: "mayor",
  },

  // ── Accesos (`metricas_accesos`) ───────────────────────────────────────────
  accesos_exitosos: {
    nombre: "Accesos exitosos",
    definicion: "Inicios de sesión correctos.",
    calculo: "Conteo de eventos de ingreso exitoso.",
    ancla: "Fecha del evento",
    unidad: CONTEO,
    sentido: "mayor",
  },
  accesos_fallidos: {
    nombre: "Accesos fallidos",
    definicion: "Intentos con credenciales inválidas.",
    calculo: "Conteo de eventos de ingreso fallido.",
    ancla: "Fecha del evento",
    unidad: CONTEO,
    sentido: "menor",
  },
  tasa_fallo: {
    nombre: "Tasa de fallo",
    definicion: "Proporción de intentos de ingreso que fallaron.",
    calculo: "Fallidos ÷ (fallidos + exitosos).",
    ancla: "Fecha del evento",
    unidad: PORCENTAJE,
    sentido: "menor",
    exigeMuestra: true,
    nota: "Más de 20 % sostenido: revisar la experiencia de contraseña o un posible ataque.",
  },
  usuarios_unicos: {
    nombre: "Usuarios únicos",
    definicion: "Personas que ingresaron al menos una vez.",
    calculo: "Conteo de usuarios distintos con ingreso exitoso.",
    ancla: "Fecha del evento",
    unidad: CONTEO,
    sentido: "mayor",
  },
  accesos_sospechosos: {
    nombre: "Accesos sospechosos",
    definicion:
      "Ingresos marcados por reglas: país inusual o múltiples fallos previos.",
    calculo: "Conteo de accesos marcados como sospechosos.",
    ancla: "Fecha del evento",
    unidad: CONTEO,
    sentido: "menor",
  },
  bloqueos: {
    nombre: "Bloqueos",
    definicion: "Intentos de ingreso rechazados por exceso de fallos.",
    calculo: "Conteo de eventos de ingreso bloqueado.",
    ancla: "Fecha del evento",
    unidad: CONTEO,
    sentido: "menor",
    nota: "Los picos suelen indicar intentos de fuerza bruta.",
  },
  paises_distintos: {
    nombre: "Países de origen",
    definicion: "Países desde los que hubo ingresos exitosos.",
    calculo: "Conteo de países distintos con ingreso exitoso.",
    ancla: "Fecha del evento",
    unidad: CONTEO,
    sentido: "neutro",
  },
  mfa_fallidos: {
    nombre: "Verificaciones fallidas",
    definicion: "Códigos de verificación en dos pasos rechazados.",
    calculo: "Conteo de verificaciones TOTP fallidas.",
    ancla: "Fecha del evento",
    unidad: CONTEO,
    sentido: "menor",
  },
  sesiones_revocadas: {
    nombre: "Sesiones revocadas",
    definicion: "Cierres de sesión forzados y suspensiones de cuentas.",
    calculo: "Conteo de sesiones revocadas y usuarios suspendidos.",
    ancla: "Fecha del evento",
    unidad: CONTEO,
    sentido: "neutro",
  },
} as const satisfies Record<string, DefinicionKpi>

export type ClaveKpi = keyof typeof DEFINICIONES_KPI

/** Las 16 claves que devuelve `kpis_admin`. */
export const CLAVES_KPIS_ADMIN = [
  "gmv_comprometido",
  "gmv_verificado",
  "comision",
  "take_rate",
  "negocios_cerrados",
  "ofertas_publicadas",
  "tasa_llenado",
  "tiempo_medio_llenado_h",
  "tasa_aceptacion",
  "tasa_cumplimiento",
  "alcance_total",
  "medios_activos",
  "medios_nuevos",
  "medios_en_riesgo",
  "anunciantes_activos",
  "ticket_promedio",
] as const satisfies readonly ClaveKpi[]

/** Claves de `kpis_anunciante`. */
export const CLAVES_KPIS_ANUNCIANTE = [
  "inversion_comprometida",
  "inversion_verificada",
  "campanas_activas",
  "ofertas_publicadas",
  "tasa_llenado",
  "medios_alcanzados",
  "alcance_total",
  "impresiones",
  "interacciones",
  "reproducciones",
  "clics",
  "cpm_efectivo",
  "costo_por_interaccion",
  "engagement",
  "costo_por_alcance",
  "tasa_cumplimiento",
] as const satisfies readonly ClaveKpi[]

/** Claves de `kpis_medio`. */
export const CLAVES_KPIS_MEDIO = [
  "ganado_periodo",
  "pendiente_pago",
  "pagado_historico",
  "retenciones_historicas",
  "asignaciones_activas",
  "tasa_cumplimiento",
  "publicaciones_realizadas",
  "tope_anual",
  "consumido_tope",
  "porcentaje_tope",
  "multiplicador_calidad",
] as const satisfies readonly ClaveKpi[]

/** Claves de `metricas_accesos`. */
export const CLAVES_METRICAS_ACCESOS = [
  "accesos_exitosos",
  "accesos_fallidos",
  "bloqueos",
  "tasa_fallo",
  "usuarios_unicos",
  "paises_distintos",
  "accesos_sospechosos",
  "mfa_fallidos",
  "sesiones_revocadas",
] as const satisfies readonly ClaveKpi[]

export function esClaveKpi(valor: string): valor is ClaveKpi {
  return Object.hasOwn(DEFINICIONES_KPI, valor)
}

export function definicionKpi(clave: string): DefinicionKpi | undefined {
  return esClaveKpi(clave) ? DEFINICIONES_KPI[clave] : undefined
}
