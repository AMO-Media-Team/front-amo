import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/env", () => ({
  envCliente: { NEXT_PUBLIC_SITE_URL: "https://amo.test" },
}))
vi.mock("@/lib/supabase/admin", () => ({
  crearClienteAdmin: vi.fn(async () => {
    throw new Error("En las pruebas se inyecta el cliente.")
  }),
}))

const {
  APLAZADOS_EN_PARALELO,
  loteDe,
  mensajeDeFila,
  procesarColaCorreos,
  ErrorColaCorreos,
} = await import("./procesar")
const { enviado, fallido, reintentar } = await import("./tipos")

type Fila = Parameters<typeof mensajeDeFila>[0]
type Resultado = Awaited<ReturnType<typeof enviado>>

function fila(correoId: number, cambios: Partial<Fila> = {}): Fila {
  return {
    correo_id: correoId,
    intento: 1,
    destinatario: `persona${correoId}@ejemplo.co`,
    nombre: "Persona",
    clave: "oferta.nueva_elegible",
    asunto: "Nueva oferta: {{oferta}}",
    cuerpo: "Hay una oferta **{{oferta}}**.",
    datos: { oferta: "Lanzamiento" },
    titulo: "Nueva oferta disponible para tu medio",
    mensaje: "Hay una oferta Lanzamiento.",
    entidad: "ofertas",
    entidad_id: "abc",
    url: null as unknown as string,
    ...cambios,
  }
}

interface Registro {
  p_id: number
  p_intento: number
  p_resultado: string
  p_proveedor_id: string | null
  p_error: string | null
}

function clienteFalso({
  filas = [] as Fila[],
  lote = 20 as unknown,
  errorReclamo = null as { code: string } | null,
  respuestaRegistro = (registro: Registro): string | null =>
    registro.p_resultado,
} = {}) {
  const registros: Registro[] = []
  const reclamos: unknown[] = []
  const cliente = {
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { valor: lote }, error: null }),
        }),
      }),
    })),
    rpc: vi.fn(async (nombre: string, argumentos: unknown) => {
      if (nombre === "reclamar_correos_srv") {
        reclamos.push(argumentos)
        return errorReclamo
          ? { data: null, error: errorReclamo }
          : { data: filas, error: null }
      }
      const registro = argumentos as Registro
      registros.push(registro)
      const data = respuestaRegistro(registro)
      return data === null
        ? { data: null, error: { code: "57014" } }
        : { data, error: null }
    }),
  }
  return { cliente, registros, reclamos }
}

function adaptadorCon(...resultados: Resultado[]) {
  const enviar = vi.fn(async () => resultados.shift() ?? enviado("re_x"))
  return { nombre: "prueba", enviar }
}

const sinEspera = { esperar: async () => {}, pausaMs: 0 }

describe("loteDe", () => {
  it("acota a 1–100 y usa 20 si el valor no sirve", () => {
    expect(loteDe(35)).toBe(35)
    expect(loteDe("10")).toBe(10)
    expect(loteDe(0)).toBe(1)
    expect(loteDe(500)).toBe(100)
    expect(loteDe(2.5)).toBe(20)
    expect(loteDe(null)).toBe(20)
    expect(loteDe("muchos")).toBe(20)
  })
})

describe("mensajeDeFila", () => {
  it("arma el correo con la clave de idempotencia de la cola", () => {
    const mensaje = mensajeDeFila(fila(41), "https://amo.test")
    expect(mensaje).toMatchObject({
      para: "persona41@ejemplo.co",
      asunto: "Nueva oferta: Lanzamiento",
      claveIdempotencia: "amo-correo-41",
    })
    expect(mensaje.html).toContain("https://amo.test/ir/ofertas/abc")
  })
})

