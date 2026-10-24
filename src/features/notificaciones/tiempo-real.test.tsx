import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type AlEstado = (estado: string) => void
type AlMensaje = (mensaje: { payload: unknown }) => void

interface CanalFalso {
  topico: string
  opciones: unknown
  filtro: unknown
  alMensaje: AlMensaje | null
  alEstado: AlEstado | null
}

const realtime = vi.hoisted(() => ({
  canales: [] as CanalFalso[],
  retirados: [] as CanalFalso[],
  setAuth: vi.fn(async () => {}),
}))

vi.mock("@/lib/supabase/client", () => ({
  obtenerClienteNavegador: () => ({
    realtime: { setAuth: realtime.setAuth },
    channel: (topico: string, opciones: unknown) => {
      const canal: CanalFalso = {
        topico,
        opciones,
        filtro: null,
        alMensaje: null,
        alEstado: null,
      }
      realtime.canales.push(canal)
      const api = {
        on: (_tipo: string, filtro: unknown, alMensaje: AlMensaje) => {
          canal.filtro = filtro
          canal.alMensaje = alMensaje
          return api
        },
        subscribe: (alEstado: AlEstado) => {
          canal.alEstado = alEstado
          return api
        },
        canal,
      }
      return api
    },
    removeChannel: vi.fn(async (api: { canal: CanalFalso }) => {
      realtime.retirados.push(api.canal)
      return "ok"
    }),
  }),
}))
vi.mock("./actions", () => ({
  marcarNotificaciones: vi.fn(),
  marcarTodasLeidas: vi.fn(),
}))

const { useCanalNotificaciones } = await import("./tiempo-real")
const { CLAVES_NOTIFICACIONES } = await import("./fuente")
const { fijarEnVivo } = await import("./en-vivo")

function preparar() {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  cliente.setQueryData(CLAVES_NOTIFICACIONES.conteo, {
    disponible: true,
    total: 1,
  })
  cliente.setQueryData(CLAVES_NOTIFICACIONES.recientes, {
    disponible: true,
    notificaciones: [],
  })
  const envoltura = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
  )
  return { cliente, envoltura }
}

/** Deja correr las promesas pendientes (retiro previo y `setAuth`). */
async function drenar() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

function ultimo(): CanalFalso {
  const canal = realtime.canales.at(-1)
  if (!canal) throw new Error("No se abrió ningún canal.")
  return canal
}

beforeEach(() => {
  vi.useFakeTimers()
  realtime.canales.length = 0
  realtime.retirados.length = 0
  realtime.setAuth.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  fijarEnVivo(false)
})

describe("useCanalNotificaciones", () => {
  it("abre el canal privado del usuario después de fijar el token", async () => {
    const { envoltura } = preparar()
    const { result } = renderHook(() => useCanalNotificaciones("u-1"), {
      wrapper: envoltura,
    })
    await drenar()

    expect(realtime.setAuth).toHaveBeenCalledTimes(1)
    expect(realtime.canales).toHaveLength(1)
    expect(ultimo()).toMatchObject({
      topico: "usuario:u-1",
      opciones: { config: { private: true } },
      filtro: { event: "notificacion" },
    })
    expect(result.current).toBe(false)

    act(() => ultimo().alEstado?.("SUBSCRIBED"))
    expect(result.current).toBe(true)
  })

  it("un aviso fija el contador al instante e invalida el resto una vez por ráfaga", async () => {
    const { cliente, envoltura } = preparar()
    const alRecibir = vi.fn()
    renderHook(() => useCanalNotificaciones("u-1", { alRecibir }), {
      wrapper: envoltura,
    })
    await drenar()
    act(() => ultimo().alEstado?.("SUBSCRIBED"))
    const invalidar = vi.spyOn(cliente, "invalidateQueries")

    act(() => {
      ultimo().alMensaje?.({
        payload: {
          id: 5,
          tipo: "oferta.publicada",
          prioridad: 0,
          no_leidas: 2,
        },
      })
      ultimo().alMensaje?.({
        payload: {
          id: 6,
          tipo: "oferta.publicada",
          prioridad: 2,
          no_leidas: 3,
        },
      })
    })

    expect(cliente.getQueryData(CLAVES_NOTIFICACIONES.conteo)).toEqual({
      disponible: true,
      total: 3,
    })
    expect(alRecibir).toHaveBeenCalledTimes(2)
    expect(alRecibir).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 6, prioridad: 2 })
    )
    expect(invalidar).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(invalidar).toHaveBeenCalledTimes(1)
    expect(
      cliente.getQueryState(CLAVES_NOTIFICACIONES.recientes)?.isInvalidated
    ).toBe(true)
    expect(
      cliente.getQueryState(CLAVES_NOTIFICACIONES.conteo)?.isInvalidated
    ).toBe(false)
  })

  it("descarta una carga que no cumple el esquema", async () => {
    const { cliente, envoltura } = preparar()
    const alRecibir = vi.fn()
    renderHook(() => useCanalNotificaciones("u-1", { alRecibir }), {
      wrapper: envoltura,
    })
    await drenar()
    act(() =>
      ultimo().alMensaje?.({ payload: { id: "x", no_leidas: 99, titulo: "?" } })
    )
    expect(cliente.getQueryData(CLAVES_NOTIFICACIONES.conteo)).toEqual({
      disponible: true,
      total: 1,
    })
    expect(alRecibir).not.toHaveBeenCalled()
  })

  it("si el canal cae, vuelve al sondeo, reabre con espera e invalida al reconectar", async () => {
    const { cliente, envoltura } = preparar()
    const { result } = renderHook(() => useCanalNotificaciones("u-1"), {
      wrapper: envoltura,
    })
    await drenar()
    const primero = ultimo()
    act(() => primero.alEstado?.("SUBSCRIBED"))
    expect(result.current).toBe(true)

    act(() => primero.alEstado?.("CHANNEL_ERROR"))
    expect(result.current).toBe(false)
    await drenar()
    expect(realtime.retirados).toContain(primero)
    // El cierre que provoca el propio retiro no programa otra reconexión.
    act(() => primero.alEstado?.("CLOSED"))
    expect(realtime.canales).toHaveLength(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(realtime.canales).toHaveLength(2)
    const invalidar = vi.spyOn(cliente, "invalidateQueries")
    act(() => ultimo().alEstado?.("SUBSCRIBED"))
    expect(result.current).toBe(true)
    expect(invalidar).toHaveBeenCalledWith({
      queryKey: CLAVES_NOTIFICACIONES.todas,
    })
  })

  it("al desmontar retira el canal y apaga el estado en vivo", async () => {
    const { envoltura } = preparar()
    const { result, unmount } = renderHook(
      () => useCanalNotificaciones("u-1"),
      { wrapper: envoltura }
    )
    await drenar()
    const canal = ultimo()
    act(() => canal.alEstado?.("SUBSCRIBED"))
    expect(result.current).toBe(true)

    unmount()
    await drenar()
    expect(realtime.retirados).toContain(canal)
    const otra = renderHook(() => useCanalNotificaciones("u-2"), {
      wrapper: envoltura,
    })
    expect(otra.result.current).toBe(false)
    otra.unmount()
  })
})
