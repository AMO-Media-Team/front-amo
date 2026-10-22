import { describe, expect, it, vi } from "vitest"

import { MIB } from "@/lib/archivos/formato"
import { ErrorSubida, errorCancelada } from "@/lib/archivos/reintentos"
import type { SubidaPreparada } from "@/lib/archivos/tipos"
import type { ResultadoValidacion } from "@/lib/archivos/validar"
import { exito, fallo } from "@/lib/result"

import {
  crearSubida,
  type EntornoSubida,
  type EstadoSubida,
  type InstantaneaSubida,
  MENSAJES_MOTOR,
  type OpcionesSubida,
} from "./motor-subida"
import type { SubidaReanudable } from "./transporte-tus"

const PREPARADA: SubidaPreparada = {
  bucket: "evidencias",
  ruta: "asignacion/a/publicacion/u.webp",
  token: "token",
  miniatura: null,
}

function crearEntorno(cambios: Partial<EntornoSubida> = {}) {
  const oyentes = new Set<(enLinea: boolean) => void>()
  let enLinea = true
  const entorno: EntornoSubida = {
    subirFirmada: vi.fn(async ({ archivo, alProgresar }) => {
      alProgresar(archivo.size, archivo.size)
    }),
    crearTus: vi.fn((): SubidaReanudable => ({
      subir: vi.fn(async (_senal, alProgresar) => alProgresar(1, 1)),
      descartar: vi.fn(async () => {}),
    })),
    enLinea: () => enLinea,
    alCambiarConexion: (oyente) => {
      oyentes.add(oyente)
      return () => oyentes.delete(oyente)
    },
    esperar: vi.fn(async () => {}),
    ahora: () => 1_000,
    aleatorio: () => 1,
    validarArchivo: vi.fn(async (archivo) => ({
      ok: true as const,
      tipo: archivo.type,
      dimensiones: null,
      duracionSeg: null,
    })),
    comprimirImagen: vi.fn(async (archivo) => archivo),
    generarMiniatura: vi.fn(
      async () => new File(["m"], "min.webp", { type: "image/webp" })
    ),
    sha256Hex: vi.fn(async () => "f".repeat(64)),
    leerDimensiones: vi.fn(async () => ({ ancho: 1080, alto: 1920 })),
    leerDuracionVideo: vi.fn(async () => 12.5),
    ...cambios,
  }
  return {
    entorno,
    conexion(valor: boolean) {
      enLinea = valor
      for (const oyente of [...oyentes]) oyente(valor)
    },
  }
}

function opcionesCon(
  cambios: Partial<OpcionesSubida<string>> = {}
): OpcionesSubida<string> {
  return {
    preparar: vi.fn(async () => exito(PREPARADA)),
    confirmar: vi.fn(async () => exito("fila-1")),
    ...cambios,
  }
}

function archivo(tamano = 1024, nombre = "captura.png", tipo = "image/png") {
  return new File([new Uint8Array(tamano)], nombre, { type: tipo })
}

function registro() {
  const estados: EstadoSubida[] = []
  const ultimas: InstantaneaSubida[] = []
  return {
    estados,
    ultimas,
    alCambiar: (instantanea: InstantaneaSubida) => {
      ultimas.push(instantanea)
      if (estados.at(-1) !== instantanea.estado)
        estados.push(instantanea.estado)
    },
  }
}

/** Una subida que cuelga hasta que la abortan. */
function colgada() {
  return vi.fn(
    ({ senal }: { senal: AbortSignal }) =>
      new Promise<void>((_, rechazar) =>
        senal.addEventListener("abort", () => rechazar(errorCancelada()))
      )
  )
}

const esperarTicks = () => new Promise((resolver) => setTimeout(resolver, 0))

