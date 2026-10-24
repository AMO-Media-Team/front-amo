"use client"

/**
 * Sección «Documento soporte» de la ficha de la liquidación (LIQ-004; contrato de la fase 5). Muestra el
 * estado, el número, la fecha, el valor, el CUDS (con copiar), las descargas y el historial de los
 * anulados, y ofrece las acciones según el estado de la liquidación, quién numera
 * (`tributario.numeracion_documento_soporte`) y el permiso:
 *
 * - Numeración de la plataforma: «Emitir documento soporte» (consecutivo + PDF + archivo para el
 *   proveedor), «Generar archivos» si faltan y «Registrar CUDS» cuando el proveedor lo transmite.
 * - Numeración del proveedor: «Registrar documento expedido» (prefijo, número, fecha, CUDS y su PDF).
 * - Corrección (D38 del RF): sin CUDS, «Anular documento»; con CUDS, primero «Registrar nota de ajuste».
 *
 * Tras cada cambio el foco va al estado del documento (el botón usado suele desaparecer) y un aviso
 * confirma lo hecho. Sin «Ver datos sensibles» (`documento.archivosReservados`) no se ofrecen las
 * descargas: los archivos llevan el nombre, el documento de identidad y la dirección del medio.
 */
import {
  Ban,
  CircleCheck,
  Clock,
  FileCheck2,
  FilePen,
  FileWarning,
  Fingerprint,
  History,
  Info,
  LockKeyhole,
  ReceiptText,
  RefreshCw,
  Stamp,
  TriangleAlert,
} from "lucide-react"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { BotonCopiar } from "@/components/feedback/boton-copiar"
import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { InsigniaEstado } from "@/features/operacion/components/distintivos"
import type { EstadoLiquidacion } from "@/features/operacion/estados"
import { DialogoMotivo } from "@/features/usuarios/components/dialogo-motivo"
import {
  ListaDatos,
  SinDato,
  TarjetaFicha,
} from "@/features/usuarios/components/tarjeta-ficha"
import { parsearFecha } from "@/lib/fechas"
import { formatearCOP, formatearFecha, formatearFechaHora } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  anularDocumentoSoporte,
  emitirDocumentoSoporte,
  generarArchivosDocumentoSoporte,
} from "../actions"
import {
  accionesDocumentoSoporte,
  descargasReservadas,
  ESTADOS_DOCUMENTO_SOPORTE,
  NOMBRES_ARCHIVO,
  type SituacionDocumento,
  situacionDocumento,
} from "../presentacion"
import type {
  DocumentoSoporteFicha,
  NumeracionDocumentoSoporte,
} from "../tipos"
import { BotonDescarga } from "./boton-descarga"
import { DialogoDocumentoExpedido } from "./dialogo-documento-expedido"
import { DialogoNotaAjuste } from "./dialogo-nota-ajuste"
import { DialogoRegistrarCuds } from "./dialogo-registrar-cuds"

export interface SeccionDocumentoSoporteProps {
  liquidacionId: string
  estadoLiquidacion: EstadoLiquidacion
  documento: DocumentoSoporteFicha | null
  numeracion: NumeracionDocumentoSoporte
  /** `liquidaciones.aprobar`: emitir, registrar CUDS, nota de ajuste, anular. */
  puedeGestionar: boolean
}

/** El estado del documento: recibe el foco tras un cambio (uno por página). */
export const ID_ESTADO_DOCUMENTO_SOPORTE = "estado-documento-soporte"

function estadoDocumento(): HTMLElement | null {
  return document.getElementById(ID_ESTADO_DOCUMENTO_SOPORTE)
}

type Dialogo = "emitir" | "expedido" | "cuds" | "nota" | "anular"

const SUGERENCIAS_ANULAR = [
  "El valor del documento no corresponde a la liquidación.",
  "Los datos del vendedor estaban mal.",
  "Se numeró con una resolución equivocada.",
] as const

const ESTILO_SITUACION: Readonly<
  Record<
    SituacionDocumento["tono"],
    { caja: string; icono: string; Icono: typeof Info }
  >
