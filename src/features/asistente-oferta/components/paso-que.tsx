"use client"

import { CircleAlert, Lock } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useId } from "react"
import { useFormContext, useWatch } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  FieldDescription,
  FieldError,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { InsigniaEstado } from "@/features/operacion/components/distintivos"
import { ESTADOS_OFERTA } from "@/features/operacion/estados"
import {
  CampoCifra,
  CampoTexto,
} from "@/features/configuracion/components/campos"
import {
  GESTION_PROPIA,
  type ModoGestion,
  rutasGestion,
} from "@/features/campanas/rutas-gestion"
import { cn } from "@/lib/utils"

import { FORMATO_RETIRADO } from "../errores"
import {
  formatosPorPlataforma,
  nombreFormato,
  resumenRequisitos,
} from "../formatos"
import type { ValoresOferta } from "../schemas"
import type { FormatoAsistente, OfertaEnCurso } from "../tipos"

/** Grupo «Formatos»: recibe el foco cuando desaparece el botón que lo tenía. */
export const ID_FORMATOS = "asistente-formatos"

export interface PropsPasoQue {
  campanaId: string
  formatos: readonly FormatoAsistente[]
  /** Formatos que AMO retiró y usa alguna oferta (solo para nombrarlos). */
  retirados: readonly FormatoAsistente[]
  /** Ofertas ya creadas por el asistente (una por formato). */
  ofertas: readonly OfertaEnCurso[]
  /** Editar una oferta: su formato es fijo. */
  formatoFijo: boolean
  maximoArchivoMb: number | null
  /** Marca o desmarca un formato (el asistente confirma si descarta un borrador). */
  onAlternarFormato: (formatoId: string, marcar: boolean) => void
  /** Quita un formato retirado (descarta su borrador, confirmando). */
  onQuitarRetirado: (formatoId: string) => void
  /** El anunciante o el equipo AMO por su cuenta (decide los enlaces). */
  gestion?: ModoGestion
}

function TarjetaFormato({
  formato,
  marcado,
  bloqueado,
  invalido,
  idError,
  oferta,
  maximoArchivoMb,
  onCambio,
}: {
  formato: FormatoAsistente
  marcado: boolean
  bloqueado: boolean
  invalido: boolean
  /** Error del grupo: se anuncia junto a cada casilla mientras exista. */
  idError: string
  oferta: OfertaEnCurso | undefined
  maximoArchivoMb: number | null
  onCambio: (marcar: boolean) => void
}) {
  const idDetalle = useId()
  const idNombre = useId()
  return (
    <label
      className={cn(
        "flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border bg-background p-3 transition-colors select-none hover:bg-muted/50",
        "has-data-checked:border-primary/45 has-data-checked:bg-primary/8 dark:has-data-checked:bg-primary/12",
        "has-focus-visible:anillo-foco",
        bloqueado && "cursor-not-allowed hover:bg-background"
      )}
    >
      <Checkbox
        checked={marcado}
        disabled={bloqueado}
        aria-invalid={invalido || undefined}
        aria-labelledby={idNombre}
        aria-describedby={invalido ? `${idDetalle} ${idError}` : idDetalle}
        onCheckedChange={(valor) => onCambio(valor === true)}
        className="mt-0.5"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <span id={idNombre}>{formato.nombre}</span>
          {oferta && oferta.estado !== "BORRADOR" ? (
            <InsigniaEstado catalogo={ESTADOS_OFERTA} estado={oferta.estado} />
          ) : null}
        </span>
        <span id={idDetalle} className="text-xs text-muted-foreground">
          {resumenRequisitos(formato.requisitos, maximoArchivoMb)}
        </span>
      </span>
    </label>
  )
}

const clasesEnlace =
  "w-fit rounded-sm font-medium text-foreground underline underline-offset-4 outline-none focus-visible:anillo-foco"

