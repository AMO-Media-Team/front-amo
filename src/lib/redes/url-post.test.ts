// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  EJEMPLOS_URL_POST,
  LONGITUD_MAXIMA_URL_POST,
  normalizarUrlPost,
  type PlataformaPost,
  validarUrlPost,
} from "./url-post"

const MIGRACIONES = join(process.cwd(), "supabase/migrations")

/** Expresión vigente de `publicaciones_url_chk` por plataforma (la última migración que la define). */
function checkDeLaBd(): Record<PlataformaPost, RegExp> {
  const expresiones: Partial<Record<PlataformaPost, RegExp>> = {}
  for (const archivo of readdirSync(MIGRACIONES).sort()) {
    const sql = readFileSync(join(MIGRACIONES, archivo), "utf8")
    for (const [, plataforma, patron] of sql.matchAll(
      /plataforma = '(FACEBOOK|INSTAGRAM|TIKTOK)' and url_post ~\* '([^']+)'/g
    )) {
      expresiones[plataforma as PlataformaPost] = new RegExp(patron, "i")
    }
  }
  return expresiones as Record<PlataformaPost, RegExp>
}

const CHECK = checkDeLaBd()

/** [entrada copiada de la app, forma canónica que se guarda] */
const VALIDOS: Readonly<Record<PlataformaPost, readonly [string, string][]>> = {
  FACEBOOK: [
    [
      "https://www.facebook.com/share/p/1AbCdEfGh2/",
      "https://www.facebook.com/share/p/1AbCdEfGh2",
    ],
    [
      "https://www.facebook.com/share/r/15xYz9AbCd/?mibextid=wwXIfr",
      "https://www.facebook.com/share/r/15xYz9AbCd",
    ],
    [
      "https://www.facebook.com/share/v/1Q2w3E4r5T/",
      "https://www.facebook.com/share/v/1Q2w3E4r5T",
    ],
    [
      "https://www.facebook.com/NoticiasDelHuila/posts/pfbid02KxYz8aBcD1234efGh/?__cft__[0]=AZW&__tn__=%2CO%2CP-R",
      "https://www.facebook.com/NoticiasDelHuila/posts/pfbid02KxYz8aBcD1234efGh",
    ],
    [
      "https://m.facebook.com/story.php?story_fbid=pfbid0abc123&id=100064527312345&mibextid=Nif5oz",
      "https://www.facebook.com/story.php?story_fbid=pfbid0abc123&id=100064527312345",
    ],
    [
      "https://web.facebook.com/permalink.php?story_fbid=123456789&id=100012345&_rdc=1&_rdr",
      "https://www.facebook.com/permalink.php?story_fbid=123456789&id=100012345",
    ],
    [
      "https://www.facebook.com/watch/?v=1234567890123456&ref=sharing",
      "https://www.facebook.com/watch?v=1234567890123456",
    ],
    [
      "https://www.facebook.com/reel/1234567890123456?fs=e&s=TIeQ9V",
      "https://www.facebook.com/reel/1234567890123456",
    ],
    [
      "https://www.facebook.com/photo/?fbid=987654321&set=a.123456789",
      "https://www.facebook.com/photo?fbid=987654321&set=a.123456789",
    ],
    [
      "https://www.facebook.com/RadioVillavicencio/videos/1234567890123456/",
      "https://www.facebook.com/RadioVillavicencio/videos/1234567890123456",
    ],
    [
      "https://www.facebook.com/groups/vecinosdesoacha/posts/2468013579/",
      "https://www.facebook.com/groups/vecinosdesoacha/posts/2468013579",
    ],
    ["https://fb.watch/qWeRtY12_a/", "https://fb.watch/qWeRtY12_a"],
    [
      "facebook.com/stories/100064527312345/UzpfSVNDOjEy/",
      "https://www.facebook.com/stories/100064527312345/UzpfSVNDOjEy",
    ],
  ],
  INSTAGRAM: [
    [
      "https://www.instagram.com/p/C8xYz12AbCd/?igsh=MWQ1ZGUxMzBkMA==",
      "https://www.instagram.com/p/C8xYz12AbCd",
    ],
    [
      "https://www.instagram.com/reel/C9AbCdEfGhI/?utm_source=ig_web_copy_link",
      "https://www.instagram.com/reel/C9AbCdEfGhI",
    ],
    [
      "https://instagram.com/reels/C9AbCdEfGhI/",
      "https://www.instagram.com/reel/C9AbCdEfGhI",
    ],
    [
      "https://www.instagram.com/elpilondevalledupar/p/C8xYz12AbCd/?img_index=2",
      "https://www.instagram.com/p/C8xYz12AbCd",
    ],
    [
      "https://www.instagram.com/elpilondevalledupar/reel/C9AbCd-_EfG/",
      "https://www.instagram.com/reel/C9AbCd-_EfG",
    ],
    [
      "https://www.instagram.com/tv/B8xYz12AbCd/",
      "https://www.instagram.com/p/B8xYz12AbCd",
    ],
    [
      "https://www.instagram.com/stories/noticias.pasto/3456789012345678901/?utm_source=ig_story_item_share&igsh=abc",
      "https://www.instagram.com/stories/noticias.pasto/3456789012345678901",
    ],
    [
      "https://www.instagram.com/stories/highlights/17912345678901234/",
      "https://www.instagram.com/stories/highlights/17912345678901234",
    ],
    [
      "https://m.instagram.com/p/C8xYz12AbCd/c/17890123456789012/",
      "https://www.instagram.com/p/C8xYz12AbCd",
    ],
  ],
  TIKTOK: [
    [
      "https://www.tiktok.com/@noticias.cucuta/video/7412345678901234567?is_from_webapp=1&sender_device=pc&web_id=7412",
      "https://www.tiktok.com/@noticias.cucuta/video/7412345678901234567",
    ],
    [
      "https://tiktok.com/@la_voz-del_cauca/photo/7412345678901234567",
      "https://www.tiktok.com/@la_voz-del_cauca/photo/7412345678901234567",
    ],
    ["https://vm.tiktok.com/ZMhAbC123/", "https://vm.tiktok.com/ZMhAbC123"],
    [
      "https://www.tiktok.com/t/ZT8AbCdEf/",
      "https://www.tiktok.com/t/ZT8AbCdEf",
    ],
    [
      "https://m.tiktok.com/@noticias.cucuta/video/7412345678901234567",
      "https://www.tiktok.com/@noticias.cucuta/video/7412345678901234567",
    ],
  ],
}

