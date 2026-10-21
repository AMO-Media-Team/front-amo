import { expect, test } from "./utilidades/prueba"

test.describe("humo", () => {
  test("la página de ingreso responde en español", async ({ page }) => {
    const respuesta = await page.goto("/ingresar")
    expect(respuesta?.status()).toBe(200)
    await expect(page).toHaveTitle(/AMO/)
    await expect(page.locator("html")).toHaveAttribute("lang", "es-CO")
  })

  test("robots.txt bloquea la indexación", async ({ request }) => {
    const respuesta = await request.get("/robots.txt")
    expect(respuesta.ok()).toBe(true)
    expect(await respuesta.text()).toMatch(/Disallow: \/$/m)
  })

  test("las respuestas incluyen las cabeceras de seguridad", async ({
    request,
  }) => {
    const respuesta = await request.get("/robots.txt")
    const cabeceras = respuesta.headers()
    expect(cabeceras["x-content-type-options"]).toBe("nosniff")
    expect(cabeceras["x-frame-options"]).toBe("DENY")
    expect(cabeceras["referrer-policy"]).toBe("strict-origin-when-cross-origin")
    expect(cabeceras["cross-origin-opener-policy"]).toBe("same-origin")
    expect(cabeceras["x-powered-by"]).toBeUndefined()
  })
})
