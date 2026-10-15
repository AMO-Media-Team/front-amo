/**
 * Catálogo de presentación de los parámetros de `public.configuracion`
 * (docs/modelo-datos.md §7): en qué sección y grupo se muestran, su título
 * corto, el valor por defecto de fábrica y textos de ayuda. Las reglas de
 * validación (tipo, mínimo, máximo, opciones) NO viven aquí: se leen de la BD,
 * que es la fuente de verdad. Una clave nueva que aún no esté en el catálogo
 * se muestra igual, en el grupo «Otros parámetros».
 */
import type { Seccion } from "./secciones"
import type { ValorParametro } from "./tipos"

export interface GrupoParametros {
  id: string
  seccion: Seccion
  titulo: string
  descripcion: string
}

export interface FichaParametro {
  grupo: string
  titulo: string
  /** Valor de fábrica (semilla de §7) para «Restablecer». */
  defecto: ValorParametro
  /** Qué pasa al cambiarlo (se muestra al confirmar). */
  impacto?: string
  /** Textos para un booleano: [verdadero, falso]. */
  booleano?: readonly [string, string]
}

export const GRUPO_OTROS = "otros"

export const GRUPOS: readonly GrupoParametros[] = [
  {
    id: "comision",
    seccion: "comercial",
    titulo: "Comisión de la plataforma",
    descripcion:
      "Se aplica sobre el monto bruto de cada asignación, salvo una excepción vigente por anunciante o campaña.",
  },
  {
    id: "ofertas",
    seccion: "comercial",
    titulo: "Campañas y ofertas",
    descripcion: "Reglas que se validan al crear y enviar ofertas a revisión.",
  },
  {
    id: "disputas",
    seccion: "comercial",
    titulo: "Disputas",
    descripcion: "Plazos del medio cuando una asignación vence sin publicar.",
  },
  {
    id: "precios",
    seccion: "precios",
    titulo: "Cálculo del precio",
    descripcion:
      "Ajustes que se aplican sobre la tarifa base al cotizar una asignación.",
  },
  {
    id: "elegibilidad",
    seccion: "medios",
    titulo: "Elegibilidad",
    descripcion: "Condición mínima para que una cuenta reciba ofertas.",
  },
  {
    id: "reverificacion",
    seccion: "medios",
    titulo: "Verificación de cuentas",
    descripcion:
      "Vigencia de la verificación de seguidores y del código temporal de historia.",
  },
  {
    id: "actividad",
    seccion: "medios",
    titulo: "Actividad y reputación",
    descripcion:
      "Ventanas con las que se calcula si un medio está activo, en riesgo o tiene historial suficiente.",
  },
  {
    id: "cortes",
    seccion: "metricas",
    titulo: "Cortes y plazos",
    descripcion: "Qué cortes de métricas se piden por defecto y en qué plazo.",
  },
  {
    id: "integridad",
    seccion: "metricas",
    titulo: "Detección de anomalías",
    descripcion:
      "Cuándo una métrica reportada se marca para revisión antes de validarla.",
  },
  {
    id: "analitica",
    seccion: "metricas",
    titulo: "Analítica e insights",
    descripcion:
      "Muestra mínima y umbral con los que los paneles comparan y generan alertas.",
  },
  {
    id: "multiplicador",
    seccion: "calidad",
    titulo: "Rango del multiplicador",
    descripcion:
      "El multiplicador de calidad nunca baja del piso ni supera el techo.",
  },
  {
    id: "calculo",
    seccion: "calidad",
    titulo: "Cálculo",
    descripcion:
      "Con qué publicaciones y qué corte se calcula, y con cuánta antelación se avisa un cambio.",
  },
  {
    id: "inactividad",
    seccion: "seguridad",
    titulo: "Inactividad de sesión",
    descripcion:
      "Tiempo sin actividad tras el que se cierra la sesión, según el tipo de usuario.",
  },
  {
    id: "ingreso",
    seccion: "seguridad",
    titulo: "Intentos de ingreso",
    descripcion:
      "Límites del bloqueo temporal ante contraseñas incorrectas repetidas.",
  },
  {
    id: "paises",
    seccion: "seguridad",
    titulo: "Países habituales",
    descripcion:
      "Un ingreso exitoso desde otro país se marca como inusual y avisa a la persona y a los superadministradores.",
  },
  {
    id: "retencion",
    seccion: "seguridad",
    titulo: "Retención de registros",
    descripcion:
      "Cuánto tiempo se conservan los registros antes de la purga automática diaria.",
  },
  {
    id: "archivos",
    seccion: "seguridad",
    titulo: "Archivos",
    descripcion: "Descargas firmadas y tamaño de los archivos creativos.",
  },
  {
    id: "tributario",
    seccion: "tributario",
    titulo: "Reglas tributarias",
    descripcion:
      "Criterios que usan las liquidaciones para calcular retenciones y controles.",
  },
  {
    id: "facturacion",
    seccion: "tributario",
    titulo: "Facturación a anunciantes",
    descripcion: "IVA y plazo de pago de las facturas.",
  },
  {
    id: "liquidaciones",
    seccion: "tributario",
    titulo: "Liquidaciones a medios",
    descripcion: "Cada cuánto se corta y en cuántos días se paga a los medios.",
  },
  {
    id: GRUPO_OTROS,
    seccion: "comercial",
    titulo: "Otros parámetros",
    descripcion: "Parámetros nuevos que aún no tienen un lugar propio.",
  },
]

