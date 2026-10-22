import { describe, expect, it } from "vitest"

import {
  arroba,
  claveCuenta,
  interpretarSeguidores,
  MAXIMO_SEGUIDORES,
  normalizarUsuarioCuenta,
  seguidoresMaximos,
  siguientePlataforma,
  urlPerfil,
} from "./cuentas"

describe("normalizarUsuarioCuenta", () => {
  it.each([
    ["INSTAGRAM", "@Noticias.Pasto", "noticias.pasto"],
    ["INSTAGRAM", "  noticias_pasto  ", "noticias_pasto"],
    [
      "INSTAGRAM",
      "https://www.instagram.com/noticias.pasto/?hl=es",
      "noticias.pasto",
    ],
    ["INSTAGRAM", "instagram.com/noticias.pasto", "noticias.pasto"],
    ["TIKTOK", "@LaVozDelSur", "lavozdelsur"],
    ["TIKTOK", "https://www.tiktok.com/@lavozdelsur?lang=es", "lavozdelsur"],
    [
      "TIKTOK",
      "https://www.tiktok.com/@lavozdelsur/video/7412345678901234567",
      "lavozdelsur",
    ],
    ["FACEBOOK", "NoticiasPasto", "NoticiasPasto"],
    ["FACEBOOK", "https://m.facebook.com/NoticiasPasto/", "NoticiasPasto"],
    [
      "FACEBOOK",
      "https://www.facebook.com/profile.php?id=100089234567890",
      "100089234567890",
    ],
    [
      "FACEBOOK",
      "https://www.facebook.com/people/Noticias-Pasto/100089234567890/",
      "100089234567890",
    ],
    ["FACEBOOK", "Pasto-Informa", "Pasto-Informa"],
  ] as const)("%s «%s» → %s", (plataforma, texto, usuario) => {
    expect(normalizarUsuarioCuenta(plataforma, texto)).toEqual({
      ok: true,
      usuario,
    })
  })

  it("pide el dato si viene vacío", () => {
    expect(normalizarUsuarioCuenta("INSTAGRAM", "  @ ")).toMatchObject({
      ok: false,
    })
    expect(normalizarUsuarioCuenta("INSTAGRAM", "")).toEqual({
      ok: false,
      mensaje: "Escribe el usuario o pega el enlace del perfil.",
    })
  })

  it("rechaza el enlace de otra red y lo dice", () => {
    expect(
      normalizarUsuarioCuenta("INSTAGRAM", "https://www.tiktok.com/@medio")
    ).toEqual({
      ok: false,
      mensaje:
        "Ese enlace es de TikTok. Cambia la red o pega el enlace de Instagram.",
    })
  })

  it("rechaza enlaces que no son de una red social", () => {
    const resultado = normalizarUsuarioCuenta(
      "FACEBOOK",
      "https://noticiaspasto.com/contacto"
    )
    expect(resultado).toMatchObject({ ok: false })
  })

  it("distingue una publicación de un perfil", () => {
    for (const [plataforma, enlace] of [
      ["INSTAGRAM", "https://www.instagram.com/p/C8xYz12AbCd/"],
      ["INSTAGRAM", "https://www.instagram.com/reel/C8xYz12AbCd/"],
      ["FACEBOOK", "https://www.facebook.com/share/p/1AbCdEfGh2/"],
      ["TIKTOK", "https://vm.tiktok.com/ZMabc123/"],
    ] as const) {
      expect(normalizarUsuarioCuenta(plataforma, enlace)).toMatchObject({
        ok: false,
        mensaje: expect.stringContaining("publicación"),
      })
    }
  })

  it("aplica las reglas de usuario de cada red", () => {
    expect(
      normalizarUsuarioCuenta("INSTAGRAM", "noticias pasto")
    ).toMatchObject({ ok: false })
    expect(normalizarUsuarioCuenta("INSTAGRAM", "a".repeat(31))).toMatchObject({
      ok: false,
    })
    expect(normalizarUsuarioCuenta("TIKTOK", "a")).toMatchObject({ ok: false })
    expect(normalizarUsuarioCuenta("FACEBOOK", "Noticias Pasto")).toMatchObject(
      { ok: false }
    )
    expect(normalizarUsuarioCuenta("FACEBOOK", "Radio.Ñañes")).toEqual({
      ok: true,
      usuario: "Radio.Ñañes",
    })
  })

  it("no analiza entradas enormes", () => {
    expect(
      normalizarUsuarioCuenta(
        "INSTAGRAM",
        `https://instagram.com/${"a".repeat(400)}`
      )
    ).toMatchObject({ ok: false })
  })
})

