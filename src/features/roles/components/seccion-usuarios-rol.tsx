import { ArrowUpRight, ChevronRight, Lock, Users } from "lucide-react"
import Link from "next/link"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import {
  AvatarPersona,
  IndicadorMfa,
  InsigniaEstado,
} from "@/features/usuarios/components/distintivos"
import { TarjetaFicha } from "@/features/usuarios/components/tarjeta-ficha"
import { estadoMfa, nombreVisible } from "@/features/usuarios/presentacion"
import { formatearFechaHora, formatearRelativo } from "@/lib/format"

import { pluralizar } from "../presentacion"
import { LIMITE_USUARIOS_ROL, usuariosDelRol } from "../queries"
import { rutaUsuario, rutaUsuariosDelRol } from "../rutas"
import type { RolDetalle } from "../tipos"

/**
 * Pestaña "Usuarios con este rol": lista compacta de las cuentas vigentes,
 * cada una enlazada a su ficha. `listar_usuarios` exige `usuarios.ver`.
 */
export async function SeccionUsuariosRol({
  rol,
  puedeVerUsuarios,
}: {
  rol: Pick<RolDetalle, "id" | "nombre" | "color" | "requiereMfa">
  puedeVerUsuarios: boolean
}) {
  if (!puedeVerUsuarios) {
    return (
      <EstadoVacio
        icono={Lock}
        titulo="Necesitas el permiso para ver usuarios"
        descripcion="Pide a un administrador el permiso «Ver el listado y la ficha de usuarios»."
        className="flex-none py-12"
      />
    )
  }

  const { usuarios, total } = await usuariosDelRol(rol.id)

  return (
    <TarjetaFicha
      titulo="Usuarios con este rol"
      icono={Users}
      descripcion={
        total === 0
          ? "Ninguna cuenta vigente tiene este rol."
          : `${pluralizar(total, "cuenta vigente", "cuentas vigentes")}, por nombre.`
      }
      acciones={
        total > 0 ? (
          <EnlaceBoton
            href={rutaUsuariosDelRol(rol.id)}
            variant="outline"
            size="sm"
          >
            Ver en Usuarios
            <ArrowUpRight data-icon="inline-end" aria-hidden />
          </EnlaceBoton>
        ) : null
      }
      className="[&>div:last-child]:p-0"
    >
      {usuarios.length === 0 ? (
        <EstadoVacio
          variante="simple"
          icono={Users}
          titulo="Nadie tiene este rol todavía"
          descripcion="Asígnalo desde Usuarios al invitar o editar una cuenta."
          className="py-10"
        />
      ) : (
        <ul className="divide-y">
          {usuarios.map((usuario, indice) => {
            const nombre = nombreVisible(usuario)
            return (
              <li
                key={usuario.id}
                style={{ animationDelay: `${Math.min(indice, 10) * 30}ms` }}
                className="animate-aparecer-arriba motion-reduce:animate-none"
              >
                <Link
                  href={rutaUsuario(usuario.id)}
                  className="group/usuario flex items-center gap-3 px-5 py-3 outline-none hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:ring-inset"
                >
                  <AvatarPersona
                    nombre={nombre}
                    color={rol.color}
                    tamano="sm"
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      {nombre}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {usuario.email}
                    </span>
                  </span>
                  <InsigniaEstado
                    estado={usuario.estado}
                    className="max-sm:hidden"
                  />
                  <IndicadorMfa
                    estado={estadoMfa(
                      usuario.mfaActivo,
                      rol.requiereMfa,
                      usuario.estado
                    )}
                    compacto
                  />
                  <span
                    className="hidden w-28 text-right text-xs text-muted-foreground md:block"
                    title={
                      usuario.ultimoAccesoAt
                        ? formatearFechaHora(usuario.ultimoAccesoAt)
                        : undefined
                    }
                  >
                    {usuario.ultimoAccesoAt
                      ? formatearRelativo(usuario.ultimoAccesoAt)
                      : "Sin accesos"}
                  </span>
                  <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-hover/usuario:translate-x-0.5"
                  />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {total > LIMITE_USUARIOS_ROL ? (
        <p className="border-t px-5 py-3 text-xs text-muted-foreground">
          Se muestran las primeras {LIMITE_USUARIOS_ROL}. Usa «Ver en Usuarios»
          para buscar y filtrar todas.
        </p>
      ) : null}
    </TarjetaFicha>
  )
}
