"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { FileMinus } from "lucide-react"
import { useId, useMemo, useState, useTransition } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Textarea } from "@/components/ui/textarea"
import { numeroAEntrada, textoANumero } from "@/features/configuracion/numeros"
import { MarcaPlataforma } from "@/features/operacion/components/distintivos"
import { formatearCOP } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  confirmarArchivoFactura,
  prepararArchivoFactura,
  registrarNotaCredito,
} from "../actions"
import { describir, repartirErrores } from "../errores-formulario"
import { avisoEstadoFactura } from "../foco"
import {
  efectoNotaCredito,
  normalizarCodigoDian,
  sigueFacturable,
} from "../presentacion"
import {
  esquemaFormularioNota,
  hoyEnBogota,
  LIMITES_ARCHIVO,
  LONGITUD_MAXIMA_MOTIVO_NOTA,
  type ValoresFormularioNota,
} from "../schemas"
import type { LineaFactura } from "../tipos"
import { CampoArchivo } from "./campo-archivo"
import { DialogoFormulario } from "./dialogo-formulario"
import { useArchivoSoporte } from "./use-archivo-soporte"

type Campo = Exclude<keyof ValoresFormularioNota, "facturaId">

const CAMPOS: readonly Campo[] = [
  "numero",
  "cude",
  "fechaEmision",
  "valor",
  "motivo",
  "asignacionIds",
]

export interface RegistrarNotaCreditoProps {
  facturaId: string
  numero: string
  anunciante: string
  saldo: number
  pagado: number
  /** `YYYY-MM-DD` de la factura: la nota no puede ser anterior. */
  fechaEmision: string
  lineas: readonly LineaFactura[]
}

function valoresIniciales(
  facturaId: string,
  lineas: readonly LineaFactura[]
): ValoresFormularioNota {
  return {
    facturaId,
    numero: "",
    cude: "",
    fechaEmision: hoyEnBogota(),
    valor: "",
    motivo: "",
    // Las que ya no son facturables (disputa, cancelación) son la razón habitual de la nota.
    asignacionIds: lineas
      .filter((linea) => !sigueFacturable(linea.estado))
      .map((linea) => linea.asignacionId),
  }
}

const TEXTOS_EFECTO = {
  anula:
    "Cubre todo el saldo y la factura no tiene pagos: quedará ANULADA, sale de la cartera y el anunciante recibe el aviso.",
  salda: "Cubre el saldo que queda: la factura quedará pagada.",
} as const

/**
 * «Registrar nota crédito» (D38 del RF, LIQ-008 c4): la nota se emite en el
 * software de AMO y aquí se registran su número, CUDE, fecha, valor (hasta el
 * saldo), motivo, las asignaciones que libera y el PDF. Antes de enviar dice
 * si la factura queda anulada, pagada o con qué saldo.
 */