const IMPACTO_PRECIO =
  "Aplica a las asignaciones que se acepten desde ahora; las ya aceptadas conservan su precio congelado."
const IMPACTO_SESION =
  "Las sesiones abiertas se evalúan con el nuevo valor en su siguiente solicitud."

export const FICHAS: Readonly<Record<string, FichaParametro>> = {
  "comision.porcentaje_global": {
    grupo: "comision",
    titulo: "Comisión global",
    defecto: 0.2,
    impacto: IMPACTO_PRECIO,
  },
  "comision.visible_para_medio": {
    grupo: "comision",
    titulo: "Desglose visible para el medio",
    defecto: true,
    booleano: ["Visible", "Oculto"],
    impacto:
      "Con el desglose oculto, el medio solo ve su monto neto en cotizaciones y asignaciones.",
  },
  "campanas.tope_porcentaje_por_medio": {
    grupo: "ofertas",
    titulo: "Tope del presupuesto por medio",
    defecto: 0.15,
    impacto:
      "Es el valor sugerido de las ofertas nuevas; las ofertas existentes conservan el suyo.",
  },
  "ofertas.anticipacion_minima_horas": {
    grupo: "ofertas",
    titulo: "Anticipación mínima de la fecha límite",
    defecto: 24,
  },
  "ofertas.minimo_medios": {
    grupo: "ofertas",
    titulo: "Mínimo de medios por oferta",
    defecto: 1,
  },
  "disputas.plazo_vencida_horas": {
    grupo: "disputas",
    titulo: "Plazo para disputar una vencida",
    defecto: 72,
  },
  "disputas.plazo_recarga_horas": {
    grupo: "disputas",
    titulo: "Plazo para recargar la evidencia",
    defecto: 24,
  },
  "precios.redondeo": {
    grupo: "precios",
    titulo: "Redondeo del precio",
    defecto: 100,
    impacto: IMPACTO_PRECIO,
  },
  "precios.recargo_exclusividad": {
    grupo: "precios",
    titulo: "Recargo por exclusividad",
    defecto: 1.25,
    impacto: IMPACTO_PRECIO,
  },
  "medios.umbral_seguidores": {
    grupo: "elegibilidad",
    titulo: "Seguidores verificados mínimos",
    defecto: 30000,
    impacto:
      "Las cuentas por debajo del nuevo umbral dejan de ver ofertas nuevas; sus asignaciones en curso no cambian.",
  },
  "medios.reverificacion_dias": {
    grupo: "reverificacion",
    titulo: "Vigencia de la verificación",
    defecto: 30,
  },
  "medios.reverificacion_gracia_dias": {
    grupo: "reverificacion",
    titulo: "Gracia tras vencer",
    defecto: 7,
  },
  "medios.codigo_verificacion_minutos": {
    grupo: "reverificacion",
    titulo: "Vigencia del código de historia",
    defecto: 60,
  },
  "medios.n_minimo_cumplimiento": {
    grupo: "actividad",
    titulo: "Muestra mínima de cumplimiento",
    defecto: 3,
  },
  "medios.dias_actividad": {
    grupo: "actividad",
    titulo: "Ventana de actividad",
    defecto: 90,
  },
  "medios.dias_riesgo_sin_aceptar": {
    grupo: "actividad",
    titulo: "Días sin aceptar para riesgo",
    defecto: 30,
  },
  "metricas.cortes_requeridos": {
    grupo: "cortes",
    titulo: "Cortes requeridos",
    defecto: ["H24", "H72", "D7"],
    impacto:
      "Aplica a las ofertas nuevas; las publicadas conservan sus cortes.",
  },
  "metricas.plazo_carga_horas": {
    grupo: "cortes",
    titulo: "Plazo de carga",
    defecto: 48,
  },
  "metricas.factor_desviacion": {
    grupo: "integridad",
    titulo: "Factor de desviación",
    defecto: 3,
  },
  "metricas.minimo_historial": {
    grupo: "integridad",
    titulo: "Historial mínimo",
    defecto: 5,
  },
  "metricas.multiplo_alcance_seguidores": {
    grupo: "integridad",
    titulo: "Múltiplo alcance / seguidores",
    defecto: { FACEBOOK: 3, INSTAGRAM: 2, TIKTOK: 20 },
  },
  "analitica.n_minimo_tasas": {
    grupo: "analitica",
    titulo: "Muestra mínima de tasas",
    defecto: 20,
  },
  "analitica.umbral_variacion": {
    grupo: "analitica",
    titulo: "Variación significativa",
    defecto: 0.15,
  },
  "calidad.multiplicador_piso": {
    grupo: "multiplicador",
    titulo: "Piso",
    defecto: 0.7,
    impacto:
      "Se aplica en el próximo recálculo semanal; el medio recibe aviso antes de que cambie su multiplicador.",
  },
  "calidad.multiplicador_techo": {
    grupo: "multiplicador",
    titulo: "Techo",
    defecto: 1.4,
    impacto:
      "Se aplica en el próximo recálculo semanal; el medio recibe aviso antes de que cambie su multiplicador.",
  },
  "calidad.minimo_publicaciones": {
    grupo: "calculo",
    titulo: "Publicaciones mínimas",
    defecto: 5,
  },
  "calidad.ventana_publicaciones": {
    grupo: "calculo",
    titulo: "Ventana de publicaciones",
    defecto: 20,
  },
  "calidad.corte_referencia": {
    grupo: "calculo",
    titulo: "Corte de referencia",
    defecto: "D7",
  },
  "calidad.dias_aviso_cambio": {
    grupo: "calculo",
    titulo: "Aviso previo de un cambio",
    defecto: 7,
  },
  "seguridad.inactividad_minutos_admin": {
    grupo: "inactividad",
    titulo: "Equipo interno",
    defecto: 30,
    impacto: IMPACTO_SESION,
  },
  "seguridad.inactividad_minutos_anunciante": {
    grupo: "inactividad",
    titulo: "Anunciantes",
    defecto: 120,
    impacto: IMPACTO_SESION,
  },
  "seguridad.inactividad_minutos_medio": {
    grupo: "inactividad",
    titulo: "Medios",
    defecto: 720,
    impacto: IMPACTO_SESION,
  },
  "seguridad.aviso_inactividad_segundos": {
    grupo: "inactividad",
    titulo: "Cuenta regresiva de aviso",
    defecto: 120,
  },
  "seguridad.sesion_actividad_throttle_segundos": {
    grupo: "inactividad",
    titulo: "Intervalo de registro de actividad",
    defecto: 60,
  },
  "seguridad.login_max_fallos_email": {
    grupo: "ingreso",
    titulo: "Fallos por correo e IP",
    defecto: 5,
  },
  "seguridad.login_max_fallos_ip": {
    grupo: "ingreso",
    titulo: "Fallos por IP",
    defecto: 20,
  },
  "seguridad.login_max_fallos_email_global": {
    grupo: "ingreso",
    titulo: "Fallos por correo desde cualquier IP",
    defecto: 30,
  },
  "seguridad.login_ventana_minutos": {
    grupo: "ingreso",
    titulo: "Ventana de conteo",
    defecto: 15,
  },
  "seguridad.login_bloqueo_minutos": {
    grupo: "ingreso",
    titulo: "Duración del bloqueo",
    defecto: 15,
  },
  "seguridad.paises_habituales": {
    grupo: "paises",
    titulo: "Países habituales",
    defecto: ["CO"],
  },
  "retencion.accesos_dias": {
    grupo: "retencion",
    titulo: "Registro de accesos",
    defecto: 365,
    impacto:
      "La purga diaria borra de forma definitiva lo que supere el nuevo plazo.",
  },
  "retencion.bitacora_dias": {
    grupo: "retencion",
    titulo: "Bitácora de auditoría",
    defecto: 1825,
    impacto:
      "La purga diaria borra de forma definitiva lo que supere el nuevo plazo.",
  },
  "retencion.intentos_login_dias": {
    grupo: "retencion",
    titulo: "Intentos de ingreso",
    defecto: 30,
  },
  "retencion.notificaciones_dias": {
    grupo: "retencion",
    titulo: "Notificaciones leídas",
    defecto: 180,
  },
  "archivos.vigencia_url_firmada_segundos": {
    grupo: "archivos",
    titulo: "Vigencia de los enlaces de descarga",
    defecto: 300,
  },
  "archivos.max_creativo_mb": {
    grupo: "archivos",
    titulo: "Tamaño máximo de un creativo",
    defecto: 50,
    impacto:
      "No puede superar el límite del plan de almacenamiento (50 MB en el plan gratuito).",
  },
  "tributario.reteica_municipio_base": {
    grupo: "tributario",
    titulo: "Municipio base de ReteICA",
    defecto: "MEDIO",
  },
  "tributario.municipio_plataforma": {
    grupo: "tributario",
    titulo: "Domicilio fiscal de AMO",
    defecto: "11001",
  },
  "tributario.politica_seg_social": {
    grupo: "tributario",
    titulo: "Seguridad social sin aprobar",
    defecto: "ALERTA",
  },
  "facturacion.iva": {
    grupo: "facturacion",
    titulo: "Tarifa de IVA",
    defecto: 0.19,
  },
  "facturacion.dias_vencimiento": {
    grupo: "facturacion",
    titulo: "Plazo de pago",
    defecto: 30,
  },
  "liquidaciones.periodicidad": {
    grupo: "liquidaciones",
    titulo: "Periodicidad",
    defecto: "QUINCENAL",
  },
  "liquidaciones.dias_pago": {
    grupo: "liquidaciones",
    titulo: "Días para pagar",
    defecto: 8,
  },
}

