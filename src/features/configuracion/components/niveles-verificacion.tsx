"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { BadgeCheck, Check, History, Pencil, ShieldCheck } from "lucide-react"
import { useState } from "react"
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { formatearCOP, formatearPorcentaje } from "@/lib/format"
import { cn } from "@/lib/utils"

import { guardarNivel } from "../actions"
import { valoresNivel } from "../formularios"
import { NOMBRES_DOCUMENTO_MEDIO } from "../presentacion"
import { DOCUMENTOS_MEDIO, type EntradaNivel, esquemaNivel } from "../schemas"
import type { NivelVerificacion } from "../tipos"
import { decimalesPorcentaje } from "../valores"
import { Bloque } from "./bloque"
import {
  CampoAreaTexto,
  CampoCifra,
  CampoInterruptor,
  CampoTexto,
} from "./campos"
import {
  useHistorial,
  usePermisosConfiguracion,
} from "./contexto-configuracion"
import { FormularioHoja, HojaLateral, useHojaLateral } from "./hoja-lateral"
import { InsigniaPendiente } from "./insignias"
import { FichasOpciones } from "./selector-opciones"
import { useEnvio } from "./use-envio"

const CAMPOS = [
  "nombre",
  "requisitos",
  "documentosRequeridos",
  "topeAnual",
  "porcentajeAlerta",
  "porcentajeBloqueo",
] as const satisfies readonly (keyof EntradaNivel)[]

function porcentaje(fraccion: number): string {
  return formatearPorcentaje(fraccion, decimalesPorcentaje(fraccion))
}

/**
 * Niveles de verificación de medios: documentos que exige cada nivel, tope
 * anual de ingresos y en qué punto se avisa y se bloquea la aceptación de
 * ofertas (§7.1.1). Los topes están pendientes de validación con el contador.
 */
export function NivelesVerificacion({
  niveles,
}: {
  niveles: readonly NivelVerificacion[]
}) {
  const permisos = usePermisosConfiguracion()
  const abrirHistorial = useHistorial()
  const [elegido, setElegido] = useState<NivelVerificacion | null>(null)
  const [abierta, setAbierta] = useState(false)

  return (
    <Bloque
      id="niveles"
      titulo="Niveles de verificación y topes"
      descripcion="Qué documentos exige cada nivel y cuánto puede facturar un medio al año antes de pasar al siguiente."
      icono={ShieldCheck}
    >
      {niveles.length === 0 ? (
        <EstadoVacio
          icono={ShieldCheck}
          variante="simple"
          titulo="Sin niveles configurados"
          descripcion="Los tres niveles se crean con la migración de configuración."
          className="py-8"
        />
      ) : (
        <div className="@container">
          <ol className="grid divide-y @3xl:grid-cols-3 @3xl:divide-x @3xl:divide-y-0">
            {niveles.map((nivel) => (
              <TarjetaNivel
                key={nivel.nivel}
                nivel={nivel}
                editable={permisos.editar}
                onEditar={() => {
                  setElegido(nivel)
                  setAbierta(true)
                }}
                onHistorial={
                  abrirHistorial
                    ? () =>
                        abrirHistorial({
                          entidad: "niveles_verificacion",
                          entidadId: String(nivel.nivel),
                          titulo: `Nivel ${nivel.nivel} · ${nivel.nombre}`,
                        })
                    : null
                }
              />
            ))}
          </ol>
        </div>
      )}
      <HojaLateral
        abierta={abierta}
        onAbiertaChange={setAbierta}
        icono={BadgeCheck}
        titulo={elegido ? `Editar nivel ${elegido.nivel}` : "Editar nivel"}
        descripcion={elegido?.nombre}
        ancho="lg"
      >
        {elegido ? <FormularioNivel nivel={elegido} /> : null}
      </HojaLateral>
    </Bloque>
  )
}

