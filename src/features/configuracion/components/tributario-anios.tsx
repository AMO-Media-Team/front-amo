"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { CalendarRange, History, Pencil, Plus } from "lucide-react"
import { useState } from "react"
import { FormProvider, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { Button } from "@/components/ui/button"
import { formatearCOP, formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import { guardarParametrosAnio } from "../actions"
import { valoresParametrosAnio } from "../formularios"
import { textoANumero } from "../numeros"
import { type EntradaParametrosAnio, esquemaParametrosAnio } from "../schemas"
import type { ParametrosAnio } from "../tipos"
import { hoyBogota } from "../vigencias"
import { Bloque, CELDA_DIVIDIDA, CUADRICULA_DIVIDIDA } from "./bloque"
import { CampoCifra, CampoInterruptor } from "./campos"
import {
  useHistorial,
  usePermisosConfiguracion,
} from "./contexto-configuracion"
import { FormularioHoja, HojaLateral, useHojaLateral } from "./hoja-lateral"
import { InsigniaPendiente } from "./insignias"
import { useEnvio } from "./use-envio"

const CAMPOS = [
  "anio",
  "uvt",
  "smlmv",
  "umbralSegSocialSmlmv",
] as const satisfies readonly (keyof EntradaParametrosAnio)[]

/** Año en curso en Bogotá. */
function anioActual(): number {
  return Number(hoyBogota().slice(0, 4))
}

/** UVT, salario mínimo y umbral de seguridad social de cada año. */
export function ParametrosAnios({
  anios,
}: {
  anios: readonly ParametrosAnio[]
}) {
  const permisos = usePermisosConfiguracion()
  const abrirHistorial = useHistorial()
  const [elegido, setElegido] = useState<ParametrosAnio | null>(null)
  const [abierta, setAbierta] = useState(false)
  const actual = anioActual()

  function abrir(parametros: ParametrosAnio | null) {
    setElegido(parametros)
    setAbierta(true)
  }

  return (
    <Bloque
      id="anios"
      titulo="Parámetros por año"
      descripcion="UVT y salario mínimo con los que se convierten bases y umbrales a pesos."
      icono={CalendarRange}
      acciones={
        permisos.tributario ? (
          <Button variant="outline" size="sm" onClick={() => abrir(null)}>
            <Plus data-icon="inline-start" aria-hidden />
            Agregar año
          </Button>
        ) : null
      }
    >
      {anios.length === 0 ? (
        <EstadoVacio
          icono={CalendarRange}
          variante="simple"
          titulo="Sin parámetros anuales"
          descripcion="Registra la UVT y el salario mínimo del año para que las liquidaciones calculen retenciones."
          className="py-8"
        />
      ) : (
        <div className="@container">
          <ul
            className={cn(
              CUADRICULA_DIVIDIDA,
              "@lg:grid-cols-2 @3xl:grid-cols-3"
            )}
          >
            {anios.map((parametros) => {
              const umbral =
                parametros.umbralSegSocialSmlmv !== null
                  ? parametros.umbralSegSocialSmlmv * parametros.smlmv
                  : null
              return (
                <li
                  key={parametros.anio}
                  className={cn(
                    CELDA_DIVIDIDA,
                    "flex flex-col gap-3 p-4 sm:p-5"
                  )}
                >
                  {/*
                    El año y sus acciones en una fila; las insignias en la
                    siguiente, con alto fijo: así las cifras de todas las
                    tarjetas quedan a la misma altura aunque un año tenga dos
                    insignias (en curso y por validar) y otro una o ninguna.
                  */}
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "font-heading text-xl font-bold cifras",
                        parametros.anio === actual && "text-primary"
                      )}
                    >
                      {parametros.anio}
                    </span>
                    <div className="flex items-center gap-1">
                      {abrirHistorial ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Historial de ${parametros.anio}`}
                          onClick={() =>
                            abrirHistorial({
                              entidad: "parametros_tributarios",
                              entidadId: String(parametros.anio),
                              titulo: `Parámetros tributarios ${parametros.anio}`,
                            })
                          }
                        >
                          <History aria-hidden />
                        </Button>
                      ) : null}
                      {permisos.tributario ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Editar ${parametros.anio}`}
                          onClick={() => abrir(parametros)}
                        >
                          <Pencil aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <div className="-mt-1.5 flex min-h-6 flex-wrap items-center gap-2">
                    {parametros.anio === actual ? (
                      <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[0.6875rem] font-medium text-primary">
                        Año en curso
                      </span>
                    ) : null}
                    {parametros.pendienteValidacion ? (
                      <InsigniaPendiente compacta />
                    ) : null}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">UVT</dt>
                      <dd className="font-semibold cifras">
                        {formatearCOP(parametros.uvt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Salario mínimo
                      </dt>
                      <dd className="font-semibold cifras">
                        {formatearCOP(parametros.smlmv)}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-muted-foreground">
                        Umbral de seguridad social
                      </dt>
                      <dd className="cifras">
                        {umbral === null ? (
                          "Sin umbral"
                        ) : (
                          <>
                            <span className="font-semibold">
                              {formatearCOP(umbral)}
                            </span>{" "}
                            <span className="text-xs text-muted-foreground">
                              al mes (
                              {formatearNumero(
                                parametros.umbralSegSocialSmlmv,
                                2
                              )}{" "}
                              SMLMV)
                            </span>
                          </>
                        )}
                      </dd>
                    </div>
                  </dl>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      <HojaLateral
        abierta={abierta}
        onAbiertaChange={setAbierta}
        icono={CalendarRange}
        titulo={elegido ? `Parámetros de ${elegido.anio}` : "Agregar año"}
        descripcion="Toma las cifras de la resolución de la DIAN y del decreto del salario mínimo."
      >
        <FormularioAnio parametros={elegido} anios={anios} />
      </HojaLateral>
    </Bloque>
  )
}

function FormularioAnio({
  parametros,
  anios,
}: {
  parametros: ParametrosAnio | null
  anios: readonly ParametrosAnio[]
}) {
  const { cerrar } = useHojaLateral()
  const formulario = useForm({
    resolver: zodResolver(esquemaParametrosAnio),
    defaultValues: valoresParametrosAnio(parametros, anios),
    mode: "onTouched",
  })
  const [textoSmlmv, textoUmbral] = useWatch({
    control: formulario.control,
    name: ["smlmv", "umbralSegSocialSmlmv"],
  })
  const smlmv = textoANumero(String(textoSmlmv ?? ""))
  const umbral = textoANumero(String(textoUmbral ?? ""))
  const { enviar, pendiente, errorGeneral, sucio } = useEnvio({
    formulario,
    accion: guardarParametrosAnio,
    campos: CAMPOS,
    onExito: () => {
      toast.success(parametros ? "Parámetros actualizados" : "Año agregado")
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
        textoEnviar={parametros ? "Guardar cambios" : "Agregar año"}
      >
        <CampoCifra
          nombre="anio"
          etiqueta="Año"
          className="max-w-36"
          deshabilitado={parametros !== null || pendiente}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoCifra
            nombre="uvt"
            etiqueta="UVT"
            prefijo="$"
            decimal
            deshabilitado={pendiente}
          />
          <CampoCifra
            nombre="smlmv"
            etiqueta="Salario mínimo (SMLMV)"
            prefijo="$"
            decimal
            deshabilitado={pendiente}
          />
        </div>
        <CampoCifra
          nombre="umbralSegSocialSmlmv"
          etiqueta="Umbral mensual de seguridad social"
          sufijo="SMLMV"
          decimal
          opcional
          deshabilitado={pendiente}
          descripcion={
            smlmv !== null && umbral !== null
              ? `Equivale a ${formatearCOP(smlmv * umbral)} al mes. Por encima, el medio debe acreditar aportes.`
              : "Ingresos mensuales a partir de los cuales el medio debe acreditar aportes."
          }
        />
        <CampoInterruptor
          nombre="pendienteValidacion"
          etiqueta="Pendiente de validación con el contador"
          descripcion="Desmárcalo cuando el contador confirme las cifras."
          deshabilitado={pendiente}
        />
      </FormularioHoja>
    </FormProvider>
  )
}
