"use client"

import { ArrowDown, ArrowRight, Fingerprint, LockKeyhole } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import type {
  CambiosPresentados,
  CampoDiff,
  TipoCambio,
  ValorPresentado,
} from "../diferencias"

const ETIQUETA_CAMBIO: Readonly<Record<TipoCambio, string>> = {
  agregado: "Agregado",
  eliminado: "Quitado",
  modificado: "Modificado",
}

const PUNTO_CAMBIO: Readonly<Record<TipoCambio, string>> = {
  agregado: "bg-success",
  eliminado: "bg-destructive",
  modificado: "bg-primary",
}

/** Un valor según su tipo: redactados con candado/huella, JSON en bloque, cifras alineadas. */
export function Valor({
  valor,
  lado,
}: {
  valor: ValorPresentado
  lado?: "antes" | "despues"
}) {
  switch (valor.tipo) {
    case "vacio":
      return <span className="text-muted-foreground italic">Vacío</span>
    case "enmascarado":
      return (
        <span
          className="inline-flex items-center gap-1.5 font-mono text-[0.8125rem]"
          title="Dato protegido: la bitácora guarda solo una versión enmascarada."
        >
          <LockKeyhole
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <span className="sr-only">Dato enmascarado:</span>
          {valor.texto}
        </span>
      )
    case "hash":
      return (
        <span
          className="inline-flex items-center gap-1.5 font-mono text-[0.8125rem]"
          title={`Huella SHA-256 (el valor original no se guarda): ${valor.detalle ?? valor.texto}`}
        >
          <Fingerprint
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <span className="sr-only">Huella del dato:</span>
          {valor.texto}
        </span>
      )
    case "json":
      return (
        <pre className="max-h-40 w-full overflow-auto rounded-md bg-muted/60 p-2 font-mono text-xs leading-relaxed whitespace-pre-wrap">
          {valor.detalle ?? valor.texto}
        </pre>
      )
    case "referencia":
      return (
        <span title={valor.detalle} className="break-words">
          {valor.texto}
        </span>
      )
    case "color":
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-[0.8125rem]">
          <span
            aria-hidden
            className="size-3.5 shrink-0 rounded-[4px] ring-1 ring-foreground/15"
            style={{ backgroundColor: valor.texto }}
          />
          {valor.texto}
        </span>
      )
    case "estado":
      return (
        <span
          className={cn(
            "inline-flex h-5.5 items-center rounded-full px-2 text-xs font-medium",
            lado === "antes"
              ? "bg-muted text-muted-foreground"
              : "bg-primary/12 text-primary"
          )}
        >
          {valor.texto}
        </span>
      )
    case "numero":
    case "moneda":
    case "porcentaje":
    case "fecha":
      return (
        <span className="cifras" title={valor.detalle}>
          {valor.texto}
        </span>
      )
    default:
      return (
        <span className="break-words whitespace-pre-wrap">{valor.texto}</span>
      )
  }
}

function FilaDiferencia({ campo }: { campo: CampoDiff }) {
  return (
    <li className="grid gap-2 px-3.5 py-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] sm:gap-4">
      <div className="flex min-w-0 items-center gap-2 sm:items-start sm:pt-0.5">
        <span
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-full sm:mt-1.5",
            PUNTO_CAMBIO[campo.tipo]
          )}
        />
        <span className="text-xs font-medium break-words text-muted-foreground">
          {campo.etiqueta}
        </span>
        <span className="sr-only">({ETIQUETA_CAMBIO[campo.tipo]})</span>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
        <div className="min-w-0 rounded-md bg-destructive/6 px-2 py-1 text-foreground/80 ring-1 ring-destructive/15 dark:bg-destructive/10">
          <span className="sr-only">Antes: </span>
          {campo.antes ? <Valor valor={campo.antes} lado="antes" /> : null}
        </div>
        <ArrowRight
          className="hidden size-3.5 shrink-0 text-muted-foreground sm:block"
          aria-hidden
        />
        <ArrowDown
          className="size-3.5 shrink-0 self-start text-muted-foreground sm:hidden"
          aria-hidden
        />
        <div className="min-w-0 rounded-md bg-success/8 px-2 py-1 ring-1 ring-success/20 dark:bg-success/12">
          <span className="sr-only">Después: </span>
          {campo.despues ? (
            <Valor valor={campo.despues} lado="despues" />
          ) : null}
        </div>
      </div>
    </li>
  )
}

function FilaDato({ campo }: { campo: CampoDiff }) {
  const valor = campo.despues ?? campo.antes
  return (
    <div className="grid gap-1 px-3.5 py-2.5 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] sm:gap-4">
      <dt className="text-xs font-medium break-words text-muted-foreground sm:pt-0.5">
        {campo.etiqueta}
      </dt>
      <dd className="min-w-0 text-sm">
        {valor ? <Valor valor={valor} /> : null}
      </dd>
    </div>
  )
}

function esVacio(campo: CampoDiff): boolean {
  return (campo.despues ?? campo.antes)?.tipo === "vacio"
}

/**
 * Visor de diferencias: en una edición, antes → después por campo (con el
 * tipo de cambio indicado por color Y por texto para lectores de pantalla);
 * en una creación o un borrado, los datos de la fila, con los campos vacíos
 * plegados. Los valores redactados se muestran tal como los guarda la BD.
 */
export function VisorDiferencias({ cambios }: { cambios: CambiosPresentados }) {
  const [verVacios, setVerVacios] = useState(false)

  if (cambios.modo === "sin_cambios") return null

  if (cambios.modo === "diferencias") {
    return (
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {cambios.campos.map((campo) => (
          <FilaDiferencia key={campo.campo} campo={campo} />
        ))}
      </ul>
    )
  }

  const conValor = cambios.campos.filter((campo) => !esVacio(campo))
  const vacios = cambios.campos.length - conValor.length
  const visibles = verVacios ? cambios.campos : conValor

  return (
    <div className="flex flex-col gap-2">
      <dl className="divide-y overflow-hidden rounded-xl border bg-card">
        {visibles.map((campo) => (
          <FilaDato key={campo.campo} campo={campo} />
        ))}
      </dl>
      {vacios > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="self-start text-muted-foreground"
          aria-expanded={verVacios}
          onClick={() => setVerVacios((actual) => !actual)}
        >
          {verVacios
            ? "Ocultar campos vacíos"
            : `Mostrar ${vacios} ${vacios === 1 ? "campo vacío" : "campos vacíos"}`}
        </Button>
      ) : null}
    </div>
  )
}
