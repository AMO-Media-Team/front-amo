import type { MetadataRoute } from "next"

import { NEUTRO } from "@/components/brand/colores"

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "AMO — Advertising Market Optimization",
    short_name: "AMO",
    description:
      "Marketplace de pauta en medios hiperlocales: planea, mide y liquida con confianza.",
    lang: "es-CO",
    dir: "ltr",
    start_url: "/inicio",
    scope: "/",
    display: "standalone",
    background_color: NEUTRO.fondoOscuro,
    theme_color: NEUTRO.fondoOscuro,
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/brand/amo-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/amo-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/amo-icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/brand/amo-app-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  }
}
