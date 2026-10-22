"use client"

import { MapPinned, MapPinPlus, Pencil, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { InsigniaTono } from "@/features/operacion/components/distintivos"
import { TarjetaFicha } from "@/features/operacion/components/ficha"
import { formatearFecha, formatearFechaHora } from "@/lib/format"

import { quitarPertinencia } from "../actions"
import {
  efectoMultiplicador,
  type FilaPertinencia,
  textoMultiplicador,
} from "../pertinencia"
import { HojaPertinencia } from "./formulario-pertinencia"

type Edicion = { modo: "nueva" } | { modo: "editar"; fila: FilaPertinencia }

function Municipio({ fila }: { fila: FilaPertinencia }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="font-medium">
        {fila.municipio}
        {fila.departamento ? (
          <span className="font-normal text-muted-foreground">
            , {fila.departamento}
          </span>
        ) : null}
      </span>
      {fila.notas ? (
        <span className="text-xs text-pretty text-muted-foreground">
          {fila.notas}
        </span>
      ) : null}
      {fila.clasificadoAt ? (
        <span
          className="text-xs text-muted-foreground"
          title={formatearFechaHora(fila.clasificadoAt)}
        >
          {fila.clasificadoPor ? `${fila.clasificadoPor} · ` : ""}
          {formatearFecha(fila.clasificadoAt)}
        </span>
      ) : null}
    </div>
  )
}

function Multiplicador({ valor }: { valor: number }) {
  const efecto = efectoMultiplicador(valor)
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="text-base font-semibold cifras">
        {textoMultiplicador(valor)} ×
      </span>
      <InsigniaTono
        tono={efecto.tono}
        etiqueta={efecto.texto}
        className="h-5 px-2 text-[0.6875rem]"
      />
    </div>
  )
}

/**
 * Pertinencia geográfica del medio (ADM-006): por municipio, cuánto pesa en
 * el precio cuando una oferta se dirige ahí. Quien tiene
 * `medios.clasificar_pertinencia` la clasifica, la ajusta o la quita; los
 * demás la consultan.
 */
export function PertinenciaMedio({
  medio,
  filas,
  puedeEditar,
}: {
  medio: { id: string; nombre: string }
  filas: readonly FilaPertinencia[]
  puedeEditar: boolean
}) {
  const [edicion, setEdicion] = useState<Edicion | null>(null)
  const [quitando, setQuitando] = useState<FilaPertinencia | null>(null)
  const clasificados = new Set(filas.map((fila) => fila.municipioCodigo))

  const botonNuevo = puedeEditar ? (
    <Button onClick={() => setEdicion({ modo: "nueva" })}>
      <MapPinPlus data-icon="inline-start" aria-hidden />
      Clasificar municipio
    </Button>
  ) : null

  return (
    <TarjetaFicha
      titulo="Pertinencia geográfica"
      icono={MapPinned}
      descripcion="Ajusta el precio cuando una oferta se dirige a un municipio. Donde no hay clasificación el multiplicador es neutro (1 ×)."
      acciones={filas.length > 0 ? botonNuevo : null}
    >
      {filas.length === 0 ? (
        <EstadoVacio
          variante="simple"
          icono={MapPinned}
          titulo="Sin municipios clasificados"
          descripcion={
            puedeEditar
              ? "Clasifica los municipios donde este medio pesa más (o menos) que en el resto, por ejemplo su sede."
              : "Su multiplicador geográfico es neutro en todos los municipios."
          }
          className="py-8"
        >
          {botonNuevo}
        </EstadoVacio>
      ) : (
        <Table>
          <TableCaption className="sr-only">
            Multiplicador geográfico de {medio.nombre} por municipio
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Municipio</TableHead>
              <TableHead className="text-right">Multiplicador</TableHead>
              {puedeEditar ? (
                <TableHead className="w-0">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((fila) => (
              <TableRow key={fila.municipioCodigo}>
                <TableCell className="align-top whitespace-normal">
                  <Municipio fila={fila} />
                </TableCell>
                <TableCell className="align-top whitespace-normal">
                  <Multiplicador valor={fila.multiplicador} />
                </TableCell>
                {puedeEditar ? (
                  <TableCell className="align-top">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        aria-label={`Editar ${fila.municipio}`}
                        onClick={() => setEdicion({ modo: "editar", fila })}
                      >
                        <Pencil aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        aria-label={`Quitar ${fila.municipio}`}
                        onClick={() => setQuitando(fila)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {puedeEditar ? (
        <HojaPertinencia
          key={
            edicion?.modo === "editar" ? edicion.fila.municipioCodigo : "nueva"
          }
          abierta={edicion !== null}
          onAbiertaChange={(abierta) => {
            if (!abierta) setEdicion(null)
          }}
          medio={medio}
          fila={edicion?.modo === "editar" ? edicion.fila : null}
          clasificados={clasificados}
        />
      ) : null}

      <DialogoConfirmacion
        abierto={quitando !== null}
        onAbiertoChange={(abierto) => {
          if (!abierto) setQuitando(null)
        }}
        destructivo
        titulo={`¿Quitar ${quitando?.municipio ?? "el municipio"}?`}
        descripcion="Su multiplicador vuelve a ser neutro (1 ×) en lo que el medio acepte desde ahora; lo ya aceptado conserva su precio."
        textoConfirmar="Quitar"
        onConfirmar={async () => {
          if (!quitando) return false
          const resultado = await quitarPertinencia({
            medioId: medio.id,
            municipioCodigo: quitando.municipioCodigo,
          })
          if (resultado.ok) {
            toast.success("Clasificación quitada", {
              description: `${quitando.municipio} · ${medio.nombre}`,
            })
          }
          return resultado
        }}
      />
    </TarjetaFicha>
  )
}
