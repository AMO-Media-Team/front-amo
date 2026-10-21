"use client"

import { CopyPlus, PencilLine, ShieldPlus, X } from "lucide-react"
import { useRouter } from "next/navigation"
import {
  createContext,
  type ReactNode,
  Suspense,
  use,
  useCallback,
  useMemo,
  useState,
} from "react"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { Esqueleto } from "@/components/feedback/esqueletos"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

import type { RolCreado } from "../actions"
import { pluralizar } from "../presentacion"
import { rutaRol } from "../rutas"
import type { ActorRoles, RolListado } from "../tipos"
import { FormularioCrearRol } from "./formulario-crear-rol"
import { FormularioEditarRol } from "./formulario-editar-rol"

type Solicitud =
  | { modo: "crear"; origenId: string | null }
  | { modo: "editar"; rol: RolListado }

interface HojaRol {
  abrirCrear: (origenId?: string | null) => void
  abrirEditar: (rol: RolListado) => void
}

const ContextoHojaRol = createContext<HojaRol | null>(null)

export function useHojaRol(): HojaRol {
  const valor = use(ContextoHojaRol)
  if (!valor) throw new Error("useHojaRol requiere <ProveedorHojaRol>.")
  return valor
}

const TEXTOS = {
  crear: {
    Icono: ShieldPlus,
    titulo: "Nuevo rol",
    descripcion: "Un rol agrupa permisos para asignarlos a varias personas.",
  },
  duplicar: {
    Icono: CopyPlus,
    titulo: "Duplicar rol",
    descripcion: "Parte de un rol existente y ajusta lo que necesites.",
  },
  editar: {
    Icono: PencilLine,
    titulo: "Editar rol",
    descripcion: "Los cambios se aplican a todas las personas con este rol.",
  },
} as const

function EsqueletoFormulario() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex flex-col gap-6 px-5 py-5"
    >
      <span className="sr-only">Cargando el formulario…</span>
      <Esqueleto className="h-16 rounded-xl" />
      {Array.from({ length: 4 }, (_, indice) => (
        <div key={indice} className="flex flex-col gap-2">
          <Esqueleto className="h-4 w-24" />
          <Esqueleto className="h-8 w-full" />
        </div>
      ))}
    </div>
  )
}

function CrearConRoles({
  roles,
  ...props
}: Omit<Parameters<typeof FormularioCrearRol>[0], "roles"> & {
  roles: Promise<RolListado[]>
}) {
  return <FormularioCrearRol roles={use(roles)} {...props} />
}

/**
 * Hoja lateral para crear, duplicar o editar un rol, compartida por la
 * página (botón del encabezado, estado vacío y menús de cada rol). Los roles
 * para "copiar de" llegan como promesa: la hoja se puede abrir antes de que
 * termine la consulta. Si hay datos sin guardar, pide confirmación al cerrar.
 */
export function ProveedorHojaRol({
  actor,
  roles,
  children,
}: {
  actor: ActorRoles
  roles: Promise<RolListado[]>
  children: ReactNode
}) {
  const router = useRouter()
  const [solicitud, setSolicitud] = useState<Solicitud | null>(null)
  const [abierta, setAbierta] = useState(false)
  const [sucio, setSucio] = useState(false)
  const [confirmarDescarte, setConfirmarDescarte] = useState(false)
  // Remontar el formulario en cada apertura lo deja limpio.
  const [version, setVersion] = useState(0)

  const abrir = useCallback((nueva: Solicitud) => {
    setSolicitud(nueva)
    setSucio(false)
    setVersion((actual) => actual + 1)
    setAbierta(true)
  }, [])

  const valor = useMemo<HojaRol>(
    () => ({
      abrirCrear: (origenId = null) => abrir({ modo: "crear", origenId }),
      abrirEditar: (rol) => abrir({ modo: "editar", rol }),
    }),
    [abrir]
  )

  function cambiarAbierta(siguiente: boolean) {
    if (!siguiente && sucio) {
      setConfirmarDescarte(true)
      return
    }
    setAbierta(siguiente)
  }

  function alCrear({ id, copiados, omitidos }: RolCreado) {
    setAbierta(false)
    toast.success("Rol creado", {
      description:
        copiados > 0
          ? `Copiamos ${pluralizar(copiados, "permiso", "permisos")}${omitidos > 0 ? ` (${omitidos} omitidos)` : ""}. Revísalos en la matriz.`
          : "Ahora elige sus permisos en la matriz.",
    })
    router.push(rutaRol(id))
  }

  function alGuardar() {
    setAbierta(false)
    toast.success("Cambios guardados")
  }

  const clave =
    solicitud?.modo === "editar"
      ? "editar"
      : solicitud?.origenId
        ? "duplicar"
        : "crear"
  const { Icono, titulo, descripcion } = TEXTOS[clave]

  return (
    <ContextoHojaRol value={valor}>
      {children}

      <Sheet open={abierta} onOpenChange={cambiarAbierta}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        >
          <SheetHeader className="flex-row items-start gap-3 border-b px-5 py-4">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
              <Icono className="size-5" aria-hidden />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <SheetTitle className="text-base font-semibold">
                {titulo}
              </SheetTitle>
              <SheetDescription>{descripcion}</SheetDescription>
            </div>
            <SheetClose
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Cerrar" />
              }
            >
              <X aria-hidden />
            </SheetClose>
          </SheetHeader>

          {solicitud?.modo === "editar" ? (
            <FormularioEditarRol
              key={version}
              rol={solicitud.rol}
              onSucio={setSucio}
              onGuardado={alGuardar}
            />
          ) : solicitud ? (
            <Suspense fallback={<EsqueletoFormulario />}>
              <CrearConRoles
                key={version}
                roles={roles}
                actor={actor}
                origenInicial={solicitud.origenId}
                onSucio={setSucio}
                onCreado={alCrear}
              />
            </Suspense>
          ) : null}
        </SheetContent>
      </Sheet>

      <DialogoConfirmacion
        abierto={confirmarDescarte}
        onAbiertoChange={setConfirmarDescarte}
        titulo={
          solicitud?.modo === "editar"
            ? "¿Descartar los cambios?"
            : "¿Descartar el nuevo rol?"
        }
        descripcion="Perderás lo que escribiste."
        textoConfirmar="Descartar"
        textoCancelar="Seguir editando"
        destructivo
        onConfirmar={() => {
          setSucio(false)
          setAbierta(false)
        }}
      />
    </ContextoHojaRol>
  )
}

/** CTA "Crear rol" del encabezado. */
export function BotonCrearRol() {
  const { abrirCrear } = useHojaRol()
  return (
    <Button onClick={() => abrirCrear()}>
      <ShieldPlus data-icon="inline-start" aria-hidden />
      Crear rol
    </Button>
  )
}
