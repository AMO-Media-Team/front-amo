"use client"

import {
  BadgeCheck,
  CircleCheck,
  CircleHelp,
  ChevronDown,
  Plus,
  Share2,
} from "lucide-react"
import { useId, useMemo, useState } from "react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { useAhora } from "@/components/tiempo/use-ahora"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { SheetClose } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { formatearHandle } from "@/features/operacion/formato"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import { estadoCuenta } from "../estado-cuenta"
import {
  describirFranjas,
  fraseResumen,
  resumirCuentas,
  type ResumenCuentas,
} from "../presentacion"
import type { CuentaGuardada, PanelCuentas as DatosPanel } from "../tipos"
import { FormularioCuenta } from "./formulario-cuenta"
import { HojaCuenta } from "./hoja-cuenta"
import { TarjetaCuenta } from "./tarjeta-cuenta"

export interface PanelCuentasProps {
  panel: DatosPanel
  /** `Date.now()` del servidor al pintar (hidratación sin desajustes). */
  ahoraServidor: number
}

function Cifra({
  valor,
  etiqueta,
  tono,
}: {
  valor: number
  etiqueta: string
  tono: "exito" | "info" | "aviso"
}) {
  return (
    <div className="flex min-w-0 flex-col-reverse justify-end gap-0.5 rounded-xl bg-muted/40 px-3 py-2.5">
      <dt className="text-xs text-pretty text-muted-foreground">{etiqueta}</dt>
      <dd
        className={cn(
          "text-xl font-semibold cifras",
          valor > 0 && tono === "exito" && "text-success",
          valor > 0 && tono === "aviso" && "text-warning",
          valor > 0 && tono === "info" && "text-info"
        )}
      >
        {formatearNumero(valor)}
      </dd>
    </div>
  )
}

function Resumen({
  resumen,
  onAgregar,
}: {
  resumen: ResumenCuentas
  onAgregar: () => void
}) {
  return (
    <section
      aria-label="Resumen de tus cuentas"
      className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-pretty text-muted-foreground">
          {fraseResumen(resumen)}
        </p>
        <Button
          type="button"
          size="lg"
          onClick={onAgregar}
          className="w-full sm:w-fit"
        >
          <Plus data-icon="inline-start" aria-hidden />
          Agregar cuenta
        </Button>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        <Cifra
          valor={resumen.elegibles}
          etiqueta="Reciben ofertas"
          tono="exito"
        />
        <Cifra valor={resumen.enRevision} etiqueta="En revisión" tono="info" />
        <Cifra valor={resumen.pendientes} etiqueta="Por atender" tono="aviso" />
      </dl>
    </section>
  )
}

function Guia({ panel }: { panel: DatosPanel }) {
  const { parametros, franjas } = panel
  const pasos = [
    "Agrega cada cuenta de Facebook, Instagram o TikTok donde publicas.",
    `Verifícala: un código en una historia (tienes ${formatearNumero(parametros.minutosCodigo)} minutos) o una captura de tus estadísticas.`,
    "El equipo de AMO la revisa y te avisa. Con los seguidores verificados le asignamos su franja.",
    `La verificación dura ${formatearNumero(parametros.diasVigencia)} días; después tienes ${formatearNumero(parametros.diasGracia)} de gracia para reverificarla sin dejar de recibir ofertas.`,
  ]
  return (
    <Collapsible className="rounded-2xl border bg-card">
      <CollapsibleTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            className="group/guia h-auto w-full justify-between rounded-2xl px-4 py-3.5 text-left sm:px-5"
          />
        }
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <CircleHelp aria-hidden className="text-primary" />
          ¿Cómo funciona la verificación?
        </span>
        <ChevronDown
          aria-hidden
          className="text-muted-foreground transition-transform duration-200 group-aria-expanded/guia:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-4 px-4 pb-4 sm:px-5 sm:pb-5">
        <ol className="flex flex-col gap-2.5 text-sm">
          {pasos.map((paso, indice) => (
            <li key={paso} className="flex gap-2.5 text-pretty">
              <span
                aria-hidden
                className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-semibold cifras text-primary"
              >
                {indice + 1}
              </span>
              <span>{paso}</span>
            </li>
          ))}
        </ol>
        <p className="text-sm text-pretty text-muted-foreground">
          Solo las cuentas con al menos{" "}
          <span className="font-medium cifras text-foreground">
            {formatearNumero(parametros.umbralSeguidores)} seguidores
          </span>{" "}
          reciben ofertas.
          {franjas.length > 0 ? (
            <>
              {" "}
              Franjas de seguidores:{" "}
              <span className="cifras">{describirFranjas(franjas)}</span>.
            </>
          ) : null}
        </p>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Tras agregar una cuenta: invitar a verificarla de una vez. */
function CuentaAgregada({ handle }: { handle: string }) {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-3 py-6 text-center"
    >
      <span className="grid size-14 place-items-center rounded-full bg-success/12 text-success">
        <CircleCheck aria-hidden className="size-7" />
      </span>
      <p className="text-base font-semibold text-balance">
        Agregamos {formatearHandle(handle)}
      </p>
      <p className="max-w-sm text-sm text-pretty text-muted-foreground">
        Ahora verifícala para que empiece a recibir ofertas. Te toma unos
        minutos.
      </p>
    </div>
  )
}