/**
 * Formatos elegidos que AMO retiró (y cuya oferta no se envió): bloquean el
 * paso, así que cada uno dice cómo quitarlo. Un borrador se descarta aquí;
 * una oferta devuelta se cancela desde su ficha.
 */
function FormatosRetirados({
  rutaOferta,
  formatoIds,
  retirados,
  ofertas,
  onQuitar,
}: {
  rutaOferta: (ofertaId: string) => Route
  formatoIds: readonly string[]
  retirados: readonly FormatoAsistente[]
  ofertas: readonly OfertaEnCurso[]
  onQuitar: (formatoId: string) => void
}) {
  const idTitulo = useId()
  return (
    <section
      aria-labelledby={idTitulo}
      className="flex flex-col gap-2 rounded-xl border border-destructive/40 bg-destructive/6 p-3 text-sm"
    >
      <h3 id={idTitulo} className="flex items-center gap-2 font-semibold">
        <CircleAlert aria-hidden className="size-4 shrink-0 text-destructive" />
        Formatos que ya no están disponibles
      </h3>
      <ul className="flex flex-col gap-2">
        {formatoIds.map((formatoId) => {
          const formato = retirados.find((f) => f.id === formatoId)
          const nombre = formato ? nombreFormato(formato) : "Formato retirado"
          const oferta = ofertas.find((o) => o.formatoId === formatoId)
          return (
            <li
              key={formatoId}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5"
            >
              <span className="min-w-0 font-medium">{nombre}</span>
              {oferta?.estado === "DEVUELTA" ? (
                <Link
                  href={rutaOferta(oferta.ofertaId)}
                  className={clasesEnlace}
                >
                  Cancélala desde su ficha
                </Link>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`${oferta ? "Descartar el borrador" : "Quitar"} de ${nombre}`}
                  onClick={() => onQuitar(formatoId)}
                >
                  {oferta ? "Descartar el borrador" : "Quitar"}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * Paso 1 · Qué se publica (ANU-004): formatos por plataforma (cada una ofrece
 * solo los suyos; uno o varios: cada formato es una oferta con su precio y
 * sus cupos), título y publicaciones por medio. Un formato que AMO retiró
 * después de crear la oferta se explica con la salida que tiene.
 */
export function PasoQue({
  campanaId,
  formatos,
  retirados,
  ofertas,
  formatoFijo,
  maximoArchivoMb,
  onAlternarFormato,
  onQuitarRetirado,
  gestion = GESTION_PROPIA,
}: PropsPasoQue) {
  const rutas = rutasGestion(gestion)
  const rutaOferta = (ofertaId: string) => rutas.oferta(campanaId, ofertaId)
  const { control, getFieldState, formState } = useFormContext<ValoresOferta>()
  const elegidos = useWatch({ control, name: "que.formatoIds" })
  const idAyuda = useId()
  const idError = useId()
  const grupos = formatosPorPlataforma(formatos)
  const { error } = getFieldState("que.formatoIds", formState)

  if (formatoFijo) {
    const formatoId = elegidos[0]
    const formato = formatos.find((f) => f.id === formatoId)
    const retirado = retirados.find((f) => f.id === formatoId)
    const oferta = ofertas.find((o) => o.formatoId === formatoId)
    return (
      <div className="flex flex-col gap-6">
        <div
          className={cn(
            "flex items-start gap-3 rounded-xl border bg-muted/30 p-4",
            !formato && "border-destructive/40 bg-destructive/6"
          )}
        >
          {formato ? (
            <Lock
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            />
          ) : (
            <CircleAlert
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-destructive"
            />
          )}
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-medium">
              Formato:{" "}
              {formato
                ? nombreFormato(formato)
                : retirado
                  ? `${nombreFormato(retirado)} (ya no disponible)`
                  : "ya no disponible"}
            </p>
            {formato ? (
              <p className="text-sm text-muted-foreground">
                El formato de una oferta creada no cambia (su paquete creativo
                depende de él). Si necesitas otro, crea una oferta nueva en la
                campaña.
              </p>
            ) : (
              <>
                {/* Tras «Siguiente» el mismo texto se anuncia como error. */}
                {error ? (
                  <FieldError
                    id={idError}
                    errors={[{ message: FORMATO_RETIRADO }]}
                  />
                ) : (
                  <p className="text-sm">{FORMATO_RETIRADO}</p>
                )}
                {oferta ? (
                  <Link
                    href={rutaOferta(oferta.ofertaId)}
                    className={cn(clasesEnlace, "text-sm")}
                  >
                    Ir a la ficha de la oferta
                  </Link>
                ) : null}
              </>
            )}
          </div>
        </div>
        <CamposTexto />
      </div>
    )
  }

  // Los enviados no se tocan: su formato retirado no bloquea a los demás.
  const retiradosElegidos = elegidos.filter((formatoId) => {
    if (formatos.some((f) => f.id === formatoId)) return false
    const oferta = ofertas.find((o) => o.formatoId === formatoId)
    return !oferta || ["BORRADOR", "DEVUELTA"].includes(oferta.estado)
  })

  return (
    <div className="flex flex-col gap-7">
      <FieldSet
        id={ID_FORMATOS}
        tabIndex={-1}
        aria-describedby={error ? `${idAyuda} ${idError}` : idAyuda}
        data-invalid={error ? true : undefined}
        className="gap-4 outline-none"
      >
        <FieldLegend variant="label" className="mb-0 text-[0.9375rem]">
          Formatos
        </FieldLegend>
        <FieldDescription id={idAyuda} className="-mt-2">
          Elige uno o varios. Cada formato será una oferta con su propio precio,
          sus cupos y su paquete creativo.
        </FieldDescription>
        {grupos.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
            No hay formatos disponibles en este momento. Escríbenos para
            revisarlo.
          </p>
        ) : (
          grupos.map((grupo) => (
            <FieldSet key={grupo.plataforma} className="gap-2">
              <FieldLegend variant="label" className="mb-0">
                {grupo.nombre}
              </FieldLegend>
              <div className="grid gap-2 sm:grid-cols-2">
                {grupo.formatos.map((formato) => {
                  const oferta = ofertas.find((o) => o.formatoId === formato.id)
                  return (
                    <TarjetaFormato
                      key={formato.id}
                      formato={formato}
                      marcado={elegidos.includes(formato.id)}
                      // Una oferta ya enviada no se quita desde aquí.
                      bloqueado={Boolean(
                        oferta && oferta.estado !== "BORRADOR"
                      )}
                      invalido={Boolean(error)}
                      idError={idError}
                      oferta={oferta}
                      maximoArchivoMb={maximoArchivoMb}
                      onCambio={(marcar) =>
                        onAlternarFormato(formato.id, marcar)
                      }
                    />
                  )
                })}
              </div>
            </FieldSet>
          ))
        )}
        {retiradosElegidos.length > 0 ? (
          <FormatosRetirados
            rutaOferta={rutaOferta}
            formatoIds={retiradosElegidos}
            retirados={retirados}
            ofertas={ofertas}
            onQuitar={onQuitarRetirado}
          />
        ) : null}
        <FieldError id={idError} errors={[error]} />
      </FieldSet>
      <CamposTexto />
    </div>
  )
}

function CamposTexto() {
  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_14rem]">
      <CampoTexto
        nombre="que.titulo"
        etiqueta="Título de la oferta"
        placeholder="Por ejemplo, Lanzamiento de la nueva línea de jugos"
        descripcion="Lo ven los medios en el marketplace: claro y sin datos internos."
      />
      <CampoCifra
        nombre="que.publicacionesPorMedio"
        etiqueta="Publicaciones por medio"
        descripcion="De 1 a 10. El precio de cada medio se multiplica por este número."
      />
    </div>
  )
}
