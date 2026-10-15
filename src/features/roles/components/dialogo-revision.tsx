"use client"

import {
  GitCompareArrows,
  Minus,
  Plus,
  TriangleAlert,
  Users,
} from "lucide-react"
import { useState, useTransition } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { type ClavePermiso, PERMISOS } from "@/lib/auth/permisos"
import type { ResultadoAccion } from "@/lib/result"
import { cn } from "@/lib/utils"

import { contarSensibles, type DiffPermisos, diffPorModulo } from "../catalogo"
import { pluralizar } from "../presentacion"
import { InsigniaSensible } from "./fila-permiso"

function LineaCambio({
  clave,
  tipo,
}: {
  clave: ClavePermiso
  tipo: "agregar" | "quitar"
}) {
  const Icono = tipo === "agregar" ? Plus : Minus
  return (
    <li className="flex items-start gap-2.5 py-1.5">
      <span
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
          tipo === "agregar"
            ? "bg-success/12 text-success"
            : "bg-destructive/10 text-destructive"
        )}
      >
        <Icono className="size-3" aria-hidden />
        <span className="sr-only">
          {tipo === "agregar" ? "Se otorga:" : "Se retira:"}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
        {PERMISOS[clave].descripcion}
        {PERMISOS[clave].esSensible ? <InsigniaSensible /> : null}
      </span>
    </li>
  )
}

/**
 * Diff previo al guardar: qué se otorga y qué se retira, agrupado por módulo,
 * con avisos de permisos sensibles y de cuántas cuentas se ven afectadas. Un
 * fallo de la acción se muestra dentro del diálogo, que sigue abierto.
 */
export function DialogoRevision({
  abierto,
  onAbiertoChange,
  nombreRol,
  usuarios,
  totalFinal,
  diff,
  onGuardar,
}: {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  nombreRol: string
  /** Cuentas vigentes con el rol; `null` si el actor no puede contarlas. */
  usuarios: number | null
  /** Permisos que tendrá el rol después de guardar. */
  totalFinal: number
  diff: DiffPermisos
  onGuardar: () => Promise<ResultadoAccion<unknown>>
}) {
  const [pendiente, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const grupos = diffPorModulo(diff)
  const sensiblesOtorgados = contarSensibles(diff.agregar)
  const cambios = diff.agregar.length + diff.quitar.length

  function cambiarAbierto(valor: boolean) {
    if (pendiente) return
    if (!valor) setError(null)
    onAbiertoChange(valor)
  }

  function guardar() {
    setError(null)
    iniciar(async () => {
      const resultado = await onGuardar()
      if (resultado.ok) onAbiertoChange(false)
      else setError(resultado.error)
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={cambiarAbierto}>
      <DialogContent showCloseButton={false} className="gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="flex-row items-start gap-3 border-b px-5 py-4 text-left">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <GitCompareArrows className="size-5" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <DialogTitle className="text-base font-semibold">
              Revisa los cambios antes de guardar
            </DialogTitle>
            <DialogDescription>
              «{nombreRol}» quedará con{" "}
              {pluralizar(totalFinal, "permiso", "permisos")}.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex max-h-[min(55vh,28rem)] flex-col gap-4 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap gap-2 text-xs font-medium">
            {diff.agregar.length > 0 ? (
              <span className="inline-flex h-6 items-center gap-1 rounded-full bg-success/12 px-2.5 text-success">
                <Plus className="size-3" aria-hidden />
                {pluralizar(diff.agregar.length, "se otorga", "se otorgan")}
              </span>
            ) : null}
            {diff.quitar.length > 0 ? (
              <span className="inline-flex h-6 items-center gap-1 rounded-full bg-destructive/10 px-2.5 text-destructive">
                <Minus className="size-3" aria-hidden />
                {pluralizar(diff.quitar.length, "se retira", "se retiran")}
              </span>
            ) : null}
            {usuarios !== null ? (
              <span className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2.5 text-muted-foreground">
                <Users className="size-3" aria-hidden />
                {usuarios === 0
                  ? "Ninguna cuenta lo usa aún"
                  : `Afecta a ${pluralizar(usuarios, "cuenta", "cuentas")}`}
              </span>
            ) : null}
          </div>

          {sensiblesOtorgados > 0 ? (
            <Alert className="border-warning/40 bg-warning/8">
              <TriangleAlert className="text-warning" aria-hidden />
              <AlertDescription>
                Otorgas{" "}
                {pluralizar(
                  sensiblesOtorgados,
                  "permiso sensible",
                  "permisos sensibles"
                )}
                : dan acceso a dinero, datos personales o la seguridad de la
                plataforma.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-4">
            {grupos.map((grupo) => (
              <div key={grupo.modulo}>
                <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {grupo.titulo}
                </h3>
                <ul className="flex flex-col">
                  {grupo.agregar.map((clave) => (
                    <LineaCambio key={clave} clave={clave} tipo="agregar" />
                  ))}
                  {grupo.quitar.map((clave) => (
                    <LineaCambio key={clave} clave={clave} tipo="quitar" />
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {usuarios !== null && usuarios > 0 ? (
            <p className="text-xs text-muted-foreground">
              Las personas con este rol verán el cambio en su próxima acción; no
              hace falta que vuelvan a ingresar.
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="mx-0 mb-0 bg-muted/30 px-5 py-3">
          <Button
            variant="outline"
            onClick={() => cambiarAbierto(false)}
            disabled={pendiente}
          >
            Seguir editando
          </Button>
          <Button onClick={guardar} disabled={pendiente}>
            {pendiente ? (
              <Spinner aria-label="Guardando" data-icon="inline-start" />
            ) : null}
            Guardar {pluralizar(cambios, "cambio", "cambios")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