type Alta =
  | { tipo: "formulario" }
  | { tipo: "agregada"; cuenta: CuentaGuardada; handle: string }

/**
 * «Mi medio › Cuentas sociales» (MED-005, MED-006): resumen, guía, una
 * tarjeta por cuenta con su estado y la acción que toca, y el alta. El
 * estado de cada cuenta se recalcula con la hora del dispositivo (cada 30 s),
 * así un código o una verificación que vencen se reflejan sin recargar.
 */
export function PanelCuentas({ panel, ahoraServidor }: PanelCuentasProps) {
  const idFormulario = useId()
  const ahora = useAhora(ahoraServidor)
  const [agregando, setAgregando] = useState(false)
  const [alta, setAlta] = useState<Alta>({ tipo: "formulario" })
  const [guardando, setGuardando] = useState(false)
  const [verificando, setVerificando] = useState<string | null>(null)

  const { cuentas, franjas, parametros } = panel
  const estados = useMemo(
    () => cuentas.map((cuenta) => estadoCuenta(cuenta, parametros, ahora)),
    [cuentas, parametros, ahora]
  )
  const resumen = resumirCuentas(estados)
  const existentes = cuentas

  function abrirAlta() {
    setAlta({ tipo: "formulario" })
    setAgregando(true)
  }

  function verificarAgregada() {
    if (alta.tipo !== "agregada") return
    setAgregando(false)
    setVerificando(alta.cuenta.id)
  }

  const pieAlta =
    alta.tipo === "agregada" ? (
      <>
        <SheetClose
          render={<Button type="button" variant="outline" size="lg" />}
        >
          Más tarde
        </SheetClose>
        <Button type="button" size="lg" onClick={verificarAgregada}>
          <BadgeCheck data-icon="inline-start" aria-hidden />
          Verificar ahora
        </Button>
      </>
    ) : (
      <>
        <SheetClose
          render={
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={guardando}
            />
          }
        >
          Cancelar
        </SheetClose>
        <Button
          type="submit"
          form={idFormulario}
          size="lg"
          disabled={guardando}
        >
          {guardando ? (
            <Spinner data-icon="inline-start" aria-hidden />
          ) : (
            <Plus data-icon="inline-start" aria-hidden />
          )}
          {guardando ? "Agregando…" : "Agregar cuenta"}
        </Button>
      </>
    )

  return (
    <div className="flex flex-col gap-4">
      {cuentas.length > 0 ? (
        <Resumen resumen={resumen} onAgregar={abrirAlta} />
      ) : null}
      <Guia panel={panel} />

      {cuentas.length === 0 ? (
        <EstadoVacio
          icono={Share2}
          titulo="Aún no registras cuentas"
          descripcion="Agrega las cuentas de Facebook, Instagram o TikTok donde publicas. Después las verificas y empiezas a recibir ofertas."
          className="flex-none py-12"
        >
          <Button type="button" size="lg" onClick={abrirAlta}>
            <Plus data-icon="inline-start" aria-hidden />
            Agregar tu primera cuenta
          </Button>
        </EstadoVacio>
      ) : (
        <ul
          aria-label="Tus cuentas sociales"
          className="grid grid-cols-1 gap-4 xl:grid-cols-2"
        >
          {cuentas.map((cuenta, indice) => (
            <li key={cuenta.id} className="min-w-0">
              <TarjetaCuenta
                cuenta={cuenta}
                estado={estados[indice]}
                ahora={ahora}
                ahoraServidor={ahoraServidor}
                franjas={franjas}
                parametros={parametros}
                existentes={existentes}
                verificacionAbierta={verificando === cuenta.id}
                onVerificacionAbierta={(abierta) =>
                  // Un envío que termina con la hoja cerrada no cierra la de otra cuenta.
                  setVerificando((actual) =>
                    abierta ? cuenta.id : actual === cuenta.id ? null : actual
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}

      <HojaCuenta
        abierta={agregando}
        onAbiertaChange={(abierta) => {
          if (!guardando) setAgregando(abierta)
        }}
        icono={<Plus />}
        titulo={alta.tipo === "agregada" ? "Cuenta agregada" : "Agregar cuenta"}
        descripcion={
          alta.tipo === "agregada"
            ? undefined
            : "La red social donde publicas y el usuario de la cuenta."
        }
        pie={pieAlta}
      >
        {alta.tipo === "agregada" ? (
          <CuentaAgregada handle={alta.handle} />
        ) : (
          <FormularioCuenta
            id={idFormulario}
            existentes={existentes}
            onPendiente={setGuardando}
            onGuardada={(cuenta, handle) =>
              setAlta({ tipo: "agregada", cuenta, handle })
            }
          />
        )}
      </HojaCuenta>
    </div>
  )
}
