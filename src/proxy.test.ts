// @vitest-environment node
import type { JwtPayload } from "@supabase/supabase-js"
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server"
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type {
  AuthServidor,
  OpcionesAuthServidor,
} from "@/lib/supabase/auth-server"

import { config, proxy } from "./proxy"

// ── Matcher ──────────────────────────────────────────────────────────────────
// Next 16 documenta `unstable_doesProxyMatch`, pero la versión instalada solo
// exporta el nombre anterior, `unstable_doesMiddlewareMatch` (misma función).

const coincide = (url: string, headers?: Record<string, string>) =>
  unstable_doesMiddlewareMatch({ config, url, headers })

describe("matcher del proxy", () => {
  it.each([
    "/",
    "/inicio",
    "/ingresar",
    "/administracion/usuarios",
    "/api/geo/metricas",
    "/api/csp-report",
    "/auth/confirm",
    "/apple-icon",
    "/opengraph-image",
  ])("ejecuta el proxy en %s", (url) => {
    expect(coincide(url)).toBe(true)
  })

  it.each([
    "/_next/static/chunks/app.js",
    "/_next/image?url=%2Fbrand%2Fa.png&w=64&q=75",
    "/favicon.ico",
    "/data/geo/departamentos.json",
    "/brand/amo-isotipo.svg",
    "/vendor/browser-image-compression.js",
    "/icon.svg",
    "/manifest.webmanifest",
    "/robots.txt",
    "/fuentes/geist.woff2",
    "/imagen.webp",
  ])("omite el activo estático %s", (url) => {
    expect(coincide(url)).toBe(false)
  })

  it("no excluye los prefetch de <Link> (refrescan la sesión)", () => {
    expect(
      coincide("/operacion/medios", {
        "next-router-prefetch": "1",
        purpose: "prefetch",
      })
    ).toBe(true)
  })
})

// ── Comportamiento ───────────────────────────────────────────────────────────

const escenario: { claims: JwtPayload | null; refrescar: boolean } = {
  claims: null,
  refrescar: false,
}

const CABECERAS_ANTICACHE = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
}

vi.mock("@/lib/supabase/auth-server", () => ({
  obtenerAuthServidor: vi.fn(
    async ({ cookies }: OpcionesAuthServidor): Promise<AuthServidor> =>
      ({
        getClaims: async () => {
          if (escenario.refrescar) {
            await cookies?.setAll?.(
              [
                {
                  name: "sb-zygfqfvqwfvhbirmjojp-auth-token",
                  value: "sesion-refrescada",
                  options: { path: "/", maxAge: 43_200, sameSite: "lax" },
                },
              ],
              CABECERAS_ANTICACHE
            )
          }
          return escenario.claims
            ? { data: { claims: escenario.claims }, error: null }
            : { data: null, error: null }
        },
      }) as unknown as AuthServidor
  ),
}))

const CLAIMS: JwtPayload = {
  sub: "0192f3a4-5b6c-7d8e-9f01-23456789abcd",
  aal: "aal1",
} as JwtPayload

function solicitud(
  ruta: string,
  init?: ConstructorParameters<typeof NextRequest>[1]
) {
  return new NextRequest(new URL(ruta, "https://amo.test"), init)
}

function nonceDe(csp: string | null): string | undefined {
  return csp?.match(/'nonce-([^']+)'/)?.[1]
}