/** Nombres legibles de las opciones de los parámetros TEXTO y LISTA_TEXTO. */
export const ETIQUETAS_OPCION: Readonly<Record<string, string>> = {
  H24: "24 horas",
  H72: "72 horas",
  D7: "7 días",
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
  MEDIO: "Municipio del medio",
  PLATAFORMA: "Domicilio de AMO",
  ALERTA: "Solo alertar",
  BLOQUEAR: "Bloquear la aprobación",
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
}

export function etiquetaOpcion(
  opcion: string,
  extra?: Readonly<Record<string, string>>
): string {
  return extra?.[opcion] ?? ETIQUETAS_OPCION[opcion] ?? opcion
}

/** Parámetros cuyas opciones viven en otras tablas (validación por subconsulta en la BD). */
export const CLAVE_PAISES_HABITUALES = "seguridad.paises_habituales"
export const CLAVE_MUNICIPIO_PLATAFORMA = "tributario.municipio_plataforma"

const GRUPOS_POR_ID = new Map(GRUPOS.map((grupo) => [grupo.id, grupo]))

function humanizarClave(clave: string): string {
  const ultima = clave.split(".").at(-1) ?? clave
  const texto = ultima.replace(/_/g, " ")
  return texto.charAt(0).toLocaleUpperCase("es-CO") + texto.slice(1)
}

