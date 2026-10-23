// @vitest-environment node
/**
 * Acciones de la ejecución con el DAL, Supabase y Storage simulados: autorizan
 * y validan antes de tocar la BD, aplican las reglas de la oferta leídas con
 * la sesión, verifican que la captura sea de la carpeta de la asignación y
 * escriben solo lo que la BD deja (evidencia por la RPC con actor y sesión;
 * métricas con la sesión, sin las columnas que deriva el trigger).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ArchivoSubido } from "@/lib/archivos/tipos"
import { MENSAJE_INESPERADO } from "@/lib/errores-bd"

import { VALORES_VACIOS } from "./campos-metricas"
import type {
  AsignacionEjecucion,
  ContextoEvidencia,
  ContextoMetricas,
  MetricaEjecucion,
  PublicacionEjecucion,
} from "./tipos"

const MEDIO = "0192f1c2-5b6a-7d00-8000-000000000001"
const ASIGNACION_ID = "0192f1c2-5b6a-7d00-8000-0000000000a1"
const PUBLICACION_ID = "0192f1c2-5b6a-7d00-8000-0000000000b1"
const METRICA_ID = "0192f1c2-5b6a-7d00-8000-0000000000d1"
const UUID_ARCHIVO = "0192f1c2-5b6a-7d00-8000-0000000000f1"
// 3:00 p. m. del 23 de octubre en Bogotá.
const AHORA = new Date("2026-10-23T20:00:00.000Z")

/** Respuestas de la BD simulada por tabla y operación. */
interface Respuesta {
  data: unknown
  error: unknown
}

const estado = vi.hoisted(() => ({
  orden: [] as string[],
  usuario: { id: "u1", medioId: null as string | null },
  rpc: { data: null as unknown, error: null as unknown },
  respuestas: {} as Record<string, Respuesta>,
  llamadas: [] as { tabla: string; operacion: string; valores?: unknown }[],
}))

const simulados = vi.hoisted(() => ({
  rpc: vi.fn(),
  confirmarObjeto: vi.fn(),
  contextoEvidencia: vi.fn(),
  contextoMetricas: vi.fn(),
  estadoActualAsignacion: vi.fn(),
}))

/** Cliente de sesión mínimo: encadena filtros y responde por tabla.operación. */
function clienteSimulado() {
  return {
    from(tabla: string) {
      let operacion = "select"
      const consulta = {
        select: () => consulta,
        eq: () => consulta,
        update(valores: unknown) {
          operacion = "update"
          estado.llamadas.push({ tabla, operacion, valores })
          return consulta
        },
        insert(valores: unknown) {
          operacion = "insert"
          estado.llamadas.push({ tabla, operacion, valores })
          return consulta
        },
        maybeSingle: async () =>
          estado.respuestas[`${tabla}.${operacion}`] ?? {
            data: null,
            error: null,
          },
        single: async () =>
          estado.respuestas[`${tabla}.${operacion}`] ?? {
            data: null,
            error: null,
          },
      }
      return consulta
    },
  }
}

vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth/dal", () => ({
  requerirPermiso: vi.fn(async (permiso: string) => {
    estado.orden.push(`dal:${permiso}`)
    return estado.usuario
  }),
}))
vi.mock("@/lib/auth/contexto-actor", () => ({
  contextoDelActor: vi.fn(async (actor: { id: string }) => {
    estado.orden.push("contexto")
    return { actorId: actor.id, sessionId: "s1", admin: { rpc: simulados.rpc } }
  }),
}))
vi.mock("@/lib/supabase/server", () => ({
  crearClienteServidor: vi.fn(async () => clienteSimulado()),
}))
vi.mock("@/lib/storage/subidas", () => ({
  prepararSubidaFirmada: vi.fn(),
  confirmarObjeto: simulados.confirmarObjeto,
}))
vi.mock("@/lib/storage/descargas", () => ({
  MENSAJES_DESCARGA: { noEncontrado: "no-encontrado" },
  firmarDescarga: vi.fn(),
}))
vi.mock("./queries", () => ({
  contextoEvidencia: simulados.contextoEvidencia,
  contextoMetricas: simulados.contextoMetricas,
  estadoActualAsignacion: simulados.estadoActualAsignacion,
}))

