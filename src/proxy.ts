import { type NextRequest, NextResponse } from "next/server"

import { type DecisionAcceso, resolverAcceso } from "@/lib/auth/navegacion"
import {
  cabeceraEndpointsReporte,
  construirCsp,
  generarNonce,
  modoCspDesdeEntorno,
  nombreCabeceraCsp,
} from "@/lib/csp"
import { copiarSesion, updateSession } from "@/lib/supabase/proxy"

/**
 * Por cada solicitud: nonce y CSP, refresco de la sesión de Supabase y
 * redirecciones optimistas según haya sesión. No autoriza: eso lo hace el DAL
 * en cada página y Server Action (el proxy puede no cubrir una ruta si cambia
 * el matcher).
 */
export async function proxy(request: NextRequest) {
  const nonce = generarNonce()
  const politica = construirCsp({
    nonce,
    desarrollo: process.env.NODE_ENV === "development",
    https: request.nextUrl.protocol === "https:",
  })
  const cabeceraCsp = nombreCabeceraCsp(
    modoCspDesdeEntorno(process.env.AMO_CSP_MODO)
  )

  // Next toma el nonce de la CSP de la solicitud y lo aplica a sus scripts.
  const { respuesta, claims } = await updateSession(request, {
    "x-nonce": nonce,
    [cabeceraCsp]: politica,
  })

  const decision = resolverAcceso({
    ruta: request.nextUrl.pathname,
    busqueda: request.nextUrl.search,
    autenticado: claims !== null,
  })

  const final = responderSegun(decision, request, respuesta)
  final.headers.set(cabeceraCsp, politica)
  final.headers.set(
    "Reporting-Endpoints",
    cabeceraEndpointsReporte(request.nextUrl.origin)
  )
  return final
}

function responderSegun(
  decision: DecisionAcceso,
  request: NextRequest,
  respuesta: NextResponse
): NextResponse {
  switch (decision.tipo) {
    case "continuar":
      return respuesta
    case "no-autenticado":
      return copiarSesion(
        respuesta,
        NextResponse.json({ error: "No autenticado" }, { status: 401 })
      )
    case "redirigir": {
      // 303 convierte en GET un POST (p. ej. una acción con la sesión vencida).
      const estado =
        request.method === "GET" || request.method === "HEAD" ? 307 : 303
      const destino = new URL(decision.destino, request.url)
      return copiarSesion(respuesta, NextResponse.redirect(destino, estado))
    }
  }
}

export const config = {
  matcher: [
    /*
     * Todo menos: internos de Next (`_next/`: estáticos, imágenes, HMR),
     * `__nextjs*` (herramientas de desarrollo), activos públicos (`data/`,
     * `brand/`, `vendor/`, favicon) y archivos estáticos por extensión.
     * Los prefetch de <Link> y las rutas /api SÍ pasan: refrescan la sesión
     * y reciben 401/redirección igual que una navegación.
     */
    "/((?!_next/|__nextjs|favicon\\.ico|data/|brand/|vendor/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|txt|webmanifest|woff2|js|map)$).*)",
  ],
}
