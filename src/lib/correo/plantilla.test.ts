import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const { armarCorreo, escaparHtml, rutaDelAviso, TEXTO_PIE } =
  await import("./plantilla")

const SITIO = "https://front-amo.vercel.app"

const AVISO = {
  nombre: "Ana Pérez",
  asunto: "Nueva oferta: {{oferta}}",
  cuerpo:
    "Hay una oferta para **{{medio}}**.\n\n- Precio: {{precio}}\n- *Cupos*: {{cupos}}",
  datos: {
    oferta: "Lanzamiento",
    medio: "Noticias del Valle",
    precio: "$ 1.200.000",
    cupos: 3,
  },
  titulo: "Nueva oferta disponible para tu medio",
  mensaje: "Hay una oferta para Noticias del Valle.",
  url: null,
  entidad: "ofertas",
  entidadId: "7d4f0b6e-3c1a-4a8e-9a77-2a1b3c4d5e6f",
}

describe("escaparHtml", () => {
  it("escapa los cinco caracteres de HTML", () => {
    expect(escaparHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;"
    )
  })
})

describe("armarCorreo", () => {
  it("sustituye las variables en el asunto, el HTML y el texto", () => {
    const correo = armarCorreo(AVISO, SITIO)
    expect(correo.asunto).toBe("Nueva oferta: Lanzamiento")
    expect(correo.html).toContain(
      '<strong style="font-weight:700;color:#261848;">Noticias del Valle</strong>'
    )
    expect(correo.html).toContain("<em>Cupos</em>: 3")
    expect(correo.html).toContain("Hola, Ana Pérez:")
    expect(correo.texto).toContain("Hay una oferta para Noticias del Valle.")
    expect(correo.texto).toContain("- Precio: $ 1.200.000")
    expect(correo.texto).not.toContain("**")
  })

  it("escapa cada valor: un dato nunca se vuelve HTML ni énfasis", () => {
    const correo = armarCorreo(
      {
        ...AVISO,
        asunto: "Oferta {{oferta}}",
        datos: {
          oferta: "<img src=x onerror=alert(1)>",
          medio: "**Falso** & <b>Co</b>",
          precio: '"comillas"',
          cupos: 1,
        },
      },
      SITIO
    )
    expect(correo.html).not.toContain("<img")
    expect(correo.html).not.toContain("<b>Co</b>")
    expect(correo.html).toContain("&lt;b&gt;Co&lt;/b&gt;")
    expect(correo.html).toContain("**Falso** &amp; ")
    expect(correo.html).toContain("&quot;comillas&quot;")
    // El asunto es texto plano: se escapa solo al pintarlo en <title>.
    expect(correo.asunto).toBe("Oferta <img src=x onerror=alert(1)>")
    expect(correo.html).toContain(
      "<title>Oferta &lt;img src=x onerror=alert(1)&gt;</title>"
    )
  })

  it("una variable sin dato queda «—» y el asunto vacío usa el título", () => {
    const correo = armarCorreo(
      { ...AVISO, asunto: null, datos: { medio: null } },
      SITIO
    )
    expect(correo.asunto).toBe("Nueva oferta disponible para tu medio")
    expect(correo.texto).toContain("- Precio: —")
    expect(correo.texto).toContain("Hay una oferta para —.")
  })

  it("el asunto queda en una línea y con tope de 200 caracteres", () => {
    const correo = armarCorreo(
      {
        ...AVISO,
        asunto: "{{oferta}}",
        datos: { oferta: `Línea 1\r\nBcc: x@y.co ${"a".repeat(300)}` },
      },
      SITIO
    )
    expect(correo.asunto).not.toMatch(/[\r\n]/)
    expect(correo.asunto.length).toBe(200)
    expect(correo.asunto.endsWith("…")).toBe(true)
  })

  it("el botón lleva a la entidad (/ir/…) y el pie a Preferencias", () => {
    const correo = armarCorreo(AVISO, SITIO)
    const destino = `${SITIO}/ir/ofertas/${AVISO.entidadId}`
    expect(correo.html).toContain(`href="${destino}"`)
    expect(correo.texto).toContain(`Ver en AMO: ${destino}`)
    expect(correo.html).toContain(`href="${SITIO}/cuenta/preferencias"`)
    expect(correo.texto).toContain(`${TEXTO_PIE}: ${SITIO}/cuenta/preferencias`)
    expect(correo.html).not.toMatch(/oklch|var\(--/)
  })
})

describe("rutaDelAviso", () => {
  it("usa la url interna, si no la entidad, si no la bandeja", () => {
    expect(
      rutaDelAviso({ url: "/mis-campanas", entidad: null, entidadId: null })
    ).toBe("/mis-campanas")
    expect(
      rutaDelAviso({ url: null, entidad: "ofertas", entidadId: "abc" })
    ).toMatch(/^\/ir\/ofertas\/abc$/)
    expect(rutaDelAviso({ url: null, entidad: null, entidadId: null })).toBe(
      "/notificaciones"
    )
  })

  it("nunca lleva fuera del sitio", () => {
    for (const url of [
      "https://malo.co/x",
      "//malo.co/x",
      "javascript:alert(1)",
    ]) {
      expect(rutaDelAviso({ url, entidad: null, entidadId: null })).toBe(
        "/notificaciones"
      )
    }
  })
})
