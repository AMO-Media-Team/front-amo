import { describe, expect, it } from "vitest"

import { formatearCompacto } from "@/lib/format"

import {
  coincidenciasDeMedio,
  enlaceTelefono,
  enlaceWhatsapp,
  ESTADOS_SOLICITUD,
  type FilaMedio,
  lecturaSeguidores,
  leerCuentasDeclaradas,
  medioYaRegistrado,
  nombreNormalizadoMedio,
  resumenPendientes,
  textoSeguidores,
} from "./presentacion"

describe("nombreNormalizadoMedio", () => {
  // Valores calculados por `private.normalizar_texto` (base local).
  it.each([
    ["Noticias Bogotá D.C.", "noticias bogota"],
    ["Radio DC", "radio"],
    ["Distrito Capital", "distrito capital"],
    ["La Voz & El Eco", "la voz y el eco"],
    ["Ñandú.TV", "nandutv"],
    ["Café ¥ Ya", "cafe n ya"],
    ["Noticias de Cúcuta (Norte)", "noticias de cucuta norte"],
  ])("«%s» → «%s», igual que `medios.nombre_normalizado`", (nombre, bd) => {
    expect(nombreNormalizadoMedio(nombre)).toBe(bd)
  })
})

describe("ESTADOS_SOLICITUD", () => {
  it("nombra los tres estados de la cola", () => {
    expect(ESTADOS_SOLICITUD.PENDIENTE.etiqueta).toBe("Por atender")
    expect(ESTADOS_SOLICITUD.INVITADA.tono).toBe("exito")
    expect(ESTADOS_SOLICITUD.DESCARTADA.tono).toBe("neutro")
  })
})

describe("leerCuentasDeclaradas", () => {
  it("lee las cuentas válidas y omite lo que no tiene forma de cuenta", () => {
    expect(
      leerCuentasDeclaradas([
        { plataforma: "INSTAGRAM", usuario: "medio", seguidores: 45000 },
        { plataforma: "TIKTOK", usuario: "medio" },
        { plataforma: "X", usuario: "medio" },
        { plataforma: "FACEBOOK", usuario: "" },
        { plataforma: "FACEBOOK", usuario: "pagina", seguidores: "mucho" },
        "texto",
        null,
        [1],
      ])
    ).toEqual([
      { plataforma: "INSTAGRAM", usuario: "medio", seguidores: 45000 },
      { plataforma: "TIKTOK", usuario: "medio", seguidores: null },
      { plataforma: "FACEBOOK", usuario: "pagina", seguidores: null },
    ])
  })

  it("devuelve una lista vacía si la columna no es un arreglo", () => {
    expect(leerCuentasDeclaradas(null)).toEqual([])
    expect(leerCuentasDeclaradas({ plataforma: "INSTAGRAM" })).toEqual([])
  })
})

describe("textoSeguidores", () => {
  it("abrevia la cifra con la regla de la plataforma", () => {
    expect(textoSeguidores(45_000)).toBe(
      `${formatearCompacto(45_000)} seguidores`
    )
    expect(textoSeguidores(45_000)).toMatch(/^45\smil seguidores$/)
    expect(textoSeguidores(1)).toBe("1 seguidor")
    expect(textoSeguidores(null)).toBe("Seguidores sin declarar")
  })
})