const PLATAFORMAS = Object.keys(VALIDOS) as PlataformaPost[]

describe("validarUrlPost · enlaces reales", () => {
  for (const plataforma of PLATAFORMAS) {
    for (const [entrada, canonica] of VALIDOS[plataforma]) {
      it(`${plataforma}: ${entrada}`, () => {
        expect(validarUrlPost(plataforma, entrada)).toEqual({
          ok: true,
          url: canonica,
        })
      })
    }
  }

  it("la forma canónica cumple el CHECK publicaciones_url_chk de la BD", () => {
    expect(Object.keys(CHECK).sort()).toEqual([...PLATAFORMAS].sort())
    for (const plataforma of PLATAFORMAS) {
      for (const [, canonica] of VALIDOS[plataforma]) {
        expect(canonica, plataforma).toMatch(CHECK[plataforma])
        expect(canonica.length).toBeLessThanOrEqual(LONGITUD_MAXIMA_URL_POST)
      }
    }
  })

  it("los ejemplos que se muestran son válidos", () => {
    for (const plataforma of PLATAFORMAS) {
      expect(validarUrlPost(plataforma, EJEMPLOS_URL_POST[plataforma])).toEqual(
        expect.objectContaining({ ok: true })
      )
    }
  })

  it("encuentra el enlace dentro del texto que copian algunas apps", () => {
    expect(
      validarUrlPost(
        "TIKTOK",
        "Mira este video de @noticias.cucuta en TikTok: https://vm.tiktok.com/ZMhAbC123/."
      )
    ).toEqual({ ok: true, url: "https://vm.tiktok.com/ZMhAbC123" })
    expect(
      validarUrlPost("INSTAGRAM", "  http://INSTAGRAM.com/p/C8xYz12AbCd  ")
    ).toEqual({ ok: true, url: "https://www.instagram.com/p/C8xYz12AbCd" })
  })

  it("quita una racha larga de signos al final del enlace", () => {
    expect(
      validarUrlPost(
        "TIKTOK",
        `https://vm.tiktok.com/ZMhAbC123/${".!?)".repeat(400)}`
      )
    ).toEqual({ ok: true, url: "https://vm.tiktok.com/ZMhAbC123" })
  })
})

