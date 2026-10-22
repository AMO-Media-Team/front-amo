import { type NextRequest, NextResponse } from "next/server"

import { CABECERA_RUTA_SOLICITADA } from "@/lib/auth/compuertas"
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
    // Se lee aquí y no de `@/lib/env`: ese módulo valida al cargarse y el
    // proxy debe poder probarse sin entorno.
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    desarrollo: process.env.NODE_ENV === "development",
    https: request.nextUrl.protocol === "https:",
  })
  const cabeceraCsp = nombreCabeceraCsp(
    modoCspDesdeEntorno(process.env.AMO_CSP_MODO)
  )

  // Ruta pedida (sin `_rsc`), para que el DAL conserve el destino si manda a
  // un paso pendiente (`?next=`). Pisa lo que mande el cliente; el DAL la valida.
  const pedida = request.nextUrl.clone()
  pedida.searchParams.delete("_rsc")

  // Next toma el nonce de la CSP de la solicitud y lo aplica a sus scripts.
  const { respuesta, claims } = await updateSession(request, {
    "x-nonce": nonce,
    [cabeceraCsp]: politica,
    [CABECERA_RUTA_SOLICITADA]: pedida.pathname + pedida.search,
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
