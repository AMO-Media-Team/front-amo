import { describe, expect, it } from "vitest"

import {
  agregarEtiquetas,
  contarCaracteres,
  enlaceVisible,
  mensajeEtiquetaInvalida,
  mismaEtiqueta,
  normalizarEnlace,
  normalizarHashtag,
  normalizarMencion,
  problemaEnlace,
  separarEntradas,
} from "./textos"

describe("hashtags y menciones", () => {
  it("agrega el prefijo una sola vez", () => {
    expect(normalizarHashtag("Publicidad")).toBe("#Publicidad")
    expect(normalizarHashtag("##Publicidad ")).toBe("#Publicidad")
    expect(normalizarHashtag("#Café_2026")).toBe("#Café_2026")
    expect(normalizarMencion("mimarca.oficial")).toBe("@mimarca.oficial")
    expect(normalizarMencion("@@mi_marca")).toBe("@mi_marca")
  })

  it("rechaza vacíos, espacios y signos", () => {
    expect(normalizarHashtag("#")).toBeNull()
    expect(normalizarHashtag("mi marca")).toBeNull()
    expect(normalizarHashtag("oferta!")).toBeNull()
    expect(normalizarHashtag("a.b")).toBeNull()
    expect(normalizarMencion("@")).toBeNull()
    expect(normalizarMencion("mi-marca")).toBeNull()
    expect(normalizarHashtag("x".repeat(101))).toBeNull()
  })

  it("separa lo pegado y explica el rechazo", () => {
    expect(separarEntradas("#a #b, c;d  ")).toEqual(["#a", "#b", "c", "d"])
    expect(mensajeEtiquetaInvalida("hashtag", "mi marca")).toMatch(
      /^«mi marca» no es un hashtag válido/
    )
    expect(mensajeEtiquetaInvalida("mencion", "a-b")).toMatch(
      /no es una mención válida/
    )
  })

  it("no repite sin distinguir mayúsculas", () => {
    expect(mismaEtiqueta("#Marca", "#marca")).toBe(true)
    expect(mismaEtiqueta("#Cafe", "#Café")).toBe(false)
    expect(agregarEtiquetas(["#Marca"], ["#marca", "#Otra", "#otra"])).toEqual([
      "#Marca",
      "#Otra",
    ])
  })

  it("cuenta caracteres como Postgres (un emoji es uno)", () => {
    expect(contarCaracteres("Hola 👋")).toBe(6)
  })
})

describe("enlace de destino", () => {
  it("agrega https:// a un dominio escrito sin protocolo", () => {
    expect(normalizarEnlace("  mimarca.co/promo ")).toBe(
      "https://mimarca.co/promo"
    )
    expect(normalizarEnlace("")).toBe("")
    expect(normalizarEnlace("http://mimarca.co")).toBe("http://mimarca.co")
  })

  it("solo acepta https con dominio y hasta 2.000 caracteres", () => {
    expect(problemaEnlace("https://mimarca.co/promo?x=1")).toBeNull()
    expect(problemaEnlace("http://mimarca.co")).toBe("inseguro")
    expect(problemaEnlace("https://localhost")).toBe("invalido")
    expect(problemaEnlace("ftp://mimarca.co")).toBe("invalido")
    expect(problemaEnlace("HTTPS://mimarca.co")).toBe("invalido")
    expect(problemaEnlace("https://")).toBe("invalido")
    expect(problemaEnlace(`https://mimarca.co/${"a".repeat(2000)}`)).toBe(
      "largo"
    )
  })

  it("se muestra sin protocolo", () => {
    expect(enlaceVisible("https://mimarca.co/promo/")).toBe("mimarca.co/promo")
  })
})
