import type { MetadataRoute } from "next"

/** Plataforma privada: ningún rastreador debe indexarla. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  }
}