describe("procesarColaCorreos", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("reclama el lote configurado, envía uno por uno y registra cada resultado", async () => {
    const { cliente, registros, reclamos } = clienteFalso({
      filas: [fila(1), fila(2, { intento: 3 }), fila(3)],
      lote: 2,
    })
    const adaptador = adaptadorCon(
      enviado("re_1"),
      reintentar("resend_503"),
      fallido("resend_422_validation_error")
    )
    const esperar = vi.fn(async () => {})

    const resumen = await procesarColaCorreos({
      adaptador,
      admin: cliente as never,
      sitioUrl: "https://amo.test",
      esperar,
      pausaMs: 600,
    })

    expect(reclamos).toEqual([{ p_limite: 2 }])
    expect(adaptador.enviar).toHaveBeenCalledTimes(3)
    expect(esperar).toHaveBeenCalledTimes(2)
    expect(esperar).toHaveBeenCalledWith(600)
    expect(registros).toEqual([
      {
        p_id: 1,
        p_intento: 1,
        p_resultado: "ENVIADO",
        p_proveedor_id: "re_1",
        p_error: null,
      },
      {
        p_id: 2,
        p_intento: 3,
        p_resultado: "REINTENTO",
        p_proveedor_id: null,
        p_error: "resend_503",
      },
      {
        p_id: 3,
        p_intento: 1,
        p_resultado: "FALLIDO",
        p_proveedor_id: null,
        p_error: "resend_422_validation_error",
      },
    ])
    expect(resumen).toEqual({
      reclamados: 3,
      enviados: 1,
      reintentos: 1,
      fallidos: 1,
      ignorados: 0,
      aplazados: 0,
      sinRegistro: 0,
    })
  })

  it("cuenta IGNORADO (otro despachador tomó el turno) y los registros fallidos", async () => {
    const { cliente } = clienteFalso({
      filas: [fila(1), fila(2)],
      respuestaRegistro: (registro) =>
        registro.p_id === 1 ? "IGNORADO" : null,
    })
    const resumen = await procesarColaCorreos({
      adaptador: adaptadorCon(),
      admin: cliente as never,
      ...sinEspera,
    })
    expect(resumen).toMatchObject({ ignorados: 1, sinRegistro: 1 })
    expect(console.error).toHaveBeenCalledWith(
      expect.not.stringContaining("@ejemplo.co")
    )
  })

  it("un destinatario inválido falla sin llamar al proveedor", async () => {
    const { cliente, registros } = clienteFalso({
      filas: [fila(1, { destinatario: "sin-arroba" })],
    })
    const adaptador = adaptadorCon()
    await procesarColaCorreos({
      adaptador,
      admin: cliente as never,
      ...sinEspera,
    })
    expect(adaptador.enviar).not.toHaveBeenCalled()
    expect(registros[0]).toMatchObject({
      p_resultado: "FALLIDO",
      p_error: "destinatario_invalido",
    })
  })

  it("si el adaptador lanza, el correo se reintenta y el lote sigue", async () => {
    const { cliente, registros } = clienteFalso({
      filas: [fila(1), fila(2)],
    })
    let primero = true
    const resumen = await procesarColaCorreos({
      adaptador: {
        nombre: "inestable",
        enviar: vi.fn(async () => {
          if (primero) {
            primero = false
            throw new Error("boom")
          }
          return enviado("re_2")
        }),
      },
      admin: cliente as never,
      ...sinEspera,
    })
    expect(registros[0]).toMatchObject({
      p_resultado: "REINTENTO",
      p_error: "adaptador_excepcion",
    })
    expect(resumen).toMatchObject({ reintentos: 1, enviados: 1 })
  })

  it("si el proveedor pide esperar (429), devuelve el resto a la cola sin gastar su intento", async () => {
    const { cliente, registros } = clienteFalso({
      filas: [fila(1), fila(2, { intento: 4 }), fila(3)],
    })
    const adaptador = adaptadorCon(reintentar("resend_429", true))
    const resumen = await procesarColaCorreos({
      adaptador,
      admin: cliente as never,
      ...sinEspera,
    })
    expect(adaptador.enviar).toHaveBeenCalledTimes(1)
    expect(registros).toEqual([
      {
        p_id: 1,
        p_intento: 1,
        p_resultado: "REINTENTO",
        p_proveedor_id: null,
        p_error: "resend_429",
      },
      // Cada aplazado lleva su intento: la marca del turno que lo reclamó.
      {
        p_id: 2,
        p_intento: 4,
        p_resultado: "APLAZADO",
        p_proveedor_id: null,
        p_error: null,
      },
      {
        p_id: 3,
        p_intento: 1,
        p_resultado: "APLAZADO",
        p_proveedor_id: null,
        p_error: null,
      },
    ])
    expect(resumen).toEqual({
      reclamados: 3,
      enviados: 0,
      reintentos: 1,
      fallidos: 0,
      ignorados: 0,
      aplazados: 2,
      sinRegistro: 0,
    })
  })

  it("no empieza un envío sin tiempo para terminarlo: lo aplaza", async () => {
    const { cliente, registros } = clienteFalso({
      filas: [fila(1), fila(2), fila(3)],
    })
    let ahora = 0
    const enviar = vi.fn(async () => {
      ahora += 20_000
      return enviado("re")
    })
    const resumen = await procesarColaCorreos({
      adaptador: { nombre: "lento", enviar },
      admin: cliente as never,
      reloj: () => ahora,
      presupuestoMs: 50_000,
      ...sinEspera,
    })
    expect(enviar).toHaveBeenCalledTimes(2)
    expect(registros.map((registro) => registro.p_resultado)).toEqual([
      "ENVIADO",
      "ENVIADO",
      "APLAZADO",
    ])
    expect(registros[2]).toMatchObject({ p_id: 3, p_intento: 1 })
    expect(resumen).toMatchObject({ enviados: 2, aplazados: 1 })
  })

  it("si no se puede devolver un aplazado, queda para cuando venza su turno", async () => {
    const { cliente } = clienteFalso({
      filas: [fila(1), fila(2), fila(3)],
      respuestaRegistro: (registro) => {
        if (registro.p_resultado !== "APLAZADO") return registro.p_resultado
        // Otro despachador ya tomó el 2; el registro del 3 falla.
        return registro.p_id === 2 ? "IGNORADO" : null
      },
    })
    const resumen = await procesarColaCorreos({
      adaptador: adaptadorCon(reintentar("resend_429", true)),
      admin: cliente as never,
      ...sinEspera,
    })
    expect(resumen).toEqual({
      reclamados: 3,
      enviados: 0,
      reintentos: 1,
      fallidos: 0,
      ignorados: 1,
      aplazados: 0,
      sinRegistro: 1,
    })
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('"operacion":"registrar"')
    )
  })

  it("un registro que lanza no corta el lote: cuenta sin registro", async () => {
    const { cliente } = clienteFalso({ filas: [fila(1), fila(2)] })
    const rpc = cliente.rpc
    cliente.rpc = vi.fn(async (nombre: string, argumentos: unknown) => {
      if ((argumentos as Registro).p_id === 1) throw new Error("red")
      return rpc(nombre, argumentos)
    })
    const resumen = await procesarColaCorreos({
      adaptador: adaptadorCon(),
      admin: cliente as never,
      ...sinEspera,
    })
    expect(resumen).toMatchObject({ sinRegistro: 1, enviados: 1 })
  })

  it("devuelve los aplazados en tandas acotadas y cuadra el resumen", async () => {
    const filas = Array.from({ length: 26 }, (_, indice) => fila(indice + 1))
    let enVuelo = 0
    let maximoEnVuelo = 0
    const { cliente, registros } = clienteFalso({ filas })
    const rpc = cliente.rpc
    cliente.rpc = vi.fn(async (nombre: string, argumentos: unknown) => {
      enVuelo += 1
      maximoEnVuelo = Math.max(maximoEnVuelo, enVuelo)
      await Promise.resolve()
      const respuesta = await rpc(nombre, argumentos)
      enVuelo -= 1
      return respuesta
    })
    const resumen = await procesarColaCorreos({
      adaptador: adaptadorCon(reintentar("resend_429", true)),
      admin: cliente as never,
      ...sinEspera,
    })
    expect(maximoEnVuelo).toBe(APLAZADOS_EN_PARALELO)
    expect(
      registros.filter((registro) => registro.p_resultado === "APLAZADO")
    ).toHaveLength(25)
    const { reclamados, ...conteos } = resumen
    expect(Object.values(conteos).reduce((suma, n) => suma + n, 0)).toBe(
      reclamados
    )
    expect(resumen).toMatchObject({ reclamados: 26, aplazados: 25 })
  })

  it("sin filas no envía nada", async () => {
    const { cliente } = clienteFalso()
    const adaptador = adaptadorCon()
    expect(
      await procesarColaCorreos({
        adaptador,
        admin: cliente as never,
        ...sinEspera,
      })
    ).toMatchObject({ reclamados: 0, enviados: 0 })
    expect(adaptador.enviar).not.toHaveBeenCalled()
  })

  it("un error al reclamar se lanza con su código", async () => {
    const { cliente } = clienteFalso({ errorReclamo: { code: "42501" } })
    await expect(
      procesarColaCorreos({
        adaptador: adaptadorCon(),
        admin: cliente as never,
        ...sinEspera,
      })
    ).rejects.toThrow(ErrorColaCorreos)
  })
})
