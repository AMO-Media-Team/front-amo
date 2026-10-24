import { describe, expect, it } from "vitest"

import { rutaDispersion, rutaVistaPagosMedios } from "./rutas"
import {
  cargarVistaPagos,
  estadoTablaDispersiones,
  estadoTablaPorPagar,
} from "./vistas"

describe("cargarVistaPagos", () => {
  it("por omisión «Por pagar»; un valor desconocido también", async () => {
    expect(await cargarVistaPagos(Promise.resolve({}))).toEqual({
      vista: "por-pagar",
    })
    expect(await cargarVistaPagos(Promise.resolve({ vista: "otra" }))).toEqual({
      vista: "por-pagar",
    })
    expect(
      await cargarVistaPagos(Promise.resolve({ vista: "dispersiones" }))
    ).toEqual({ vista: "dispersiones" })
  })
})

describe("estado de las tablas en la URL", () => {
  it("«Por pagar»: las más antiguas primero y filtros de la lista blanca", async () => {
    const estado = await estadoTablaPorPagar.cargar(
      Promise.resolve({
        preparacion: "lista,inventado,en_archivo",
        metodo: "BILLETERA",
      })
    )
    expect(estado.orden).toEqual({ campo: "aprobada", descendente: false })
    expect(estado.preparacion).toEqual(["lista", "en_archivo"])
    expect(estado.metodo).toEqual(["BILLETERA"])
  })

  it("archivos: el más reciente primero; un orden ajeno se ignora", async () => {
    const estado = await estadoTablaDispersiones.cargar(
      Promise.resolve({ orden: "aprobada.asc" })
    )
    expect(estado.orden).toEqual({ campo: "fecha", descendente: true })
  })
})

describe("rutas", () => {
  it("arma la vista y la ficha de un archivo", () => {
    expect(rutaVistaPagosMedios("dispersiones")).toBe(
      "/finanzas/pagos?vista=dispersiones"
    )
    expect(rutaDispersion("0199f3a0-0000-7000-8000-00000000a501")).toBe(
      "/finanzas/pagos/0199f3a0-0000-7000-8000-00000000a501"
    )
  })
})
