import { describe, expect, it } from "vitest"

import {
  banderaEmoji,
  esDispositivo,
  etiquetaMotivoSospecha,
  EVENTOS,
  EVENTOS_ACCESO,
  RESULTADOS,
} from "./catalogo"

describe("catálogo de accesos", () => {
  it("cada evento del enum tiene etiqueta y un resultado conocido", () => {
    for (const evento of EVENTOS_ACCESO) {
      expect(EVENTOS[evento].etiqueta).not.toBe("")
      expect(RESULTADOS[EVENTOS[evento].resultado]).toBeDefined()
    }
    expect(EVENTOS.LOGIN_FALLIDO.resultado).toBe("FALLO")
    expect(EVENTOS.LOGIN_BLOQUEADO.resultado).toBe("BLOQUEO")
  })

  it("banderas con indicadores regionales; null si no es ISO2", () => {
    expect(banderaEmoji("CO")).toBe("🇨🇴")
    expect(banderaEmoji("us")).toBe("🇺🇸")
    expect(banderaEmoji("COL")).toBeNull()
    expect(banderaEmoji("1A")).toBeNull()
    expect(banderaEmoji(null)).toBeNull()
  })

  it("motivos de sospecha legibles, también los nuevos", () => {
    expect(etiquetaMotivoSospecha("PAIS_INUSUAL")).toBe("País inusual")
    expect(etiquetaMotivoSospecha("HORARIO_ATIPICO")).toBe("Horario atipico")
    expect(etiquetaMotivoSospecha(null)).toBe("Actividad sospechosa")
  })

  it("dispositivos válidos", () => {
    expect(esDispositivo("MOVIL")).toBe(true)
    expect(esDispositivo("NEVERA")).toBe(false)
    expect(esDispositivo(null)).toBe(false)
  })
})