> = {
  neutro: { caja: "bg-muted/40", icono: "text-muted-foreground", Icono: Info },
  info: { caja: "border-info/40 bg-info/8", icono: "text-info", Icono: Clock },
  aviso: {
    caja: "border-warning/40 bg-warning/8",
    icono: "text-warning",
    Icono: TriangleAlert,
  },
  exito: {
    caja: "border-success/40 bg-success/8",
    icono: "text-success",
    Icono: CircleCheck,
  },
}

function EstadoDocumento({ situacion }: { situacion: SituacionDocumento }) {
  const { caja, icono, Icono } = ESTILO_SITUACION[situacion.tono]
  const idTitulo = `${ID_ESTADO_DOCUMENTO_SOPORTE}-titulo`
  return (
    <div
      id={ID_ESTADO_DOCUMENTO_SOPORTE}
      tabIndex={-1}
      role="group"
      aria-labelledby={idTitulo}
      className={cn(
        "flex scroll-mt-20 gap-3 rounded-xl border p-4 outline-none focus-visible:anillo-foco",
        caja
      )}
    >
      <Icono aria-hidden className={cn("mt-0.5 size-5 shrink-0", icono)} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <h3 id={idTitulo} className="text-sm font-semibold text-pretty">
          {situacion.titulo}
        </h3>
        <p className="text-sm text-pretty text-muted-foreground">
          {situacion.detalle}
        </p>
      </div>
    </div>
  )
}

function fechaDia(dia: string | null): string {
  return formatearFecha(parsearFecha(dia), "largo")
}

function DatosDocumento({ documento }: { documento: DocumentoSoporteFicha }) {
  const { notaAjuste } = documento
  return (
    <ListaDatos
      datos={[
        {
          etiqueta: "Número",
          valor: documento.numero ? (
            <span className="font-medium cifras">{documento.numero}</span>
          ) : (
            <SinDato>Sin número</SinDato>
          ),
        },
        {
          etiqueta: "Fecha de emisión",
          valor: documento.fechaEmision ? (
            fechaDia(documento.fechaEmision)
          ) : (
            <SinDato />
          ),
        },
        {
          etiqueta: "Valor",
          valor: (
            <span className="cifras">{formatearCOP(documento.valorTotal)}</span>
          ),
          ayuda: "Lo que se le reconoce al medio, antes de retenciones.",
        },
        {
          etiqueta: "CUDS",
          valor: documento.cuds ? (
            <span className="flex flex-col items-start gap-2">
              <code className="font-mono text-xs break-all">
                {documento.cuds}
              </code>
              <BotonCopiar texto={documento.cuds} etiqueta="Copiar el CUDS" />
            </span>
          ) : (
            <SinDato>Pendiente de transmisión a la DIAN</SinDato>
          ),
          ayuda: documento.cudsRegistradoAt
            ? `Registrado el ${formatearFechaHora(documento.cudsRegistradoAt)}.`
            : undefined,
        },
        ...(notaAjuste
          ? [
              {
                etiqueta: "Nota de ajuste",
                valor: (
                  <span className="flex flex-col items-start gap-2">
                    <span className="font-medium">{notaAjuste.numero}</span>
                    {notaAjuste.cude ? (
                      <>
                        <code className="font-mono text-xs break-all">
                          {notaAjuste.cude}
                        </code>
                        <BotonCopiar
                          texto={notaAjuste.cude}
                          etiqueta="Copiar el CUDE"
                        />
                      </>
                    ) : null}
                  </span>
                ),
                ayuda: `Registrada el ${formatearFechaHora(notaAjuste.registradaAt)}.`,
              },
            ]
          : []),
      ]}
    />
  )
}

/** En lugar de las descargas, cuando la sesión no puede ver los datos del medio. */
function DescargasReservadas() {
  return (
    <p className="flex gap-2 rounded-lg border border-dashed p-3 text-sm text-pretty text-muted-foreground">
      <LockKeyhole aria-hidden className="mt-0.5 size-4 shrink-0" />
      Los archivos de este documento llevan el nombre, el documento de identidad
      y la dirección del medio: descargarlos requiere el permiso «Ver datos
      sensibles».
    </p>
  )
}

