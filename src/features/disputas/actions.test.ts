// @vitest-environment node
/**
 * Acciones de las disputas con el DAL, la RPC, la transición, Storage y el
 * cliente de sesión simulados: autorizan antes que nada, escriben lo que
 * validó el esquema, comprueban el estado de origen y la carpeta del
 * adjunto, y no dejan notas internas a las partes ni mensajes en una
 * disputa cerrada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MENSAJES_DISPUTA } from "./errores"
import { LONGITUD_MAXIMA_DESCRIPCION } from "./schemas"

const DISPUTA = "0192f3a4-5b6c-7d8e-9f01-0000000000d1"
const ASIGNACION = "0192f3a4-5b6c-7d8e-9f01-0000000000a1"
const ARCHIVO = "0192f3a4-5b6c-7d8e-9f01-0000000000f1"
const RUTA = `disputa/${DISPUTA}/${ARCHIVO}.webp`
const RUTA_INTERNA = `disputa/${DISPUTA}/interno/${ARCHIVO}.pdf`

const estado = vi.hoisted(() => ({
  orden: [] as string[],
  permisos: [] as string[],
  rpc: [] as { nombre: string; argumentos: unknown }[],
  errorRpc: null as unknown,
  transiciones: [] as unknown[],
  errorTransicion: null as unknown,
  estadoDisputa: "ABIERTA" as string | null,
  insertados: [] as unknown[],
  errorInsert: null as unknown,
  adjuntoGuardado: null as string | null,
  confirmados: [] as unknown[],
  objetoExiste: true,
  preparadas: [] as unknown[],
  firmadas: [] as unknown[],
  eventos: [] as unknown[],
  refrescos: 0,
}))

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({
  refresh: vi.fn(() => {
    estado.refrescos += 1
  }),
}))
vi.mock("@/lib/auth/dal", () => ({
  requerirPermiso: vi.fn(async (permiso: string | string[]) => {
    estado.orden.push(`dal:${[permiso].flat().join("|")}`)
    return { id: "u1", permisos: estado.permisos }
  }),
  tieneAlgunPermiso: (
    usuario: { permisos: readonly string[] },
    permisos: readonly string[]
  ) => permisos.some((permiso) => usuario.permisos.includes(permiso)),
}))
vi.mock("@/lib/auth/contexto-actor", () => ({
  contextoDelActor: vi.fn(async () => {
    estado.orden.push("contexto")
    return {
      actorId: "u1",
      sessionId: "s1",
      admin: {
        rpc: async (nombre: string, argumentos: unknown) => {
          estado.rpc.push({ nombre, argumentos })
          return estado.errorRpc
            ? { data: null, error: estado.errorRpc }
            : { data: DISPUTA, error: null }
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
vi.mock("@/lib/auth/registro", () => ({
  registrarEvento: vi.fn(async (evento: unknown) => {
    estado.eventos.push(evento)
    return true
  }),
}))
vi.mock("@/lib/storage/subidas", () => ({
  prepararSubidaFirmada: vi.fn(async (opciones: { ruta: string }) => {
    estado.preparadas.push(opciones)
    return {
      ok: true,
      datos: { bucket: "evidencias", ruta: opciones.ruta, token: "t" },
    }
  }),
  confirmarObjeto: vi.fn(async (opciones: unknown) => {
    estado.confirmados.push(opciones)
    return estado.objetoExiste
      ? { ok: true, datos: opciones }
      : { ok: false, error: "El archivo no terminó de subir." }
  }),
}))
vi.mock("@/lib/storage/descargas", () => ({
  MENSAJES_DESCARGA: { noEncontrado: "No encontramos el archivo." },
  firmarDescarga: vi.fn(async (opciones: unknown) => {
    estado.firmadas.push(opciones)
    return {
      ok: true,
      datos: { url: "https://firmada", vigenciaSegundos: 300 },
    }
  }),
}))
vi.mock("@/lib/supabase/server", () => ({
  crearClienteServidor: vi.fn(async () => ({
    from: (tabla: string) => {
      if (tabla === "disputas") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: estado.estadoDisputa
                  ? { estado: estado.estadoDisputa }
                  : null,
                error: null,
              }),
            }),
          }),
        }
      }
      return {
        insert: (fila: unknown) => {
          estado.insertados.push(fila)
          return {
            select: () => ({
              single: async () =>
                estado.errorInsert
                  ? { data: null, error: estado.errorInsert }
                  : { data: { id: 77 }, error: null },
            }),
          }
        },
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  adjunto_path: estado.adjuntoGuardado,
                  created_at: "2026-10-23T15:00:00Z",
                },
                error: null,
              }),
            }),
          }),
        }),
      }
    },
  })),
}))

const acciones = await import("./actions")

beforeEach(() => {
  estado.orden = []
  estado.permisos = ["disputas.abrir"]
  estado.rpc = []
  estado.errorRpc = null
  estado.transiciones = []
  estado.errorTransicion = null
  estado.estadoDisputa = "ABIERTA"
  estado.insertados = []
  estado.errorInsert = null
  estado.adjuntoGuardado = null
  estado.confirmados = []
  estado.objetoExiste = true
  estado.preparadas = []
  estado.firmadas = []
  estado.eventos = []
  estado.refrescos = 0
})

describe("abrirDisputa", () => {
  it("autoriza, llama a la RPC con actor y sesión y devuelve la disputa", async () => {
    const resultado = await acciones.abrirDisputa({
      asignacionId: ASIGNACION,
      motivo: "OTRO",
      descripcion: "  Sí publiqué y no se registró  ",
    })
    expect(estado.orden).toEqual(["dal:disputas.abrir", "contexto"])
    expect(estado.rpc).toEqual([
      {
        nombre: "abrir_disputa_srv",
        argumentos: {
          p_asignacion_id: ASIGNACION,
          p_motivo: "OTRO",
          p_descripcion: "Sí publiqué y no se registró",
          p_actor_id: "u1",
          p_session_id: "s1",
        },
      },
    ])
    expect(resultado).toEqual({ ok: true, datos: { disputaId: DISPUTA } })
    expect(estado.refrescos).toBe(1)
  })

  it("una entrada inválida no llega a la BD", async () => {
    const resultado = await acciones.abrirDisputa({
      asignacionId: ASIGNACION,
      motivo: "OTRO",
      descripcion: "corta",
    })
    expect(resultado.ok).toBe(false)
    expect(estado.orden).toEqual(["dal:disputas.abrir"])
    expect(estado.rpc).toEqual([])
  })

  it("el rechazo de la BD se muestra con su detalle", async () => {
    estado.errorRpc = {
      code: "P0001",
      message: "AMO_TRANSICION_INVALIDA",
      details: "Ya hay una disputa abierta sobre esta asignación.",
    }
    expect(
      await acciones.abrirDisputa({
        asignacionId: ASIGNACION,
        motivo: "METRICAS",
        descripcion: "Las cifras no coinciden con la captura.",
      })
    ).toEqual({
      ok: false,
      error: "Ya hay una disputa abierta sobre esta asignación.",
    })
    expect(estado.refrescos).toBe(0)
  })

  it("una descripción de 4.000 caracteres llega entera: la BD solo recorta la copia de la asignación (C1)", async () => {
    const descripcion = "x".repeat(LONGITUD_MAXIMA_DESCRIPCION)
    const resultado = await acciones.abrirDisputa({
      asignacionId: ASIGNACION,
      motivo: "METRICAS",
      descripcion,
    })
    expect(resultado.ok).toBe(true)
    expect(estado.rpc[0]?.argumentos).toMatchObject({
      p_descripcion: descripcion,
    })
    // Una base sin el recorte: el error va junto a la descripción, no genérico.
    estado.errorRpc = {
      code: "23514",
      message:
        'new row for relation "asignaciones" violates check constraint "asignaciones_motivo_chk"',
    }
    expect(
      await acciones.abrirDisputa({
        asignacionId: ASIGNACION,
        motivo: "METRICAS",
        descripcion,
      })
    ).toMatchObject({
      ok: false,
      erroresCampo: { descripcion: [expect.stringMatching(/1\.000/)] },
    })
  })

  it("un segundo reclamo de la misma vencida se explica (R4)", async () => {
    estado.errorRpc = {
      code: "P0001",
      message: "AMO_TRANSICION_INVALIDA",
      details:
        "Ya reclamaste esta publicación: una vencida admite un solo reclamo.",
      hint: "reclamo_previo",
    }
    expect(
      await acciones.abrirDisputa({
        asignacionId: ASIGNACION,
        motivo: "OTRO",
        descripcion: "Sí publiqué y no se registró",
      })
    ).toEqual({ ok: false, error: MENSAJES_DISPUTA.reclamoPrevio })
  })
})

describe("enviarMensajeDisputa", () => {
  it("guarda el mensaje con la sesión y refresca la página", async () => {
    const resultado = await acciones.enviarMensajeDisputa({
      disputaId: DISPUTA,
      mensaje: "  Adjunto la captura del panel.  ",
    })
    expect(estado.orden).toEqual(["dal:disputas.abrir|disputas.resolver"])
    expect(estado.insertados).toEqual([
      {
        disputa_id: DISPUTA,
        mensaje: "Adjunto la captura del panel.",
        adjunto_path: null,
        interno: false,
      },
    ])
    expect(resultado).toEqual({ ok: true, datos: { mensajeId: 77 } })
    expect(estado.refrescos).toBe(1)
  })

  it("una parte no deja notas internas", async () => {
    const resultado = await acciones.enviarMensajeDisputa({
      disputaId: DISPUTA,
      mensaje: "Nota",
      interno: true,
    })
    expect(resultado).toEqual({
      ok: false,
      error: MENSAJES_DISPUTA.sinPermisoNota,
    })
    expect(estado.insertados).toEqual([])
  })

  it("en una disputa cerrada las partes ya no escriben; el equipo deja notas", async () => {
    estado.estadoDisputa = "RESUELTA"
    expect(
      await acciones.enviarMensajeDisputa({
        disputaId: DISPUTA,
        mensaje: "¿Y?",
      })
    ).toEqual({ ok: false, error: MENSAJES_DISPUTA.cerrada })

    estado.permisos = ["disputas.ver", "disputas.resolver"]
    expect(
      await acciones.enviarMensajeDisputa({
        disputaId: DISPUTA,
        mensaje: "Revisado con finanzas.",
        interno: true,
      })
    ).toEqual({ ok: true, datos: { mensajeId: 77 } })
    expect(estado.insertados).toHaveLength(1)
  })

  it("comprueba que el adjunto es de la carpeta de la disputa y existe", async () => {
    const ajeno = await acciones.enviarMensajeDisputa({
      disputaId: DISPUTA,
      mensaje: "Mira el adjunto.",
      adjuntoPath: `disputa/${ASIGNACION}/${ARCHIVO}.webp`,
    })
    expect(ajeno).toMatchObject({
      ok: false,
      erroresCampo: { adjunto: [MENSAJES_DISPUTA.adjuntoAjeno] },
    })
    // La carpeta interna no sirve para un mensaje público.
    expect(
      (
        await acciones.enviarMensajeDisputa({
          disputaId: DISPUTA,
          mensaje: "Mira el adjunto.",
          adjuntoPath: RUTA_INTERNA,
        })
      ).ok
    ).toBe(false)

    estado.objetoExiste = false
    expect(
      await acciones.enviarMensajeDisputa({
        disputaId: DISPUTA,
        mensaje: "Mira el adjunto.",
        adjuntoPath: RUTA,
      })
    ).toMatchObject({
      ok: false,
      erroresCampo: { adjunto: [expect.any(String)] },
    })

    estado.objetoExiste = true
    await acciones.enviarMensajeDisputa({
      disputaId: DISPUTA,
      mensaje: "Mira el adjunto.",
      adjuntoPath: RUTA,
    })
    expect(estado.insertados).toEqual([
      {
        disputa_id: DISPUTA,
        mensaje: "Mira el adjunto.",
        adjunto_path: RUTA,
        interno: false,
      },
    ])
  })

  it("una disputa que no se ve no recibe mensajes", async () => {
    estado.estadoDisputa = null
    expect(
      await acciones.enviarMensajeDisputa({
        disputaId: DISPUTA,
        mensaje: "Hola",
      })
    ).toEqual({ ok: false, error: MENSAJES_DISPUTA.noEncontrada })
  })
})

describe("adjuntos", () => {
  const descripcion = {
    nombre: "captura.webp",
    tipo: "image/webp",
    tamano: 2000,
    sha256: null,
    dimensiones: null,
    duracionSeg: null,
    conMiniatura: false,
  }

  it("prepara la subida en la carpeta de la disputa (o la interna del equipo)", async () => {
    await acciones.prepararAdjuntoDisputa({ disputaId: DISPUTA, descripcion })
    expect(estado.preparadas).toEqual([
      expect.objectContaining({
        bucket: "evidencias",
        ruta: expect.stringMatching(
          new RegExp(`^disputa/${DISPUTA}/[0-9a-f-]{36}\\.webp$`)
        ),
      }),
    ])
    expect(
      await acciones.prepararAdjuntoDisputa({
        disputaId: DISPUTA,
        interno: true,
        descripcion,
      })
    ).toEqual({ ok: false, error: MENSAJES_DISPUTA.sinPermisoNota })

    estado.permisos = ["disputas.resolver"]
    await acciones.prepararAdjuntoDisputa({
      disputaId: DISPUTA,
      interno: true,
      descripcion,
    })
    expect(estado.preparadas.at(-1)).toMatchObject({
      ruta: expect.stringMatching(new RegExp(`^disputa/${DISPUTA}/interno/`)),
    })
  })

  it("confirma solo archivos de su carpeta", async () => {
    const adjunto = {
      ...descripcion,
      bucket: "evidencias" as const,
      ruta: RUTA,
      rutaMiniatura: null,
    }
    expect(
      await acciones.confirmarAdjuntoDisputa({ disputaId: DISPUTA, adjunto })
    ).toEqual({ ok: true, datos: undefined })
    expect(
      await acciones.confirmarAdjuntoDisputa({
        disputaId: DISPUTA,
        adjunto: { ...adjunto, ruta: RUTA_INTERNA },
      })
    ).toEqual({ ok: false, error: MENSAJES_DISPUTA.adjuntoAjeno })
  })

  it("firma como usuario la ruta guardada en el mensaje", async () => {
    expect(
      await acciones.firmarAdjuntoDisputa({ disputaId: DISPUTA, mensajeId: 9 })
    ).toEqual({ ok: false, error: "No encontramos el archivo." })

    estado.adjuntoGuardado = RUTA
    await acciones.firmarAdjuntoDisputa({
      disputaId: DISPUTA,
      mensajeId: 9,
      descargar: true,
    })
    expect(estado.orden.at(-1)).toBe(
      "dal:disputas.ver|disputas.abrir|asignaciones.ver_propias"
    )
    expect(estado.firmadas).toEqual([
      expect.objectContaining({
        bucket: "evidencias",
        ruta: RUTA,
        firmante: expect.objectContaining({ como: "usuario" }),
        descarga: expect.stringMatching(/^Adjunto del .*\.webp$/),
      }),
    ])
  })
})

describe("decisiones del equipo", () => {
  beforeEach(() => {
    estado.permisos = ["disputas.ver", "disputas.resolver"]
  })

  it("tomar en revisión parte de una abierta", async () => {
    expect(await acciones.tomarDisputa({ disputaId: DISPUTA })).toEqual({
      ok: true,
      datos: undefined,
    })
    expect(estado.orden).toEqual(["dal:disputas.resolver", "contexto"])
    expect(estado.transiciones).toEqual([
      { entidad: "disputas", id: DISPUTA, hacia: "EN_REVISION" },
    ])

    estado.estadoDisputa = "EN_REVISION"
    expect(await acciones.tomarDisputa({ disputaId: DISPUTA })).toEqual({
      ok: false,
      error:
        "La disputa ya está en revisión. Actualiza la página para ver su estado.",
    })
    expect(estado.transiciones).toHaveLength(1)
  })

  it("resolver manda el destino, la causa y la explicación", async () => {
    await acciones.resolverDisputa({
      disputaId: DISPUTA,
      estadoResultante: "CANCELADA",
      causa: "FRAUDE",
      motivo: "Las métricas reportadas no corresponden a la publicación.",
    })
    await acciones.resolverDisputa({
      disputaId: DISPUTA,
      estadoResultante: "CONTENIDO_ENTREGADO",
      causa: "FRAUDE",
      motivo: "El medio demostró que publicó a tiempo.",
    })
    expect(estado.transiciones).toEqual([
      {
        entidad: "disputas",
        id: DISPUTA,
        hacia: "RESUELTA",
        motivo: "Las métricas reportadas no corresponden a la publicación.",
        datos: {
          estado_asignacion_resultante: "CANCELADA",
          causa: "FRAUDE",
        },
      },
      {
        entidad: "disputas",
        id: DISPUTA,
        hacia: "RESUELTA",
        motivo: "El medio demostró que publicó a tiempo.",
        datos: { estado_asignacion_resultante: "CONTENIDO_ENTREGADO" },
      },
    ])
  })

  it("la constancia manual de permanencia exige `metricas.editar_validadas`", async () => {
    const entrada = {
      disputaId: DISPUTA,
      estadoResultante: "VERIFICADA" as const,
      permanenciaVerificada: true,
      motivo: "La publicación sigue en línea: lo comprobé hoy.",
    }
    expect((await acciones.resolverDisputa(entrada)).ok).toBe(false)
    expect(estado.transiciones).toEqual([])

    estado.permisos = [...estado.permisos, "metricas.editar_validadas"]
    await acciones.resolverDisputa(entrada)
    expect(estado.transiciones).toEqual([
      expect.objectContaining({
        datos: {
          estado_asignacion_resultante: "VERIFICADA",
          permanencia_verificada: true,
        },
      }),
    ])
  })

  it("una disputa cerrada no se vuelve a resolver", async () => {
    estado.estadoDisputa = "DESCARTADA"
    expect(
      await acciones.descartarDisputa({
        disputaId: DISPUTA,
        motivo: "Duplicada.",
      })
    ).toEqual({
      ok: false,
      error:
        "La disputa ya se cerró. Actualiza la página para ver su resultado.",
    })
    expect(estado.transiciones).toEqual([])
  })

  it("si la oferta cerró, refresca la ficha y lo explica", async () => {
    estado.errorTransicion = {
      code: "P0001",
      message: "AMO_TRANSICION_INVALIDA",
      details: "La oferta ya cerró.",
      hint: "oferta_cerrada",
    }
    expect(
      await acciones.resolverDisputa({
        disputaId: DISPUTA,
        estadoResultante: "CONTENIDO_ENTREGADO",
        motivo: "El medio demostró que publicó a tiempo.",
      })
    ).toEqual({ ok: false, error: MENSAJES_DISPUTA.ofertaCerrada })
    expect(estado.refrescos).toBe(1)
  })

  it("descartar manda el motivo", async () => {
    await acciones.descartarDisputa({
      disputaId: DISPUTA,
      motivo: "Las partes ya lo aclararon.",
    })
    expect(estado.transiciones).toEqual([
      {
        entidad: "disputas",
        id: DISPUTA,
        hacia: "DESCARTADA",
        motivo: "Las partes ya lo aclararon.",
      },
    ])
  })
})

describe("registrarExportacionDisputas", () => {
  it("deja EXPORTAR en la bitácora", async () => {
    estado.permisos = ["disputas.ver"]
    expect(
      await acciones.registrarExportacionDisputas({
        formato: "xlsx",
        filas: 12,
      })
    ).toEqual({ ok: true, datos: undefined })
    expect(estado.orden[0]).toBe("dal:disputas.ver")
    expect(estado.eventos).toEqual([
      expect.objectContaining({
        accion: "EXPORTAR",
        entidad: "disputas",
        metadatos: { formato: "xlsx", filas: 12 },
      }),
    ])
  })
})
