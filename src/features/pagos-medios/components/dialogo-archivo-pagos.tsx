"use client"

import {
  CircleAlert,
  Download,
  FileSpreadsheet,
  Info,
  TriangleAlert,
} from "lucide-react"
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react"
import { toast } from "sonner"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { formatearCOP, formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import { descargarArchivoPagos, generarArchivoPagos } from "../actions"
import { rescatarFoco } from "../foco"
import { PREPARACION } from "../preparacion"
import { rutaDispersion } from "../rutas"
import { avisoYaEnArchivo, descripcionPedido, plural } from "../textos"
import type { PedidoArchivo, ResultadoArchivoPagos } from "../tipos"

type Generado = Extract<ResultadoArchivoPagos, { tipo: "generado" }>

type Paso =
  | { tipo: "confirmar" }
  /** El servidor encontró alguna ya incluida en otro archivo (otra persona lo generó mientras tanto). */
  | { tipo: "repetir"; mensaje: string }
  | { tipo: "generado"; resultado: Generado }

export interface DialogoArchivoPagosProps {
  /** `null`: cerrado. */
  pedido: PedidoArchivo | null
  onCerrar: (generado: boolean) => void
}

/**
 * «Generar archivo de pagos» (LIQ-005): resume lo que irá en el archivo, deja
 * por fuera (con su porqué) lo que aún no se puede pagar y, si alguna ya está
 * en otro archivo, pide confirmar con tesorería antes de incluirla otra vez.
 * Al generar, la descarga empieza sola (URL firmada) y el diálogo ofrece
 * descargarlo otra vez y abrir el archivo. Un fallo se muestra dentro.
 */
export function DialogoArchivoPagos({
  pedido,
  onCerrar,
}: DialogoArchivoPagosProps) {
  const [paso, setPaso] = useState<Paso>({ tipo: "confirmar" })
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const [descargando, iniciarDescarga] = useTransition()
  const tituloResultado = useRef<HTMLHeadingElement>(null)
  const abierto = pedido !== null

  // Cada pedido empieza en la confirmación.
  const [pedidoVisto, setPedidoVisto] = useState(pedido)
  if (pedidoVisto !== pedido) {
    setPedidoVisto(pedido)
    setPaso({ tipo: "confirmar" })
    setError(null)
  }

  // El resultado reemplaza la confirmación: el foco va a su título.
  useEffect(() => {
    if (paso.tipo === "generado") tituloResultado.current?.focus()
  }, [paso.tipo])

  function cerrar() {
    if (pendiente) return
    const generado = paso.tipo === "generado"
    onCerrar(generado)
    if (generado) rescatarFoco()
  }

  function generar(repetir: boolean) {
    if (!pedido) return
    setError(null)
    iniciar(async () => {
      const respuesta = await generarArchivoPagos({
        liquidacionIds: pedido.ids,
        repetir,
      })
      if (!respuesta.ok) {
        setError(respuesta.error)
        return
      }
      const resultado = respuesta.datos
      if (resultado.tipo === "ya_dispersada") {
        setPaso({ tipo: "repetir", mensaje: resultado.mensaje })
        return
      }
      setPaso({ tipo: "generado", resultado })
      toast.success("Archivo de pagos generado", {
        description: `${plural(resultado.cantidad, "liquidación", "liquidaciones")} por ${formatearCOP(resultado.total)}.`,
      })
      // Llega como adjunto (`Content-Disposition`): no sale de la página.
      if (resultado.url) window.location.assign(resultado.url)
    })
  }

  function descargar(dispersionId: string) {
    iniciarDescarga(async () => {
      const respuesta = await descargarArchivoPagos({ dispersionId })
      if (!respuesta.ok) {
        toast.error(respuesta.error)
        return
      }
      window.location.assign(respuesta.datos.url)
    })
  }

  const requiereRepetir = pedido !== null && pedido.yaEnArchivo.length > 0

  return (
    <AlertDialog
      open={abierto}
      onOpenChange={(valor) => {
        if (!valor) cerrar()
      }}
    >
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        {pedido && paso.tipo === "generado" ? (
          <Resultado
            resultado={paso.resultado}
            refTitulo={tituloResultado}
            descargando={descargando}
            onDescargar={() => descargar(paso.resultado.dispersionId)}
            onCerrar={cerrar}
          />
        ) : pedido ? (
          <>
            <AlertDialogHeader>
              <AlertDialogMedia
                className={cn(
                  paso.tipo === "repetir" || requiereRepetir
                    ? "bg-warning/12 text-warning"
                    : "bg-primary/10 text-primary"
                )}
              >
                {paso.tipo === "repetir" || requiereRepetir ? (
                  <TriangleAlert aria-hidden />
                ) : (
                  <FileSpreadsheet aria-hidden />
                )}
              </AlertDialogMedia>
              <AlertDialogTitle>
                {paso.tipo === "repetir"
                  ? "¿Incluirlas otra vez?"
                  : "¿Generar el archivo de pagos?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {pedido.ids.length > 0
                  ? `${descripcionPedido(pedido)}. El archivo revela los datos bancarios de cada medio: su generación y cada descarga quedan en la bitácora.`
                  : "Ninguna de las liquidaciones elegidas se puede pagar todavía."}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="flex flex-col gap-3 text-sm">
              {paso.tipo === "repetir" ? (
                <Aviso tono="aviso">{paso.mensaje}</Aviso>
              ) : requiereRepetir ? (
                <Aviso tono="aviso">{avisoYaEnArchivo(pedido)}</Aviso>
              ) : null}
              {pedido.excluidas.length > 0 ? (
                <Excluidas excluidas={pedido.excluidas} />
              ) : null}
              {pedido.recortado ? (
                <Aviso tono="info">
                  Un archivo admite hasta 500 liquidaciones: van las primeras
                  500. Genera otro con las que queden.
                </Aviso>
              ) : null}
              {error ? (
                <p role="alert" className="text-pretty text-destructive">
                  {error}
                </p>
              ) : null}
            </div>

            <AlertDialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={cerrar}
                disabled={pendiente}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() =>
                  generar(paso.tipo === "repetir" || requiereRepetir)
                }
                disabled={pendiente || pedido.ids.length === 0}
              >
                {pendiente ? (
                  <Spinner aria-label="Generando" data-icon="inline-start" />
                ) : (
                  <FileSpreadsheet data-icon="inline-start" aria-hidden />
                )}
                {paso.tipo === "repetir" || requiereRepetir
                  ? "Incluirlas otra vez"
                  : "Generar archivo"}
              </Button>
            </AlertDialogFooter>
          </>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  )
}

function Aviso({
  tono,
  children,
}: {
  tono: "aviso" | "info"
  children: ReactNode
}) {
  const Icono = tono === "aviso" ? CircleAlert : Info
  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-xl border px-3.5 py-3 text-pretty",
        tono === "aviso"
          ? "border-warning/40 bg-warning/8"
          : "border-info/35 bg-info/6"
      )}
    >
      <Icono
        aria-hidden
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tono === "aviso" ? "text-warning" : "text-info"
        )}
      />
      <p>{children}</p>
    </div>
  )
}

