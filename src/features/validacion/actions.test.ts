// @vitest-environment node
/**
 * Acciones de la validación con el DAL, las RPC, la transición y las
 * lecturas simulados: autorizan antes que nada, mandan a la BD exactamente lo
 * decidido, traducen los `hint` de la fase y revalidan la ficha y la cola.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { VALORES_VACIOS } from "@/features/ejecucion/campos-metricas"

import { frasePermanenciaPendiente } from "./decision"
import { MENSAJES_VALIDACION } from "./errores"
import type { MetricaParaCorregir } from "./tipos"

const ASIGNACION = "0192f3a4-5b6c-7d8e-9f01-0000000000a1"
const PUBLICACION = "0192f3a4-5b6c-7d8e-9f01-0000000000b1"
const METRICA = "0192f3a4-5b6c-7d8e-9f01-0000000000c1"
const PERMANENCIA = "2026-10-30T15:00:00+00:00"
/** `updated_at` tal cual lo entrega la BD (con microsegundos). */
const VERSION = "2026-10-22T16:00:00.123456+00:00"

const estado = vi.hoisted(() => ({
  orden: [] as string[],
  permisos: ["evidencias.validar", "metricas.validar"] as string[],
  rpc: [] as { nombre: string; argumentos: Record<string, unknown> }[],
  respuesta: { data: null as unknown, error: null as unknown },
  transiciones: [] as unknown[],
  errorTransicion: null as unknown,
  revalidadas: [] as string[],
  estadoAsignacion: "METRICAS_CARGADAS" as string | null,
  lecturaCorreccion: null as unknown,
}))

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn((ruta: string) => {
    estado.revalidadas.push(ruta)
  }),
}))
vi.mock("@/lib/auth/dal", () => ({
  requerirPermiso: vi.fn(async (permiso: string) => {
    estado.orden.push(`dal:${permiso}`)
    return { id: "u1", permisos: estado.permisos }
  }),
  tieneAlgunPermiso: (usuario: { permisos: string[] }, permisos: string[]) =>
    permisos.some((permiso) => usuario.permisos.includes(permiso)),
}))
vi.mock("@/lib/auth/contexto-actor", () => ({
  contextoDelActor: vi.fn(async () => {
    estado.orden.push("contexto")
    return {
      actorId: "u1",
      sessionId: "s1",
      admin: {
        rpc: async (nombre: string, argumentos: Record<string, unknown>) => {
          estado.rpc.push({ nombre, argumentos })
          return estado.respuesta
        },
      },
    }
  }),
}))
vi.mock("@/lib/negocio/transicionar", () => ({
  transicionar: vi.fn(async (_contexto: unknown, solicitud: unknown) => {
    estado.transiciones.push(solicitud)
    return { data: null, error: estado.errorTransicion }
  }),
}))
vi.mock("./queries", () => ({
  estadoAsignacion: vi.fn(async () => estado.estadoAsignacion),
  permanenciaPendienteHasta: vi.fn(async () => PERMANENCIA),
  metricaParaCorregir: vi.fn(async () => estado.lecturaCorreccion),
}))

const {
  corregirMetrica,
  prepararCorreccionMetrica,
  validarEvidencia,
  validarMetrica,
  verificarAsignacion,
} = await import("./actions")

const RUTA_FICHA = `/operacion/asignaciones/${ASIGNACION}`
const RUTA_COLA = "/operacion/validacion"

beforeEach(() => {
  estado.orden = []
  estado.permisos = ["evidencias.validar", "metricas.validar"]
  estado.rpc = []
  estado.respuesta = {
    data: {
      asignacion_id: ASIGNACION,
      estado: "EVIDENCIA_VALIDADA",
      fecha_limite_publicacion: null,
    },
    error: null,
  }
  estado.transiciones = []
  estado.errorTransicion = null
  estado.revalidadas = []
  estado.estadoAsignacion = "METRICAS_CARGADAS"
  estado.lecturaCorreccion = null
})