const { registrarEvidencia, guardarMetricas } = await import("./actions")
const { MENSAJES_EJECUCION } = await import("./errores")

const ASIGNACION: AsignacionEjecucion = {
  id: ASIGNACION_ID,
  estado: "CONTENIDO_ENTREGADO",
  plataforma: "INSTAGRAM",
  formatoClave: "REEL",
  formatoNombre: "Reel",
  ofertaTitulo: "Lanzamiento",
  marca: "Café",
  handle: "noticias",
  publicaciones: 1,
  ventanaInicio: "2026-10-20T05:00:00.000Z",
  ventanaFin: "2026-10-30T04:59:00.000Z",
  contenidoDescargadoAt: "2026-10-20T14:00:00.000Z",
  fechaLimitePublicacion: "2026-10-30T04:59:00.000Z",
  cortesRequeridos: ["H24", "H72"],
  permanenciaMinimaDias: 7,
  reclamoHasta: null,
}

const PUBLICACION: PublicacionEjecucion = {
  id: PUBLICACION_ID,
  numero: 1,
  urlPost: "https://www.instagram.com/reel/C9AbCdEfGhI",
  fechaPublicacion: "2026-10-21T19:00:00.000Z",
  estado: "PENDIENTE",
  observaciones: null,
  conMiniatura: true,
  actualizadaAt: "2026-10-21T19:00:00.000Z",
}

function captura(tipo: "publicacion" | "metrica"): ArchivoSubido {
  const carpeta = `asignacion/${ASIGNACION_ID}/${tipo}`
  return {
    nombre: "panel.png",
    tipo: "image/webp",
    tamano: 2048,
    sha256: null,
    dimensiones: null,
    duracionSeg: null,
    conMiniatura: true,
    bucket: "evidencias",
    ruta: `${carpeta}/${UUID_ARCHIVO}.webp`,
    rutaMiniatura: `${carpeta}/${UUID_ARCHIVO}-min.webp`,
  }
}

function contextoEvidencia(
  cambios: Partial<ContextoEvidencia> = {}
): ContextoEvidencia {
  return {
    asignacion: ASIGNACION,
    numero: 1,
    publicacion: null,
    publicaciones: [],
    contenido: { vigente: null, versionDescargada: 1 },
    ...cambios,
  }
}

const EVIDENCIA = {
  asignacionId: ASIGNACION_ID,
  numero: 1,
  url: "https://www.instagram.com/reel/C9AbCdEfGhI/?igsh=abc",
  dia: "2026-10-22",
  hora: "19:30",
  etiquetaConfirmada: true,
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  vi.clearAllMocks()
  estado.orden = []
  estado.usuario = { id: "u1", medioId: MEDIO }
  estado.rpc = { data: PUBLICACION_ID, error: null }
  estado.respuestas = {}
  estado.llamadas = []
  simulados.rpc.mockImplementation(async () => {
    estado.orden.push("rpc")
    return estado.rpc
  })
  simulados.confirmarObjeto.mockResolvedValue({ ok: true, datos: {} })
  simulados.contextoEvidencia.mockResolvedValue(contextoEvidencia())
  simulados.estadoActualAsignacion.mockResolvedValue("PUBLICADA")
})

afterEach(() => {
  vi.useRealTimers()
})

