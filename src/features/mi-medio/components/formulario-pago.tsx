"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  Landmark,
  LockKeyhole,
  type LucideIcon,
  ReceiptText,
  RefreshCcw,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  Undo2,
  UserRound,
  Wallet,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { type ReactNode, type Ref, useId, useMemo, useRef } from "react"
import {
  Controller,
  FormProvider,
  useForm,
  useFormContext,
  useFormState,
  useWatch,
} from "react-hook-form"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  CampoInterruptor,
  CampoSelect,
  CampoTexto,
} from "@/features/configuracion/components/campos"
import { useEnvio } from "@/features/configuracion/components/use-envio"

import { guardarDatosPagoMedio, type PagoGuardadoResultado } from "../actions"
import { RUTAS_MI_MEDIO } from "../alta"
import {
  BANCOS,
  BILLETERAS,
  METODOS_PAGO,
  METODOS_PAGO_BD,
  type MetodoPago,
  OTRA_ENTIDAD,
  REGLAS_DOCUMENTO,
  SIGLAS_DOCUMENTO,
  TIPOS_CUENTA,
  TIPOS_CUENTA_BD,
  TIPOS_DOCUMENTO_IDENTIDAD,
  TIPOS_DOCUMENTO_IDENTIDAD_BD,
  type TipoDocumentoIdentidad,
} from "../datos-pago"
import { CUENTA_VACIA, valoresPago } from "../formularios"
import {
  CAMPOS_PAGO,
  type CampoPago,
  type EntradaDatosPago,
  esquemaDatosPago,
} from "../schemas"
import type { PagoEditable, PagoResumen } from "../tipos"
import { BarraGuardar, useSalidaSinGuardar } from "./guardado"
import { SeccionFormulario } from "./seccion-formulario"

const OPCIONES_DOCUMENTO = TIPOS_DOCUMENTO_IDENTIDAD_BD.map((tipo) => ({
  valor: tipo,
  etiqueta: TIPOS_DOCUMENTO_IDENTIDAD[tipo],
}))

const OPCIONES_BANCO = [
  ...BANCOS.map((banco) => ({ valor: banco, etiqueta: banco })),
  { valor: OTRA_ENTIDAD, etiqueta: "Otro banco" },
]

const OPCIONES_BILLETERA = [
  ...BILLETERAS.map((billetera) => ({ valor: billetera, etiqueta: billetera })),
  { valor: OTRA_ENTIDAD, etiqueta: "Otra billetera" },
]

const ICONOS_METODO: Readonly<Record<MetodoPago, LucideIcon>> = {
  BANCARIO: Landmark,
  BILLETERA: Smartphone,
}

const DESCRIPCION_METODO: Readonly<Record<MetodoPago, string>> = {
  BANCARIO: "Ahorros o corriente, en un banco de Colombia.",
  BILLETERA: "Nequi, Daviplata u otra, asociada a tu celular.",
}

const esTipoDocumento = (valor: string): valor is TipoDocumentoIdentidad =>
  (TIPOS_DOCUMENTO_IDENTIDAD_BD as readonly string[]).includes(valor)

/** Campos de la cuenta que se limpian al conservar la registrada. */
const CAMPOS_CUENTA: readonly CampoPago[] = [
  "metodoPago",
  ...(Object.keys(CUENTA_VACIA) as CampoPago[]),
]

// ── Campo sensible (documento, cuenta, celular) ─────────────────────────────

/**
 * Número que se cifra en el servidor: nunca llega precargado, no se corrige
 * ni se autocompleta, y su ayuda y su error se anuncian con el campo.
 */
