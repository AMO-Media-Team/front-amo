"use client"

import { CircleAlert, FileText, Receipt, Upload, X } from "lucide-react"
import { useId, useState } from "react"
import { toast } from "sonner"

import { ListaSubidas } from "@/components/archivos/lista-subidas"
import { useSubida } from "@/components/archivos/use-subida"
import { ZonaArchivos } from "@/components/archivos/zona-archivos"
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { TarjetaFicha } from "@/features/usuarios/components/tarjeta-ficha"
import { formatearTamano } from "@/lib/archivos/formato"
import { mimeDeArchivo } from "@/lib/archivos/mime"

import {
  prepararFacturaMedioInterna,
  registrarFacturaMedioInterna,
} from "../actions"
import { esquemaFormularioFactura, LIMITES_FACTURA_MEDIO } from "../schemas"
import type { EstadoLiquidacion } from "../tipos"
import { BotonDescarga } from "./boton-descarga"

export interface SeccionFacturaMedioProps {
  liquidacionId: string
  medio: string
  estado: EstadoLiquidacion
  numero: string | null
  tieneArchivo: boolean
  /** `liquidaciones.registrar_pago`: Finanzas la registra por el medio. */
  puedeRegistrar: boolean
}

/**
 * «Factura del medio» (LIQ-004, D83): el medio que factura carga su factura
 * desde Ganancias; aquí se ve el número y el PDF y, con permiso de registrar
 * pagos, Finanzas la registra o la corrige por él mientras la liquidación no
 * se haya pagado ni anulado.
 */
