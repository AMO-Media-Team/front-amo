import { describe, expect, it } from "vitest"

import {
  cabeceraEndpointsReporte,
  construirCsp,
  generarNonce,
  modoCspDesdeEntorno,
  nombreCabeceraCsp,
  resumirReportesCsp,
  sanearUrlReporte,
} from "./csp"

function directiva(csp: string, nombre: string): string | undefined {
  return csp
    .split("; ")
    .find((parte) => parte === nombre || parte.startsWith(`${nombre} `))
}

describe("construirCsp", () => {
  const produccion = construirCsp({
    nonce: "abc123",
    desarrollo: false,
    https: true,
  })
  const desarrollo = construirCsp({
    nonce: "abc123",
    desarrollo: true,
    https: false,
  })

  it("incluye el nonce con strict-dynamic y wasm en script-src", () => {
    expect(directiva(produccion, "script-src")).toBe(
      "script-src 'self' 'nonce-abc123' 'strict-dynamic' 'wasm-unsafe-eval'"
    )
  })

  it("solo permite unsafe-eval en desarrollo", () => {
    expect(produccion).not.toContain("'unsafe-eval'")
    expect(directiva(desarrollo, "script-src")).toContain("'unsafe-eval'")
  })

  it("solo fuerza HTTPS cuando el sitio se sirve por HTTPS", () => {
    expect(directiva(produccion, "upgrade-insecure-requests")).toBeDefined()
    expect(directiva(desarrollo, "upgrade-insecure-requests")).toBeUndefined()
    // `pnpm start` en http://localhost: build de producción sin HTTPS.
    const produccionLocal = construirCsp({
      nonce: "abc123",
      desarrollo: false,
      https: false,
    })
    expect(
      directiva(produccionLocal, "upgrade-insecure-requests")
    ).toBeUndefined()
    expect(produccionLocal).not.toContain("'unsafe-eval'")
  })

  it("permite Supabase (REST, Realtime y Storage directo) y Mapbox", () => {
    const conexiones = directiva(produccion, "connect-src")
    expect(conexiones).toContain("https://zygfqfvqwfvhbirmjojp.supabase.co")
    expect(conexiones).toContain("wss://zygfqfvqwfvhbirmjojp.supabase.co")
    expect(conexiones).toContain(
      "https://zygfqfvqwfvhbirmjojp.storage.supabase.co"
    )
    expect(conexiones).toContain("https://events.mapbox.com")
    expect(directiva(produccion, "img-src")).toContain(
      "https://*.tiles.mapbox.com"
    )
    expect(directiva(produccion, "worker-src")).toBe("worker-src 'self' blob:")
  })

  it("bloquea marcos, objetos y bases ajenas y reporta violaciones", () => {
    expect(directiva(produccion, "frame-ancestors")).toBe(
      "frame-ancestors 'none'"
    )
    expect(directiva(produccion, "object-src")).toBe("object-src 'none'")
    expect(directiva(produccion, "base-uri")).toBe("base-uri 'self'")
    expect(directiva(produccion, "form-action")).toBe("form-action 'self'")
    expect(directiva(produccion, "report-uri")).toBe(
      "report-uri /api/csp-report"
    )
    expect(directiva(produccion, "report-to")).toBe("report-to csp")
  })

  it("es una sola línea sin espacios sobrantes", () => {
    expect(produccion).not.toMatch(/\s{2,}|\n/)
  })
})

describe("generarNonce", () => {
  it("genera valores base64 distintos de 128 bits", () => {
    const a = generarNonce()
    const b = generarNonce()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/)
  })
})

describe("modo de la política", () => {
  it("aplica por defecto y solo reporta con AMO_CSP_MODO=report", () => {
    expect(modoCspDesdeEntorno(undefined)).toBe("enforce")
    expect(modoCspDesdeEntorno("")).toBe("enforce")
    expect(modoCspDesdeEntorno("otro")).toBe("enforce")
    expect(modoCspDesdeEntorno(" Report ")).toBe("report")
  })

  it("elige la cabecera según el modo", () => {
    expect(nombreCabeceraCsp("enforce")).toBe("Content-Security-Policy")
    expect(nombreCabeceraCsp("report")).toBe(
      "Content-Security-Policy-Report-Only"
    )
  })

  it("declara el endpoint de reportes con URL absoluta", () => {
    expect(cabeceraEndpointsReporte("https://amo.co")).toBe(
      'csp="https://amo.co/api/csp-report"'
    )
  })
})

describe("sanearUrlReporte", () => {
  it("quita la consulta y el fragmento (pueden llevar tokens o PII)", () => {
    expect(
      sanearUrlReporte("https://amo.co/auth/confirm?token_hash=secreto#x")
    ).toBe("https://amo.co/auth/confirm")
  })

  it("conserva palabras clave del navegador y oculta lo que no es URL", () => {
    expect(sanearUrlReporte("inline")).toBe("inline")
    expect(sanearUrlReporte("data:image/png;base64,AAAA")).toBe("data")
    expect(sanearUrlReporte("no es / una url")).toBe("(no es URL)")
    expect(sanearUrlReporte(undefined)).toBe("(desconocido)")
  })
})

describe("resumirReportesCsp", () => {
  it("lee el formato clásico application/csp-report", () => {
    const [resumen] = resumirReportesCsp({
      "csp-report": {
        "document-uri": "https://amo.co/inicio?correo=ana@x.co",
        "effective-directive": "script-src-elem",
        "blocked-uri": "https://malicioso.example/x.js?k=1",
        disposition: "report",
        "source-file": "https://amo.co/_next/static/a.js",
        "line-number": 12,
      },
    })
    expect(resumen).toEqual({
      directiva: "script-src-elem",
      recursoBloqueado: "https://malicioso.example/x.js",
      documento: "https://amo.co/inicio",
      disposicion: "report",
      archivo: "https://amo.co/_next/static/a.js",
      linea: 12,
    })
  })

  it("lee el formato de la API Reporting e ignora otros tipos", () => {
    const resumenes = resumirReportesCsp([
      {
        type: "csp-violation",
        body: {
          documentURL: "https://amo.co/ingresar",
          effectiveDirective: "img-src",
          blockedURL: "https://imagenes.example/a.png",
          disposition: "enforce",
        },
      },
      { type: "deprecation", body: { message: "x" } },
    ])
    expect(resumenes).toEqual([
      {
        directiva: "img-src",
        recursoBloqueado: "https://imagenes.example/a.png",
        documento: "https://amo.co/ingresar",
        disposicion: "enforce",
      },
    ])
  })

  it("devuelve una lista vacía ante cargas desconocidas", () => {
    expect(resumirReportesCsp(null)).toEqual([])
    expect(resumirReportesCsp("texto")).toEqual([])
    expect(resumirReportesCsp({ otro: 1 })).toEqual([])
  })
})
