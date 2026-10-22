import { describe, expect, it } from "vitest"

import {
  EJEMPLOS_PERFIL,
  interpretarPerfil,
  LARGO_MAXIMO_ENTRADA,
  problemaUsuario,
  urlLegible,
  urlPerfil,
} from "./perfil-red"

/** Lo que exige la BD (`cuentas_sociales_handle_chk` y `_url_chk`). */
const HANDLE_BD = /^[A-Za-z0-9._]{1,60}$/
const URL_BD = {
  FACEBOOK: /^https:\/\/(www\.|m\.|web\.)?facebook\.com\/.+/i,
  INSTAGRAM: /^https:\/\/(www\.)?instagram\.com\/.+/i,
  TIKTOK: /^https:\/\/(www\.)?tiktok\.com\/@.+/i,
} as const

function ok(resultado: ReturnType<typeof interpretarPerfil>) {
  if (!resultado.ok) throw new Error(`Se esperaba válido: ${resultado.mensaje}`)
  return resultado
}

function mensaje(resultado: ReturnType<typeof interpretarPerfil>) {
  if (resultado.ok) throw new Error("Se esperaba un error")
  return resultado.mensaje
}

describe("interpretarPerfil · Instagram", () => {
  it.each([
    ["@NoticiasDelSur", "noticiasdelsur"],
    ["noticias.sur", "noticias.sur"],
    ["https://www.instagram.com/noticias_sur/", "noticias_sur"],
    ["instagram.com/noticias_sur?igsh=abc123", "noticias_sur"],
    ["https://instagram.com/stories/noticias_sur/3456789", "noticias_sur"],
    ["  @@noticias  ", "noticias"],
  ])("«%s» → %s en minúsculas y con URL canónica", (entrada, handle) => {
    const resultado = ok(interpretarPerfil("INSTAGRAM", entrada))
    expect(resultado.handle).toBe(handle)
    expect(resultado.url).toBe(`https://www.instagram.com/${handle}/`)
    expect(resultado.handle).toMatch(HANDLE_BD)
    expect(resultado.url).toMatch(URL_BD.INSTAGRAM)
  })

  it("rechaza el enlace de una publicación y explica qué pegar", () => {
    expect(
      mensaje(
        interpretarPerfil("INSTAGRAM", "https://www.instagram.com/p/Cx1/")
      )
    ).toMatch(/publicación, no del perfil/)
  })

  it("rechaza un enlace de otra red nombrando ambas", () => {
    expect(
      mensaje(
        interpretarPerfil("INSTAGRAM", "https://www.tiktok.com/@noticias")
      )
    ).toBe(
      "Ese enlace es de TikTok, pero la cuenta es de Instagram. Pega el enlace de tu perfil de Instagram."
    )
  })

  it("rechaza sitios que no son redes sociales", () => {
    expect(
      mensaje(interpretarPerfil("INSTAGRAM", "https://misitio.com/noticias"))
    ).toMatch(/no es de Instagram/)
  })

  it("aplica las reglas del usuario (caracteres, largo y puntos)", () => {
    expect(mensaje(interpretarPerfil("INSTAGRAM", "noticias sur"))).toMatch(
      /sin espacios/
    )
    expect(mensaje(interpretarPerfil("INSTAGRAM", "a".repeat(31)))).toMatch(
      /como máximo 30/
    )
    expect(mensaje(interpretarPerfil("INSTAGRAM", "noticias..sur"))).toMatch(
      /dos puntos seguidos/
    )
    expect(mensaje(interpretarPerfil("INSTAGRAM", ".noticias"))).toMatch(
      /no empieza ni termina con punto/
    )
  })
})

describe("interpretarPerfil · TikTok", () => {
  it.each([
    ["@NoticiasDelSur", "noticiasdelsur"],
    ["https://www.tiktok.com/@noticias.sur", "noticias.sur"],
    ["tiktok.com/@noticias_sur/video/7300000000000000000", "noticias_sur"],
    ["https://m.tiktok.com/@noticias?lang=es", "noticias"],
  ])("«%s» → %s", (entrada, handle) => {
    const resultado = ok(interpretarPerfil("TIKTOK", entrada))
    expect(resultado.handle).toBe(handle)
    expect(resultado.url).toBe(`https://www.tiktok.com/@${handle}`)
    expect(resultado.url).toMatch(URL_BD.TIKTOK)
  })

  it("explica que los enlaces cortos no traen el usuario", () => {
    expect(
      mensaje(interpretarPerfil("TIKTOK", "https://vm.tiktok.com/ZMabc123/"))
    ).toMatch(/enlaces cortos de TikTok/)
  })

  it("exige al menos dos caracteres", () => {
    expect(mensaje(interpretarPerfil("TIKTOK", "@a"))).toMatch(/al menos 2/)
  })
})

