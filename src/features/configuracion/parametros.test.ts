import { describe, expect, it } from "vitest"

import {
  agruparParametros,
  exigeComisiones,
  FICHAS,
  GRUPO_OTROS,
  GRUPOS,
  grupoDe,
  parametrosDelGrupo,
  tituloParametro,
} from "./parametros"
import { esquemaValorParametro } from "./schemas"
import { SECCIONES } from "./secciones"
import type { ReglasParametro } from "./tipos"

type Regla = [
  clave: string,
  tipo: ReglasParametro["tipo"],
  minimo: number | null,
  maximo: number | null,
  opciones?: string[],
]

/** Las 53 claves sembradas (docs/modelo-datos.md §7) con sus reglas reales. */
const SEMILLA: readonly Regla[] = [
  ["comision.porcentaje_global", "PORCENTAJE", 0, 0.5],
  ["comision.visible_para_medio", "BOOLEANO", null, null],
  ["campanas.tope_porcentaje_por_medio", "PORCENTAJE", 0.01, 1],
  ["ofertas.anticipacion_minima_horas", "ENTERO", 0, 720],
  ["ofertas.minimo_medios", "ENTERO", 1, 500],
  ["medios.umbral_seguidores", "ENTERO", 1000, 1000000],
  ["medios.reverificacion_dias", "ENTERO", 7, 365],
  ["medios.reverificacion_gracia_dias", "ENTERO", 0, 60],
  ["medios.codigo_verificacion_minutos", "ENTERO", 5, 1440],
  ["medios.n_minimo_cumplimiento", "ENTERO", 1, 100],
  ["medios.dias_actividad", "ENTERO", 7, 365],
  ["medios.dias_riesgo_sin_aceptar", "ENTERO", 7, 180],
  [
    "metricas.cortes_requeridos",
    "LISTA_TEXTO",
    null,
    null,
    ["H24", "H72", "D7"],
  ],
  ["metricas.plazo_carga_horas", "ENTERO", 1, 336],
  ["metricas.factor_desviacion", "DECIMAL", 1.5, 10],
  ["metricas.minimo_historial", "ENTERO", 1, 50],
  [
    "metricas.multiplo_alcance_seguidores",
    "MAPA_DECIMAL",
    1,
    100,
    ["FACEBOOK", "INSTAGRAM", "TIKTOK"],
  ],
  ["calidad.multiplicador_piso", "DECIMAL", 0.5, 1],
  ["calidad.multiplicador_techo", "DECIMAL", 1, 2],
  ["calidad.minimo_publicaciones", "ENTERO", 1, 50],
  ["calidad.ventana_publicaciones", "ENTERO", 5, 100],
  ["calidad.corte_referencia", "TEXTO", null, null, ["H24", "H72", "D7"]],
  ["calidad.dias_aviso_cambio", "ENTERO", 0, 30],
  ["precios.redondeo", "ENTERO", 1, 1000],
  ["precios.recargo_exclusividad", "DECIMAL", 1, 3],
  ["disputas.plazo_vencida_horas", "ENTERO", 1, 720],
  ["disputas.plazo_recarga_horas", "ENTERO", 1, 168],
  [
    "liquidaciones.periodicidad",
    "TEXTO",
    null,
    null,
    ["SEMANAL", "QUINCENAL", "MENSUAL"],
  ],
  ["liquidaciones.dias_pago", "ENTERO", 0, 90],
  ["facturacion.dias_vencimiento", "ENTERO", 0, 120],
  ["facturacion.iva", "PORCENTAJE", 0, 0.5],
  [
    "tributario.reteica_municipio_base",
    "TEXTO",
    null,
    null,
    ["MEDIO", "PLATAFORMA"],
  ],
  ["tributario.municipio_plataforma", "TEXTO", null, null],
  [
    "tributario.politica_seg_social",
    "TEXTO",
    null,
    null,
    ["ALERTA", "BLOQUEAR"],
  ],
  ["analitica.n_minimo_tasas", "ENTERO", 1, 1000],
  ["analitica.umbral_variacion", "PORCENTAJE", 0.01, 1],
  ["seguridad.inactividad_minutos_admin", "ENTERO", 5, 480],
  ["seguridad.inactividad_minutos_anunciante", "ENTERO", 5, 1440],
  ["seguridad.inactividad_minutos_medio", "ENTERO", 5, 10080],
  ["seguridad.aviso_inactividad_segundos", "ENTERO", 30, 600],
  ["seguridad.sesion_actividad_throttle_segundos", "ENTERO", 15, 600],
  ["seguridad.login_max_fallos_email", "ENTERO", 3, 20],
  ["seguridad.login_max_fallos_ip", "ENTERO", 5, 200],
  ["seguridad.login_max_fallos_email_global", "ENTERO", 10, 500],
  ["seguridad.login_ventana_minutos", "ENTERO", 1, 1440],
  ["seguridad.login_bloqueo_minutos", "ENTERO", 1, 1440],
  ["seguridad.paises_habituales", "LISTA_TEXTO", null, null],
  ["retencion.accesos_dias", "ENTERO", 30, 1825],
  ["retencion.bitacora_dias", "ENTERO", 365, 3650],
  ["retencion.intentos_login_dias", "ENTERO", 1, 365],
  ["retencion.notificaciones_dias", "ENTERO", 7, 730],
  ["archivos.vigencia_url_firmada_segundos", "ENTERO", 30, 3600],
  ["archivos.max_creativo_mb", "ENTERO", 1, 500],
]

