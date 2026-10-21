import { describe, expect, it } from "vitest"

import { datosExportacionAccesos } from "./exportacion"
import type { AccesoFila } from "./tipos"

const ACCESO: AccesoFila = {
  id: 1,
  at: "2026-09-30T22:30:00Z",
  evento: "LOGIN_EXITOSO",
  etiquetaEvento: "Ingreso",
  resultado: "EXITO",
  usuario: null,
  paisIso2: "CO",
  pais: "Colombia",
  bandera: "🇨🇴",
  ciudad: "Medellín",
  region: "Antioquia",
  dispositivo: "MOVIL",
  navegador: "Safari",
  sistemaOperativo: "iOS",
  ip: "181.52.•••.•••",
  aal: "aal2",
  sospechoso: true,
  motivoSospecha: "PAIS_INUSUAL",
}

describe("datosExportacionAccesos", () => {
  it("una fila legible por acceso, con tantas celdas como columnas", () => {
    const datos = datosExportacionAccesos([ACCESO])
    expect(datos.titulo).toBe("Accesos AMO")
    const [fila] = datos.filas
    expect(fila).toHaveLength(datos.columnas.length)
    expect(fila).toEqual([
      new Date(ACCESO.at),
      "Sin cuenta",
      null,
      null,
      "Ingreso",
      "Exitoso",
      "Colombia",
      "CO",
      "Medellín",
      "Antioquia",
      "Móvil",
      "Safari",
      "iOS",
      "181.52.•••.•••",
      "Dos pasos",
      true,
      "País inusual",
    ])
  })
})