describe("registrarEvidencia (MED-013)", () => {
  it("autoriza, valida y registra con la URL canónica, la fecha y la captura verificada", async () => {
    const resultado = await registrarEvidencia({
      ...EVIDENCIA,
      captura: captura("publicacion"),
    })
    expect(resultado).toEqual({
      ok: true,
      datos: { publicacionId: PUBLICACION_ID, estadoAsignacion: "PUBLICADA" },
    })
    expect(estado.orden).toEqual([
      "dal:asignaciones.ejecutar",
      "contexto",
      "rpc",
    ])
    expect(simulados.rpc).toHaveBeenCalledWith("registrar_evidencia_srv", {
      p_asignacion_id: ASIGNACION_ID,
      p_numero: 1,
      p_url: "https://www.instagram.com/reel/C9AbCdEfGhI",
      p_fecha_publicacion: "2026-10-23T00:30:00.000Z",
      p_captura_path: captura("publicacion").ruta,
      p_miniatura_path: captura("publicacion").rutaMiniatura,
      p_etiqueta_confirmada: true,
      p_actor_id: "u1",
      p_session_id: "s1",
    })
  })

  it("sin medio en la sesión no llega a la BD", async () => {
    estado.usuario = { id: "u1", medioId: null }
    const resultado = await registrarEvidencia({ ...EVIDENCIA, captura: null })
    expect(resultado).toEqual({ ok: false, error: MENSAJES_EJECUCION.sinMedio })
    expect(simulados.contextoEvidencia).not.toHaveBeenCalled()
  })

  it("rechaza una captura que no es de la carpeta de la asignación", async () => {
    const ajena = {
      ...captura("publicacion"),
      ruta: `asignacion/${METRICA_ID}/publicacion/${UUID_ARCHIVO}.webp`,
      rutaMiniatura: null,
    }
    const resultado = await registrarEvidencia({ ...EVIDENCIA, captura: ajena })
    expect(resultado).toMatchObject({
      ok: false,
      erroresCampo: { captura: [MENSAJES_EJECUCION.capturaAjena] },
    })
    expect(simulados.rpc).not.toHaveBeenCalled()
  })

  it("aplica las reglas de la oferta en el servidor (enlace de otra red)", async () => {
    const resultado = await registrarEvidencia({
      ...EVIDENCIA,
      url: "https://www.tiktok.com/@a/video/7412345678901234567",
      captura: captura("publicacion"),
    })
    expect(resultado).toMatchObject({
      ok: false,
      erroresCampo: { url: [expect.stringMatching(/es de TikTok/)] },
    })
    expect(simulados.rpc).not.toHaveBeenCalled()
  })

  it("no registra una publicación anterior a la descarga del contenido", async () => {
    simulados.contextoEvidencia.mockResolvedValue(
      contextoEvidencia({
        asignacion: {
          ...ASIGNACION,
          // 2:40:30 p. m. del 22 en Bogotá: vale desde las 2:40 p. m.
          contenidoDescargadoAt: "2026-10-22T19:40:30.000Z",
        },
      })
    )
    const antes = await registrarEvidencia({
      ...EVIDENCIA,
      dia: "2026-10-22",
      hora: "14:39",
      captura: captura("publicacion"),
    })
    expect(antes).toMatchObject({
      ok: false,
      erroresCampo: {
        hora: [
          expect.stringMatching(
            /^La publicación no puede ser anterior a la descarga del contenido/
          ),
        ],
      },
    })
    expect(simulados.rpc).not.toHaveBeenCalled()

    const mismoMinuto = await registrarEvidencia({
      ...EVIDENCIA,
      dia: "2026-10-22",
      hora: "14:40",
      captura: captura("publicacion"),
    })
    expect(mismoMinuto.ok).toBe(true)
  })

  it("no registra el video de otra cuenta (S2)", async () => {
    simulados.contextoEvidencia.mockResolvedValue(
      contextoEvidencia({
        asignacion: {
          ...ASIGNACION,
          plataforma: "TIKTOK",
          formatoClave: "VIDEO",
          handle: "noticias.cucuta",
        },
      })
    )
    const resultado = await registrarEvidencia({
      ...EVIDENCIA,
      url: "https://www.tiktok.com/@medio_b/video/7412345678901234567",
      captura: captura("publicacion"),
    })
    expect(resultado).toMatchObject({
      ok: false,
      erroresCampo: {
        url: [
          "El enlace es de @medio_b y esta campaña es con @noticias.cucuta. Pega el enlace de la publicación en tu cuenta.",
        ],
      },
    })
    expect(simulados.rpc).not.toHaveBeenCalled()
  })

  it("al corregir sin elegir otra captura conserva la anterior", async () => {
    simulados.contextoEvidencia.mockResolvedValue(
      contextoEvidencia({
        publicacion: { ...PUBLICACION, estado: "RECHAZADA" },
      })
    )
    estado.respuestas["publicaciones.select"] = {
      data: { captura_path: "anterior.webp", miniatura_path: null },
      error: null,
    }
    await registrarEvidencia({ ...EVIDENCIA, captura: null })
    expect(simulados.rpc).toHaveBeenCalledWith(
      "registrar_evidencia_srv",
      expect.objectContaining({
        p_captura_path: "anterior.webp",
        p_miniatura_path: null,
      })
    )
  })

  it("una evidencia nueva sin captura no se registra (INT-001)", async () => {
    const resultado = await registrarEvidencia({ ...EVIDENCIA, captura: null })
    expect(resultado).toMatchObject({
      ok: false,
      erroresCampo: { captura: [MENSAJES_EJECUCION.capturaRequerida] },
    })
    expect(simulados.rpc).not.toHaveBeenCalled()
  })

  it("si la asignación ya no admite evidencias, no llama a la RPC", async () => {
    simulados.contextoEvidencia.mockResolvedValue(
      contextoEvidencia({
        asignacion: { ...ASIGNACION, estado: "VERIFICADA" },
      })
    )
    const resultado = await registrarEvidencia({
      ...EVIDENCIA,
      captura: captura("publicacion"),
    })
    expect(resultado).toEqual({
      ok: false,
      error: MENSAJES_EJECUCION.evidenciaCerrada,
    })
    expect(simulados.rpc).not.toHaveBeenCalled()
  })

  it("una URL ya registrada vuelve al campo del enlace (INT-002)", async () => {
    estado.rpc = {
      data: null,
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "publicaciones_url_post_key"',
      },
    }
    const resultado = await registrarEvidencia({
      ...EVIDENCIA,
      captura: captura("publicacion"),
    })
    expect(resultado).toMatchObject({
      ok: false,
      erroresCampo: { url: [MENSAJES_EJECUCION.urlRepetida] },
    })
  })

  it("la versión del contenido sin descargar se explica (NOT-006)", async () => {
    estado.rpc = {
      data: null,
      error: {
        code: "P0001",
        message: "AMO_CREATIVO_DESACTUALIZADO",
        details: "Descarga la versión vigente del creativo antes de publicar.",
      },
    }
    const resultado = await registrarEvidencia({
      ...EVIDENCIA,
      captura: captura("publicacion"),
    })
    expect(resultado).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Descarga la versión vigente/),
    })
  })

  it("un error inesperado no expone el mensaje técnico", async () => {
    estado.rpc = { data: null, error: { code: "XX000", message: "boom" } }
    const silencio = vi.spyOn(console, "error").mockImplementation(() => {})
    const resultado = await registrarEvidencia({
      ...EVIDENCIA,
      captura: captura("publicacion"),
    })
    expect(resultado).toEqual({ ok: false, error: MENSAJE_INESPERADO })
    silencio.mockRestore()
  })
})