describe("proxy", () => {
  beforeEach(() => {
    escenario.claims = null
    escenario.refrescar = false
    vi.unstubAllEnvs()
  })

  it("sin sesión redirige a ingresar con next y aplica la CSP", async () => {
    const respuesta = await proxy(
      solicitud("/administracion/usuarios?pagina=2")
    )

    expect(respuesta.status).toBe(307)
    expect(respuesta.headers.get("location")).toBe(
      "https://amo.test/ingresar?next=%2Fadministracion%2Fusuarios%3Fpagina%3D2"
    )
    expect(respuesta.headers.get("content-security-policy")).toMatch(
      /script-src 'self' 'nonce-/
    )
    expect(respuesta.headers.get("reporting-endpoints")).toBe(
      'csp="https://amo.test/api/csp-report"'
    )
  })

  it("en APIs privadas responde 401 en JSON", async () => {
    const respuesta = await proxy(solicitud("/api/geo/metricas"))
    expect(respuesta.status).toBe(401)
    expect(await respuesta.json()).toEqual({ error: "No autenticado" })
  })

  it("un POST sin sesión se redirige con 303", async () => {
    const respuesta = await proxy(solicitud("/inicio", { method: "POST" }))
    expect(respuesta.status).toBe(303)
  })

  it("deja pasar rutas públicas y entrega el nonce a la app", async () => {
    const respuesta = await proxy(solicitud("/recuperar"))
    const csp = respuesta.headers.get("content-security-policy")

    expect(respuesta.headers.get("x-middleware-next")).toBe("1")
    expect(respuesta.headers.get("x-middleware-request-x-nonce")).toBe(
      nonceDe(csp)
    )
    expect(
      respuesta.headers.get("x-middleware-request-content-security-policy")
    ).toBe(csp)
  })

  it("genera un nonce distinto por solicitud", async () => {
    const [a, b] = await Promise.all([
      proxy(solicitud("/ingresar")),
      proxy(solicitud("/ingresar")),
    ])
    expect(nonceDe(a.headers.get("content-security-policy"))).not.toBe(
      nonceDe(b.headers.get("content-security-policy"))
    )
  })

  it("con sesión, /ingresar lleva a Inicio", async () => {
    escenario.claims = CLAIMS
    const respuesta = await proxy(solicitud("/ingresar"))
    expect(respuesta.headers.get("location")).toBe("https://amo.test/inicio")
  })

  it("con sesión deja pasar rutas privadas", async () => {
    escenario.claims = CLAIMS
    const respuesta = await proxy(solicitud("/inicio"))
    expect(respuesta.headers.get("x-middleware-next")).toBe("1")
  })

  it("lleva cookies refrescadas y cabeceras anti-caché también a las redirecciones", async () => {
    escenario.claims = CLAIMS
    escenario.refrescar = true
    const respuesta = await proxy(solicitud("/ingresar"))

    expect(respuesta.status).toBe(307)
    expect(
      respuesta.cookies.get("sb-zygfqfvqwfvhbirmjojp-auth-token")?.value
    ).toBe("sesion-refrescada")
    expect(respuesta.headers.get("cache-control")).toBe(
      CABECERAS_ANTICACHE["Cache-Control"]
    )
    expect(respuesta.headers.get("expires")).toBe("0")
    expect(respuesta.headers.get("pragma")).toBe("no-cache")
  })

  it("las páginas leen en la misma solicitud la cookie refrescada", async () => {
    escenario.claims = CLAIMS
    escenario.refrescar = true
    const respuesta = await proxy(solicitud("/inicio"))
    expect(respuesta.headers.get("x-middleware-request-cookie")).toContain(
      "sb-zygfqfvqwfvhbirmjojp-auth-token=sesion-refrescada"
    )
  })

  it("solo pide pasar a HTTPS cuando la solicitud llegó por HTTPS", async () => {
    const segura = await proxy(solicitud("/ingresar"))
    const local = await proxy(
      new NextRequest(new URL("/ingresar", "http://localhost:3000"))
    )
    expect(segura.headers.get("content-security-policy")).toContain(
      "upgrade-insecure-requests"
    )
    expect(local.headers.get("content-security-policy")).not.toContain(
      "upgrade-insecure-requests"
    )
  })

  it("en modo report usa la cabecera Report-Only", async () => {
    vi.stubEnv("AMO_CSP_MODO", "report")
    const respuesta = await proxy(solicitud("/ingresar"))
    expect(respuesta.headers.get("content-security-policy")).toBeNull()
    expect(
      respuesta.headers.get("content-security-policy-report-only")
    ).toMatch(/'nonce-/)
  })
})