function reglas([
  clave,
  tipo,
  minimo,
  maximo,
  opciones,
]: Regla): ReglasParametro {
  return { clave, tipo, minimo, maximo, opciones: opciones ?? null }
}

describe("catálogo de parámetros", () => {
  it("cubre exactamente las 53 claves sembradas", () => {
    expect(SEMILLA).toHaveLength(53)
    expect(Object.keys(FICHAS).sort()).toEqual(SEMILLA.map(([c]) => c).sort())
  })

  it.each(SEMILLA.map((regla) => [regla[0], regla] as const))(
    "%s: el valor de fábrica cumple las reglas de la BD",
    (_clave, regla) => {
      const ficha = FICHAS[regla[0]]
      expect(
        esquemaValorParametro(reglas(regla)).safeParse(ficha.defecto).success
      ).toBe(true)
    }
  )

  it("cada ficha apunta a un grupo existente y cada sección con grupos es válida", () => {
    const ids = new Set(GRUPOS.map((g) => g.id))
    for (const ficha of Object.values(FICHAS))
      expect(ids.has(ficha.grupo)).toBe(true)
    for (const grupo of GRUPOS) expect(SECCIONES).toContain(grupo.seccion)
    expect(ids.size).toBe(GRUPOS.length)
  })

  it("una clave desconocida cae en «Otros parámetros» con un título legible", () => {
    expect(grupoDe("nuevo.limite_diario").id).toBe(GRUPO_OTROS)
    expect(tituloParametro("nuevo.limite_diario")).toBe("Limite diario")
    expect(tituloParametro("comision.porcentaje_global")).toBe(
      "Comisión global"
    )
  })

  it("agrupa por sección en el orden del catálogo y omite grupos vacíos", () => {
    const parametros = [
      { clave: "disputas.plazo_recarga_horas" },
      { clave: "comision.visible_para_medio" },
      { clave: "comision.porcentaje_global" },
      { clave: "medios.umbral_seguidores" },
      { clave: "nuevo.cosa" },
    ]
    const grupos = agruparParametros(parametros, "comercial")
    expect(grupos.map((g) => g.grupo.id)).toEqual([
      "comision",
      "disputas",
      GRUPO_OTROS,
    ])
    expect(grupos[0].parametros.map((p) => p.clave)).toEqual([
      "comision.porcentaje_global",
      "comision.visible_para_medio",
    ])
    expect(parametrosDelGrupo(parametros, "elegibilidad")).toEqual([
      { clave: "medios.umbral_seguidores" },
    ])
    expect(parametrosDelGrupo(parametros, "inexistente")).toEqual([])
  })

  it("las claves de comisión exigen el permiso de comisiones", () => {
    expect(exigeComisiones("comision.porcentaje_global")).toBe(true)
    expect(exigeComisiones("campanas.tope_porcentaje_por_medio")).toBe(false)
  })
})