// ── Métricas ─────────────────────────────────────────────────────────────────

function metrica(cambios: Partial<MetricaEjecucion> = {}): MetricaEjecucion {
  return {
    id: METRICA_ID,
    corte: "H24",
    fechaCorte: "2026-10-22T20:00:00.000Z",
    periodoDesde: null,
    periodoHasta: null,
    valores: {
      ...VALORES_VACIOS,
      alcance: 1000,
      impresiones: 2000,
      meGusta: 10,
    },
    estado: "PENDIENTE",
    observaciones: null,
    conMiniatura: true,
    ...cambios,
  }
}

function contextoMetricas(
  cambios: Partial<ContextoMetricas> = {}
): ContextoMetricas {
  return {
    asignacion: { ...ASIGNACION, estado: "EVIDENCIA_VALIDADA" },
    numero: 1,
    publicacion: { ...PUBLICACION, estado: "APROBADA" },
    publicaciones: [PUBLICACION],
    corte: "H24",
    metrica: null,
    otros: [],
    toleranciaCortes: 0.02,
    plazoCargaHoras: 48,
    ...cambios,
  }
}

const CIFRAS = {
  alcance: "1.200",
  impresiones: "2.500",
  reproducciones: "3.100",
  espectadoresUnicos: "",
  meGusta: "150",
  comentarios: "12",
  compartidos: "8",
  guardados: "20",
  clicsEnlace: "",
  visitasPerfil: "",
  tiempoPromedioS: "",
  porcentajeCompleto: "",
}

