import { act, renderHook } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useEstadoBarraLateral } from "./use-estado-barra-lateral"
import {
  COOKIE_VISTA_TABLET,
  cookieVistaTablet,
  pistaVistaTablet,
} from "./vista-tablet"

function simularAncho(tablet: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (consulta: string) =>
      ({
        matches: tablet,
        media: consulta,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList
  )
}

/** Lo que pinta el servidor: abierta o colapsada. */
function Sonda(props: { preferencia: boolean | null; tablet: boolean }) {
  const { abierta, asentada } = useEstadoBarraLateral(
    props.preferencia,
    props.tablet
  )
  return (
    <span>{`${abierta ? "abierta" : "colapsada"}|${asentada ? "asentada" : "inicial"}`}</span>
  )
}

const enServidor = (preferencia: boolean | null, tablet: boolean) =>
  renderToString(<Sonda preferencia={preferencia} tablet={tablet} />)

afterEach(() => {
  vi.restoreAllMocks()
  document.cookie = `${COOKIE_VISTA_TABLET}=; path=/; max-age=0`
})

describe("pista de vista tablet", () => {
  it("solo «1» significa tablet; sin cookie se asume escritorio", () => {
    expect(pistaVistaTablet("1")).toBe(true)
    expect(pistaVistaTablet("0")).toBe(false)
    expect(pistaVistaTablet(undefined)).toBe(false)
    expect(pistaVistaTablet("true")).toBe(false)
  })

  it("la cookie vale para todo el sitio y dura un año", () => {
    expect(cookieVistaTablet(true)).toBe(
      `${COOKIE_VISTA_TABLET}=1; path=/; max-age=31536000; samesite=lax`
    )
    expect(cookieVistaTablet(false)).toContain(`${COOKIE_VISTA_TABLET}=0;`)
  })
})

describe("useEstadoBarraLateral", () => {
  it("el servidor pinta colapsada si la visita anterior fue en tablet", () => {
    expect(enServidor(null, true)).toContain("colapsada|inicial")
    expect(enServidor(null, false)).toContain("abierta|inicial")
  })

  it("la preferencia guardada manda sobre el ancho", () => {
    expect(enServidor(true, true)).toContain("abierta")
    expect(enServidor(false, false)).toContain("colapsada")
  })

  it("en el navegador manda el ancho real y lo anota para la próxima visita", () => {
    simularAncho(true)
    const { result } = renderHook(() => useEstadoBarraLateral(null, false))
    expect(result.current.abierta).toBe(false)
    expect(pistaVistaTablet(valorCookie())).toBe(true)
  })

  it("alternar fija la preferencia aunque el ancho diga otra cosa", () => {
    simularAncho(true)
    const { result } = renderHook(() => useEstadoBarraLateral(null, true))
    act(() => result.current.setAbierta(true))
    expect(result.current.abierta).toBe(true)
  })

  it("se da por asentada tras el primer cuadro (ahí ya puede animarse)", async () => {
    simularAncho(false)
    const { result } = renderHook(() => useEstadoBarraLateral(null, false))
    expect(result.current.asentada).toBe(false)
    await act(
      () => new Promise<void>((listo) => requestAnimationFrame(() => listo()))
    )
    expect(result.current.asentada).toBe(true)
  })
})

function valorCookie(): string | undefined {
  return document.cookie
    .split("; ")
    .find((par) => par.startsWith(`${COOKIE_VISTA_TABLET}=`))
    ?.split("=")[1]
}
