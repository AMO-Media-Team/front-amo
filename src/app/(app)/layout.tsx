import { cookies } from "next/headers"

import { ShellAplicacion } from "@/components/layout/shell-aplicacion"
import {
  COOKIE_VISTA_TABLET,
  pistaVistaTablet,
} from "@/components/layout/vista-tablet"
import { ProveedorPreferencias } from "@/features/cuenta/components/proveedor-preferencias"
import { preferenciasPropias } from "@/features/cuenta/queries"
import { obtenerUsuarioShell } from "@/lib/auth/dal"

/** La escribe el SidebarProvider de shadcn al colapsar o expandir. */
const COOKIE_BARRA_LATERAL = "sidebar_state"

function preferenciaBarraLateral(valor: string | undefined): boolean | null {
  if (valor === "true") return true
  if (valor === "false") return false
  return null
}

/**
 * AppShell de las secciones privadas. No es la compuerta de seguridad (los
 * layouts no se vuelven a ejecutar al navegar): cada página y cada Server
 * Action autoriza con el DAL. Sin usuario al día no hay shell que pintar:
 * `obtenerUsuarioShell` redirige al ingreso o al paso pendiente.
 */
export default async function LayoutAplicacion({ children }: LayoutProps<"/">) {
  const [usuario, almacenCookies] = await Promise.all([
    obtenerUsuarioShell(),
    cookies(),
  ])
  // Movimiento reducido, densidad y formato de cifras de la cuenta valen en
  // toda la app, no solo en /cuenta/preferencias.
  const preferencias = await preferenciasPropias(usuario.id)

  return (
    <ProveedorPreferencias inicial={preferencias}>
      <ShellAplicacion
        usuario={usuario}
        barraLateralAbierta={preferenciaBarraLateral(
          almacenCookies.get(COOKIE_BARRA_LATERAL)?.value
        )}
        vistaTablet={pistaVistaTablet(
          almacenCookies.get(COOKIE_VISTA_TABLET)?.value
        )}
      >
        {children}
      </ShellAplicacion>
    </ProveedorPreferencias>
  )
}