describe("validarUrlPost · rechazos con un mensaje que orienta", () => {
  function rechazo(plataforma: PlataformaPost, url: string) {
    const resultado = validarUrlPost(plataforma, url)
    if (resultado.ok) throw new Error(`Se aceptó ${url}`)
    expect(resultado.ejemplo).toBe(EJEMPLOS_URL_POST[plataforma])
    return resultado.mensaje
  }

  it("pide el enlace si llega vacío", () => {
    expect(rechazo("INSTAGRAM", "   ")).toBe(
      "Pega el enlace de la publicación."
    )
  })

  it("explica cuando el texto no es un enlace", () => {
    expect(rechazo("FACEBOOK", "mi publicación de ayer")).toMatch(
      /no parece un enlace/
    )
    expect(rechazo("FACEBOOK", "ftp://facebook.com/x")).toMatch(
      /no parece un enlace/
    )
  })

  it("nombra la red correcta cuando el enlace es de otra", () => {
    expect(
      rechazo(
        "INSTAGRAM",
        "https://www.tiktok.com/@a/video/7412345678901234567"
      )
    ).toBe(
      "Ese enlace es de TikTok, pero la publicación debe estar en Instagram."
    )
    expect(
      rechazo("FACEBOOK", "https://www.instagram.com/p/C8xYz12AbCd/")
    ).toMatch(/es de Instagram/)
  })

  it("rechaza dominios ajenos y suplantaciones del dominio", () => {
    for (const url of [
      "https://youtube.com/watch?v=abc",
      "https://facebook.com.evil.co/posts/1",
      "https://notfacebook.com/pagina/posts/1",
      "https://instagram.com@evil.co/p/abc",
    ]) {
      expect(rechazo("FACEBOOK", url)).toBe(
        "El enlace debe ser de Facebook (facebook.com o fb.watch)."
      )
    }
  })

  it("distingue el perfil de la publicación", () => {
    const perfil = /enlace del perfil/
    expect(
      rechazo("INSTAGRAM", "https://www.instagram.com/elpilondevalledupar/")
    ).toMatch(perfil)
    expect(
      rechazo("TIKTOK", "https://www.tiktok.com/@noticias.cucuta")
    ).toMatch(perfil)
    expect(
      rechazo("FACEBOOK", "https://www.facebook.com/NoticiasDelHuila")
    ).toMatch(perfil)
    expect(
      rechazo(
        "FACEBOOK",
        "https://www.facebook.com/profile.php?id=100064527312345"
      )
    ).toMatch(perfil)
  })

  it("rechaza secciones que no son una publicación", () => {
    expect(
      rechazo("INSTAGRAM", "https://www.instagram.com/explore/tags/pasto/")
    ).toBe(
      "Ese enlace de Instagram no lleva a una publicación, un reel o una historia."
    )
    expect(
      rechazo("INSTAGRAM", "https://www.instagram.com/stories/noticias.pasto/")
    ).toMatch(/no lleva a/)
    expect(rechazo("FACEBOOK", "https://www.facebook.com/watch/")).toMatch(
      /no lleva a/
    )
    expect(
      rechazo(
        "FACEBOOK",
        "https://l.facebook.com/l.php?u=https%3A%2F%2Fevil.co"
      )
    ).toMatch(/no lleva a/)
    expect(rechazo("TIKTOK", "https://www.tiktok.com/@a/live")).toMatch(
      /no lleva a/
    )
    expect(rechazo("TIKTOK", "https://www.tiktok.com/@a/video/abc")).toMatch(
      /no lleva a/
    )
  })

  it("explica que el enlace corto vt.tiktok.com no se admite (la BD no lo acepta)", () => {
    expect(rechazo("TIKTOK", "https://vt.tiktok.com/ZSabc123/")).toMatch(
      /enlace corto de TikTok no se admite/
    )
    expect("https://vt.tiktok.com/ZSabc123").not.toMatch(CHECK.TIKTOK)
  })

  it("respeta el largo máximo de la BD", () => {
    const largo = `https://www.facebook.com/pagina/posts/${"a".repeat(LONGITUD_MAXIMA_URL_POST)}`
    expect(rechazo("FACEBOOK", largo)).toMatch(/supera los 500 caracteres/)
  })

  it("no analiza un texto pegado desmesurado", () => {
    const enorme = `https://www.facebook.com/${".".repeat(50_000)}a`
    expect(rechazo("FACEBOOK", enorme)).toMatch(/supera los 500 caracteres/)
  })

  it("la página de un audio de reels no es una publicación", () => {
    expect(
      rechazo(
        "INSTAGRAM",
        "https://www.instagram.com/reels/audio/123456789012/"
      )
    ).toMatch(/no lleva a/)
  })
})