describe("validarEvidencia (ADM-007)", () => {
  it("aprueba con la etiqueta verificada, después del DAL, y revalida ficha y cola", async () => {
    const resultado = await validarEvidencia({
      aprobar: true,
      publicacionId: PUBLICACION,
      enviadaAt: VERSION,
      etiquetaVerificada: true,
      observaciones: "",
    })
    expect(estado.orden).toEqual(["dal:evidencias.validar", "contexto"])
    expect(estado.rpc).toEqual([
      {
        nombre: "validar_evidencia_srv",
        argumentos: {
          p_publicacion_id: PUBLICACION,
          p_aprobar: true,
          p_etiqueta_verificada: true,
          p_observaciones: null,
          p_actor_id: "u1",
          p_session_id: "s1",
          p_enviada_at: VERSION,
        },
      },
    ])
    expect(estado.revalidadas).toEqual([RUTA_FICHA, RUTA_COLA])
    expect(resultado).toEqual({
      ok: true,
      datos: {
        asignacionId: ASIGNACION,
        estadoAsignacion: "EVIDENCIA_VALIDADA",
        fechaLimitePublicacion: null,
      },
    })
  })

  it("rechaza con observaciones y devuelve el plazo nuevo del medio", async () => {
    estado.respuesta = {
      data: {
        asignacion_id: ASIGNACION,
        estado: "CONTENIDO_ENTREGADO",
        fecha_limite_publicacion: "2026-10-24T15:00:00+00:00",
      },
      error: null,
    }
    const resultado = await validarEvidencia({
      aprobar: false,
      publicacionId: PUBLICACION,
      enviadaAt: VERSION,
      observaciones: "Falta la etiqueta de publicidad.",
    })
    expect(estado.rpc[0].argumentos).toMatchObject({
      p_aprobar: false,
      p_etiqueta_verificada: false,
      p_observaciones: "Falta la etiqueta de publicidad.",
    })
    expect(resultado.ok && resultado.datos.fechaLimitePublicacion).toBe(
      "2026-10-24T15:00:00+00:00"
    )
  })

  it("no llama a la BD si el formulario no es válido", async () => {
    const resultado = await validarEvidencia({
      aprobar: true,
      publicacionId: PUBLICACION,
      enviadaAt: VERSION,
      etiquetaVerificada: false,
      observaciones: "",
    })
    expect(estado.rpc).toEqual([])
    expect(resultado.ok).toBe(false)
    expect(!resultado.ok && resultado.erroresCampo).toEqual({
      etiquetaVerificada: [MENSAJES_VALIDACION.etiquetaRequerida],
    })
  })

  it("una asignación cerrada se explica y la cola se actualiza", async () => {
    estado.respuesta = {
      data: null,
      error: {
        code: "P0001",
        message: "AMO_TRANSICION_INVALIDA",
        hint: "asignacion_cerrada",
      },
    }
    const resultado = await validarEvidencia({
      aprobar: true,
      publicacionId: PUBLICACION,
      enviadaAt: VERSION,
      etiquetaVerificada: true,
      observaciones: "",
    })
    expect(resultado).toEqual({
      ok: false,
      error: MENSAJES_VALIDACION.asignacionCerrada,
    })
    expect(estado.revalidadas).toEqual([RUTA_COLA])
  })

  it("en disputa la evidencia se decide al resolverla (hint `en_disputa`)", async () => {
    estado.respuesta = {
      data: null,
      error: {
        code: "P0001",
        message: "AMO_TRANSICION_INVALIDA",
        details:
          "La asignación está en disputa: decide sobre la evidencia al resolverla.",
        hint: "en_disputa",
      },
    }
    const resultado = await validarEvidencia({
      aprobar: false,
      publicacionId: PUBLICACION,
      enviadaAt: VERSION,
      observaciones: "La captura no corresponde al post.",
    })
    expect(resultado).toEqual({
      ok: false,
      error: MENSAJES_VALIDACION.enDisputaEvidencia,
    })
    expect(estado.revalidadas).toEqual([RUTA_COLA])
  })
})

describe("validarEvidencia y validarMetrica · versión revisada (S3/C2)", () => {
  it("sin la versión que se vio no llama a la BD", async () => {
    const resultado = await validarEvidencia({
      aprobar: true,
      publicacionId: PUBLICACION,
      etiquetaVerificada: true,
      observaciones: "",
    } as Parameters<typeof validarEvidencia>[0])
    expect(estado.rpc).toEqual([])
    expect(resultado.ok).toBe(false)
  })

  it("si el medio cambió la evidencia, lo explica y actualiza la cola", async () => {
    estado.respuesta = {
      data: null,
      error: {
        code: "P0001",
        message: "AMO_TRANSICION_INVALIDA",
        details:
          "El medio cambió esta evidencia mientras la revisabas: vuelve a abrirla para revisar la versión actual.",
        hint: "evidencia_cambiada",
      },
    }
    const resultado = await validarEvidencia({
      aprobar: true,
      publicacionId: PUBLICACION,
      enviadaAt: VERSION,
      etiquetaVerificada: true,
      observaciones: "",
    })
    expect(estado.rpc[0].argumentos.p_enviada_at).toBe(VERSION)
    expect(resultado).toEqual({
      ok: false,
      error: MENSAJES_VALIDACION.evidenciaCambiada,
    })
    expect(estado.revalidadas).toEqual([RUTA_COLA])
  })

  it("si el medio cambió la métrica, lo explica y actualiza la cola", async () => {
    estado.respuesta = {
      data: null,
      error: {
        code: "P0001",
        message: "AMO_TRANSICION_INVALIDA",
        hint: "metrica_cambiada",
      },
    }
    const resultado = await validarMetrica({
      aprobar: false,
      metricaId: METRICA,
      enviadaAt: VERSION,
      observaciones: "Las cifras no coinciden con la captura.",
    })
    expect(estado.rpc[0].argumentos.p_enviada_at).toBe(VERSION)
    expect(resultado).toEqual({
      ok: false,
      error: MENSAJES_VALIDACION.metricaCambiada,
    })
    expect(estado.revalidadas).toEqual([RUTA_COLA])
  })
})

