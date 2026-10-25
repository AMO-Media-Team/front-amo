import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import {
  EMPRESA_SIN_NOMBRE,
  type ModoGestion,
  modoAsistido,
} from "@/features/campanas/rutas-gestion"
import { accionesGestion } from "@/features/ofertas/acciones"
import { rutaAnunciante } from "@/features/operacion/rutas"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
vi.mock("@/features/ofertas/actions", () => ({
  enviarOfertaARevision: vi.fn(),
  retirarOfertaDeRevision: vi.fn(),
  cancelarOferta: vi.fn(),
  archivarOferta: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }))

import {
  PanelGestionAsistida,
  TITULO_GESTION_ASISTIDA,
} from "./panel-gestion-asistida"

const OFERTA = "0192f3a4-5b6c-7d8e-9f01-0000000000f1"
const CAMPANA = "0192f3a4-5b6c-7d8e-9f01-0000000000c1"
const ANUNCIANTE = "e2e00000-0000-4000-8000-00000000a001"
/** OPERACIONES: gestiona y modera ofertas. */
const OPERACIONES = [
  "ofertas.gestionar",
  "ofertas.moderar",
  "ofertas.ver",
  "campanas.ver",
]
const GESTION: Extract<ModoGestion, { modo: "asistido" }> = {
  modo: "asistido",
  anuncianteId: ANUNCIANTE,
  anunciante: "Anunciante E2E",
}

type Estado = Parameters<typeof accionesGestion>[0]

function pintar(estado: Estado, enlace = true, gestion = GESTION) {
  return render(
    <PanelGestionAsistida
      oferta={{ id: OFERTA, campanaId: CAMPANA, titulo: "Reel", estado }}
      opciones={accionesGestion(estado, "ADMIN", OPERACIONES, {
        cuposOcupados: 0,
      })}
      gestion={gestion}
      enlaceAnunciante={enlace ? rutaAnunciante(ANUNCIANTE) : null}
    />
  )
}

describe("PanelGestionAsistida", () => {
  it("dice por cuenta de quién se actúa y ofrece lo del borrador con rutas de Operación", () => {
    pintar("BORRADOR")
    const panel = screen
      .getByRole("heading", { name: TITULO_GESTION_ASISTIDA })
      .closest("section")
    expect(panel).not.toBeNull()
    const enPanel = within(panel as HTMLElement)
    // Solo los cambios de estado de la oferta llegan como aviso.
    expect(panel).toHaveTextContent(
      "Actúas por cuenta de Anunciante E2E. Cada cambio queda en la bitácora a tu nombre; la empresa recibe un aviso cuando envías, retiras o cancelas la oferta."
    )
    expect(
      enPanel.getByRole("link", { name: "Anunciante E2E" })
    ).toHaveAttribute("href", `/operacion/anunciantes/${ANUNCIANTE}`)
    expect(enPanel.getByRole("link", { name: "Editar" })).toHaveAttribute(
      "href",
      `/operacion/ofertas/${OFERTA}/editar`
    )
    expect(
      enPanel.getByRole("button", { name: "Enviar a revisión" })
    ).toBeInTheDocument()
    expect(
      enPanel.getByRole("button", { name: "Cancelar oferta" })
    ).toBeInTheDocument()
  })

  it("en revisión solo retira: publicar o devolver son de la moderación", () => {
    pintar("EN_REVISION")
    expect(
      screen.getByRole("button", { name: "Retirar de revisión" })
    ).toBeInTheDocument()
    expect(screen.getAllByRole("button")).toHaveLength(1)
    expect(screen.queryByRole("button", { name: /Publicar/ })).toBeNull()
  })

  it("sin acciones para el estado no pinta nada", () => {
    const { container } = pintar("CUPOS_COMPLETOS")
    expect(container).toBeEmptyDOMElement()
  })

  it("sin el nombre de la empresa, la nombra genéricamente y concuerda", () => {
    pintar("BORRADOR", false, modoAsistido(ANUNCIANTE, null))
    expect(GESTION.anunciante).not.toBe(EMPRESA_SIN_NOMBRE)
    expect(
      screen.getByText(/^Actúas por cuenta de la empresa\. Cada cambio/)
    ).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /empresa/ })).toBeNull()
  })

  it("sin acceso a la ficha del anunciante, lo nombra sin enlace", () => {
    pintar("DEVUELTA", false)
    expect(screen.queryByRole("link", { name: "Anunciante E2E" })).toBeNull()
    expect(screen.getByText("Anunciante E2E")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Reenviar a revisión" })
    ).toBeInTheDocument()
  })
})