describe("normalizarUrlPost", () => {
  it("quita parámetros de rastreo, fragmento y barra final", () => {
    expect(
      normalizarUrlPost(
        "https://www.instagram.com/p/C8xYz12AbCd/?utm_source=ig_web_copy_link&igsh=abc#comentarios"
      )
    ).toBe("https://www.instagram.com/p/C8xYz12AbCd")
  })

  it("conserva solo los parámetros que identifican una publicación de Facebook", () => {
    expect(
      normalizarUrlPost(
        "https://www.facebook.com/permalink.php?story_fbid=1&id=2&fbclid=x&utm_medium=y"
      )
    ).toBe("https://www.facebook.com/permalink.php?story_fbid=1&id=2")
  })

  it("en otros dominios solo retira el rastreo conocido", () => {
    expect(
      normalizarUrlPost("https://ejemplo.co/nota/?id=5&utm_source=x&fbclid=y")
    ).toBe("https://ejemplo.co/nota?id=5")
  })

  it("pasa a https, quita credenciales y unifica el host", () => {
    expect(
      normalizarUrlPost("http://usuario:clave@M.Facebook.com//reel//123//")
    ).toBe("https://www.facebook.com/reel/123")
    expect(normalizarUrlPost("https://instagr.am/p/C8xYz12AbCd")).toBe(
      "https://www.instagram.com/p/C8xYz12AbCd"
    )
  })

  it("no confunde un usuario llamado como una sección de Instagram", () => {
    expect(
      normalizarUrlPost("https://www.instagram.com/stories/reel/3456789012345/")
    ).toBe("https://www.instagram.com/stories/reel/3456789012345")
    expect(
      normalizarUrlPost("https://www.instagram.com/x/constructor/abc")
    ).toBe("https://www.instagram.com/x/constructor/abc")
  })

  it("devuelve el texto recortado si no es un enlace", () => {
    expect(normalizarUrlPost("  no es un enlace ")).toBe("no es un enlace")
    expect(normalizarUrlPost("")).toBe("")
  })

  it("es idempotente", () => {
    for (const plataforma of PLATAFORMAS) {
      for (const [entrada] of VALIDOS[plataforma]) {
        const una = normalizarUrlPost(entrada)
        expect(normalizarUrlPost(una)).toBe(una)
      }
    }
  })
})