describe("motor de subida", () => {
  it("procesa, prepara, sube por URL firmada y confirma", async () => {
    const { entorno } = crearEntorno()
    const opciones = opcionesCon()
    const { estados, ultimas, alCambiar } = registro()
    const resultado = await crearSubida(
      archivo(),
      opciones,
      entorno,
      alCambiar
    ).iniciar()

    expect(resultado).toEqual({
      ok: true,
      datos: "fila-1",
      archivo: expect.objectContaining({
        nombre: "captura.png",
        tipo: "image/png",
        tamano: 1024,
        ruta: PREPARADA.ruta,
        bucket: "evidencias",
        rutaMiniatura: null,
        conMiniatura: false,
        sha256: null,
      }),
    })
    expect(estados).toEqual([
      "procesando",
      "preparando",
      "subiendo",
      "confirmando",
      "completada",
    ])
    expect(ultimas.at(-1)?.progreso).toBe(1)
    expect(entorno.crearTus).not.toHaveBeenCalled()
    expect(opciones.preparar).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: "captura.png", tamano: 1024 })
    )
  })

  it("usa TUS por encima de 6 MB", async () => {
    const { entorno } = crearEntorno()
    const resultado = await crearSubida(
      archivo(6 * MIB + 1, "reel.mp4", "video/mp4"),
      opcionesCon(),
      entorno,
      () => {}
    ).iniciar()
    expect(resultado.ok).toBe(true)
    expect(entorno.crearTus).toHaveBeenCalledOnce()
    expect(entorno.subirFirmada).not.toHaveBeenCalled()
  })

  it("normaliza el MIME del archivo antes de subirlo", async () => {
    const { entorno } = crearEntorno()
    await crearSubida(
      archivo(10, "foto.heic", ""),
      opcionesCon(),
      entorno,
      () => {}
    ).iniciar()
    const subido = vi.mocked(entorno.subirFirmada).mock.calls[0][0].archivo
    expect(subido.type).toBe("image/heic")
  })

  it("comprime, mide, calcula el hash y sube la miniatura", async () => {
    const comprimida = new File(["c"], "captura.webp", { type: "image/webp" })
    const { entorno } = crearEntorno({
      comprimirImagen: vi.fn(async () => comprimida),
    })
    const opciones = opcionesCon({
      comprimir: { maxLado: 1600, calidad: 0.85 },
      miniatura: true,
      hash: true,
      medidas: true,
      preparar: vi.fn(async () =>
        exito({ ...PREPARADA, miniatura: { ruta: "m.webp", token: "tm" } })
      ),
    })
    const resultado = await crearSubida(
      archivo(),
      opciones,
      entorno,
      () => {}
    ).iniciar()

    expect(opciones.preparar).toHaveBeenCalledWith({
      nombre: "captura.png",
      tipo: "image/webp",
      tamano: 1,
      sha256: "f".repeat(64),
      dimensiones: { ancho: 1080, alto: 1920 },
      duracionSeg: null,
      conMiniatura: true,
    })
    expect(entorno.subirFirmada).toHaveBeenCalledTimes(2)
    expect(resultado.ok && resultado.archivo.rutaMiniatura).toBe("m.webp")
  })

  it("reintenta con espera creciente los fallos de red", async () => {
    const subirFirmada = vi
      .fn()
      .mockRejectedValueOnce(new ErrorSubida(null))
      .mockRejectedValueOnce(new ErrorSubida(503))
      .mockResolvedValueOnce(undefined)
    const { entorno } = crearEntorno({ subirFirmada })
    const { estados, ultimas, alCambiar } = registro()
    const resultado = await crearSubida(
      archivo(),
      opcionesCon(),
      entorno,
      alCambiar
    ).iniciar()

    expect(resultado.ok).toBe(true)
    expect(subirFirmada).toHaveBeenCalledTimes(3)
    expect(vi.mocked(entorno.esperar).mock.calls.map(([ms]) => ms)).toEqual([
      1_000, 2_000,
    ])
    expect(estados).toContain("reintentando")
    expect(ultimas.find((i) => i.estado === "reintentando")).toMatchObject({
      intento: 1,
      reanudaEn: 2_000,
    })
  })

  it("se rinde tras los reintentos y retoma desde la subida", async () => {
    const subirFirmada = vi.fn().mockRejectedValue(new ErrorSubida(null))
    const { entorno } = crearEntorno({ subirFirmada })
    const opciones = opcionesCon({ reintentos: 2 })
    const subida = crearSubida(archivo(), opciones, entorno, () => {})

    const primero = await subida.iniciar()
    expect(primero).toEqual({
      ok: false,
      error: "Se perdió la conexión mientras se subía el archivo.",
      cancelada: false,
    })
    expect(subirFirmada).toHaveBeenCalledTimes(3)
    expect(subida.instantanea().estado).toBe("error")

    subirFirmada.mockResolvedValue(undefined)
    const segundo = await subida.iniciar()
    expect(segundo.ok).toBe(true)
    // El destino seguía vigente: no se volvió a preparar.
    expect(opciones.preparar).toHaveBeenCalledOnce()
  })

  it("no insiste con un 403 y el reintento manual pide un destino nuevo", async () => {
    const subirFirmada = vi
      .fn()
      .mockRejectedValueOnce(new ErrorSubida(403))
      .mockResolvedValue(undefined)
    const { entorno } = crearEntorno({ subirFirmada })
    const opciones = opcionesCon()
    const subida = crearSubida(archivo(), opciones, entorno, () => {})

    const primero = await subida.iniciar()
    expect(primero.ok).toBe(false)
    expect(entorno.esperar).not.toHaveBeenCalled()

    expect((await subida.iniciar()).ok).toBe(true)
    expect(opciones.preparar).toHaveBeenCalledTimes(2)
  })

  it("muestra el mensaje del servidor si `preparar` falla y no sube nada", async () => {
    const { entorno } = crearEntorno()
    const opciones = opcionesCon({
      preparar: vi.fn(async () =>
        fallo("No tienes permiso para subir archivos aquí.")
      ),
    })
    const resultado = await crearSubida(
      archivo(),
      opciones,
      entorno,
      () => {}
    ).iniciar()
    expect(resultado).toEqual({
      ok: false,
      error: "No tienes permiso para subir archivos aquí.",
      cancelada: false,
    })
    expect(entorno.subirFirmada).not.toHaveBeenCalled()
  })

  it("reintenta una Server Action que no respondió (red)", async () => {
    const preparar = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(exito(PREPARADA))
    const { entorno } = crearEntorno()
    const resultado = await crearSubida(
      archivo(),
      opcionesCon({ preparar }),
      entorno,
      () => {}
    ).iniciar()
    expect(resultado.ok).toBe(true)
    expect(preparar).toHaveBeenCalledTimes(2)
  })

  it("rechaza con el mensaje de la validación antes de pedir destino", async () => {
    const { entorno } = crearEntorno({
      validarArchivo: vi.fn(async () => ({
        ok: false as const,
        motivo: "tamano" as const,
        mensaje: "El archivo pesa 12 MB y el máximo es 10 MB.",
      })),
    })
    const opciones = opcionesCon({
      reglas: { mimes: ["image/png"], maxBytes: 10 * MIB },
    })
    const resultado = await crearSubida(
      archivo(),
      opciones,
      entorno,
      () => {}
    ).iniciar()
    expect(resultado).toMatchObject({
      ok: false,
      error: "El archivo pesa 12 MB y el máximo es 10 MB.",
    })
    expect(opciones.preparar).not.toHaveBeenCalled()
  })

  it("informa un fallo de procesamiento sin detalles técnicos", async () => {
    const { entorno } = crearEntorno({
      comprimirImagen: vi.fn(async () => {
        throw new Error("canvas")
      }),
    })
    const resultado = await crearSubida(
      archivo(),
      opcionesCon({ comprimir: { maxLado: 10, calidad: 1 } }),
      entorno,
      () => {}
    ).iniciar()
    expect(resultado).toMatchObject({
      ok: false,
      error: MENSAJES_MOTOR.procesar,
    })
  })

  it("si el servidor no confirma, el reintento vuelve a subir a un destino nuevo", async () => {
    const confirmar = vi
      .fn()
      .mockResolvedValueOnce(
        fallo("El archivo no terminó de subir. Inténtalo de nuevo.")
      )
      .mockResolvedValueOnce(exito("fila-2"))
    const { entorno } = crearEntorno()
    const opciones = opcionesCon({ confirmar })
    const subida = crearSubida(archivo(), opciones, entorno, () => {})
    expect((await subida.iniciar()).ok).toBe(false)
    expect(await subida.iniciar()).toMatchObject({ ok: true, datos: "fila-2" })
    expect(opciones.preparar).toHaveBeenCalledTimes(2)
    expect(entorno.subirFirmada).toHaveBeenCalledTimes(2)
  })

  it("se pausa sin conexión y sigue sola al volver", async () => {
    const { entorno, conexion } = crearEntorno()
    conexion(false)
    const { estados, alCambiar } = registro()
    const promesa = crearSubida(
      archivo(),
      opcionesCon(),
      entorno,
      alCambiar
    ).iniciar()
    await esperarTicks()
    expect(estados.at(-1)).toBe("pausada")
    conexion(true)
    expect((await promesa).ok).toBe(true)
  })

  it("si se cae la conexión a mitad, detiene el intento y lo retoma sin contarlo", async () => {
    const subirFirmada = colgada()
    const { entorno, conexion } = crearEntorno({ subirFirmada })
    const { estados, alCambiar } = registro()
    const promesa = crearSubida(
      archivo(),
      opcionesCon(),
      entorno,
      alCambiar
    ).iniciar()
    await esperarTicks()
    expect(estados.at(-1)).toBe("subiendo")

    conexion(false)
    await esperarTicks()
    expect(estados.at(-1)).toBe("pausada")

    subirFirmada.mockImplementation(async () => {})
    conexion(true)
    expect((await promesa).ok).toBe(true)
    expect(subirFirmada).toHaveBeenCalledTimes(2)
    expect(entorno.esperar).not.toHaveBeenCalled()
  })

  it("se puede cancelar y luego retomar", async () => {
    const subirFirmada = colgada()
    const { entorno } = crearEntorno({ subirFirmada })
    const opciones = opcionesCon()
    const subida = crearSubida(archivo(), opciones, entorno, () => {})
    const promesa = subida.iniciar()
    await esperarTicks()
    subida.cancelar()
    expect(await promesa).toEqual({
      ok: false,
      error: MENSAJES_MOTOR.cancelada,
      cancelada: true,
    })
    expect(subida.instantanea().estado).toBe("cancelada")

    subirFirmada.mockImplementation(async () => {})
    expect((await subida.iniciar()).ok).toBe(true)
  })

  it("cancelar mientras procesa el archivo no pide destino ni sube nada", async () => {
    for (const enLinea of [true, false]) {
      let terminarValidacion = () => {}
      const { entorno, conexion } = crearEntorno({
        validarArchivo: vi.fn(
          (archivoValidado: File) =>
            new Promise<ResultadoValidacion>((resolver) => {
              terminarValidacion = () =>
                resolver({
                  ok: true as const,
                  tipo: archivoValidado.type,
                  dimensiones: null,
                  duracionSeg: null,
                })
            })
        ),
      })
      const opciones = opcionesCon({
        reglas: { mimes: ["image/png"], maxBytes: 10 * MIB },
      })
      const subida = crearSubida(archivo(), opciones, entorno, () => {})
      const promesa = subida.iniciar()
      await esperarTicks()
      expect(subida.instantanea().estado).toBe("procesando")

      conexion(enLinea)
      subida.cancelar()
      terminarValidacion()
      expect(await promesa, `en línea: ${enLinea}`).toMatchObject({
        ok: false,
        cancelada: true,
      })
      expect(subida.instantanea().estado).toBe("cancelada")
      expect(opciones.preparar).not.toHaveBeenCalled()
      expect(entorno.subirFirmada).not.toHaveBeenCalled()
      expect(opciones.confirmar).not.toHaveBeenCalled()
    }
  })

  it("un AbortError que no viene de la persona es un fallo, no una cancelación", async () => {
    const subirFirmada = vi.fn().mockRejectedValue(errorCancelada())
    const { entorno } = crearEntorno({ subirFirmada })
    const subida = crearSubida(
      archivo(),
      opcionesCon({ reintentos: 1 }),
      entorno,
      () => {}
    )
    expect(await subida.iniciar()).toEqual({
      ok: false,
      error: MENSAJES_MOTOR.servidor,
      cancelada: false,
    })
    expect(subida.instantanea().estado).toBe("error")
  })

  it("un conflicto TUS que no cede pide un destino nuevo al reintentar", async () => {
    const subir = vi.fn().mockRejectedValue(new ErrorSubida(409))
    const crearTus = vi.fn((): SubidaReanudable => ({
      subir,
      descartar: vi.fn(async () => {}),
    }))
    const { entorno } = crearEntorno({ crearTus })
    const opciones = opcionesCon({ reintentos: 1 })
    const subida = crearSubida(
      archivo(7 * MIB, "reel.mp4", "video/mp4"),
      opciones,
      entorno,
      () => {}
    )
    expect((await subida.iniciar()).ok).toBe(false)
    expect(subir).toHaveBeenCalledTimes(2)

    subir.mockResolvedValue(undefined)
    expect((await subida.iniciar()).ok).toBe(true)
    expect(opciones.preparar).toHaveBeenCalledTimes(2)
    expect(crearTus).toHaveBeenCalledTimes(2)
  })

  it("al cancelar una subida TUS la descarta en el servidor", async () => {
    const descartar = vi.fn(async () => {})
    const tus: SubidaReanudable = {
      subir: (senal) =>
        new Promise((_, rechazar) =>
          senal.addEventListener("abort", () => rechazar(errorCancelada()))
        ),
      descartar,
    }
    const { entorno } = crearEntorno({ crearTus: vi.fn(() => tus) })
    const subida = crearSubida(
      archivo(7 * MIB, "reel.mp4", "video/mp4"),
      opcionesCon(),
      entorno,
      () => {}
    )
    const promesa = subida.iniciar()
    await esperarTicks()
    subida.cancelar()
    await promesa
    expect(descartar).toHaveBeenCalledOnce()
  })

  it("una subida completada no se repite", async () => {
    const { entorno } = crearEntorno()
    const opciones = opcionesCon()
    const subida = crearSubida(archivo(), opciones, entorno, () => {})
    const primero = await subida.iniciar()
    expect(await subida.iniciar()).toBe(primero)
    expect(opciones.confirmar).toHaveBeenCalledOnce()
  })
})
