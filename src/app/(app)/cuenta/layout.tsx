import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { NavegacionCuenta } from "@/features/cuenta/components/navegacion-cuenta"

/**
 * Marco de «Mi cuenta»: encabezado y navegación entre Perfil, Seguridad y
 * Preferencias. Es estático a propósito: no autoriza ni consulta (los layouts
 * no se vuelven a ejecutar al navegar); cada página llama al DAL.
 */
export default function LayoutCuenta({ children }: LayoutProps<"/cuenta">) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:gap-8 lg:px-8 lg:py-8">
      <EncabezadoPagina
        antetitulo="Cuenta"
        titulo="Mi cuenta"
        descripcion="Tus datos, la seguridad de tu acceso y cómo quieres ver AMO."
      />
      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10">
        <NavegacionCuenta />
        <div className="flex min-w-0 flex-col">{children}</div>
      </div>
    </div>
  )
}
