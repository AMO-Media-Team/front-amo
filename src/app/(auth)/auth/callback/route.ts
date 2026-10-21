import { type NextRequest, NextResponse } from "next/server"

import { leerClaims } from "@/lib/auth/compuertas"
import { RUTA_INGRESO, rutaInternaSegura } from "@/lib/auth/navegacion"
import { registrarIngreso } from "@/lib/auth/registro"
import { obtenerAuthServidor } from "@/lib/supabase/auth-server"

/** Sin `next`, el enlace por defecto de Supabase es el de recuperación. */
const DESTINO_POR_DEFECTO = "/restablecer"

function redirigir(request: NextRequest, destino: string): NextResponse {
  const respuesta = NextResponse.redirect(
    new URL(destino, request.nextUrl.origin)
  )
  // Puede llevar cookies de sesión nuevas: nunca debe cachearse.
  respuesta.headers.set("Cache-Control", "private, no-store")
  return respuesta
}

const motivoDeError = (codigo: string | null | undefined) =>
  codigo === "otp_expired" ? "enlace-vencido" : "enlace-invalido"

/**
 * Intercambio PKCE para los correos con las plantillas por defecto de
 * Supabase (`?code=`). Las invitaciones y los enlaces generados por AMO usan
 * `/auth/confirm`, que no consume el token con un GET.
 */
export async function GET(request: NextRequest) {
  const parametros = request.nextUrl.searchParams
  const codigo = parametros.get("code")
  const errorSupabase = parametros.get("error_code") ?? parametros.get("error")

  if (!codigo || errorSupabase) {
    return redirigir(
      request,
      `${RUTA_INGRESO}?motivo=${motivoDeError(errorSupabase)}`
    )
  }

  const auth = await obtenerAuthServidor()
  const { data, error } = await auth.exchangeCodeForSession(codigo)
  if (error) {
    return redirigir(
      request,
      `${RUTA_INGRESO}?motivo=${motivoDeError(error.code)}`
    )
  }
  const { data: verificado } = await auth.getClaims(data.session.access_token)
  const claims = verificado ? leerClaims(verificado.claims) : null
  if (claims) await registrarIngreso(claims)

  const destino =
    rutaInternaSegura(parametros.get("next")) ?? DESTINO_POR_DEFECTO
  return redirigir(request, destino)
}