function CampoNumero({
  nombre,
  etiqueta,
  descripcion,
  placeholder,
  teclado,
  tipo = "text",
  deshabilitado,
}: {
  nombre: "numeroDocumento" | "numeroCuenta" | "numeroBilletera"
  etiqueta: string
  descripcion: ReactNode
  placeholder?: string
  teclado: "numeric" | "text" | "tel"
  tipo?: "text" | "tel"
  deshabilitado?: boolean
}) {
  const { register, control } = useFormContext<EntradaDatosPago>()
  const { errors } = useFormState({ control, name: nombre })
  const error = errors[nombre]
  const id = useId()
  const idAyuda = `${id}-ayuda`
  const idError = `${id}-error`
  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel htmlFor={id}>{etiqueta}</FieldLabel>
      <Input
        id={id}
        type={tipo}
        inputMode={teclado}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize={teclado === "text" ? "characters" : "off"}
        spellCheck={false}
        placeholder={placeholder}
        disabled={deshabilitado}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${idError} ${idAyuda}` : idAyuda}
        className="cifras"
        {...register(nombre)}
      />
      <FieldDescription id={idAyuda}>{descripcion}</FieldDescription>
      <FieldError id={idError} errors={[error]} />
    </Field>
  )
}

// ── Titular y documento ─────────────────────────────────────────────────────

function NumeroDocumento({
  resumen,
  deshabilitado,
}: {
  resumen: PagoResumen
  deshabilitado?: boolean
}) {
  const { control } = useFormContext<EntradaDatosPago>()
  const tipo = useWatch({ control, name: "tipoDocumento" })
  const regla = esTipoDocumento(tipo) ? REGLAS_DOCUMENTO[tipo] : null
  const registrado =
    resumen.documentoRegistrado && resumen.numeroDocumentoResumen
      ? resumen.numeroDocumentoResumen
      : null
  const mismoTipo = registrado !== null && resumen.tipoDocumento === tipo
  const sigla = resumen.tipoDocumento
    ? SIGLAS_DOCUMENTO[resumen.tipoDocumento]
    : ""

  let descripcion: ReactNode
  if (registrado && mismoTipo) {
    descripcion = (
      <>
        Registrado:{" "}
        <span className="font-medium cifras">
          {sigla} {registrado}
        </span>
        . Por seguridad no lo mostramos completo. Déjalo vacío para conservarlo
        o escríbelo para cambiarlo.
      </>
    )
  } else if (registrado) {
    descripcion =
      "Cambiaste el tipo de documento: escribe el número completo otra vez."
  } else if (tipo === "NIT") {
    descripcion = "Con el dígito de verificación, tal como aparece en tu RUT."
  } else {
    descripcion = "Puedes escribirlo con o sin puntos."
  }

  return (
    <CampoNumero
      nombre="numeroDocumento"
      etiqueta={mismoTipo ? "Número de documento nuevo" : "Número de documento"}
      descripcion={descripcion}
      placeholder={mismoTipo ? "Escríbelo solo si cambia" : regla?.ejemplo}
      teclado={regla?.teclado ?? "text"}
      deshabilitado={deshabilitado}
    />
  )
}

// ── Cuenta de pago ──────────────────────────────────────────────────────────

function OpcionMetodo({ metodo, id }: { metodo: MetodoPago; id: string }) {
  const Icono = ICONOS_METODO[metodo]
  return (
    <FieldLabel htmlFor={id}>
      <Field orientation="horizontal">
        <Icono aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
        <FieldContent>
          <FieldTitle>{METODOS_PAGO[metodo]}</FieldTitle>
          <FieldDescription>{DESCRIPCION_METODO[metodo]}</FieldDescription>
        </FieldContent>
        <RadioGroupItem value={metodo} id={id} />
      </Field>
    </FieldLabel>
  )
}

function idOpcionMetodo(base: string, metodo: MetodoPago) {
  return `${base}-${metodo.toLowerCase()}`
}

function ElegirMetodo({
  idBase,
  deshabilitado,
}: {
  idBase: string
  deshabilitado?: boolean
}) {
  const { control } = useFormContext<EntradaDatosPago>()
  return (
    <Controller
      control={control}
      name="metodoPago"
      render={({ field, fieldState }) => (
        <FieldSet data-invalid={fieldState.invalid || undefined}>
          <FieldLegend variant="label">
            ¿Cómo quieres recibir tus pagos?
          </FieldLegend>
          <RadioGroup
            value={field.value}
            onValueChange={(valor) => field.onChange(String(valor ?? ""))}
            onBlur={field.onBlur}
            disabled={deshabilitado}
            aria-invalid={fieldState.invalid || undefined}
            className="grid gap-3 sm:grid-cols-2"
          >
            {METODOS_PAGO_BD.map((metodo) => (
              <OpcionMetodo
                key={metodo}
                metodo={metodo}
                id={idOpcionMetodo(idBase, metodo)}
              />
            ))}
          </RadioGroup>
          <FieldError errors={[fieldState.error]} />
        </FieldSet>
      )}
    />
  )
}

function TipoCuenta({ deshabilitado }: { deshabilitado?: boolean }) {
  const { control } = useFormContext<EntradaDatosPago>()
  const idBase = useId()
  return (
    <Controller
      control={control}
      name="tipoCuenta"
      render={({ field, fieldState }) => (
        <FieldSet data-invalid={fieldState.invalid || undefined}>
          <FieldLegend variant="label">Tipo de cuenta</FieldLegend>
          <RadioGroup
            value={field.value}
            onValueChange={(valor) => field.onChange(String(valor ?? ""))}
            onBlur={field.onBlur}
            disabled={deshabilitado}
            aria-invalid={fieldState.invalid || undefined}
            className="grid grid-cols-2 gap-3"
          >
            {TIPOS_CUENTA_BD.map((tipo) => {
              const id = `${idBase}-${tipo.toLowerCase()}`
              return (
                <FieldLabel key={tipo} htmlFor={id}>
                  <Field orientation="horizontal" className="min-h-6">
                    <FieldContent>
                      <FieldTitle>{TIPOS_CUENTA[tipo]}</FieldTitle>
                    </FieldContent>
                    <RadioGroupItem value={tipo} id={id} />
                  </Field>
                </FieldLabel>
              )
            })}
          </RadioGroup>
          <FieldError errors={[fieldState.error]} />
        </FieldSet>
      )}
    />
  )
}

function CamposBanco({ deshabilitado }: { deshabilitado?: boolean }) {
  const { control } = useFormContext<EntradaDatosPago>()
  const banco = useWatch({ control, name: "banco" })
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <CampoSelect
        nombre="banco"
        etiqueta="Banco"
        opciones={OPCIONES_BANCO}
        placeholder="Elige tu banco"
        deshabilitado={deshabilitado}
      />
      {banco === OTRA_ENTIDAD ? (
        <CampoTexto
          nombre="bancoOtro"
          etiqueta="Nombre del banco"
          placeholder="Banco Cooperativo Coopcentral"
          deshabilitado={deshabilitado}
        />
      ) : null}
      <div className="md:col-span-2">
        <TipoCuenta deshabilitado={deshabilitado} />
      </div>
      <div className="md:col-span-2">
        <CampoNumero
          nombre="numeroCuenta"
          etiqueta="Número de la cuenta"
          descripcion="Tal como aparece en la certificación del banco."
          placeholder="03012345678"
          teclado="numeric"
          deshabilitado={deshabilitado}
        />
      </div>
    </div>
  )
}

function CamposBilletera({ deshabilitado }: { deshabilitado?: boolean }) {
  const { control } = useFormContext<EntradaDatosPago>()
  const billetera = useWatch({ control, name: "billetera" })
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <CampoSelect
        nombre="billetera"
        etiqueta="Billetera"
        opciones={OPCIONES_BILLETERA}
        placeholder="Elige tu billetera"
        deshabilitado={deshabilitado}
      />
      {billetera === OTRA_ENTIDAD ? (
        <CampoTexto
          nombre="billeteraOtra"
          etiqueta="Nombre de la billetera"
          deshabilitado={deshabilitado}
        />
      ) : null}
      <div className="md:col-span-2">
        <CampoNumero
          nombre="numeroBilletera"
          etiqueta="Celular de la billetera"
          descripcion="El número con el que abriste la billetera, a tu nombre."
          placeholder="300 123 4567"
          tipo="tel"
          teclado="tel"
          deshabilitado={deshabilitado}
        />
      </div>
    </div>
  )
}

function CuentaRegistrada({
  resumen,
  onCambiar,
  deshabilitado,
  botonRef,
}: {
  resumen: PagoResumen
  onCambiar: () => void
  deshabilitado?: boolean
  botonRef: Ref<HTMLButtonElement>
}) {
  const metodo = resumen.metodoPago ?? "BANCARIO"
  const Icono = ICONOS_METODO[metodo]
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-3.5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-background ring-1 ring-border"
        >
          <Icono className="size-5 text-primary" />
        </span>
        <div className="flex min-w-0 flex-col">
          <p className="truncate font-medium cifras">{resumen.cuentaResumen}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {METODOS_PAGO[metodo]}
            <span aria-hidden>·</span>
            <LockKeyhole aria-hidden className="size-3" />
            Cifrada
          </p>
        </div>
      </div>
      <Button
        ref={botonRef}
        type="button"
        variant="outline"
        onClick={onCambiar}
        disabled={deshabilitado}
        className="w-full sm:w-auto"
      >
        <RefreshCcw data-icon="inline-start" aria-hidden />
        Cambiar de cuenta
      </Button>
    </div>
  )
}

function SeccionCuenta({
  pago,
  deshabilitado,
}: {
  pago: PagoEditable
  deshabilitado?: boolean
}) {
  const { control, setValue, clearErrors } = useFormContext<EntradaDatosPago>()
  const [cambiar, metodo] = useWatch({
    control,
    name: ["cambiarCuenta", "metodoPago"],
  })
  const idBase = useId()
  const editorRef = useRef<HTMLDivElement>(null)
  const botonCambiarRef = useRef<HTMLButtonElement>(null)
  const { resumen, guardado, verificado } = pago
  const conGuardada = guardado.cuentaRegistrada
  const escribe = cambiar || !conGuardada

  // El botón que se pulsó desaparece al cambiar de vista: el foco pasa a lo
  // que aparece en su lugar, para que teclado y lector de pantalla sigan ahí.
  function abrirCambio() {
    setValue("cambiarCuenta", true, { shouldDirty: true })
    requestAnimationFrame(() => {
      const editor = editorRef.current
      const opcion =
        editor?.querySelector<HTMLElement>(
          '[role="radio"][aria-checked="true"]'
        ) ?? editor?.querySelector<HTMLElement>('[role="radio"]')
      opcion?.focus()
    })
  }

  function conservar() {
    setValue("cambiarCuenta", false, { shouldDirty: true })
    setValue("metodoPago", resumen.metodoPago ?? "", { shouldDirty: true })
    for (const [campo, valor] of Object.entries(CUENTA_VACIA)) {
      setValue(campo as keyof typeof CUENTA_VACIA, valor, {
        shouldDirty: true,
      })
    }
    clearErrors(CAMPOS_CUENTA as CampoPago[])
    requestAnimationFrame(() => botonCambiarRef.current?.focus())
  }

  return (
    <SeccionFormulario
      icono={Wallet}
      titulo="Dónde te pagamos"
      descripcion="La cuenta debe estar a nombre del titular. Te pediremos su certificación en Documentos."
    >
      {escribe ? (
        <div ref={editorRef} className="flex flex-col gap-5">
          {conGuardada ? (
            <Alert role="note">
              <TriangleAlert aria-hidden />
              <AlertDescription className="flex flex-col items-start gap-3">
                <p>
                  Escribe la cuenta nueva completa: reemplaza a{" "}
                  <span className="font-medium cifras">
                    {resumen.cuentaResumen}
                  </span>
                  .{" "}
                  {verificado
                    ? "El equipo de AMO la revisará de nuevo y necesitará su certificación."
                    : "Después carga su certificación en Documentos."}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={conservar}
                  disabled={deshabilitado}
                >
                  <Undo2 data-icon="inline-start" aria-hidden />
                  Conservar la cuenta registrada
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          <ElegirMetodo idBase={idBase} deshabilitado={deshabilitado} />
          {metodo === "BANCARIO" ? (
            <CamposBanco deshabilitado={deshabilitado} />
          ) : metodo === "BILLETERA" ? (
            <CamposBilletera deshabilitado={deshabilitado} />
          ) : null}
        </div>
      ) : (
        <CuentaRegistrada
          resumen={resumen}
          onCambiar={abrirCambio}
          deshabilitado={deshabilitado}
          botonRef={botonCambiarRef}
        />
      )}
    </SeccionFormulario>
  )
}

// ── Formulario ──────────────────────────────────────────────────────────────

/** Por qué se piden y cómo se protegen (antes de pedir nada). */
function PorQueLosPedimos() {
  return (
    <aside className="flex gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
      <ShieldCheck
        aria-hidden
        className="mt-0.5 size-5 shrink-0 text-primary"
      />
      <div className="flex min-w-0 flex-col gap-1.5 text-sm">
        <p className="font-medium">Tus datos van cifrados</p>
        <p className="text-pretty text-muted-foreground">
          Los usamos solo para pagarte y para cumplir con la DIAN (retenciones y
          documento soporte de cada pago). El número de tu documento y el de tu
          cuenta se guardan cifrados y no se vuelven a mostrar completos, ni
          siquiera a ti: para cambiarlos, escríbelos de nuevo.
        </p>
      </div>
    </aside>
  )
}

/**
 * Pago y condición tributaria (MED-004). El servidor cifra número de
 * documento y cuenta, calcula huella y resúmenes, y llama a la RPC; aquí solo
 * se muestran los resúmenes (`•••• 1234`). La página lo monta con `key` =
 * versión de los datos: al guardar se rehace con lo registrado.
 */
export function FormularioPagoMedio({ pago }: { pago: PagoEditable }) {
  const router = useRouter()
  const { resumen, guardado } = pago
  const esquema = useMemo(() => esquemaDatosPago(guardado), [guardado])
  const formulario = useForm({
    resolver: zodResolver(esquema),
    defaultValues: valoresPago(resumen),
    mode: "onTouched",
  })
  const { enviar, pendiente, errorGeneral, sucio } = useEnvio({
    formulario,
    accion: guardarDatosPagoMedio,
    campos: CAMPOS_PAGO,
    onExito: ({ cuentaNueva }: PagoGuardadoResultado) => {
      formulario.reset({
        ...formulario.getValues(),
        numeroDocumento: "",
        cambiarCuenta: false,
        ...CUENTA_VACIA,
      })
      if (!cuentaNueva) {
        toast.success("Datos de pago guardados")
        return
      }
      toast.success("Datos de pago guardados", {
        description:
          "Ahora carga la certificación de tu cuenta para que podamos verificarla.",
        action: {
          label: "Ir a Documentos",
          onClick: () => router.push(RUTAS_MI_MEDIO.documentos),
        },
      })
    },
  })
  const dialogoSalida = useSalidaSinGuardar(sucio && !pendiente)

  return (
    <FormProvider {...formulario}>
      <form
        onSubmit={enviar}
        noValidate
        autoComplete="off"
        aria-label="Datos de pago y condición tributaria"
        className="flex flex-col gap-5"
      >
        <PorQueLosPedimos />
        {errorGeneral ? (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden />
            <AlertDescription>{errorGeneral}</AlertDescription>
          </Alert>
        ) : null}

        <SeccionFormulario
          icono={UserRound}
          titulo="Titular y documento"
          descripcion="La persona o empresa a cuyo nombre está la cuenta. Debe coincidir con la certificación que cargues."
        >
          <div className="grid gap-5 md:grid-cols-2">
            <CampoTexto
              nombre="titularNombre"
              etiqueta="Nombre del titular"
              placeholder="Como aparece en tu documento"
              className="md:col-span-2"
              deshabilitado={pendiente}
            />
            <CampoSelect
              nombre="tipoDocumento"
              etiqueta="Tipo de documento"
              opciones={OPCIONES_DOCUMENTO}
              placeholder="Elige el tipo"
              deshabilitado={pendiente}
            />
            <NumeroDocumento resumen={resumen} deshabilitado={pendiente} />
          </div>
        </SeccionFormulario>

        <SeccionCuenta pago={pago} deshabilitado={pendiente} />

        <SeccionFormulario
          icono={ReceiptText}
          titulo="Condición tributaria"
          descripcion="Define las retenciones de cada pago y quién emite el documento que lo soporta. Si dudas, revisa tu RUT o pregúntale a tu contador."
        >
          <div className="flex flex-col gap-3">
            <CampoInterruptor
              nombre="esDeclarante"
              etiqueta="Declaro renta"
              descripcion="Presentas declaración de renta ante la DIAN."
              deshabilitado={pendiente}
            />
            <CampoInterruptor
              nombre="obligadoFacturar"
              etiqueta="Estoy obligado a facturar"
              descripcion="Emites factura electrónica. Si no lo estás, AMO emite el documento soporte de tus pagos."
              deshabilitado={pendiente}
            />
            <CampoInterruptor
              nombre="responsableIva"
              etiqueta="Soy responsable de IVA"
              descripcion="Tu RUT tiene la responsabilidad 48 (impuesto sobre las ventas)."
              deshabilitado={pendiente}
            />
          </div>
        </SeccionFormulario>

        <BarraGuardar
          visible={sucio || pendiente}
          pendiente={pendiente}
          onDescartar={() => formulario.reset()}
          textoGuardar="Guardar datos de pago"
        />
      </form>
      {dialogoSalida}
    </FormProvider>
  )
}