function Historial({
  anteriores,
  reservados,
}: {
  anteriores: DocumentoSoporteFicha["anteriores"]
  /** Sin «Ver datos sensibles»: sin descargas. */
  reservados: boolean
}) {
  return (
    <section
      aria-labelledby="historial-documento-soporte"
      className="grid gap-3"
    >
      <h3
        id="historial-documento-soporte"
        className="flex items-center gap-2 text-sm font-semibold"
      >
        <History aria-hidden className="size-4 text-muted-foreground" />
        Documentos anteriores
      </h3>
      <ul className="grid gap-2">
        {anteriores.map((anterior) => {
          const nombre = anterior.numero ?? "sin número"
          return (
            <li
              key={anterior.id}
              className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                <span className="font-medium">
                  {anterior.numero ?? "Borrador sin número"}
                </span>
                <span className="text-xs text-pretty text-muted-foreground">
                  {anterior.anuladoAt
                    ? `Anulado el ${formatearFechaHora(anterior.anuladoAt)}`
                    : "Anulado"}
                  {anterior.notaAjusteNumero
                    ? ` · nota de ajuste ${anterior.notaAjusteNumero}`
                    : ""}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 empty:hidden">
                {anterior.numero && !reservados ? (
                  <BotonDescarga
                    documentoId={anterior.id}
                    archivo="pdf"
                    etiqueta="PDF"
                    complemento={`del documento ${nombre}`}
                  />
                ) : null}
                {anterior.notaAjusteNumero && !reservados ? (
                  <BotonDescarga
                    documentoId={anterior.id}
                    archivo="nota_ajuste"
                    etiqueta="Nota de ajuste"
                    complemento={`del documento ${nombre}`}
                  />
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function BotonGenerar({
  documentoId,
  modo,
  onGenerado,
}: {
  documentoId: string
  modo: "faltan" | "regenerar"
  onGenerado: () => void
}) {
  const [generando, iniciar] = useTransition()
  return (
    <Button
      type="button"
      variant={modo === "faltan" ? "default" : "outline"}
      className="w-full sm:w-auto data-disabled:cursor-not-allowed data-disabled:opacity-50"
      // Enfocable mientras genera: el foco no salta al documento y Enter sirve para reintentar.
      disabled={generando}
      focusableWhenDisabled
      aria-busy={generando || undefined}
      onClick={() =>
        iniciar(async () => {
          const resultado = await generarArchivosDocumentoSoporte({
            documentoId,
          })
          if (!resultado.ok) {
            toast.error(resultado.error)
            return
          }
          toast.success("Archivos generados", {
            description: `El PDF y el archivo para el proveedor del documento ${resultado.datos.numero} están listos.`,
          })
          onGenerado()
        })
      }
    >
      {generando ? (
        <Spinner role={undefined} aria-hidden data-icon="inline-start" />
      ) : (
        <RefreshCw data-icon="inline-start" aria-hidden />
      )}
      {generando
        ? "Generando…"
        : modo === "faltan"
          ? "Generar archivos"
          : "Volver a generar"}
    </Button>
  )
}

export function SeccionDocumentoSoporte(props: SeccionDocumentoSoporteProps) {
  const { liquidacionId, documento, numeracion, estadoLiquidacion } = props
  const acciones = accionesDocumentoSoporte(props)
  const situacion = situacionDocumento(props)
  const [dialogo, setDialogo] = useState<Dialogo | null>(null)
  // Tras un cambio confirmado el foco va al estado; al cancelar, al botón que abrió el diálogo.
  const cambio = useRef(false)

  function abrir(cual: Dialogo) {
    cambio.current = false
    setDialogo(cual)
  }

  function cerrar(abierto: boolean) {
    if (!abierto) setDialogo(null)
  }

  function focoTrasCambio(): HTMLElement | null {
    return cambio.current ? estadoDocumento() : null
  }

  function hecho() {
    cambio.current = true
  }

  function enfocarEstado() {
    window.setTimeout(() => estadoDocumento()?.focus(), 0)
  }

  const numero = documento?.numero ?? null
  const ayudaDescarga = acciones.generarArchivos
    ? `Si es un documento de los datos de demostración, sus archivos no existen: usa «${
        acciones.generarArchivos === "faltan"
          ? "Generar archivos"
          : "Volver a generar"
      }».`
    : undefined
  const hayAcciones =
    acciones.emitir ||
    acciones.registrarExpedido ||
    acciones.registrarCuds ||
    acciones.registrarNotaAjuste ||
    acciones.anular ||
    acciones.generarArchivos === "regenerar"

  return (
    <TarjetaFicha
      titulo="Documento soporte"
      icono={ReceiptText}
      descripcion="Lo exige la DIAN para pagarle a un medio que no factura."
      acciones={
        documento ? (
          <InsigniaEstado
            catalogo={ESTADOS_DOCUMENTO_SOPORTE}
            estado={documento.estado}
          />
        ) : null
      }
    >
      <div className="flex flex-col gap-5">
        <EstadoDocumento situacion={situacion} />

        {documento && documento.estado !== "BORRADOR" ? (
          <DatosDocumento documento={documento} />
        ) : null}

        {documento && acciones.generarArchivos === "faltan" ? (
          <div className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/8 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex gap-2 text-sm text-pretty">
              <FileWarning
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-warning"
              />
              Faltan los archivos de este documento: genéralos para descargar el
              PDF y enviar el archivo al proveedor tecnológico.
            </p>
            <BotonGenerar
              documentoId={documento.id}
              modo="faltan"
              onGenerado={enfocarEstado}
            />
          </div>
        ) : null}

        {documento && descargasReservadas(documento) ? (
          <DescargasReservadas />
        ) : null}

        {documento && acciones.descargas.length > 0 ? (
          <div
            role="group"
            aria-label="Descargas del documento soporte"
            className="flex flex-wrap gap-2"
          >
            {acciones.descargas.map((archivo) => (
              <BotonDescarga
                key={archivo}
                documentoId={documento.id}
                archivo={archivo}
                etiqueta={NOMBRES_ARCHIVO[archivo]}
                complemento={numero ? `(${numero})` : undefined}
                ayudaSiFalla={ayudaDescarga}
              />
            ))}
          </div>
        ) : null}

        {hayAcciones ? (
          <div
            role="group"
            aria-label="Acciones del documento soporte"
            className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap"
          >
            {acciones.emitir ? (
              <Button
                className="w-full sm:w-auto"
                onClick={() => abrir("emitir")}
              >
                <Stamp data-icon="inline-start" aria-hidden />
                Emitir documento soporte
              </Button>
            ) : null}
            {acciones.registrarExpedido ? (
              <Button
                className="w-full sm:w-auto"
                onClick={() => abrir("expedido")}
              >
                <FileCheck2 data-icon="inline-start" aria-hidden />
                Registrar documento expedido
              </Button>
            ) : null}
            {acciones.registrarCuds ? (
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => abrir("cuds")}
              >
                <Fingerprint data-icon="inline-start" aria-hidden />
                Registrar CUDS
              </Button>
            ) : null}
            {acciones.registrarNotaAjuste ? (
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => abrir("nota")}
              >
                <FilePen data-icon="inline-start" aria-hidden />
                Registrar nota de ajuste
              </Button>
            ) : null}
            {documento && acciones.generarArchivos === "regenerar" ? (
              <BotonGenerar
                documentoId={documento.id}
                modo="regenerar"
                onGenerado={enfocarEstado}
              />
            ) : null}
            {acciones.anular ? (
              <Button
                variant="destructive"
                className="w-full sm:w-auto"
                onClick={() => abrir("anular")}
              >
                <Ban data-icon="inline-start" aria-hidden />
                Anular documento
              </Button>
            ) : null}
          </div>
        ) : null}

        {documento && documento.anteriores.length > 0 ? (
          <Historial
            anteriores={documento.anteriores}
            reservados={documento.archivosReservados === true}
          />
        ) : null}
      </div>

      <DialogoConfirmacion
        abierto={dialogo === "emitir"}
        onAbiertoChange={cerrar}
        titulo="¿Emitir el documento soporte?"
        descripcion="Se le asigna el siguiente número de la resolución de documento soporte vigente y se generan el PDF y el archivo para el proveedor tecnológico. Ese número no se vuelve a usar: un error se corrige anulando el documento."
        textoConfirmar="Emitir documento"
        focoAlCerrar={focoTrasCambio}
        onConfirmar={async () => {
          const resultado = await emitirDocumentoSoporte({ liquidacionId })
          if (resultado.ok) {
            hecho()
            toast.success(
              resultado.datos.numero
                ? `Documento soporte ${resultado.datos.numero} emitido`
                : "Documento soporte emitido"
            )
            if (resultado.datos.aviso) {
              toast.warning(resultado.datos.aviso, { duration: 15_000 })
            }
          }
          return resultado
        }}
      />

      <DialogoDocumentoExpedido
        abierto={dialogo === "expedido"}
        onAbiertoChange={cerrar}
        liquidacionId={liquidacionId}
        focoAlCerrar={focoTrasCambio}
        onRegistrado={(registrado) => {
          hecho()
          toast.success(`Documento soporte ${registrado} registrado`)
        }}
      />

      {documento ? (
        <>
          <DialogoRegistrarCuds
            abierto={dialogo === "cuds"}
            onAbiertoChange={cerrar}
            documentoId={documento.id}
            numero={numero}
            regeneraPdf={numeracion === "PLATAFORMA"}
            focoAlCerrar={focoTrasCambio}
            onRegistrado={(aviso) => {
              hecho()
              toast.success("CUDS registrado", {
                description: numero
                  ? `Documento soporte ${numero}.`
                  : undefined,
              })
              if (aviso) toast.warning(aviso, { duration: 15_000 })
            }}
          />
          <DialogoNotaAjuste
            abierto={dialogo === "nota"}
            onAbiertoChange={cerrar}
            liquidacionId={liquidacionId}
            documentoId={documento.id}
            numeroDocumento={numero}
            focoAlCerrar={focoTrasCambio}
            onRegistrada={(nota) => {
              hecho()
              toast.success(`Nota de ajuste ${nota} registrada`, {
                description:
                  estadoLiquidacion === "APROBADA"
                    ? "Ya puedes anular el documento y emitir uno nuevo."
                    : "Queda como corrección del documento que soporta el pago.",
              })
            }}
          />
          <DialogoMotivo
            abierto={dialogo === "anular"}
            onAbiertoChange={cerrar}
            titulo={
              numero
                ? `¿Anular el documento soporte ${numero}?`
                : "¿Anular el documento soporte?"
            }
            descripcion={
              documento.notaAjuste
                ? `Ya tiene registrada la nota de ajuste ${documento.notaAjuste.numero}. Al anularlo, la liquidación sigue aprobada y podrás emitir un documento nuevo.`
                : "Aún no se ha transmitido a la DIAN. Su número queda usado y no se vuelve a asignar; la liquidación sigue aprobada y podrás emitir un documento nuevo."
            }
            textoConfirmar="Anular documento"
            textoCancelar="Volver"
            destructivo
            sugerencias={SUGERENCIAS_ANULAR}
            placeholder="Ej.: el valor no corresponde a la liquidación."
            focoAlCerrar={focoTrasCambio}
            onConfirmar={async (motivo) => {
              const resultado = await anularDocumentoSoporte({
                documentoId: documento.id,
                motivo,
              })
              if (resultado.ok) {
                hecho()
                toast.success("Documento soporte anulado", {
                  description:
                    "La liquidación queda lista para un documento nuevo.",
                })
              }
              return resultado
            }}
          />
        </>
      ) : null}
    </TarjetaFicha>
  )
}