const METRICAS = {
  asignacionId: ASIGNACION_ID,
  numero: 1,
  corte: "H24" as const,
  metricaId: null,
  dia: "2026-10-23",
  hora: "14:30",
  periodoDesde: "",
  periodoHasta: "",
  ...CIFRAS,
}

describe("guardarMetricas (MED-014)", () => {
  beforeEach(() => {
    simulados.contextoMetricas.mockResolvedValue(contextoMetricas())
    simulados.estadoActualAsignacion.mockResolvedValue("EVIDENCIA_VALIDADA")
    estado.respuestas["metricas.insert"] = {
      data: { id: "nueva" },
      error: null,
    }
    estado.respuestas["metricas.update"] = {
      data: { id: METRICA_ID, estado_validacion: "PENDIENTE" },
      error: null,
    }
  })

  it("inserta un corte nuevo con la sesión y sin las columnas que deriva la BD", async () => {
    const resultado = await guardarMetricas({
      ...METRICAS,
      captura: captura("metrica"),
    })
    expect(resultado).toEqual({
      ok: true,
      datos: { metricaId: "nueva", estadoAsignacion: "EVIDENCIA_VALIDADA" },
    })
    expect(simulados.rpc).not.toHaveBeenCalled()
    const [insercion] = estado.llamadas
    expect(insercion).toMatchObject({ tabla: "metricas", operacion: "insert" })
    expect(insercion?.valores).toEqual({
      publicacion_id: PUBLICACION_ID,
      corte: "H24",
      fecha_corte: "2026-10-23T19:30:00.000Z",
      periodo_desde: null,
      periodo_hasta: null,
      alcance: 1200,
      impresiones: 2500,
      reproducciones: 3100,
      espectadores_unicos: null,
      me_gusta: 150,
      comentarios: 12,
      compartidos: 8,
      guardados: 20,
      clics_enlace: null,
      visitas_perfil: null,
      tiempo_promedio_visualizacion_s: null,
      porcentaje_reproduccion_completa: null,
      captura_path: captura("metrica").ruta,
      miniatura_path: captura("metrica").rutaMiniatura,
    })
  })

  it("INT-005: valida la coherencia con los otros cortes antes de escribir", async () => {
    simulados.contextoMetricas.mockResolvedValue(
      contextoMetricas({
        corte: "H24",
        otros: [
          metrica({
            id: "h72",
            corte: "H72",
            valores: {
              ...VALORES_VACIOS,
              alcance: 1000,
              impresiones: 1500,
              meGusta: 1,
            },
          }),
        ],
      })
    )
    const resultado = await guardarMetricas({
      ...METRICAS,
      captura: captura("metrica"),
    })
    expect(resultado).toMatchObject({
      ok: false,
      erroresCampo: {
        alcance: [expect.stringMatching(/^En el corte de 72 horas/)],
      },
    })
    expect(estado.llamadas).toEqual([])
  })

  it("corrige el corte existente con un update y conserva su captura", async () => {
    simulados.contextoMetricas.mockResolvedValue(
      contextoMetricas({ metrica: metrica({ estado: "RECHAZADA" }) })
    )
    const resultado = await guardarMetricas({ ...METRICAS, captura: null })
    expect(resultado.ok).toBe(true)
    const [cambio] = estado.llamadas
    expect(cambio).toMatchObject({ tabla: "metricas", operacion: "update" })
    expect(cambio?.valores).not.toHaveProperty("captura_path")
  })

  it("reenviar sin cambios una métrica rechazada no la da por corregida", async () => {
    simulados.contextoMetricas.mockResolvedValue(
      contextoMetricas({ metrica: metrica({ estado: "RECHAZADA" }) })
    )
    // Sin cambios, la BD la deja RECHAZADA (`fn_metricas_guardar_edicion`).
    estado.respuestas["metricas.update"] = {
      data: { id: METRICA_ID, estado_validacion: "RECHAZADA" },
      error: null,
    }
    const resultado = await guardarMetricas({ ...METRICAS, captura: null })
    expect(resultado).toEqual({
      ok: false,
      error: MENSAJES_EJECUCION.correccionSinCambios,
    })
    expect(simulados.estadoActualAsignacion).not.toHaveBeenCalled()
  })

  it("si la RLS ya no deja corregirlo, lo explica", async () => {
    simulados.contextoMetricas.mockResolvedValue(
      contextoMetricas({ metrica: metrica() })
    )
    estado.respuestas["metricas.update"] = { data: null, error: null }
    const resultado = await guardarMetricas({ ...METRICAS, captura: null })
    expect(resultado).toEqual({
      ok: false,
      error: MENSAJES_EJECUCION.metricaCerrada,
    })
  })

  it("una métrica aprobada no se toca", async () => {
    simulados.contextoMetricas.mockResolvedValue(
      contextoMetricas({ metrica: metrica({ estado: "APROBADA" }) })
    )
    const resultado = await guardarMetricas({ ...METRICAS, captura: null })
    expect(resultado).toEqual({
      ok: false,
      error: MENSAJES_EJECUCION.metricaCerrada,
    })
    expect(estado.llamadas).toEqual([])
  })

  it("un corte nuevo sin captura no se registra (INT-001)", async () => {
    const resultado = await guardarMetricas({ ...METRICAS, captura: null })
    expect(resultado).toMatchObject({
      ok: false,
      erroresCampo: { captura: [MENSAJES_EJECUCION.capturaRequerida] },
    })
  })

  describe("personalizado", () => {
    const PERSONALIZADO = {
      ...METRICAS,
      corte: "PERSONALIZADO" as const,
      periodoDesde: "2026-10-21",
      periodoHasta: "2026-10-22",
    }
    const existente = metrica({
      corte: "PERSONALIZADO",
      periodoDesde: "2026-10-21T05:00:00.000Z",
      periodoHasta: "2026-10-23T05:00:00.000Z",
    })

    beforeEach(() => {
      simulados.contextoMetricas.mockResolvedValue(
        contextoMetricas({ corte: "PERSONALIZADO", otros: [existente] })
      )
    })

    it("el mismo periodo con otra captura se explica como repetido", async () => {
      estado.respuestas["metricas.select"] = {
        data: { captura_path: "otra.webp", estado_validacion: "PENDIENTE" },
        error: null,
      }
      const resultado = await guardarMetricas({
        ...PERSONALIZADO,
        captura: captura("metrica"),
      })
      expect(resultado).toMatchObject({
        ok: false,
        erroresCampo: { periodoDesde: [MENSAJES_EJECUCION.intervaloRepetido] },
      })
    })

    it("un reintento con la misma captura actualiza la misma fila", async () => {
      estado.respuestas["metricas.select"] = {
        data: {
          captura_path: captura("metrica").ruta,
          estado_validacion: "PENDIENTE",
        },
        error: null,
      }
      const resultado = await guardarMetricas({
        ...PERSONALIZADO,
        captura: captura("metrica"),
      })
      expect(resultado.ok).toBe(true)
      expect(estado.llamadas.map((l) => l.operacion)).toEqual(["update"])
    })
  })
})
