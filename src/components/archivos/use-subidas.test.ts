import { describe, expect, it, vi } from "vitest"

vi.mock("./entorno-navegador", () => ({ ENTORNO_NAVEGADOR: {} }))

import { errorCancelada } from "@/lib/archivos/reintentos"
import { exito } from "@/lib/result"

import type { EntornoSubida } from "./motor-subida"
import {
  crearColaSubidas,
  type ElementoSubida,
  type OpcionesSubidas,
} from "./use-subidas"

/** Subidas que terminan cuando la prueba lo decide. */
function entornoControlado() {
  const pendientes: { resolver: () => void; nombre: string }[] = []
  const entorno = {
    subirFirmada: vi.fn(
      ({ archivo, senal }: { archivo: File; senal: AbortSignal }) =>
        new Promise<void>((resolver, rechazar) => {
          pendientes.push({ resolver, nombre: archivo.name })
          senal.addEventListener("abort", () => rechazar(errorCancelada()))
        })
    ),
    enLinea: () => true,
    alCambiarConexion: () => () => {},
    esperar: async () => {},
    ahora: () => 0,
    aleatorio: () => 1,
  } as unknown as EntornoSubida
  return { entorno, pendientes }
}

function montar(
  entorno: EntornoSubida,
  cambios: Partial<OpcionesSubidas<string>> = {}
) {
  let elementos: ElementoSubida<string>[] = []
  const opciones = {
    current: {
      preparar: vi.fn(async (descripcion: { nombre: string }) =>
        exito({
          bucket: "evidencias" as const,
          ruta: `r/${descripcion.nombre}`,
          token: "t",
          miniatura: null,
        })
      ),
      confirmar: vi.fn(async (archivo: { ruta: string }) =>
        exito(`fila:${archivo.ruta}`)
      ),
      ...cambios,
    } as OpcionesSubidas<string>,
  }
  const cola = crearColaSubidas(
    opciones,
    (cambio) => {
      elementos = cambio(elementos)
    },
    entorno
  )
  return { cola, opciones, elementos: () => elementos }
}

const archivo = (nombre: string) =>
  new File(["x"], nombre, { type: "application/pdf" })
const esperarTicks = () => new Promise((resolver) => setTimeout(resolver, 0))

describe("cola de subidas", () => {
  it("respeta la concurrencia y avanza al terminar cada una", async () => {
    const { entorno, pendientes } = entornoControlado()
    const alCompletar = vi.fn()
    const { cola, elementos } = montar(entorno, {
      concurrencia: 2,
      alCompletar,
    })
    cola.agregar([archivo("a.pdf"), archivo("b.pdf"), archivo("c.pdf")])
    await esperarTicks()

    expect(pendientes.map((p) => p.nombre)).toEqual(["a.pdf", "b.pdf"])
    expect(elementos().map((e) => e.estado)).toEqual([
      "subiendo",
      "subiendo",
      "en-cola",
    ])

    pendientes[0].resolver()
    await esperarTicks()
    expect(pendientes.map((p) => p.nombre)).toEqual(["a.pdf", "b.pdf", "c.pdf"])
    expect(elementos()[0]).toMatchObject({
      estado: "completada",
      resultado: "fila:r/a.pdf",
    })
    expect(alCompletar).toHaveBeenCalledWith(
      "fila:r/a.pdf",
      expect.objectContaining({ ruta: "r/a.pdf" })
    )
  })

  it("cancelar una en cola la quita; en curso la cancela y se puede reintentar", async () => {
    const { entorno, pendientes } = entornoControlado()
    const { cola, elementos } = montar(entorno, { concurrencia: 1 })
    cola.agregar([archivo("a.pdf"), archivo("b.pdf")])
    await esperarTicks()
    const [a, b] = elementos()

    cola.cancelar(b.id)
    expect(elementos().map((e) => e.nombre)).toEqual(["a.pdf"])

    cola.cancelar(a.id)
    await esperarTicks()
    expect(elementos()[0].estado).toBe("cancelada")

    cola.reintentar(a.id)
    await esperarTicks()
    expect(elementos()[0].estado).toBe("subiendo")
    pendientes.at(-1)?.resolver()
    await esperarTicks()
    expect(elementos()[0].estado).toBe("completada")
  })

  it("reintentar una completada no la repite ni avisa dos veces", async () => {
    const { entorno, pendientes } = entornoControlado()
    const alCompletar = vi.fn()
    const { cola, elementos } = montar(entorno, { alCompletar })
    cola.agregar([archivo("a.pdf")])
    await esperarTicks()
    pendientes[0].resolver()
    await esperarTicks()
    const [a] = elementos()
    expect(a.estado).toBe("completada")

    cola.reintentar(a.id)
    await esperarTicks()
    expect(elementos()[0].estado).toBe("completada")
    expect(alCompletar).toHaveBeenCalledOnce()
  })

  it("quitar completadas deja las demás", async () => {
    const { entorno, pendientes } = entornoControlado()
    const { cola, elementos } = montar(entorno, { concurrencia: 2 })
    cola.agregar([archivo("a.pdf"), archivo("b.pdf")])
    await esperarTicks()
    pendientes[0].resolver()
    await esperarTicks()
    cola.quitarCompletadas()
    expect(elementos().map((e) => e.nombre)).toEqual(["b.pdf"])
  })
})