const VISIBLES_EXCLUIDAS = 5

function Excluidas({ excluidas }: { excluidas: PedidoArchivo["excluidas"] }) {
  const visibles = excluidas.slice(0, VISIBLES_EXCLUIDAS)
  const resto = excluidas.length - visibles.length
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border bg-muted/30 px-3.5 py-3">
      <p className="font-medium">
        Quedan por fuera{" "}
        {plural(excluidas.length, "liquidación", "liquidaciones")}:
      </p>
      <ul className="flex flex-col gap-1 text-muted-foreground">
        {visibles.map((fila) => (
          <li key={fila.id} className="flex min-w-0 flex-wrap gap-x-1.5">
            <span className="truncate font-medium text-foreground">
              {fila.medio}
            </span>
            <span>· {PREPARACION[fila.motivo].etiqueta}</span>
          </li>
        ))}
        {resto > 0 ? <li>y {formatearNumero(resto)} más.</li> : null}
      </ul>
    </div>
  )
}

function Resultado({
  resultado,
  refTitulo,
  descargando,
  onDescargar,
  onCerrar,
}: {
  resultado: Generado
  refTitulo: RefObject<HTMLHeadingElement | null>
  descargando: boolean
  onDescargar: () => void
  onCerrar: () => void
}) {
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogMedia className="bg-success/12 text-success">
          <FileSpreadsheet aria-hidden />
        </AlertDialogMedia>
        <AlertDialogTitle
          ref={refTitulo}
          tabIndex={-1}
          className="outline-none"
        >
          Archivo de pagos generado
        </AlertDialogTitle>
        <AlertDialogDescription>
          {plural(resultado.cantidad, "liquidación", "liquidaciones")} de{" "}
          {plural(resultado.medios, "medio", "medios")} por{" "}
          {formatearCOP(resultado.total)}.{" "}
          {resultado.url
            ? `La descarga de «${resultado.nombreArchivo}» empezó sola.`
            : null}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className="flex flex-col gap-3 text-sm">
        {resultado.avisoDescarga ? (
          <p role="alert" className="text-pretty text-destructive">
            El archivo quedó guardado, pero no pudimos descargarlo (
            {resultado.avisoDescarga.replace(/\.$/, "")}). Usa «Descargar otra
            vez».
          </p>
        ) : null}
        <Aviso tono="info">
          Súbelo al portal del banco. Si lo abres en Excel, importa las columnas
          de documento y de cuenta como texto para conservar los ceros a la
          izquierda. Cuando el banco confirme cada pago, regístralo con su
          soporte.
        </Aviso>
      </div>
      <AlertDialogFooter className="sm:flex-wrap">
        <EnlaceBoton
          href={rutaDispersion(resultado.dispersionId)}
          variant="outline"
          onClick={onCerrar}
        >
          Ver el archivo
        </EnlaceBoton>
        <Button
          type="button"
          variant="outline"
          onClick={onDescargar}
          disabled={descargando}
        >
          {descargando ? (
            <Spinner data-icon="inline-start" role={undefined} aria-hidden />
          ) : (
            <Download data-icon="inline-start" aria-hidden />
          )}
          Descargar otra vez
        </Button>
        <Button type="button" onClick={onCerrar}>
          Listo
        </Button>
      </AlertDialogFooter>
    </>
  )
}