export function SeccionFacturaMedio({
  liquidacionId,
  medio,
  estado,
  numero,
  tieneArchivo,
  puedeRegistrar,
}: SeccionFacturaMedioProps) {
  const [abierto, setAbierto] = useState(false)
  const editable = estado === "BORRADOR" || estado === "APROBADA"
  const registrada = numero !== null

  return (
    <TarjetaFicha
      titulo="Factura del medio"
      icono={Receipt}
      descripcion="El medio factura: su pago se respalda con su factura, no con documento soporte."
      acciones={
        puedeRegistrar && editable ? (
          <Button
            variant={registrada ? "outline" : "default"}
            size="sm"
            onClick={() => setAbierto(true)}
          >
            <Upload data-icon="inline-start" aria-hidden />
            {registrada ? "Corregir la factura" : "Registrar la factura"}
          </Button>
        ) : null
      }
    >
      {registrada ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <dl className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground">
              Número de la factura
            </dt>
            <dd className="text-sm font-medium cifras">{numero}</dd>
          </dl>
          {tieneArchivo ? (
            <BotonDescarga
              liquidacionId={liquidacionId}
              archivo="factura_medio"
              texto="Descargar PDF"
            />
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-pretty text-muted-foreground">
          {editable
            ? `${medio} aún no carga su factura: se la pedimos al generar la liquidación. Sin ella no se puede registrar el pago.`
            : "No se registró factura del medio."}
        </p>
      )}
      {puedeRegistrar && editable ? (
        <DialogoFacturaMedio
          abierto={abierto}
          onAbiertoChange={setAbierto}
          liquidacionId={liquidacionId}
          medio={medio}
          numeroActual={numero}
        />
      ) : null}
    </TarjetaFicha>
  )
}

function DialogoFacturaMedio({
  abierto,
  onAbiertoChange,
  liquidacionId,
  medio,
  numeroActual,
}: {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  liquidacionId: string
  medio: string
  numeroActual: string | null
}) {
  const [numero, setNumero] = useState(numeroActual ?? "")
  const [archivo, setArchivo] = useState<File | null>(null)
  const [errores, setErrores] = useState<{ numero?: string; archivo?: string }>(
    {}
  )
  const subida = useSubida<void>({
    preparar: (descripcion) =>
      prepararFacturaMedioInterna({ liquidacionId, archivo: descripcion }),
    confirmar: (subido) =>
      registrarFacturaMedioInterna({ liquidacionId, numero, archivo: subido }),
    reglas: LIMITES_FACTURA_MEDIO,
    usarTus: false,
  })
  const id = useId()
  const ids = {
    numero: `${id}-numero`,
    ayudaNumero: `${id}-numero-ayuda`,
    errorNumero: `${id}-numero-error`,
    errorArchivo: `${id}-archivo-error`,
  }
  const enCurso = subida.activa

  function reiniciar() {
    subida.reiniciar()
    setNumero(numeroActual ?? "")
    setArchivo(null)
    setErrores({})
  }

  function cambiarAbierto(valor: boolean) {
    if (enCurso) return
    if (!valor) reiniciar()
    onAbiertoChange(valor)
  }

  async function registrar() {
    const validacion = esquemaFormularioFactura.safeParse({
      liquidacionId,
      numero,
    })
    const nuevos: { numero?: string; archivo?: string } = {}
    if (!validacion.success) {
      nuevos.numero = validacion.error.issues.find(
        (issue) => issue.path[0] === "numero"
      )?.message
    }
    if (!archivo) nuevos.archivo = "Elige el PDF de la factura."
    setErrores(nuevos)
    if (nuevos.numero || nuevos.archivo || !archivo) return

    // Siempre una subida nueva: lleva el número tal como está ahora.
    const resultado = await subida.subir(archivo)
    if (!resultado.ok) return
    toast.success("Factura registrada", {
      description: `${medio}: ya se puede registrar el pago.`,
    })
    reiniciar()
    onAbiertoChange(false)
  }

  const elemento =
    archivo && subida.estado !== "en-cola"
      ? {
          id: "factura-medio",
          nombre: archivo.name,
          tamano: archivo.size,
          tipo: mimeDeArchivo(archivo),
          vistaPrevia: null,
          resultado: null,
          estado: subida.estado,
          progreso: subida.progreso,
          error: subida.error,
          intento: subida.intento,
          reanudaEn: subida.reanudaEn,
        }
      : null

  return (
    <Dialog
      open={abierto}
      onOpenChange={cambiarAbierto}
      disablePointerDismissal
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>
            {numeroActual ? "Corregir la factura" : "Registrar la factura"} de{" "}
            {medio}
          </DialogTitle>
          <DialogDescription>
            El número tal como aparece en la factura y su PDF. Queda en la
            bitácora que la registraste tú.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <Field data-invalid={errores.numero ? true : undefined}>
            <FieldLabel htmlFor={ids.numero}>Número de la factura</FieldLabel>
            <Input
              id={ids.numero}
              value={numero}
              maxLength={60}
              autoComplete="off"
              disabled={enCurso}
              aria-invalid={errores.numero ? true : undefined}
              aria-describedby={
                errores.numero
                  ? `${ids.errorNumero} ${ids.ayudaNumero}`
                  : ids.ayudaNumero
              }
              onChange={(evento) => {
                setNumero(evento.target.value)
                setErrores(({ numero: _quitado, ...resto }) => resto)
              }}
              className="h-10 sm:h-9"
            />
            <FieldDescription id={ids.ayudaNumero}>
              Con su prefijo, p. ej. FE-1234.
            </FieldDescription>
            <FieldError id={ids.errorNumero}>{errores.numero}</FieldError>
          </Field>

          <div className="flex flex-col gap-2">
            {archivo ? (
              <div className="flex items-center gap-3 rounded-xl border bg-muted/20 p-3">
                <FileText
                  aria-hidden
                  className="size-6 shrink-0 text-muted-foreground"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className="truncate text-sm font-medium"
                    title={archivo.name}
                  >
                    {archivo.name}
                  </span>
                  <span className="text-xs cifras text-muted-foreground">
                    {formatearTamano(archivo.size)}
                  </span>
                </span>
                {!enCurso ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Quitar el PDF elegido"
                    onClick={() => {
                      subida.reiniciar()
                      setArchivo(null)
                    }}
                  >
                    <X aria-hidden />
                  </Button>
                ) : null}
              </div>
            ) : (
              <ZonaArchivos
                reglas={LIMITES_FACTURA_MEDIO}
                onArchivos={([elegido]) => {
                  if (!elegido) return
                  subida.reiniciar()
                  setArchivo(elegido)
                  setErrores(({ archivo: _quitado, ...resto }) => resto)
                }}
                titulo="PDF de la factura"
                invalida={Boolean(errores.archivo)}
                describidaPor={errores.archivo ? ids.errorArchivo : undefined}
                compacta
              />
            )}
            {errores.archivo ? (
              <p
                id={ids.errorArchivo}
                role="alert"
                className="text-sm text-destructive"
              >
                {errores.archivo}
              </p>
            ) : null}
            {elemento ? (
              <ListaSubidas
                elementos={[elemento]}
                etiqueta="Subida de la factura"
                onReintentar={() => void registrar()}
                onCancelar={() => subida.cancelar()}
                onQuitar={() => {
                  subida.reiniciar()
                  setArchivo(null)
                }}
              />
            ) : null}
          </div>

          {subida.estado === "error" && subida.error ? (
            <Alert variant="destructive" role="alert">
              <CircleAlert aria-hidden />
              <AlertDescription>{subida.error}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          {enCurso ? (
            <Button variant="outline" onClick={() => subida.cancelar()}>
              Cancelar la subida
            </Button>
          ) : (
            <Button variant="outline" onClick={() => cambiarAbierto(false)}>
              Cancelar
            </Button>
          )}
          <Button onClick={() => void registrar()} disabled={enCurso}>
            {enCurso ? (
              <Spinner aria-label="Registrando" data-icon="inline-start" />
            ) : null}
            Registrar la factura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
