import "server-only"

import { ChevronRight, UserPlus, UsersRound } from "lucide-react"
import Link from "next/link"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { rutaUsuario } from "@/features/roles/rutas"
import {
  AvatarPersona,
  InsigniaEstado,
  InsigniaRol,
} from "@/features/usuarios/components/distintivos"
import { BotonCrearUsuario } from "@/features/usuarios/components/hoja-crear-usuario"
import { TarjetaFicha } from "@/features/usuarios/components/tarjeta-ficha"
import { nombreVisible } from "@/features/usuarios/presentacion"
import type { OrganizacionFija } from "@/features/usuarios/tipos"
import { formatearFechaHora, formatearRelativo } from "@/lib/format"

import { resumenUsuarios } from "../presentacion"
import { usuariosDelAnunciante } from "../queries"
import type { UsuarioVinculado } from "../tipos"

function UltimoAcceso({ usuario }: { usuario: UsuarioVinculado }) {
  if (usuario.ultimoAccesoAt) {
    return (
      <time
        dateTime={usuario.ultimoAccesoAt}
        title={formatearFechaHora(usuario.ultimoAccesoAt)}
      >
        Último acceso {formatearRelativo(usuario.ultimoAccesoAt)}
      </time>
    )
  }
  return usuario.estado === "INVITADO" ? (
    <span>Aún no activa su cuenta</span>
  ) : (
    <span>Nunca ha ingresado</span>
  )
}

function FilaUsuario({
  usuario,
  indice,
}: {
  usuario: UsuarioVinculado
  indice: number
}) {
  const nombre = nombreVisible(usuario)
  return (
    <li
      style={{ animationDelay: `${Math.min(indice, 10) * 30}ms` }}
      className="animate-aparecer-arriba"
    >
      <Link
        href={rutaUsuario(usuario.id)}
        className="group/usuario flex items-center gap-3 px-5 py-3 outline-none hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:ring-inset"
      >
        <AvatarPersona
          nombre={nombre}
          color={usuario.rol?.color ?? null}
          tamano="sm"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{nombre}</span>
            <span className="truncate text-xs text-muted-foreground">
              {usuario.email}
            </span>
            <span className="text-xs text-muted-foreground">
              <UltimoAcceso usuario={usuario} />
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-1.5 sm:justify-end">
            <InsigniaRol rol={usuario.rol} />
            <InsigniaEstado estado={usuario.estado} />
          </span>
        </span>
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground transition-transform group-hover/usuario:translate-x-0.5"
        />
      </Link>
    </li>
  )
}

/**
 * Pestaña «Usuarios» de la ficha del anunciante: las personas vinculadas,
 * cada una enlazada a su ficha en Administración (`usuarios.ver`). Vacía,
 * invita a crear la primera si quien mira puede invitar (con datos, el botón
 * «Invitar usuario» está en la cabecera de la ficha).
 */
export async function SeccionUsuariosAnunciante({
  anuncianteId,
  invitarA,
}: {
  anuncianteId: string
  /** Con `usuarios.invitar` y algún rol de anunciante asignable: la empresa a la que se invita. */
  invitarA: OrganizacionFija | null
}) {
  const usuarios = await usuariosDelAnunciante(anuncianteId)

  if (usuarios.length === 0) {
    return (
      <EstadoVacio
        icono={UserPlus}
        titulo="Aún no hay personas vinculadas"
        descripcion={
          invitarA
            ? `Invita a quien gestionará las campañas de ${invitarA.nombre}: recibirá un enlace para crear su contraseña y entrar a AMO.`
            : "Cuando el equipo AMO invite a la primera persona de esta empresa, aparecerá aquí."
        }
      >
        {invitarA ? (
          <BotonCrearUsuario
            organizacion={invitarA}
            texto="Invitar a la primera persona"
          />
        ) : null}
      </EstadoVacio>
    )
  }

  return (
    <TarjetaFicha
      titulo="Personas del anunciante"
      icono={UsersRound}
      descripcion={resumenUsuarios(usuarios)}
      className="[&>div:last-child]:p-0"
    >
      <ul className="divide-y">
        {usuarios.map((usuario, indice) => (
          <FilaUsuario key={usuario.id} usuario={usuario} indice={indice} />
        ))}
      </ul>
    </TarjetaFicha>
  )
}