describe("validarMetrica (ADM-008)", () => {
  it("aprobar con alerta sin revisión lleva el error al campo", async () => {
    estado.respuesta = {
      data: null,
      error: {
        code: "P0001",
        message: "AMO_MOTIVO_REQUERIDO",
        hint: "alerta_sin_revision",
      },
    }
    // El navegador dijo que no tenía alerta; la BD manda.
    const resultado = await validarMetrica({
      aprobar: true,
      metricaId: METRICA,
      enviadaAt: VERSION,
      conAlerta: false,
      observaciones: "",
    })
    expect(estado.orden[0]).toBe("dal:metricas.validar")
    expect(resultado).toEqual({
      ok: false,
      error: MENSAJES_VALIDACION.alertaSinRevision,
      erroresCampo: { observaciones: [MENSAJES_VALIDACION.alertaSinRevision] },
    })
  })

  it("rechazar manda las observaciones", async () => {
    estado.respuesta = {
      data: { asignacion_id: ASIGNACION, estado: "EVIDENCIA_VALIDADA" },
      error: null,
    }
    await validarMetrica({
      aprobar: false,
      metricaId: METRICA,
      enviadaAt: VERSION,
      observaciones: "Las cifras no coinciden con la captura.",
    })
    expect(estado.rpc[0]).toEqual({
      nombre: "validar_metrica_srv",
      argumentos: {
        p_metrica_id: METRICA,
        p_aprobar: false,
        p_observaciones: "Las cifras no coinciden con la captura.",
        p_actor_id: "u1",
        p_session_id: "s1",
        p_enviada_at: VERSION,
      },
    })
  })

  it("rechazar en disputa con todo cargado espera a la disputa", async () => {
    estado.respuesta = {
      data: null,
      error: {
        code: "P0001",
        message: "AMO_TRANSICION_INVALIDA",
        hint: "en_disputa",
      },
    }
    const resultado = await validarMetrica({
      aprobar: false,
      metricaId: METRICA,
      enviadaAt: VERSION,
      observaciones: "Las cifras no coinciden con la captura.",
    })
    expect(resultado).toEqual({
      ok: false,
      error: MENSAJES_VALIDACION.enDisputaRechazoMetrica,
    })
  })
})

describe("verificarAsignacion (ADM-009)", () => {
  it("verifica por la transición, sin motivo ni datos", async () => {
    const resultado = await verificarAsignacion({
      asignacionId: ASIGNACION,
      constancia: false,
      motivo: "",
    })
    expect(estado.orden[0]).toBe("dal:metricas.validar")
    expect(estado.transiciones).toEqual([
      {
        entidad: "asignaciones",
        id: ASIGNACION,
        hacia: "VERIFICADA",
        motivo: null,
        datos: {},
      },
    ])
    expect(estado.revalidadas).toEqual([RUTA_FICHA, RUTA_COLA])
    expect(resultado).toEqual({ ok: true, datos: undefined })
  })

  it("la permanencia pendiente dice hasta cuándo", async () => {
    estado.errorTransicion = {
      code: "P0001",
      message: "AMO_PERMANENCIA_PENDIENTE",
      details: "Aún no se cumple la permanencia mínima de la publicación.",
    }
    const resultado = await verificarAsignacion({
      asignacionId: ASIGNACION,
      constancia: false,
      motivo: "",
    })
    expect(resultado).toEqual({
      ok: false,
      error: frasePermanenciaPendiente(PERMANENCIA),
    })
  })

  it("la constancia manual exige corregir métricas validadas", async () => {
    const sinPermiso = await verificarAsignacion({
      asignacionId: ASIGNACION,
      constancia: true,
      motivo: "La publicación sigue en línea.",
    })
    expect(sinPermiso).toEqual({
      ok: false,
      error: MENSAJES_VALIDACION.constanciaSoloAdministrador,
    })
    expect(estado.transiciones).toEqual([])

    estado.permisos = [...estado.permisos, "metricas.editar_validadas"]
    await verificarAsignacion({
      asignacionId: ASIGNACION,
      constancia: true,
      motivo: "La publicación sigue en línea.",
    })
    expect(estado.transiciones).toEqual([
      {
        entidad: "asignaciones",
        id: ASIGNACION,
        hacia: "VERIFICADA",
        motivo: "La publicación sigue en línea.",
        datos: { permanencia_verificada: true },
      },
    ])
  })

  it("si ya no espera verificación no la intenta y actualiza la página", async () => {
    estado.estadoAsignacion = "VERIFICADA"
    const resultado = await verificarAsignacion({
      asignacionId: ASIGNACION,
      constancia: false,
      motivo: "",
    })
    expect(estado.transiciones).toEqual([])
    expect(resultado).toEqual({
      ok: false,
      error: MENSAJES_VALIDACION.yaNoEsperaVerificacion,
    })
    expect(estado.revalidadas).toEqual([RUTA_FICHA, RUTA_COLA])
  })
})

