"use client"

import {
  CopyPlus,
  Ellipsis,
  EllipsisVertical,
  ListChecks,
  Palette,
  PencilLine,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { eliminarRol } from "../actions"
import { type AccionesRol, accionesDisponibles } from "../reglas"
import type { ActorRoles, RolListado } from "../tipos"
import { RUTA_ROLES, rutaRol } from "../rutas"
import { useHojaRol } from "./hoja-rol"

function ItemEliminar({
  acciones,
  onElegir,
}: {
  acciones: AccionesRol
  onElegir: () => void
}) {
  return (
    <DropdownMenuItem
      variant="destructive"
      disabled={!acciones.eliminar}
      onClick={onElegir}
      className="items-start"
    >
      <Trash2 className="mt-0.5" aria-hidden />
      <span className="flex flex-col gap-0.5">
        Eliminar rol
        {acciones.motivoNoEliminar ? (
          <span className="max-w-56 text-xs text-muted-foreground">
            {acciones.motivoNoEliminar}
          </span>
        ) : null}
      </span>
    </DropdownMenuItem>
  )
}

function DialogoEliminarRol({
  rol,
  abierto,
  onAbiertoChange,
  alEliminar,
}: {
  rol: RolListado
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  alEliminar: () => void
}) {
  return (
    <DialogoConfirmacion
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={`¿Eliminar el rol «${rol.nombre}»?`}
      descripcion="Se borran el rol y sus permisos. La bitácora conserva el historial. Esta acción no se puede deshacer."
      textoVerificacion={rol.nombre}
      textoConfirmar="Eliminar rol"
      destructivo
      onConfirmar={async () => {
        const resultado = await eliminarRol({
          rolId: rol.id,
          confirmacion: rol.nombre,
        })
        if (resultado.ok) {
          toast.success("Rol eliminado", { description: rol.nombre })
          alEliminar()
        }
        return resultado
      }}
    />
  )
}

/**
 * Acciones sobre un rol: solo se ofrecen las permitidas (`accionesDisponibles`),
 * y la BD vuelve a validar cada una. En la tarjeta es un menú de tres puntos;
 * en la ficha, botones con "Más acciones".
 */
export function MenuAccionesRol({
  rol,
  actor,
  variante,
}: {
  rol: RolListado
  actor: ActorRoles
  variante: "tarjeta" | "ficha"
}) {
  const router = useRouter()
  const { abrirCrear, abrirEditar } = useHojaRol()
  const [eliminando, setEliminando] = useState(false)
  const acciones = accionesDisponibles(rol, actor)
  const puedeEliminar = actor.puedeGestionar && !rol.esSistema
  const IconoEditar = acciones.soloApariencia ? Palette : PencilLine
  const textoEditar = acciones.soloApariencia
    ? "Editar apariencia"
    : "Editar datos"

  const dialogo = puedeEliminar ? (
    <DialogoEliminarRol
      rol={rol}
      abierto={eliminando}
      onAbiertoChange={setEliminando}
      alEliminar={() =>
        variante === "ficha" ? router.replace(RUTA_ROLES) : router.refresh()
      }
    />
  ) : null

  if (variante === "tarjeta") {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Acciones para ${rol.nombre}`}
                className="relative z-10 text-muted-foreground"
              />
            }
          >
            <EllipsisVertical aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link href={rutaRol(rol.id)} />}>
                <ListChecks aria-hidden />
                Ver permisos
              </DropdownMenuItem>
              {acciones.editar ? (
                <DropdownMenuItem onClick={() => abrirEditar(rol)}>
                  <IconoEditar aria-hidden />
                  {textoEditar}
                </DropdownMenuItem>
              ) : null}
              {acciones.duplicar ? (
                <DropdownMenuItem onClick={() => abrirCrear(rol.id)}>
                  <CopyPlus aria-hidden />
                  Duplicar
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
            {puedeEliminar ? (
              <>
                <DropdownMenuSeparator />
                <ItemEliminar
                  acciones={acciones}
                  onElegir={() => setEliminando(true)}
                />
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        {dialogo}
      </>
    )
  }

  if (!actor.puedeGestionar) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {acciones.editar ? (
        <Button variant="outline" onClick={() => abrirEditar(rol)}>
          <IconoEditar data-icon="inline-start" aria-hidden />
          {acciones.soloApariencia ? "Apariencia" : "Editar"}
        </Button>
      ) : null}
      {acciones.duplicar ? (
        <Button variant="outline" onClick={() => abrirCrear(rol.id)}>
          <CopyPlus data-icon="inline-start" aria-hidden />
          Duplicar
        </Button>
      ) : null}
      {puedeEliminar ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="icon" aria-label="Más acciones" />
            }
          >
            <Ellipsis aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <ItemEliminar
              acciones={acciones}
              onElegir={() => setEliminando(true)}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {dialogo}
    </div>
  )
}
