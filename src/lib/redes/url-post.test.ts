// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  cuentaDelEnlace,
  EJEMPLOS_URL_POST,
  ejemploUrlPost,
  type FormatoPost,
  LONGITUD_MAXIMA_URL_POST,
  normalizarUrlPost,
  type PlataformaPost,
  tipoContenidoPost,
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

  it("el mismo post de Facebook sale igual con los parámetros en otro orden o repetidos", () => {
    const canonica =
      "https://www.facebook.com/permalink.php?story_fbid=123&id=456"
    for (const variante of [
      "https://www.facebook.com/permalink.php?story_fbid=123&id=456",
      "https://www.facebook.com/permalink.php?id=456&story_fbid=123",
      "https://m.facebook.com/permalink.php?id=456&fbclid=x&story_fbid=123&id=789",
    ]) {
      expect(normalizarUrlPost(variante)).toBe(canonica)
    }
    expect(
      normalizarUrlPost(
        "https://www.facebook.com/photo/?set=a.123456789&fbid=987654321"
      )
    ).toBe("https://www.facebook.com/photo?fbid=987654321&set=a.123456789")
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

/** ¿La BD guardaría lo que se pegó? (forma canónica que cumple el CHECK y su largo). */
function aceptaLaBd(plataforma: PlataformaPost, entrada: string): boolean {
  const canonica = normalizarUrlPost(entrada)
  return (
    canonica.length <= LONGITUD_MAXIMA_URL_POST &&
    CHECK[plataforma].test(canonica)
  )
}

/**
 * Enlaces combinados de hosts, rutas y parámetros reales y retorcidos (mayúsculas,
 * segmentos de más, parámetros vacíos, dominios ajenos): la validación de la
 * interfaz y el CHECK deben dar la misma respuesta en todos.
 */
const HOSTS = [
  "https://www.facebook.com",
  "https://m.facebook.com",
  "https://web.facebook.com",
  "http://facebook.com",
  "https://fb.com",
  "https://fb.watch",
  "https://www.instagram.com",
  "https://instagram.com",
  "https://instagr.am",
  "https://www.tiktok.com",
  "https://m.tiktok.com",
  "https://vm.tiktok.com",
  "https://vt.tiktok.com",
  "https://facebook.com.evil.co",
  "https://youtube.com",
  "www.instagram.com",
]

const RUTAS = [
  "",
  "/",
  "/p/C8xYz12AbCd",
  "/P/C8xYz12AbCd/",
  "/p/abc.def",
  "/reel/C9AbCd-_EfG",
  "/REEL/C9AbCd",
  "/reels/C9AbCd/",
  "/reels/audio/123",
  "/tv/B8xYz",
  "/usuario.x/p/C8xYz/",
  "/usuario.x/reel/C9AbCd",
  "/stories/noticias.pasto/3456789012345678901",
  "/Stories/noticias/345",
  "/stories/noticias.pasto",
  "/stories/highlights/17912345678901234/",
  "/usuario/stories/x/1",
  "/explore/tags/pasto",
  "/NoticiasDelHuila",
  "/NoticiasDelHuila/",
  "/profile.php",
  "/x/posts/pfbid02KxYz",
  "/x/POSTS/pfbid02KxYz",
  "/x/posts/un-titulo/1234567890",
  "/x/posts/a/b/c",
  "/x/videos/1234567890123456/",
  "/x/videos/un-titulo/1234567890123456",
  "/x/photos/a.123/456",
  "/x/photos/456",
  "/reel/1234567890123456",
  "/share/p/1AbCdEfGh2/",
  "/share/r/15xYz9AbCd",
  "/share/V/1Q2w3E4r5T",
  "/share/1AbCdEfGh2",
  "/share/x/1AbCdEfGh2",
  "/share/p",
  "/share",
  "/groups/vecinos/posts/2468013579",
  "/groups/vecinos/permalink/2468013579/",
  "/groups/vecinos",
  "/stories/100064527312345/UzpfSVNDOjEy",
  "/stories/100064527312345",
  "/watch",
  "/watch/",
  "/video.php",
  "/photo",
  "/photo.php",
  "/permalink.php",
  "/story.php",
  "/@noticias.cucuta/video/7412345678901234567",
  "/@Noticias_Cucuta/VIDEO/7412345678901234567",
  "/@noticias/photo/7412345678901234567",
  "/@noticias",
  "/@noticias/live",
  "/@noticias/video/abc",
  "/@noti+cias/video/123",
  "/t/ZT8AbCdEf",
  "/T/ZT8AbCdEf/",
  "/ZMhAbC123",
  "/ZMh/abc",
  "/abc_DEF-1",
  "//a//b//",
]

const PARAMETROS = [
  "",
  "?v=1234567890",
  "?V=1234567890",
  "?v=",
  "?fbid=987654321&set=a.123",
  "?story_fbid=pfbid0abc&id=100064527312345",
  "?id=100064527312345&story_fbid=123",
  "?multi_permalinks=55",
  "?utm_source=ig_web_copy_link&igsh=abc",
  "?id=5",
  "#comentarios",
]

describe("validarUrlPost · acepta exactamente lo que acepta el CHECK", () => {
  it("coincide con publicaciones_url_chk en miles de combinaciones", () => {
    const discrepancias: string[] = []
    let revisados = 0
    for (const host of HOSTS) {
      for (const ruta of RUTAS) {
        for (const parametros of PARAMETROS) {
          const entrada = `${host}${ruta}${parametros}`
          for (const plataforma of PLATAFORMAS) {
            revisados++
            const interfaz = validarUrlPost(plataforma, entrada).ok
            if (interfaz !== aceptaLaBd(plataforma, entrada)) {
              discrepancias.push(
                `${plataforma} ${entrada} → interfaz ${interfaz ? "acepta" : "rechaza"}`
              )
            }
          }
        }
      }
    }
    expect(revisados).toBeGreaterThan(30_000)
    expect(discrepancias).toEqual([])
  })

  it("cuenta como aceptados los casos límite que el CHECK admite", () => {
    for (const [plataforma, entrada] of [
      ["INSTAGRAM", "https://www.instagram.com/Stories/noticias/345"],
      ["TIKTOK", "https://www.tiktok.com/T/ZT8AbCdEf"],
      ["FACEBOOK", "https://www.facebook.com/x/posts/un-titulo/1234567890"],
      ["FACEBOOK", "https://www.facebook.com/share/V/1Q2w3E4r5T"],
    ] as const) {
      expect(validarUrlPost(plataforma, entrada).ok, entrada).toBe(true)
      expect(aceptaLaBd(plataforma, entrada), entrada).toBe(true)
    }
  })
})

describe("validarUrlPost · formato de la oferta", () => {
  const FORMATOS_POR_PLATAFORMA: Readonly<
    Record<PlataformaPost, readonly FormatoPost[]>
  > = {
    INSTAGRAM: ["POST_FEED", "CARRUSEL", "REEL", "HISTORIA"],
    FACEBOOK: ["POST_FEED", "VIDEO", "REEL", "HISTORIA"],
    TIKTOK: ["VIDEO"],
  }

  it("cada formato tiene un ejemplo válido, de su tipo y sin aviso", () => {
    for (const plataforma of PLATAFORMAS) {
      for (const formato of FORMATOS_POR_PLATAFORMA[plataforma]) {
        const ejemplo = ejemploUrlPost(plataforma, formato)
        expect(validarUrlPost(plataforma, ejemplo, formato), ejemplo).toEqual({
          ok: true,
          url: normalizarUrlPost(ejemplo),
        })
      }
    }
    expect(ejemploUrlPost("INSTAGRAM", "REEL")).toMatch(/\/reel\//)
    expect(ejemploUrlPost("INSTAGRAM", "HISTORIA")).toMatch(/\/stories\//)
    expect(ejemploUrlPost("FACEBOOK", "VIDEO")).toMatch(/\/share\/v\//)
  })

  it("sin formato conocido usa el ejemplo de la plataforma", () => {
    expect(ejemploUrlPost("INSTAGRAM")).toBe(EJEMPLOS_URL_POST.INSTAGRAM)
    expect(ejemploUrlPost("TIKTOK", "VIDEO")).toBe(EJEMPLOS_URL_POST.TIKTOK)
    expect(ejemploUrlPost("FACEBOOK", "OTRO")).toBe(EJEMPLOS_URL_POST.FACEBOOK)
  })

  it("rechaza lo que no es una publicación indicando el formato esperado (MED-013)", () => {
    const resultado = validarUrlPost(
      "INSTAGRAM",
      "https://www.instagram.com/explore/tags/pasto/",
      "REEL"
    )
    expect(resultado).toEqual({
      ok: false,
      mensaje:
        "Ese enlace de Instagram no lleva a una publicación, un reel o una historia. Para esta oferta, copia el enlace del reel.",
      ejemplo: "https://www.instagram.com/reel/C9AbCdEfGhI/",
    })
    const perfil = validarUrlPost(
      "INSTAGRAM",
      "https://www.instagram.com/elpilondevalledupar/",
      "HISTORIA"
    )
    expect(perfil.ok ? null : perfil.mensaje).toMatch(
      /enlace del perfil.*copia el enlace de la historia\.$/
    )
  })

  it("pide el enlace del contenido que exige la oferta", () => {
    const vacio = validarUrlPost("FACEBOOK", " ", "VIDEO")
    expect(vacio).toEqual({
      ok: false,
      mensaje: "Pega el enlace del video.",
      ejemplo: "https://www.facebook.com/share/v/1Q2w3E4r5T/",
    })
  })

  it("con otra red no agrega la pista del formato", () => {
    const resultado = validarUrlPost(
      "TIKTOK",
      "https://www.facebook.com/reel/123",
      "VIDEO"
    )
    expect(resultado.ok ? null : resultado.mensaje).toBe(
      "Ese enlace es de Facebook, pero la publicación debe estar en TikTok."
    )
  })

  it("avisa, sin bloquear, cuando el enlace parece de otro tipo de contenido", () => {
    expect(
      validarUrlPost(
        "INSTAGRAM",
        "https://www.instagram.com/stories/noticias/3456789012345678901",
        "REEL"
      )
    ).toEqual({
      ok: true,
      url: "https://www.instagram.com/stories/noticias/3456789012345678901",
      aviso:
        "Ese enlace parece de una historia, pero esta oferta pide un reel. Revisa que sea el de tu publicación.",
    })
    const historia = validarUrlPost(
      "FACEBOOK",
      "https://www.facebook.com/reel/1234567890123456",
      "HISTORIA"
    )
    expect(historia.ok && historia.aviso).toMatch(/parece de un reel.*historia/)
    const foto = validarUrlPost(
      "TIKTOK",
      "https://www.tiktok.com/@a/photo/7412345678901234567",
      "VIDEO"
    )
    expect(foto.ok && foto.aviso).toMatch(/parece de una foto.*un video/)
  })

  it("no avisa en los casos dudosos (reel abierto con /p/, enlaces cortos)", () => {
    for (const [plataforma, entrada, formato] of [
      ["INSTAGRAM", "https://www.instagram.com/p/C8xYz12AbCd/", "REEL"],
      ["INSTAGRAM", "https://www.instagram.com/reel/C9AbCdEfGhI/", "POST_FEED"],
      ["FACEBOOK", "https://www.facebook.com/watch/?v=1", "REEL"],
      ["FACEBOOK", "https://www.facebook.com/share/1AbCdEfGh2/", "HISTORIA"],
      ["TIKTOK", "https://vm.tiktok.com/ZMhAbC123/", "VIDEO"],
    ] as const) {
      const resultado = validarUrlPost(plataforma, entrada, formato)
      expect(resultado.ok, entrada).toBe(true)
      expect(resultado.ok && resultado.aviso, entrada).toBeFalsy()
    }
  })
})

describe("validarUrlPost · cuenta de la campaña", () => {
  it("dice qué cuenta nombra el enlace, si la nombra", () => {
    expect(
      cuentaDelEnlace(
        "https://m.tiktok.com/@Noticias.Cucuta/video/7412345678901234567?lang=es"
      )
    ).toBe("Noticias.Cucuta")
    expect(
      cuentaDelEnlace(
        "https://www.instagram.com/stories/noticias.pasto/3456789012345678901/"
      )
    ).toBe("noticias.pasto")
    // Sin cuenta en el enlace: publicaciones, reels, Facebook, enlaces cortos y destacadas.
    for (const enlace of [
      "https://www.instagram.com/p/C8xYz12AbCd/",
      "https://www.instagram.com/elpilondevalledupar/reel/C9AbCd-_EfG/",
      "https://www.instagram.com/stories/highlights/17912345678901234/",
      "https://www.facebook.com/NoticiasDelHuila/posts/pfbid02KxYz8aBcD1234efGh",
      "https://vm.tiktok.com/ZMhAbC123/",
      "https://www.tiktok.com/t/ZT8AbCdEf",
    ]) {
      expect(cuentaDelEnlace(enlace), enlace).toBeNull()
    }
  })

  it("rechaza el video de TikTok o la historia de otra cuenta, como la BD (AMO_URL_OTRA_CUENTA)", () => {
    expect(
      validarUrlPost(
        "TIKTOK",
        "https://www.tiktok.com/@medio_b/video/7412345678901234567",
        "VIDEO",
        "noticias.cucuta"
      )
    ).toEqual({
      ok: false,
      mensaje:
        "El enlace es de @medio_b y esta campaña es con @noticias.cucuta. Pega el enlace de la publicación en tu cuenta.",
      ejemplo: EJEMPLOS_URL_POST.TIKTOK,
    })
    expect(
      validarUrlPost(
        "INSTAGRAM",
        "https://www.instagram.com/stories/otro.medio/3456789012345678901",
        "HISTORIA",
        "noticias.pasto"
      )
    ).toMatchObject({
      ok: false,
      mensaje: expect.stringMatching(
        /^El enlace es de @otro\.medio y esta campaña es con @noticias\.pasto\./
      ),
    })
  })

  it("no distingue mayúsculas y no exige cuenta a los enlaces que no la nombran", () => {
    expect(
      validarUrlPost(
        "TIKTOK",
        "https://www.tiktok.com/@Noticias.Cucuta/video/7412345678901234567",
        "VIDEO",
        "noticias.cucuta"
      )
    ).toEqual({
      ok: true,
      url: "https://www.tiktok.com/@Noticias.Cucuta/video/7412345678901234567",
    })
    expect(
      validarUrlPost(
        "INSTAGRAM",
        "https://www.instagram.com/reel/C9AbCdEfGhI/",
        "REEL",
        "noticias.pasto"
      )
    ).toEqual({ ok: true, url: "https://www.instagram.com/reel/C9AbCdEfGhI" })
    // Sin la cuenta de la campaña no se compara.
    expect(
      validarUrlPost(
        "TIKTOK",
        "https://www.tiktok.com/@medio_b/video/7412345678901234567",
        "VIDEO",
        null
      )
    ).toMatchObject({ ok: true })
  })
})

describe("tipoContenidoPost", () => {
  it("dice qué abre cada enlace válido", () => {
    expect(
      tipoContenidoPost("INSTAGRAM", "https://instagram.com/reels/C9AbCd/")
    ).toBe("reel")
    expect(
      tipoContenidoPost("INSTAGRAM", "https://www.instagram.com/tv/B8x/")
    ).toBe("publicacion")
    expect(tipoContenidoPost("FACEBOOK", "https://fb.watch/qWeRtY12_a/")).toBe(
      "video"
    )
    expect(
      tipoContenidoPost("FACEBOOK", "https://www.facebook.com/photo/?fbid=9")
    ).toBe("foto")
    expect(
      tipoContenidoPost(
        "FACEBOOK",
        "https://www.facebook.com/permalink.php?story_fbid=1&id=2"
      )
    ).toBe("publicacion")
    expect(
      tipoContenidoPost("TIKTOK", "https://www.tiktok.com/t/ZT8AbCdEf")
    ).toBe("indeterminado")
  })

  it("es null si el enlace no vale para esa red", () => {
    expect(
      tipoContenidoPost("TIKTOK", "https://www.instagram.com/p/C8xYz12AbCd/")
    ).toBeNull()
    expect(tipoContenidoPost("INSTAGRAM", "no es un enlace")).toBeNull()
  })
})