describe("coincidenciasDeMedio", () => {
  const SOLICITUD = {
    nombreMedio: "Noticias del Sur",
    municipioCodigo: "52001",
    recibidaAt: "2026-10-20T15:00:00Z",
  }
  const medio = (parcial: Partial<FilaMedio>): FilaMedio => ({
    id: "m",
    nombre: "Noticias del Sur",
    estado: "PENDIENTE",
    municipioCodigo: "52001",
    municipio: "Pasto, Nariño",
    creadoAt: "2026-01-01T00:00:00Z",
    ...parcial,
  })

  it("reconoce el mismo medio con o sin «D.C.», como la BD", () => {
    const resultado = coincidenciasDeMedio(
      { ...SOLICITUD, nombreMedio: "Noticias Bogotá" },
      [
        medio({ id: "dc", nombre: "Noticias Bogotá D.C." }),
        medio({ id: "distrito", nombre: "Noticias Bogotá, Distrito Capital" }),
        medio({ id: "otro", nombre: "Noticias Bogotá Norte" }),
      ]
    )
    expect(resultado.map((m) => m.id).sort()).toEqual(["dc", "distrito"])
  })

  it("compara sin tildes, mayúsculas ni puntuación", () => {
    const resultado = coincidenciasDeMedio(SOLICITUD, [
      medio({ id: "a", nombre: "NOTICIAS DEL SUR." }),
      medio({ id: "b", nombre: "Notícias  del   Sur" }),
      medio({ id: "c", nombre: "Noticias del Norte" }),
    ])
    expect(resultado.map((m) => m.id).sort()).toEqual(["a", "b"])
  })

  it("marca y pone primero el medio que salió de la solicitud", () => {
    const resultado = coincidenciasDeMedio(SOLICITUD, [
      medio({ id: "otro-municipio", municipioCodigo: "05001" }),
      medio({ id: "antiguo" }),
      medio({ id: "nuevo", creadoAt: "2026-10-21T10:00:00Z" }),
      medio({
        id: "nuevo-otro-municipio",
        municipioCodigo: "05001",
        creadoAt: "2026-10-21T10:00:00Z",
      }),
    ])
    expect(resultado.map((m) => [m.id, m.desdeSolicitud])).toEqual([
      ["nuevo", true],
      ["antiguo", false],
      ["nuevo-otro-municipio", false],
      ["otro-municipio", false],
    ])
    expect(medioYaRegistrado(resultado)?.id).toBe("nuevo")
  })

  it("sin coincidencias no propone ningún medio", () => {
    expect(coincidenciasDeMedio(SOLICITUD, [])).toEqual([])
    expect(medioYaRegistrado([])).toBeNull()
  })
})

describe("enlaces de contacto", () => {
  it("arma WhatsApp con el indicativo de Colombia cuando falta", () => {
    expect(enlaceWhatsapp("300 123 4567")).toBe("https://wa.me/573001234567")
    expect(enlaceWhatsapp("57 300 123 4567")).toBe("https://wa.me/573001234567")
    expect(enlaceWhatsapp("+1 415 555 0100")).toBe("https://wa.me/14155550100")
  })

  it("no ofrece WhatsApp para un fijo local o sin número", () => {
    expect(enlaceWhatsapp("6017654321")).toBeNull()
    expect(enlaceWhatsapp("7654321")).toBeNull()
    expect(enlaceWhatsapp(null)).toBeNull()
  })

  it("arma el enlace para llamar", () => {
    expect(enlaceTelefono("300 123 4567")).toBe("tel:+573001234567")
    expect(enlaceTelefono("601 765 4321")).toBe("tel:6017654321")
  })
})

describe("resumenPendientes", () => {
  it("cuenta con singular y plural", () => {
    expect(resumenPendientes(0)).toBe("Sin solicitudes por atender")
    expect(resumenPendientes(1)).toBe("1 solicitud por atender")
    expect(resumenPendientes(1200)).toBe("1.200 solicitudes por atender")
  })
})

describe("lecturaSeguidores", () => {
  it("alcanza el umbral si una cuenta llega a él", () => {
    expect(
      lecturaSeguidores(
        [{ seguidores: 12_000 }, { seguidores: 30_000 }, { seguidores: null }],
        30_000
      )
    ).toEqual({ tipo: "alcanza", maximo: 30_000 })
  })

  it("queda bajo el umbral si ninguna cuenta declarada llega", () => {
    expect(
      lecturaSeguidores([{ seguidores: 29_999 }, { seguidores: null }], 30_000)
    ).toEqual({ tipo: "bajo", maximo: 29_999 })
  })

  it("sin cifras declaradas no hay lectura", () => {
    expect(lecturaSeguidores([{ seguidores: null }], 30_000)).toEqual({
      tipo: "sin-dato",
    })
    expect(lecturaSeguidores([], 30_000)).toEqual({ tipo: "sin-dato" })
  })
})
