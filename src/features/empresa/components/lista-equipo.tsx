import { Megaphone, UserPlus, UsersRound } from "lucide-react"
import { useId } from "react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { Nota } from "@/features/documentos-medio/components/avisos"
import {
  AvatarPersona,
  InsigniaEstado,
  InsigniaRol,
} from "@/features/usuarios/components/distintivos"
import { nombreVisible } from "@/features/usuarios/presentacion"
import { formatearFechaHora, formatearRelativo } from "@/lib/format"

import {
  ordenarEquipo,
  resumenEquipo,
  rolDeMiembro,
  type RolPropio,
} from "../equipo"
import type { MiembroEquipo } from "../tipos"

function UltimoAcceso({ miembro }: { miembro: MiembroEquipo }) {
  if (miembro.ultimoAccesoAt) {
    return (
      <time
        dateTime={miembro.ultimoAccesoAt}
        title={formatearFechaHora(miembro.ultimoAccesoAt)}
      >
        Último acceso {formatearRelativo(miembro.ultimoAccesoAt)}
      </time>
    )
  }
  return miembro.estado === "INVITADO" ? (
    <span>Aún no activa su cuenta</span>
  ) : (
    <span>Nunca ha ingresado</span>
  )
}

function FilaMiembro({
  miembro,
  esYo,
  rolPropio,
  indice,
}: {
  miembro: MiembroEquipo
  esYo: boolean
  rolPropio: RolPropio
  indice: number
}) {
  const nombre = nombreVisible(miembro)
  const rol = rolDeMiembro(miembro.rolClave, rolPropio)
  return (
    <li
      style={{ animationDelay: `${Math.min(indice, 10) * 30}ms` }}
      className="flex animate-aparecer-arriba items-center gap-3 px-4 py-3.5 sm:px-5"
    >
      <AvatarPersona nombre={nombre} color={rol?.color ?? null} tamano="sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex min-w-0 flex-col">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm font-medium">
            <span className="truncate">{nombre}</span>
            {esYo ? (
              <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[0.6875rem] font-semibold text-lila-700 dark:text-primary">
                Tú
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {miembro.email}
          </p>
          <p className="text-xs text-muted-foreground">
            <UltimoAcceso miembro={miembro} />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
          <InsigniaRol rol={rol} />
          <InsigniaEstado estado={miembro.estado} />
        </div>
      </div>
    </li>
  )
}

/**
 * «Mi empresa › Equipo» (ANU-002): las personas de la empresa con su rol,
 * estado y último acceso. Todas comparten las campañas de la empresa; las
 * cuentas nuevas las crea el equipo AMO.
 */
export function ListaEquipo({
  miembros,
  yoId,
  rolPropio,
}: {
  miembros: readonly MiembroEquipo[]
  yoId: string
  rolPropio: RolPropio
}) {
  const idTitulo = useId()
  const ordenados = ordenarEquipo(miembros, yoId)
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      {ordenados.length === 0 ? (
        <EstadoVacio
          icono={UsersRound}
          titulo="Aún no vemos a tu equipo"
          descripcion="Cuando el equipo de AMO cree las cuentas de tus compañeros, aparecerán aquí."
        />
      ) : (
        <section
          aria-labelledby={idTitulo}
          className="flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card"
        >
          <header className="flex items-start gap-3 border-b px-4 py-4 sm:px-5">
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15"
            >
              <UsersRound className="size-[1.125rem]" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2
                id={idTitulo}
                className="font-heading text-base leading-snug font-semibold"
              >
                Tu equipo en AMO
              </h2>
              <p className="text-sm cifras text-muted-foreground">
                {resumenEquipo(ordenados)}
              </p>
            </div>
          </header>
          <ul aria-labelledby={idTitulo} className="divide-y">
            {ordenados.map((miembro, indice) => (
              <FilaMiembro
                key={miembro.id}
                miembro={miembro}
                esYo={miembro.id === yoId}
                rolPropio={rolPropio}
                indice={indice}
              />
            ))}
          </ul>
        </section>
      )}
      <aside className="flex flex-col gap-4">
        <Nota icono={UserPlus} titulo="¿Necesitas sumar a alguien?">
          <p>
            Las cuentas nuevas las crea el equipo de AMO: así cada persona entra
            con su propio usuario y queda registrado quién hace qué. Escríbele
            con el <strong>nombre</strong>, el <strong>correo</strong> y el{" "}
            <strong>área</strong> de la persona (por ejemplo, mercadeo o
            compras).
          </p>
        </Nota>
        <Nota icono={Megaphone} titulo="Todo el equipo ve lo mismo">
          Las campañas y ofertas son de la empresa: cualquier persona del equipo
          las ve y, según su rol, las gestiona.
        </Nota>
      </aside>
    </div>
  )
}
