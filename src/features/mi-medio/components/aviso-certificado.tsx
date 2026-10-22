import {
  ArrowRight,
  CircleAlert,
  Hourglass,
  type LucideIcon,
} from "lucide-react"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { TIPOS_DOCUMENTO_MEDIO } from "@/features/operacion/estados"
import { cn } from "@/lib/utils"

import { RUTAS_MI_MEDIO } from "../alta"
import { AYUDA_DOCUMENTO } from "../nivel"
import { notaRequisito } from "../presentacion"
import type { EstadoRequisito } from "../requisitos"

interface Presentacion {
  titulo: string
  texto: string
  icono: LucideIcon
  clases: string
  conEnlace: boolean
}

function presentar(requisito: EstadoRequisito): Presentacion | null {
  const nombre = TIPOS_DOCUMENTO_MEDIO[requisito.tipo].toLowerCase()
  const nota = notaRequisito(requisito)
  const aviso = "border-warning/40 bg-warning/8 [&_svg]:text-warning"
  switch (requisito.situacion) {
    case "falta":
      return {
        titulo: requisito.deCuentaAnterior
          ? `Falta la ${nombre} de tu cuenta nueva`
          : `Falta la ${nombre} de tu cuenta`,
        texto: nota ?? AYUDA_DOCUMENTO[requisito.tipo],
        icono: CircleAlert,
        clases: aviso,
        conEnlace: true,
      }
    case "rechazado":
      return {
        titulo: `Tu ${nombre} no fue aprobada`,
        texto: nota ?? "Carga una nueva.",
        icono: CircleAlert,
        clases:
          "border-destructive/30 bg-destructive/5 [&_svg]:text-destructive",
        conEnlace: true,
      }
    case "vencido":
      return {
        titulo: `Tu ${nombre} venció`,
        texto: nota ?? "Carga una vigente.",
        icono: CircleAlert,
        clases: aviso,
        conEnlace: true,
      }
    case "en-revision":
      return {
        titulo: `Tu ${nombre} está en revisión`,
        texto: "El equipo de AMO la revisa junto con tu cuenta.",
        icono: Hourglass,
        clases: "border-primary/20 bg-primary/5 [&_svg]:text-primary",
        conEnlace: false,
      }
    case "aprobado":
      return requisito.porVencer && !requisito.renovacionEnRevision && nota
        ? {
            titulo: `Tu ${nombre} vence pronto`,
            texto: nota,
            icono: CircleAlert,
            clases: aviso,
            conEnlace: true,
          }
        : null
  }
}

/**
 * Estado de la certificación de la cuenta registrada (la exige la
 * verificación): qué falta y el atajo a Documentos para cargarla.
 */
export function AvisoCertificado({
  requisito,
}: {
  requisito: EstadoRequisito
}) {
  const presentacion = presentar(requisito)
  if (!presentacion) return null
  const { titulo, texto, icono: Icono, clases, conEnlace } = presentacion
  return (
    <section
      aria-label={titulo}
      className={cn(
        "flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:gap-4",
        clases
      )}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <Icono aria-hidden className="mt-0.5 size-5 shrink-0" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium">{titulo}</p>
          <p className="text-sm text-pretty break-words text-muted-foreground">
            {texto}
          </p>
        </div>
      </div>
      {conEnlace ? (
        <EnlaceBoton
          href={RUTAS_MI_MEDIO.documentos}
          variant="outline"
          className="w-full shrink-0 sm:w-auto"
        >
          Cargar en Documentos
          <ArrowRight data-icon="inline-end" aria-hidden />
        </EnlaceBoton>
      ) : null}
    </section>
  )
}
