import type { JwtPayload } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"

import { obtenerAuthServidor } from "./auth-server"
import { ipCliente } from "./contexto-solicitud"

/** Las fija `@supabase/ssr` al escribir cookies: sin ellas un CDN podría servir la sesión de otro usuario. */
const CABECERAS_ANTICACHE = ["cache-control", "expires", "pragma"] as const

export interface SesionProxy {
  /** Continúa hacia la ruta con las cookies refrescadas y las cabeceras de solicitud añadidas. */
  respuesta: NextResponse
  /** Claims verificados del JWT; `null` sin sesión válida. */
  claims: JwtPayload | null
}

/**
 * Refresca la sesión de Supabase (patrón oficial de `@supabase/ssr` para el
 * proxy) y verifica el JWT con `getClaims()`. `cabecerasSolicitud` se añaden a
 * la solicitud que llega a la app (p. ej. el nonce y la CSP).
 */
export async function updateSession(
  request: NextRequest,
  cabecerasSolicitud: Record<string, string> = {}
): Promise<SesionProxy> {
  // Se reconstruye tras cada escritura de cookies para que las páginas lean
  // las cookies nuevas en esta misma solicitud.
  const continuar = () => {
    const cabeceras = new Headers(request.headers)
    for (const [nombre, valor] of Object.entries(cabecerasSolicitud)) {
      cabeceras.set(nombre, valor)
    }
    return NextResponse.next({ request: { headers: cabeceras } })
  }

  let respuesta = continuar()

  const auth = await obtenerAuthServidor({
    ip: ipCliente(request.headers),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(porEscribir, cabecerasRespuesta) {
        for (const { name, value } of porEscribir) {
          request.cookies.set(name, value)
        }
        respuesta = continuar()
        for (const { name, value, options } of porEscribir) {
          respuesta.cookies.set(name, value, options)
        }
        for (const [nombre, valor] of Object.entries(cabecerasRespuesta)) {
          respuesta.headers.set(nombre, valor)
        }
      },
    },
  })

  // No ejecutar código entre crear el cliente y getClaims(): un refresco que
  // termine después de generar la respuesta no podría guardar la sesión y el
  // usuario perdería la sesión de forma aleatoria.
  const { data } = await auth.getClaims()

  return { respuesta, claims: data?.claims ?? null }
}

/**
 * Lleva las cookies de sesión y las cabeceras anti-caché a otra respuesta
 * (redirecciones, 401). Sin esto, un refresco hecho en esta solicitud se
 * perdería y el navegador quedaría con un refresh token ya consumido.
 */
export function copiarSesion(
  origen: NextResponse,
  destino: NextResponse
): NextResponse {
  for (const cookie of origen.cookies.getAll()) {
    destino.cookies.set(cookie)
  }
  for (const nombre of CABECERAS_ANTICACHE) {
    const valor = origen.headers.get(nombre)
    if (valor) destino.headers.set(nombre, valor)
  }
  return destino
}
