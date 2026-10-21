import { type NextRequest, NextResponse } from "next/server"

import { decidirSalida } from "@/lib/auth/dal"
import { RUTA_INGRESO } from "@/lib/auth/navegacion"
import { cerrarSesionActual } from "@/lib/auth/sesion"

function redirigir(request: NextRequest, destino: string): NextResponse {
  const respuesta = NextResponse.redirect(
    new URL(destino, request.nextUrl.origin)
  )
  // Borra o renueva cookies de sesión: nunca debe cachearse.
  respuesta.headers.set("Cache-Control", "private, no-store")
  return respuesta
}

/**
 * Salida forzada que dispara el DAL (perfil no activo, sesión revocada o
 * vencida por inactividad). Un Server Component no puede borrar cookies, así
 * que redirige aquí. Solo cierra la sesión si el servidor confirma el motivo;
 * si no, devuelve a la aplicación (un enlace externo no puede cerrarla).
 */
export async function GET(request: NextRequest) {
  const decision = await decidirSalida()
  if (decision.tipo === "continuar") {
    return redirigir(request, decision.destino)
  }
  await cerrarSesionActual(decision.claims, decision.evento)
  return redirigir(request, `${RUTA_INGRESO}?motivo=${decision.motivo}`)
}
