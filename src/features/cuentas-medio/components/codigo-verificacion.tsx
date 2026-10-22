"use client"

import { Check, Copy } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { CuentaRegresiva } from "@/components/tiempo/cuenta-regresiva"
import { Button } from "@/components/ui/button"

import { agruparCodigo, deletrearCodigo } from "../presentacion"

/** El código dura una hora: urgente en los últimos 10 minutos, próximo desde 30. */
export const UMBRALES_CODIGO = {
  criticaHoras: 10 / 60,
  prontoHoras: 30 / 60,
} as const

const TEXTOS_CODIGO = { pendiente: "Vence en", vencido: "Venció hace" }

/** Cuenta regresiva del código de la historia. */
export function VencimientoCodigo({
  expiraAt,
  ahoraServidor,
}: {
  expiraAt: string
  ahoraServidor?: number
}) {
  return (
    <CuentaRegresiva
      venceAt={expiraAt}
      ahoraServidor={ahoraServidor}
      etiqueta="Código de verificación"
      umbrales={UMBRALES_CODIGO}
      textos={TEXTOS_CODIGO}
    />
  )
}

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    return false
  }
}

/**
 * El código, grande y en dos grupos para copiarlo a mano sin errores, con
 * su vencimiento y un botón para copiarlo. El lector de pantalla lo deletrea.
 */
export function CodigoVerificacion({
  codigo,
  expiraAt,
}: {
  codigo: string
  expiraAt: string
}) {
  const [copiado, setCopiado] = useState(false)

  async function alCopiar() {
    if (await copiar(codigo)) {
      setCopiado(true)
      toast.success("Código copiado")
    } else {
      toast.error("No pudimos copiarlo. Escríbelo tal como lo ves.")
    }
  }

  return (
    <section
      aria-label="Tu código de verificación"
      className="flex flex-col items-center gap-3 rounded-2xl border border-primary/30 bg-primary/6 px-4 py-5 text-center"
    >
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Tu código
      </p>
      <p
        className="font-mono text-4xl font-semibold tracking-[0.18em] text-foreground tabular-nums select-all sm:text-5xl"
        translate="no"
      >
        <span aria-hidden>{agruparCodigo(codigo)}</span>
        <span className="sr-only">{deletrearCodigo(codigo)}</span>
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <VencimientoCodigo expiraAt={expiraAt} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void alCopiar()}
        >
          {copiado ? (
            <Check data-icon="inline-start" aria-hidden />
          ) : (
            <Copy data-icon="inline-start" aria-hidden />
          )}
          {copiado ? "Copiado" : "Copiar código"}
        </Button>
      </div>
    </section>
  )
}
