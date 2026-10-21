import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { exito, fallo } from "@/lib/result"

import type { EventoHistorial } from "../tipos"
import {
  HojaHistorial,
  type ObjetivoHistorial,
  type PedidoHistorial,
} from "./hoja-historial"

const CREACION: EventoHistorial = {
  id: 2,
  at: "2026-10-05T22:12:00+00:00",
  accion: "INSERT",
  actor: "Laura Gómez",
  origen: "APP",
  cambios: {
    id: "01a10e20-0000-7000-8000-000000000001",
    anunciante_id: "e2e00000-0000-7000-8000-000000000001",
    campana_id: null,
    porcentaje: 0.15,
    vigente_desde: "2026-11-15T05:00:00+00:00",
    vigente_hasta: null,
    motivo: "Acuerdo de volumen anual.",
    creada_por: "d7629de4-0000-7000-8000-000000000001",
    created_at: "2026-10-05T22:12:00+00:00",
    updated_at: "2026-10-05T22:12:00+00:00",
  },
}

const EDICION: EventoHistorial = {
  id: 3,
  at: "2026-10-05T22:13:00+00:00",
  accion: "UPDATE",
  actor: "Laura Gómez",
  origen: "APP",
  cambios: { porcentaje: { antes: 0.15, despues: 0.125 } },
}

function abrir(
  objetivo: Partial<ObjetivoHistorial>,
  eventos: EventoHistorial[] | null
) {
  const pedido: PedidoHistorial = {
    objetivo: {
      entidad: "comisiones_excepcion",
      entidadId: "01a10e20-0000-7000-8000-000000000001",
      titulo: "Excepción · Alimentos del Valle",
      ...objetivo,
    },
    promesa: Promise.resolve(
      eventos
        ? exito(eventos)
        : fallo("No tienes permiso para ver la bitácora.")
    ),
  }
  render(<HojaHistorial pedido={pedido} abierta onAbiertaChange={() => {}} />)
}

describe("HojaHistorial", () => {
  it("en la creación oculta las columnas técnicas (id, autor y marcas de tiempo)", async () => {
    abrir({}, [CREACION])
    const hoja = await screen.findByRole("dialog")
    expect(await within(hoja).findByText("Creación")).toBeInTheDocument()
    expect(
      within(hoja).getByText("Acuerdo de volumen anual.")
    ).toBeInTheDocument()
    // El evento ya dice quién y cuándo: no se repiten como campos.
    expect(within(hoja).queryByText("ID")).not.toBeInTheDocument()
    expect(within(hoja).queryByText("Creada por")).not.toBeInTheDocument()
    expect(within(hoja).queryByText("Creado")).not.toBeInTheDocument()
    expect(within(hoja).queryByText(/^01a10e20/)).not.toBeInTheDocument()
    expect(within(hoja).queryByText(/^d7629de4/)).not.toBeInTheDocument()
  })

  it("con `camposCreacion` muestra solo esos campos del alta", async () => {
    abrir({ camposCreacion: ["porcentaje", "motivo"] }, [CREACION])
    const hoja = await screen.findByRole("dialog")
    expect(
      await within(hoja).findByText("Acuerdo de volumen anual.")
    ).toBeInTheDocument()
    // El id del anunciante no dice nada: el destinatario va en el título.
    expect(within(hoja).queryByText(/^e2e00000/)).not.toBeInTheDocument()
    expect(within(hoja).queryByText(/Vigente desde/)).not.toBeInTheDocument()
  })

  it("en la eliminación también oculta las columnas técnicas de la fila borrada", async () => {
    abrir({ camposCreacion: ["motivo"] }, [
      { ...CREACION, id: 4, accion: "DELETE" },
    ])
    const hoja = await screen.findByRole("dialog")
    expect(await within(hoja).findByText("Eliminación")).toBeInTheDocument()
    expect(
      within(hoja).getByText("Acuerdo de volumen anual.")
    ).toBeInTheDocument()
    // `camposCreacion` solo recorta el alta: del borrado se ve qué se perdió.
    expect(within(hoja).getByText(/Vigente desde/)).toBeInTheDocument()
    expect(within(hoja).queryByText("ID")).not.toBeInTheDocument()
    expect(within(hoja).queryByText("Creado")).not.toBeInTheDocument()
  })

  it("una edición siempre muestra todo lo que cambió, con el formato propio del campo", async () => {
    abrir(
      {
        camposCreacion: ["motivo"],
        formatearCampo: (campo, valor) =>
          campo === "porcentaje" && typeof valor === "number"
            ? `${valor * 100} por ciento`
            : null,
      },
      [EDICION]
    )
    const hoja = await screen.findByRole("dialog")
    expect(await within(hoja).findByText("15 por ciento")).toBeInTheDocument()
    expect(within(hoja).getByText("12.5 por ciento")).toBeInTheDocument()
  })

  it("sin eventos explica que el valor conserva la configuración inicial", async () => {
    abrir({}, [])
    expect(
      await screen.findByText("Sin cambios registrados")
    ).toBeInTheDocument()
  })

  it("un fallo de la consulta se muestra dentro de la hoja y enlaza a la bitácora", async () => {
    abrir({}, null)
    const hoja = await screen.findByRole("dialog")
    expect(
      await within(hoja).findByText("No tienes permiso para ver la bitácora.")
    ).toBeInTheDocument()
    expect(
      within(hoja).getByText("Abrir en la bitácora de auditoría").closest("a")
    ).toHaveAttribute(
      "href",
      "/administracion/auditoria?entidad=comisiones_excepcion&q=01a10e20-0000-7000-8000-000000000001"
    )
  })
})
