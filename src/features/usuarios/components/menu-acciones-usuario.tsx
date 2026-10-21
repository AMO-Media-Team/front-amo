"use client"

import { Ellipsis, EllipsisVertical, Eye, UserPen } from "lucide-react"
import Link from "next/link"
import { Fragment, type ReactNode, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { nombreVisible } from "../presentacion"
import { type AccionUsuario, accionesDisponibles } from "../reglas-acciones"
import type { UsuarioDetalle } from "../tipos"
import { useGestionUsuarios } from "./contexto-gestion"
import {
  CONFIG_ACCIONES,
  DialogosAccionUsuario,
  rutaUsuario,
  type UsuarioAcciones,
} from "./dialogos-accion-usuario"
import { HojaEditarUsuario } from "./hoja-editar-usuario"

/** Grupos del menú, de lo cotidiano a lo irreversible. */
const GRUPOS: readonly (readonly AccionUsuario[])[] = [
  [
    "enlace_invitacion",
    "enlace_recuperacion",
    "forzar_cambio",
    "restablecer_mfa",
    "cerrar_sesiones",
  ],
  ["reactivar", "suspender", "revocar_invitacion", "desactivar"],
  ["eliminar"],
]

function useAcciones(usuario: UsuarioAcciones) {
  const { actor, rolesGestionables } = useGestionUsuarios()
  return accionesDisponibles(actor, usuario, rolesGestionables)
}

function ItemsAcciones({
  grupos,
  separarPrimero,
  onElegir,
}: {
  grupos: readonly (readonly AccionUsuario[])[]
  separarPrimero: boolean
  onElegir: (accion: AccionUsuario) => void
}) {
  return grupos.map((grupo, indice) => (
    <Fragment key={grupo.join()}>
      {indice > 0 || separarPrimero ? <DropdownMenuSeparator /> : null}
      <DropdownMenuGroup>
        {grupo.map((accion) => {
          const { etiqueta, Icono, destructiva } = CONFIG_ACCIONES[accion]
          return (
            <DropdownMenuItem
              key={accion}
              variant={destructiva ? "destructive" : "default"}
              onClick={() => onElegir(accion)}
            >
              <Icono aria-hidden />
              {etiqueta}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuGroup>
    </Fragment>
  ))
}

interface MenuAccionesUsuarioProps {
  usuario: UsuarioAcciones
  /** "fila": botón de tres puntos en la tabla; "ficha": botones de la cabecera del detalle. */
  variante: "fila" | "ficha"
  /** Ficha: datos completos para la hoja de edición. */
  detalle?: UsuarioDetalle
  /** Ficha: abre la edición al cargar (`?editar=1` desde el listado). */
  editarAlAbrir?: boolean
}

/**
 * Acciones sobre un usuario: solo se ofrecen las permitidas por permisos,
 * estado y anti-escalada (`accionesDisponibles`); la BD vuelve a validar cada
 * una. En la fila, "Editar" lleva a la ficha (que tiene todos los datos).
 */
export function MenuAccionesUsuario({
  usuario,
  variante,
  detalle,
  editarAlAbrir = false,
}: MenuAccionesUsuarioProps) {
  const disponibles = useAcciones(usuario)
  const [accion, setAccion] = useState<AccionUsuario | null>(null)
  const [edicion, setEdicion] = useState(
    editarAlAbrir && disponibles.has("editar")
  )
  const nombre = nombreVisible(usuario)
  const grupos = GRUPOS.map((grupo) =>
    grupo.filter((candidata) => disponibles.has(candidata))
  ).filter((grupo) => grupo.length > 0)

  let disparadores: ReactNode
  if (variante === "fila") {
    disparadores = (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Acciones para ${nombre}`}
              data-no-navegar
            />
          }
        >
          <EllipsisVertical aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="truncate">{nombre}</DropdownMenuLabel>
            <DropdownMenuItem render={<Link href={rutaUsuario(usuario.id)} />}>
              <Eye aria-hidden />
              Ver ficha
            </DropdownMenuItem>
            {disponibles.has("editar") ? (
              <DropdownMenuItem
                render={<Link href={rutaUsuario(usuario.id, true)} />}
              >
                <UserPen aria-hidden />
                {CONFIG_ACCIONES.editar.etiqueta}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
          <ItemsAcciones grupos={grupos} separarPrimero onElegir={setAccion} />
        </DropdownMenuContent>
      </DropdownMenu>
    )
  } else {
    disparadores = (
      <div className="flex flex-wrap items-center gap-2">
        {disponibles.has("editar") && detalle ? (
          <Button variant="outline" onClick={() => setEdicion(true)}>
            <UserPen data-icon="inline-start" aria-hidden />
            Editar
          </Button>
        ) : null}
        {grupos.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              <Ellipsis data-icon="inline-start" aria-hidden />
              Más acciones
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <ItemsAcciones
                grupos={grupos}
                separarPrimero={false}
                onElegir={setAccion}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    )
  }

  return (
    <>
      {disparadores}
      {detalle ? (
        <HojaEditarUsuario
          usuario={detalle}
          abierta={edicion}
          onAbiertaChange={setEdicion}
        />
      ) : null}
      <DialogosAccionUsuario
        usuario={usuario}
        accion={accion}
        onCerrar={() => setAccion(null)}
        volverAlListadoTrasEliminar={variante === "ficha"}
      />
    </>
  )
}

/**
 * Acceso directo a una acción (p. ej. "Cerrar todas" en Seguridad). No se
 * pinta si la acción no está permitida sobre este usuario.
 */
export function BotonAccionUsuario({
  usuario,
  accion,
  children,
  variante = "outline",
}: {
  usuario: UsuarioAcciones
  accion: AccionUsuario
  children: ReactNode
  variante?: "outline" | "secondary" | "ghost"
}) {
  const disponibles = useAcciones(usuario)
  const [abierta, setAbierta] = useState(false)
  if (!disponibles.has(accion)) return null
  const { Icono } = CONFIG_ACCIONES[accion]

  return (
    <>
      <Button variant={variante} size="sm" onClick={() => setAbierta(true)}>
        <Icono data-icon="inline-start" aria-hidden />
        {children}
      </Button>
      <DialogosAccionUsuario
        usuario={usuario}
        accion={abierta ? accion : null}
        onCerrar={() => setAbierta(false)}
      />
    </>
  )
}