describe("urlPerfil y arroba", () => {
  it("arma el enlace público de cada red", () => {
    expect(urlPerfil("INSTAGRAM", "noticias.pasto")).toBe(
      "https://www.instagram.com/noticias.pasto/"
    )
    expect(urlPerfil("FACEBOOK", "NoticiasPasto")).toBe(
      "https://www.facebook.com/NoticiasPasto"
    )
    expect(urlPerfil("TIKTOK", "@lavozdelsur")).toBe(
      "https://www.tiktok.com/@lavozdelsur"
    )
  })

  it("codifica lo que no es seguro en una ruta", () => {
    expect(urlPerfil("FACEBOOK", "a/b?c")).toBe(
      "https://www.facebook.com/a%2Fb%3Fc"
    )
  })

  it("antepone una sola arroba", () => {
    expect(arroba("medio")).toBe("@medio")
    expect(arroba("@medio")).toBe("@medio")
  })
})

describe("claveCuenta y siguientePlataforma", () => {
  it("la misma cuenta escrita distinto tiene la misma clave", () => {
    expect(claveCuenta("INSTAGRAM", "@Medio")).toBe(
      claveCuenta("INSTAGRAM", "medio")
    )
    expect(claveCuenta("INSTAGRAM", "medio")).not.toBe(
      claveCuenta("TIKTOK", "medio")
    )
  })

  it("propone la primera red sin usar", () => {
    expect(siguientePlataforma([])).toBe("INSTAGRAM")
    expect(siguientePlataforma(["INSTAGRAM"])).toBe("FACEBOOK")
    expect(siguientePlataforma(["INSTAGRAM", "FACEBOOK"])).toBe("TIKTOK")
    expect(siguientePlataforma(["INSTAGRAM", "FACEBOOK", "TIKTOK"])).toBe(
      "INSTAGRAM"
    )
  })
})

describe("interpretarSeguidores", () => {
  it.each([
    ["", null],
    ["   ", null],
    ["45000", 45_000],
    ["45.000", 45_000],
    ["45,000", 45_000],
    ["45 000", 45_000],
    ["1.250.000", 1_250_000],
    ["45 mil", 45_000],
    ["45mil", 45_000],
    ["45k", 45_000],
    ["45K", 45_000],
    ["1,2 M", 1_200_000],
    ["1.5 millones", 1_500_000],
    ["2 millones", 2_000_000],
    ["1 millón", 1_000_000],
    ["0", 0],
  ])("«%s» → %s", (texto, valor) => {
    expect(interpretarSeguidores(texto)).toEqual({ ok: true, valor })
  })

  it.each(["muchos", "45.5", "-3", "45 000 000 000", "12 xyz", "1.2.3"])(
    "rechaza «%s»",
    (texto) => {
      expect(interpretarSeguidores(texto)).toMatchObject({ ok: false })
    }
  )

  it("no admite más que el tope de la BD", () => {
    expect(interpretarSeguidores(String(MAXIMO_SEGUIDORES))).toEqual({
      ok: true,
      valor: MAXIMO_SEGUIDORES,
    })
    expect(interpretarSeguidores("1001 millones")).toMatchObject({ ok: false })
  })
})

describe("seguidoresMaximos", () => {
  it("toma el mayor declarado o null sin datos", () => {
    expect(seguidoresMaximos([])).toBeNull()
    expect(seguidoresMaximos([{ seguidores: null }])).toBeNull()
    expect(
      seguidoresMaximos([
        { seguidores: 12_000 },
        { seguidores: null },
        { seguidores: 45_000 },
      ])
    ).toBe(45_000)
  })
})
