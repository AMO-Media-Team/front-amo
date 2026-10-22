import "server-only"

import { UserPlus, UsersRound } from "lucide-react"
import Link from "next/link"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { FechaRelativa } from "@/features/operacion/components/ficha"
import {
  AvatarPersona,
  InsigniaEstado,
  InsigniaRol,
} from "@/features/usuarios/components/distintivos"
import { BotonCrearUsuario } from "@/features/usuarios/components/hoja-crear-usuario"
import { TarjetaFicha } from "@/features/usuarios/components/tarjeta-ficha"
import { nombreVisible } from "@/features/usuarios/presentacion"
import type { OrganizacionFija } from "@/features/usuarios/tipos"

import { resumenPersonas, rutaUsuario } from "../presentacion"
import { usuariosDelMedio } from "../queries"
import type { PersonaMedio } from "../tipos"

function FilaPersona({ persona }: { persona: PersonaMedio }) {
  const nombre = nombreVisible(persona)
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <AvatarPersona
        nombre={nombre}
        color={persona.rol?.color ?? null}
        tamano="sm"
      />
      <div className="flex min-w-0 flex-col">
        <Link
          href={rutaUsuario(persona.id)}
          className="truncate text-sm font-medium underline-offset-4 hover:underline focus-visible:underline"
        >
          {nombre}
        </Link>
        <span className="truncate text-xs text-muted-foreground">
          {persona.email}
        </span>
        <span className="text-xs text-muted-foreground">
          {persona.ultimoAccesoAt ? (
            <>
              Último acceso{" "}
              <FechaRelativa valor={persona.ultimoAccesoAt} estilo="medio" />
            </>
          ) : persona.estado === "INVITADO" ? (
            "Aún no activa su cuenta"
          ) : (
            "Nunca ha ingresado"
          )}
        </span>
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-1.5 sm:col-start-3 sm:justify-end">
        <InsigniaRol rol={persona.rol} />
        <InsigniaEstado estado={persona.estado} />
      </div>
    </li>
  )
}

/**
 * Pestaña «Usuarios» de la ficha: las personas vinculadas al medio, con
 * enlace a su ficha en Administración. Vacía, invita a crear la primera.
 */
export function UsuariosMedio({
  personas,
  invitarA,
}: {
  personas: readonly PersonaMedio[]
  /** Con `usuarios.invitar`: el medio al que se invita (organización fija). */
  invitarA: OrganizacionFija | null
}) {
  if (personas.length === 0) {
    return (
      <EstadoVacio
        icono={UserPlus}
        titulo="Aún no hay usuarios en este medio"
        descripcion={
          invitarA
            ? "Invita a la primera persona de su equipo: completará el perfil, registrará sus cuentas sociales y subirá los documentos para la verificación."
            : "Quien tenga permiso para invitar usuarios puede crear la primera cuenta de su equipo; aparecerá aquí."
        }
      >
        {invitarA ? (
          <BotonCrearUsuario organizacion={invitarA} texto="Invitar usuario" />
        ) : null}
      </EstadoVacio>
    )
  }

  return (
    <TarjetaFicha
      titulo="Personas del medio"
      icono={UsersRound}
      descripcion={resumenPersonas(personas)}
    >
      <ul className="flex flex-col divide-y">
        {personas.map((persona) => (
          <FilaPersona key={persona.id} persona={persona} />
        ))}
      </ul>
    </TarjetaFicha>
  )
}

/**
 * Pestaña «Usuarios» con su propia consulta: va dentro de `Diferida`, así un
 * fallo o una espera aquí no detienen el resto de la ficha.
 */
export async function SeccionUsuariosMedio({
  medioId,
  invitarA,
}: {
  medioId: string
  invitarA: OrganizacionFija | null
}) {
  const personas = await usuariosDelMedio(medioId)
  return <UsuariosMedio personas={personas} invitarA={invitarA} />
}