export function fichaDe(clave: string): FichaParametro | null {
  return FICHAS[clave] ?? null
}

export function tituloParametro(clave: string): string {
  return FICHAS[clave]?.titulo ?? humanizarClave(clave)
}

export function grupoDe(clave: string): GrupoParametros {
  const id = FICHAS[clave]?.grupo ?? GRUPO_OTROS
  return (
    GRUPOS_POR_ID.get(id) ?? (GRUPOS_POR_ID.get(GRUPO_OTROS) as GrupoParametros)
  )
}

/** Las comisiones exigen además `configuracion.comisiones` (RLS de §3.2). */
export function exigeComisiones(clave: string): boolean {
  return clave.startsWith("comision.")
}

export interface GrupoConParametros<P extends { clave: string }> {
  grupo: GrupoParametros
  parametros: P[]
}

/**
 * Parámetros de una sección agrupados en el orden del catálogo (y, dentro de
 * cada grupo, en el orden de las fichas). Los grupos vacíos se omiten.
 */
export function agruparParametros<P extends { clave: string }>(
  parametros: readonly P[],
  seccion: Seccion
): GrupoConParametros<P>[] {
  const orden = Object.keys(FICHAS)
  const posicion = (clave: string) => {
    const indice = orden.indexOf(clave)
    return indice === -1 ? Number.MAX_SAFE_INTEGER : indice
  }
  return GRUPOS.filter((grupo) => grupo.seccion === seccion)
    .map((grupo) => ({
      grupo,
      parametros: parametros
        .filter((p) => grupoDe(p.clave).id === grupo.id)
        .sort(
          (a, b) =>
            posicion(a.clave) - posicion(b.clave) ||
            a.clave.localeCompare(b.clave)
        ),
    }))
    .filter(({ parametros: lista }) => lista.length > 0)
}

/** Parámetros de un grupo concreto (para tarjetas con diseño propio). */
export function parametrosDelGrupo<P extends { clave: string }>(
  parametros: readonly P[],
  grupo: string
): P[] {
  const seccion = GRUPOS_POR_ID.get(grupo)?.seccion
  if (!seccion) return []
  return (
    agruparParametros(parametros, seccion).find((g) => g.grupo.id === grupo)
      ?.parametros ?? []
  )
}