describe("corrección de una métrica aprobada (ADM-008 c2)", () => {
  const LEIDA: MetricaParaCorregir = {
    metricaId: METRICA,
    asignacionId: ASIGNACION,
    publicacionId: PUBLICACION,
    numero: 1,
    corte: "H24",
    plataforma: "INSTAGRAM",
    formatoClave: "POST_FEED",
    fechaCorte: "2026-10-22T15:15:00+00:00",
    periodo: null,
    fechaPublicacion: "2026-10-21T12:00:00+00:00",
    valores: {
      ...VALORES_VACIOS,
      alcance: 12500,
      impresiones: 20000,
      meGusta: 10,
      comentarios: 1,
      compartidos: 0,
      guardados: 0,
    },
    otros: [],
    tolerancia: 0.02,
  }
  const ESCRITO = {
    asignacionId: ASIGNACION,
    numero: 1,
    corte: "H24" as const,
    metricaId: METRICA,
    dia: "2026-10-22",
    hora: "10:15",
    periodoDesde: "",
    periodoHasta: "",
    alcance: "1.250",
    impresiones: "20.000",
    reproducciones: "",
    espectadoresUnicos: "",
    meGusta: "10",
    comentarios: "1",
    compartidos: "0",
    guardados: "0",
    clicsEnlace: "",
    visitasPerfil: "",
    tiempoPromedioS: "",
    porcentajeCompleto: "",
    motivo: "El medio digitó un cero de más.",
  }

  beforeEach(() => {
    estado.permisos = ["metricas.validar", "metricas.editar_validadas"]
    estado.respuesta = { data: METRICA, error: null }
  })

  it("solo manda lo que cambió, con el motivo, después del DAL", async () => {
    estado.lecturaCorreccion = { metrica: LEIDA, aprobada: true }
    const resultado = await corregirMetrica(ESCRITO)
    expect(estado.orden[0]).toBe("dal:metricas.editar_validadas")
    expect(estado.rpc).toEqual([
      {
        nombre: "corregir_metrica_srv",
        argumentos: {
          p_metrica_id: METRICA,
          p_valores: { alcance: 1250 },
          p_motivo: "El medio digitó un cero de más.",
          p_actor_id: "u1",
          p_session_id: "s1",
        },
      },
    ])
    expect(estado.revalidadas).toEqual([RUTA_FICHA, RUTA_COLA])
    expect(resultado.ok).toBe(true)
  })

  it("sin cambios no llama a la BD", async () => {
    estado.lecturaCorreccion = { metrica: LEIDA, aprobada: true }
    const resultado = await corregirMetrica({
      ...ESCRITO,
      alcance: "12.500",
    })
    expect(estado.rpc).toEqual([])
    expect(resultado).toEqual({
      ok: false,
      error: MENSAJES_VALIDACION.sinCambios,
    })
  })

  it("una métrica que no está aprobada no se corrige", async () => {
    estado.lecturaCorreccion = { metrica: LEIDA, aprobada: false }
    expect(await corregirMetrica(ESCRITO)).toEqual({
      ok: false,
      error: MENSAJES_VALIDACION.noAprobada,
    })
    expect(await prepararCorreccionMetrica({ metricaId: METRICA })).toEqual({
      ok: false,
      error: MENSAJES_VALIDACION.noAprobada,
    })
  })

  it("prepara el formulario con lo leído", async () => {
    estado.lecturaCorreccion = { metrica: LEIDA, aprobada: true }
    expect(await prepararCorreccionMetrica({ metricaId: METRICA })).toEqual({
      ok: true,
      datos: LEIDA,
    })
  })
})