export function RegistrarNotaCredito({
  facturaId,
  numero,
  anunciante,
  saldo,
  pagado,
  fechaEmision,
  lineas,
}: RegistrarNotaCreditoProps) {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, iniciar] = useTransition()
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const id = useId()
  const idFormulario = `${id}-formulario`
  const esquema = useMemo(
    () => esquemaFormularioNota({ saldo, fechaEmision }),
    [saldo, fechaEmision]
  )
  const formulario = useForm({
    resolver: zodResolver(esquema),
    defaultValues: valoresIniciales(facturaId, lineas),
    mode: "onTouched",
  })
  const { register, formState, setError, control, setValue } = formulario
  const [valor, cude, motivo] = useWatch({
    control,
    name: ["valor", "cude", "motivo"],
  })
  const archivo = useArchivoSoporte({
    preparar: (descripcion) =>
      prepararArchivoFactura({ facturaId, destino: "factura", descripcion }),
    confirmar: (subido) =>
      confirmarArchivoFactura({
        facturaId,
        destino: "factura",
        archivo: subido,
      }),
    reglas: LIMITES_ARCHIVO.factura,
  })
  const valorNota =
    typeof valor === "string" ? (textoANumero(valor) ?? 0) : (valor ?? 0)
  const efecto =
    valorNota > 0
      ? efectoNotaCredito({ valor: valorNota, saldo, pagado })
      : null

  function cambiarAbierto(valorAbierto: boolean) {
    if (!valorAbierto) {
      formulario.reset(valoresIniciales(facturaId, lineas))
      archivo.descartar()
      setErrorArchivo(null)
      setErrorGeneral(null)
    }
    setAbierto(valorAbierto)
  }

  const enviar = formulario.handleSubmit(() =>
    iniciar(async () => {
      setErrorGeneral(null)
      if (!archivo.elegido) {
        setErrorArchivo("Carga el PDF de la nota crédito.")
        return
      }
      const listo = await archivo.obtener()
      if (!listo?.ok) {
        setErrorArchivo(listo?.error ?? "Carga el PDF de la nota crédito.")
        return
      }
      const resultado = await registrarNotaCredito({
        ...formulario.getValues(),
        facturaId,
        archivoPath: listo.ruta,
      })
      if (!resultado.ok) {
        const errores = repartirErrores(resultado, CAMPOS)
        errores.campos.forEach(([campo, mensaje], indice) =>
          setError(
            campo,
            { type: "server", message: mensaje },
            { shouldFocus: indice === 0 }
          )
        )
        setErrorArchivo(errores.archivo)
        setErrorGeneral(errores.general)
        return
      }
      const { estado } = resultado.datos
      toast.success("Nota crédito registrada", {
        description:
          estado === "ANULADA"
            ? `La factura ${numero} quedó anulada y salió de la cartera.`
            : estado === "PAGADA"
              ? `La factura ${numero} quedó sin saldo.`
              : `Saldo de la factura ${numero}: ${formatearCOP(resultado.datos.saldo)}.`,
      })
      cambiarAbierto(false)
    })
  )

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setAbierto(true)}
      >
        <FileMinus data-icon="inline-start" aria-hidden />
        Registrar nota crédito
      </Button>
      <DialogoFormulario
        abierto={abierto}
        onAbiertoChange={cambiarAbierto}
        icono={FileMinus}
        titulo="Registrar nota crédito"
        descripcion={`Nota crédito emitida en el software de facturación sobre la factura ${numero} de ${anunciante}. Saldo: ${formatearCOP(saldo)}.`}
        idFormulario={idFormulario}
        textoConfirmar="Registrar nota crédito"
        textoPendiente="Registrando la nota crédito"
        pendiente={pendiente}
        errorGeneral={errorGeneral}
        focoAlCerrar={avisoEstadoFactura}
      >
        <form id={idFormulario} onSubmit={enviar} noValidate>
          <FieldGroup>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field data-invalid={formState.errors.numero ? true : undefined}>
                <FieldLabel htmlFor={`${id}-numero`}>Número</FieldLabel>
                <Input
                  id={`${id}-numero`}
                  maxLength={40}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="Ej.: NC125"
                  disabled={pendiente}
                  aria-invalid={formState.errors.numero ? true : undefined}
                  aria-describedby={describir(
                    formState.errors.numero && `${id}-numero-error`
                  )}
                  className="h-10 cifras uppercase sm:h-9"
                  {...register("numero")}
                />
                <FieldError
                  id={`${id}-numero-error`}
                  errors={[formState.errors.numero]}
                />
              </Field>
              <Field
                data-invalid={formState.errors.fechaEmision ? true : undefined}
              >
                <FieldLabel htmlFor={`${id}-fecha`}>
                  Fecha de emisión
                </FieldLabel>
                <Input
                  id={`${id}-fecha`}
                  type="date"
                  min={fechaEmision}
                  max={hoyEnBogota()}
                  disabled={pendiente}
                  aria-invalid={
                    formState.errors.fechaEmision ? true : undefined
                  }
                  aria-describedby={describir(
                    formState.errors.fechaEmision && `${id}-fechaEmision-error`
                  )}
                  className="h-10 sm:h-9"
                  {...register("fechaEmision")}
                />
                <FieldError
                  id={`${id}-fechaEmision-error`}
                  errors={[formState.errors.fechaEmision]}
                />
              </Field>
            </div>

            <Field data-invalid={formState.errors.cude ? true : undefined}>
              <div className="flex items-baseline justify-between gap-3">
                <FieldLabel htmlFor={`${id}-cude`}>CUDE</FieldLabel>
                <span
                  className="text-xs cifras text-muted-foreground"
                  aria-hidden
                >
                  {normalizarCodigoDian(cude).length}/96
                </span>
              </div>
              <Textarea
                id={`${id}-cude`}
                rows={3}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="none"
                disabled={pendiente}
                aria-invalid={formState.errors.cude ? true : undefined}
                aria-describedby={describir(
                  `${id}-cude-ayuda`,
                  formState.errors.cude && `${id}-cude-error`
                )}
                className="font-mono text-xs break-all md:text-xs"
                {...register("cude")}
              />
              <FieldDescription id={`${id}-cude-ayuda`}>
                El código único de la nota crédito: 96 caracteres, como lo
                muestra el software de facturación.
              </FieldDescription>
              <FieldError
                id={`${id}-cude-error`}
                errors={[formState.errors.cude]}
              />
            </Field>

            <Field data-invalid={formState.errors.valor ? true : undefined}>
              <div className="flex items-baseline justify-between gap-3">
                <FieldLabel htmlFor={`${id}-valor`}>Valor</FieldLabel>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={pendiente}
                  onClick={() =>
                    setValue("valor", numeroAEntrada(saldo), {
                      shouldValidate: true,
                    })
                  }
                >
                  Todo el saldo
                </Button>
              </div>
              <InputGroup className="h-10 sm:h-9">
                <InputGroupAddon align="inline-start" className="pl-3">
                  <span aria-hidden className="text-sm text-muted-foreground">
                    $
                  </span>
                </InputGroupAddon>
                <InputGroupInput
                  id={`${id}-valor`}
                  inputMode="decimal"
                  autoComplete="off"
                  disabled={pendiente}
                  aria-invalid={formState.errors.valor ? true : undefined}
                  aria-describedby={describir(
                    `${id}-valor-ayuda`,
                    formState.errors.valor && `${id}-valor-error`
                  )}
                  className="h-full cifras"
                  {...register("valor")}
                />
              </InputGroup>
              <FieldDescription id={`${id}-valor-ayuda`}>
                Hasta el saldo de la factura ({formatearCOP(saldo)}).
              </FieldDescription>
              <FieldError
                id={`${id}-valor-error`}
                errors={[formState.errors.valor]}
              />
            </Field>

            {efecto && efecto !== "excede" ? (
              <p
                aria-live="polite"
                className={cn(
                  "rounded-lg px-3 py-2.5 text-sm text-pretty",
                  efecto === "anula" ? "bg-warning/10" : "bg-muted/60"
                )}
              >
                {efecto === "rebaja"
                  ? `El saldo bajará a ${formatearCOP(saldo - valorNota)}.`
                  : TEXTOS_EFECTO[efecto]}
              </p>
            ) : null}

            <Field data-invalid={formState.errors.motivo ? true : undefined}>
              <div className="flex items-baseline justify-between gap-3">
                <FieldLabel htmlFor={`${id}-motivo`}>Motivo</FieldLabel>
                <span
                  className="text-xs cifras text-muted-foreground"
                  aria-hidden
                >
                  {motivo.length}/{LONGITUD_MAXIMA_MOTIVO_NOTA}
                </span>
              </div>
              <Textarea
                id={`${id}-motivo`}
                rows={3}
                maxLength={LONGITUD_MAXIMA_MOTIVO_NOTA}
                disabled={pendiente}
                placeholder="Ej.: la asignación de Radio Pasto se canceló por incumplimiento del medio."
                aria-invalid={formState.errors.motivo ? true : undefined}
                aria-describedby={describir(
                  `${id}-motivo-ayuda`,
                  formState.errors.motivo && `${id}-motivo-error`
                )}
                {...register("motivo")}
              />
              <FieldDescription id={`${id}-motivo-ayuda`}>
                Lo recibe el anunciante en el aviso y queda en la bitácora.
              </FieldDescription>
              <FieldError
                id={`${id}-motivo-error`}
                errors={[formState.errors.motivo]}
              />
            </Field>

            {lineas.length > 0 ? (
              <Controller
                control={control}
                name="asignacionIds"
                render={({ field, fieldState }) => {
                  const elegidas = new Set(field.value ?? [])
                  return (
                    <FieldSet data-invalid={fieldState.invalid || undefined}>
                      <FieldLegend variant="label">
                        Asignaciones que salen de la factura{" "}
                        <span className="font-normal text-muted-foreground">
                          (opcional)
                        </span>
                      </FieldLegend>
                      <FieldDescription>
                        Quedan libres para facturarse de nuevo. Marcadas: las
                        que ya no están verificadas.
                      </FieldDescription>
                      <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto rounded-lg border p-1.5">
                        {lineas.map((linea) => {
                          const idCasilla = `${id}-asignacion-${linea.asignacionId}`
                          return (
                            <li key={linea.asignacionId}>
                              <label
                                htmlFor={idCasilla}
                                className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
                              >
                                <Checkbox
                                  id={idCasilla}
                                  checked={elegidas.has(linea.asignacionId)}
                                  disabled={pendiente}
                                  onCheckedChange={(marcada) => {
                                    const siguiente = new Set(elegidas)
                                    if (marcada === true) {
                                      siguiente.add(linea.asignacionId)
                                    } else {
                                      siguiente.delete(linea.asignacionId)
                                    }
                                    field.onChange([...siguiente])
                                  }}
                                  className="mt-0.5"
                                />
                                <span className="flex min-w-0 flex-1 flex-col text-sm">
                                  <span className="flex min-w-0 items-center gap-1.5">
                                    <MarcaPlataforma
                                      plataforma={linea.plataforma}
                                    />
                                    <span className="truncate font-medium">
                                      {linea.medio ?? "Medio"}
                                    </span>
                                  </span>
                                  <span className="truncate text-xs text-muted-foreground">
                                    {[linea.oferta, linea.campana]
                                      .filter(Boolean)
                                      .join(" · ")}
                                    {sigueFacturable(linea.estado)
                                      ? ""
                                      : " · ya no está verificada"}
                                  </span>
                                </span>
                                <span className="shrink-0 text-sm cifras">
                                  {formatearCOP(linea.montoBruto)}
                                </span>
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                      <FieldError errors={[fieldState.error]} />
                    </FieldSet>
                  )
                }}
              />
            ) : null}

            <CampoArchivo
              titulo="PDF de la nota crédito"
              descripcion="El PDF que generó el software de facturación (hasta 10 MB). Lo verá el anunciante."
              reglas={LIMITES_ARCHIVO.factura}
              archivo={archivo}
              error={errorArchivo}
              onCambio={() => setErrorArchivo(null)}
              deshabilitado={pendiente}
            />
          </FieldGroup>
        </form>
      </DialogoFormulario>
    </>
  )
}
