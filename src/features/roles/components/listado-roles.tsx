"use client"

import { SearchX, ShieldPlus } from "lucide-react"
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs"
import type { ReactNode } from "react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { Button } from "@/components/ui/button"

import {
  filtrarRoles,
  type FiltroTipo,
  ORDEN_TIPOS,
  pluralizar,
  TIPOS_ROL_ETIQUETA,
} from "../presentacion"
import type { ActorRoles, RolListado } from "../tipos"
import { CampoBusqueda } from "./campo-busqueda"
import { ControlSegmentado } from "./control-segmentado"
import { useHojaRol } from "./hoja-rol"
import { TarjetaRol } from "./tarjeta-rol"

const FILTROS_TIPO = [
  "TODOS",
  ...ORDEN_TIPOS,
] as const satisfies readonly FiltroTipo[]

/** Estado del listado en la URL (`?q=&tipo=`): solo del cliente, sin ir al servidor. */
const parsers = {
  q: parseAsString.withDefault(""),
  tipo: parseAsStringLiteral(FILTROS_TIPO).withDefault("TODOS"),
}

function GrupoRoles({
  id,
  titulo,
  descripcion,
  roles,
  actor,
  desplazamiento,
  children,
}: {
  id: string
  titulo: string
  descripcion: string
  roles: readonly RolListado[]
  actor: ActorRoles
  /** Índice inicial para escalonar la aparición tras el grupo anterior. */
  desplazamiento: number
  children?: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 id={id} className="flex items-center gap-2 text-base font-semibold">
          {titulo}
          <span className="rounded-full bg-muted px-2 text-xs leading-5 font-medium cifras text-muted-foreground">
            {roles.length}
          </span>
        </h2>
        <p className="text-sm text-muted-foreground">{descripcion}</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {roles.map((rol, indice) => (
          <TarjetaRol
            key={rol.id}
            rol={rol}
            actor={actor}
            indice={desplazamiento + indice}
          />
        ))}
        {children}
      </div>
    </section>
  )
}

function TarjetaCrearRol() {
  const { abrirCrear } = useHojaRol()
  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/40 p-6 text-center">
      <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
        <ShieldPlus className="size-5" aria-hidden />
      </span>
      <div className="flex max-w-64 flex-col gap-1">
        <p className="text-sm font-semibold">Crea un rol a la medida</p>
        <p className="text-sm text-muted-foreground">
          Empieza desde cero o duplica un rol existente y ajusta sus permisos.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={() => abrirCrear()}>
        <ShieldPlus data-icon="inline-start" aria-hidden />
        Crear rol
      </Button>
    </div>
  )
}

/**
 * Listado de roles en tarjetas, separados en "de sistema" y "personalizados",
 * con búsqueda sin tildes y filtro por tipo. Son pocos roles: se filtran en
 * el cliente y el estado queda en la URL para compartir la vista.
 */
export function ListadoRoles({
  roles,
  actor,
}: {
  roles: readonly RolListado[]
  actor: ActorRoles
}) {
  const [{ q, tipo }, fijar] = useQueryStates(parsers)
  const visibles = filtrarRoles(roles, { q, tipo })
  const sistema = visibles.filter((rol) => rol.esSistema)
  const personalizados = visibles.filter((rol) => !rol.esSistema)
  const hayPersonalizados = roles.some((rol) => !rol.esSistema)
  const filtrando = q.trim() !== "" || tipo !== "TODOS"

  const opcionesTipo = FILTROS_TIPO.map((valor) => ({
    valor,
    etiqueta: valor === "TODOS" ? "Todos" : TIPOS_ROL_ETIQUETA[valor],
    cantidad: filtrarRoles(roles, { q, tipo: valor }).length,
  }))

  return (
    <div className="flex flex-col gap-8">
      {/* Se reparte en una fila si cabe; si no, el filtro baja (nunca se recorta). */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <CampoBusqueda
          etiqueta="Buscar roles"
          placeholder="Buscar por nombre, clave o descripción"
          valor={q}
          onCambio={(texto) => void fijar({ q: texto || null })}
          className="sm:w-80 sm:max-w-full"
        />
        <ControlSegmentado
          etiqueta="Filtrar por tipo de rol"
          opciones={opcionesTipo}
          valor={tipo}
          onCambio={(valor) =>
            void fijar({ tipo: valor === "TODOS" ? null : valor })
          }
        />
      </div>

      <p className="sr-only" role="status">
        {pluralizar(visibles.length, "rol visible", "roles visibles")}
      </p>

      {visibles.length === 0 ? (
        <EstadoVacio
          icono={SearchX}
          titulo="Ningún rol coincide"
          descripcion="Prueba con otra palabra o quita el filtro de tipo."
          className="flex-none py-14"
        >
          <Button
            variant="outline"
            onClick={() => void fijar({ q: null, tipo: null })}
          >
            Limpiar filtros
          </Button>
        </EstadoVacio>
      ) : (
        <>
          {sistema.length > 0 ? (
            <GrupoRoles
              id="roles-sistema"
              titulo="Roles de sistema"
              descripcion="Vienen con la plataforma. Sus permisos solo cambian con una actualización; duplícalos para crear variantes."
              roles={sistema}
              actor={actor}
              desplazamiento={0}
            />
          ) : null}
          {personalizados.length > 0 || (!filtrando && !hayPersonalizados) ? (
            <GrupoRoles
              id="roles-personalizados"
              titulo="Roles personalizados"
              descripcion="Creados por tu equipo para necesidades específicas. Puedes editarlos, duplicarlos o eliminarlos."
              roles={personalizados}
              actor={actor}
              desplazamiento={sistema.length}
            >
              {!hayPersonalizados ? (
                actor.puedeGestionar ? (
                  <TarjetaCrearRol />
                ) : (
                  <p className="text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">
                    Aún no hay roles personalizados.
                  </p>
                )
              ) : null}
            </GrupoRoles>
          ) : null}
        </>
      )}
    </div>
  )
}