function TarjetaNivel({
  nivel,
  editable,
  onEditar,
  onHistorial,
}: {
  nivel: NivelVerificacion
  editable: boolean
  onEditar: () => void
  onHistorial: (() => void) | null
}) {
  return (
    <li className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex min-h-6 flex-wrap items-center gap-2">
            <span className="text-[0.6875rem] font-semibold tracking-[0.08em] text-primary uppercase">
              Nivel {nivel.nivel}
            </span>
            {nivel.pendienteValidacion ? <InsigniaPendiente compacta /> : null}
          </span>
          <h4 className="font-heading leading-snug font-semibold">
            {nivel.nombre}
          </h4>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onHistorial ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Historial del nivel ${nivel.nivel}`}
              onClick={onHistorial}
            >
              <History aria-hidden />
            </Button>
          ) : null}
          {editable ? (
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={`Editar el nivel ${nivel.nivel}`}
              onClick={onEditar}
            >
              <Pencil aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-heading text-xl font-bold cifras">
          {nivel.topeAnual === null
            ? "Sin tope"
            : formatearCOP(nivel.topeAnual)}
        </span>
        <span className="text-xs text-muted-foreground">
          {nivel.topeAnual === null
            ? "Puede facturar sin límite anual"
            : "Tope anual de ingresos"}
        </span>
        {nivel.topeAnual !== null ? (
          <BarraUmbrales nivel={nivel} tope={nivel.topeAnual} />
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Documentos
        </span>
        <ul className="flex flex-wrap gap-1.5">
          {nivel.documentosRequeridos.map((documento) => (
            <li
              key={documento}
              className="rounded-md bg-muted px-2 py-0.5 text-xs"
            >
              {NOMBRES_DOCUMENTO_MEDIO[documento]}
            </li>
          ))}
        </ul>
      </div>

      {nivel.requisitos.length > 0 ? (
        <ul className="flex flex-col gap-1.5 text-sm">
          {nivel.requisitos.map((requisito) => (
            <li key={requisito} className="flex gap-2 text-pretty">
              <Check
                aria-hidden
                className="mt-0.5 size-3.5 shrink-0 text-success"
              />
              {requisito}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

/** Barra del tope con las marcas de alerta y bloqueo. */
function BarraUmbrales({
  nivel,
  tope,
}: {
  nivel: NivelVerificacion
  tope: number
}) {
  const marcas = [
    { tipo: "alerta", fraccion: nivel.porcentajeAlerta, etiqueta: "Alerta" },
    { tipo: "bloqueo", fraccion: nivel.porcentajeBloqueo, etiqueta: "Bloqueo" },
  ] as const
  return (
    <div className="flex flex-col gap-1.5 pt-1">
      <div
        role="img"
        aria-label={`Alerta al ${porcentaje(nivel.porcentajeAlerta)} y bloqueo al ${porcentaje(nivel.porcentajeBloqueo)} del tope`}
        className="relative h-2 rounded-full bg-linear-to-r from-success/35 via-warning/45 to-destructive/55"
      >
        {marcas.map((marca) => (
          <span
            key={marca.tipo}
            aria-hidden
            className={cn(
              "absolute -top-1 h-4 w-0.5 rounded-full",
              marca.tipo === "alerta" ? "bg-warning" : "bg-destructive"
            )}
            style={{ left: `calc(${marca.fraccion * 100}% - 1px)` }}
          />
        ))}
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        {marcas.map((marca) => (
          <div key={marca.tipo} className="flex flex-col">
            <dt className="text-muted-foreground">
              {marca.etiqueta} al {porcentaje(marca.fraccion)}
            </dt>
            <dd className="font-medium cifras">
              {formatearCOP(tope * marca.fraccion)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function FormularioNivel({ nivel }: { nivel: NivelVerificacion }) {
  const { cerrar } = useHojaLateral()
  const formulario = useForm({
    resolver: zodResolver(esquemaNivel),
    defaultValues: valoresNivel(nivel),
    mode: "onTouched",
  })
  const { control } = formulario
  const sinTope = useWatch({ control, name: "sinTope" })
  const { enviar, pendiente, errorGeneral, sucio } = useEnvio({
    formulario,
    accion: guardarNivel,
    campos: CAMPOS,
    onExito: () => {
      toast.success(`Nivel ${nivel.nivel} actualizado`)
      cerrar()
    },
  })

  return (
    <FormProvider {...formulario}>
      <FormularioHoja
        onEnviar={enviar}
        pendiente={pendiente}
        sucio={sucio}
        errorGeneral={errorGeneral}
        textoEnviar="Guardar nivel"
      >
        <CampoTexto
          nombre="nombre"
          etiqueta="Nombre"
          deshabilitado={pendiente}
        />
        <CampoAreaTexto
          nombre="requisitos"
          etiqueta="Requisitos"
          filas={4}
          descripcion="Uno por línea. Es lo que ve el medio al verificarse."
          deshabilitado={pendiente}
        />
        <Controller
          control={control}
          name="documentosRequeridos"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel>Documentos requeridos</FieldLabel>
              <FichasOpciones
                etiqueta="Documentos requeridos"
                opciones={DOCUMENTOS_MEDIO.map((d) => ({
                  valor: d,
                  etiqueta: NOMBRES_DOCUMENTO_MEDIO[d],
                }))}
                valores={field.value}
                deshabilitado={pendiente}
                onCambio={(valores) =>
                  field.onChange(
                    valores as EntradaNivel["documentosRequeridos"]
                  )
                }
              />
              <FieldDescription>
                Además, todo nivel exige el certificado del medio de pago
                declarado (bancario o billetera).
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <fieldset className="flex flex-col gap-4 rounded-xl border p-4">
          <legend className="px-1 text-sm font-medium">Tope anual</legend>
          <CampoInterruptor
            nombre="sinTope"
            etiqueta="Sin tope"
            descripcion="El medio de este nivel puede facturar sin límite anual."
            deshabilitado={pendiente}
          />
          {sinTope ? null : (
            <CampoCifra
              nombre="topeAnual"
              etiqueta="Tope de ingresos al año"
              prefijo="$"
              deshabilitado={pendiente}
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoCifra
              nombre="porcentajeAlerta"
              etiqueta="Avisar al llegar a"
              sufijo="%"
              decimal
              deshabilitado={pendiente || sinTope}
              descripcion="Aviso en la interfaz y en los insights."
            />
            <CampoCifra
              nombre="porcentajeBloqueo"
              etiqueta="Bloquear al llegar a"
              sufijo="%"
              decimal
              deshabilitado={pendiente || sinTope}
              descripcion="No puede aceptar ofertas que lo superen."
            />
          </div>
        </fieldset>

        <CampoInterruptor
          nombre="pendienteValidacion"
          etiqueta="Pendiente de validación con el contador"
          descripcion="Márcalo mientras las cifras sean sugeridas."
          deshabilitado={pendiente}
        />
      </FormularioHoja>
    </FormProvider>
  )
}
