import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  AvisoSeguridadSocial,
  CondicionTributariaMedio,
  PorLiquidar,
} from "./secciones-ganancias"

/** Los separadores de Intl (U+00A0, U+202F) como espacios, para comparar. */
const plano = (texto: string | null) => (texto ?? "").replace(/[  ]/g, " ")

const ASIGNACION = {
  id: "0199f3a0-0000-7000-8000-00000000a501",
  oferta: "Video de TikTok · Amor y Amistad",
  marca: "Supermercados La Cosecha",
  plataforma: "TIKTOK" as const,
  formato: "Video",
  verificadaAt: "2026-10-14T22:15:18+00:00",
  montoMedio: 476_080,
}

describe("PorLiquidar", () => {
  it("cada verificada con su valor estimado y el total antes de retenciones (MED-015 c2)", () => {
    render(
      <PorLiquidar
        asignaciones={[ASIGNACION]}
        total={3}
        valorTotal={1_707_440}
        enlazarCampanas
      />
    )
    const region = screen.getByRole("region", { name: "Por liquidar" })
    expect(
      within(region).getByRole("link", { name: ASIGNACION.oferta })
    ).toHaveAttribute("href", `/mis-campanas/${ASIGNACION.id}`)
    expect(plano(within(region).getByRole("listitem").textContent)).toContain(
      "$ 476.080"
    )
    expect(
      within(region).getByText(/Estimado antes de retenciones/)
    ).toHaveTextContent("1.707.440")
    expect(
      within(region).getByText("Y 2 publicaciones más, incluidas en el total.")
    ).toBeVisible()
  })

  it("sin permiso para ver campañas no enlaza; vacío, explica cuándo aparecen", () => {
    const { unmount } = render(
      <PorLiquidar
        asignaciones={[ASIGNACION]}
        total={1}
        valorTotal={476_080}
        enlazarCampanas={false}
      />
    )
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    unmount()
    render(
      <PorLiquidar asignaciones={[]} total={0} valorTotal={0} enlazarCampanas />
    )
    expect(
      screen.getByText(/No tienes publicaciones por liquidar/)
    ).toBeVisible()
    expect(screen.queryByText(/Estimado antes/)).not.toBeInTheDocument()
  })
})

describe("CondicionTributariaMedio", () => {
  it("su condición y el enlace a sus datos de pago", () => {
    render(
      <CondicionTributariaMedio
        condicion={{
          esDeclarante: false,
          obligadoFacturar: true,
          responsableIva: false,
        }}
        enlacePago
      />
    )
    expect(screen.getByText("No declaras renta")).toBeVisible()
    expect(screen.getByText("Facturas tus servicios")).toBeVisible()
    expect(
      screen.getByRole("link", { name: "Revisar mis datos de pago" })
    ).toHaveAttribute("href", "/mi-medio/pago")
  })

  it("sin registrar invita a hacerlo (si puede editar su medio)", () => {
    const { unmount } = render(
      <CondicionTributariaMedio condicion={null} enlacePago />
    )
    expect(
      screen.getByRole("link", { name: "Registrar mis datos de pago" })
    ).toBeVisible()
    unmount()
    render(<CondicionTributariaMedio condicion={null} enlacePago={false} />)
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })
})

describe("AvisoSeguridadSocial", () => {
  it("«Seguridad social pendiente» con el enlace a sus documentos", () => {
    render(<AvisoSeguridadSocial enlaceDocumentos />)
    const aviso = screen.getByRole("region", {
      name: "Seguridad social pendiente",
    })
    expect(
      within(aviso).getByRole("link", {
        name: "Cargar mi planilla de seguridad social",
      })
    ).toHaveAttribute("href", "/mi-medio/documentos")
  })

  it("con la política BLOQUEAR dice que sin ella no se aprueba", () => {
    render(<AvisoSeguridadSocial bloquea enlaceDocumentos={false} />)
    expect(screen.getByText(/no podemos aprobar ni pagar/)).toBeVisible()
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })
})
