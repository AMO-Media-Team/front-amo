import { describe, expect, it } from "vitest"

import { describirAgente } from "./agente-usuario"

const UA = {
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  safariIpad:
    "Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 15; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  tabletAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  firefoxLinux:
    "Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0",
  samsung:
    "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  bot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
}

describe("describirAgente", () => {
  it.each([
    [UA.chromeMac, "Chrome", "macOS", "ESCRITORIO"],
    [UA.edgeWindows, "Edge", "Windows", "ESCRITORIO"],
    [UA.safariIphone, "Safari", "iOS", "MOVIL"],
    [UA.safariIpad, "Safari", "iOS", "TABLETA"],
    [UA.chromeAndroid, "Chrome", "Android", "MOVIL"],
    [UA.tabletAndroid, "Chrome", "Android", "TABLETA"],
    [UA.firefoxLinux, "Firefox", "Linux", "ESCRITORIO"],
    [UA.samsung, "Samsung Internet", "Android", "MOVIL"],
  ])("%s", (ua, navegador, sistemaOperativo, dispositivo) => {
    expect(describirAgente(ua)).toEqual({
      navegador,
      sistemaOperativo,
      dispositivo,
    })
  })

  it("marca los robots como OTRO", () => {
    expect(describirAgente(UA.bot).dispositivo).toBe("OTRO")
  })

  it("tolera la ausencia de User-Agent", () => {
    expect(describirAgente(null)).toEqual({
      navegador: null,
      sistemaOperativo: null,
      dispositivo: "OTRO",
    })
  })
})