describe("interpretarPerfil · Facebook", () => {
  it("conserva las mayúsculas del nombre de la página", () => {
    const resultado = ok(
      interpretarPerfil("FACEBOOK", "https://web.facebook.com/NoticiasDelSur/")
    )
    expect(resultado.handle).toBe("NoticiasDelSur")
    expect(resultado.url).toBe("https://www.facebook.com/NoticiasDelSur")
  })

  it.each([
    [
      "https://www.facebook.com/profile.php?id=100064123456789",
      "100064123456789",
    ],
    [
      "https://www.facebook.com/p/Noticias-del-Sur-100064123456789/",
      "100064123456789",
    ],
    [
      "https://facebook.com/people/Noticias-del-Sur/100064123456789",
      "100064123456789",
    ],
  ])("usa el id numérico de las páginas sin usuario: %s", (entrada, id) => {
    const resultado = ok(interpretarPerfil("FACEBOOK", entrada))
    expect(resultado.handle).toBe(id)
    expect(resultado.url).toBe(`https://www.facebook.com/profile.php?id=${id}`)
    expect(resultado.url).toMatch(URL_BD.FACEBOOK)
  })

  it("rechaza grupos, videos y publicaciones", () => {
    for (const entrada of [
      "https://www.facebook.com/groups/123456",
      "https://www.facebook.com/watch/?v=1",
      "https://www.facebook.com/share/p/abc/",
    ]) {
      expect(mensaje(interpretarPerfil("FACEBOOK", entrada))).toMatch(
        /publicación, no del perfil/
      )
    }
  })

  it("no admite guiones bajos en el usuario", () => {
    expect(mensaje(interpretarPerfil("FACEBOOK", "noticias_sur"))).toMatch(
      /letras, números y puntos/
    )
  })

  it("un profile.php sin id no identifica la cuenta", () => {
    expect(
      mensaje(
        interpretarPerfil("FACEBOOK", "https://www.facebook.com/profile.php")
      )
    ).toMatch(/no lleva el usuario/)
  })
})

describe("interpretarPerfil · entradas vacías o desmesuradas", () => {
  it("pide el usuario si no se escribió nada", () => {
    expect(mensaje(interpretarPerfil("INSTAGRAM", "   "))).toBe(
      "Escribe el usuario de la cuenta o pega el enlace de tu perfil."
    )
  })

  it("rechaza textos más largos que el límite de la URL", () => {
    expect(
      mensaje(
        interpretarPerfil("INSTAGRAM", "a".repeat(LARGO_MAXIMO_ENTRADA + 1))
      )
    ).toMatch(/demasiado largo/)
  })
})

describe("problemaUsuario, urlPerfil y urlLegible", () => {
  it("un id numérico de Facebook es válido aunque sea largo", () => {
    expect(problemaUsuario("FACEBOOK", "100064123456789")).toBeNull()
  })

  it("los ejemplos que muestra la interfaz son válidos", () => {
    for (const [plataforma, ejemplo] of Object.entries(EJEMPLOS_PERFIL)) {
      const red = plataforma as keyof typeof EJEMPLOS_PERFIL
      expect(interpretarPerfil(red, ejemplo.usuario).ok).toBe(true)
      expect(interpretarPerfil(red, ejemplo.enlace).ok).toBe(true)
    }
  })

  it("urlPerfil arma la forma canónica de cada red", () => {
    expect(urlPerfil("INSTAGRAM", "x")).toBe("https://www.instagram.com/x/")
    expect(urlPerfil("TIKTOK", "x")).toBe("https://www.tiktok.com/@x")
    expect(urlPerfil("FACEBOOK", "Pagina")).toBe(
      "https://www.facebook.com/Pagina"
    )
  })

  it("urlLegible quita esquema, www y barra final", () => {
    expect(urlLegible("https://www.instagram.com/noticias/")).toBe(
      "instagram.com/noticias"
    )
    expect(urlLegible("https://www.tiktok.com/@noticias")).toBe(
      "tiktok.com/@noticias"
    )
  })
})
