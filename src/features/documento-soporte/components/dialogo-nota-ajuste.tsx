"use client"

import { FilePen } from "lucide-react"
import { useId, useRef, useState, useTransition } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { desdeErrorZod } from "@/lib/result"

import { registrarNotaAjuste } from "../actions"
import {
  esquemaCamposNotaAjuste,
  LARGO_MAXIMO_CUDE,
  LARGO_MAXIMO_NUMERO_NOTA,
  MENSAJES_CAMPOS,
  type ValoresNotaAjuste,
} from "../schemas"
import { CampoPdf } from "./campo-pdf"
import { DialogoFormulario } from "./dialogo-formulario"
import { usePdfDocumento } from "./use-pdf-documento"

type Campo = "numero" | "cude" | "archivo"

const ORDEN: readonly Campo[] = ["numero", "cude", "archivo"]
const VACIO: ValoresNotaAjuste = { numero: "", cude: "" }

type Fase = "editando" | "subiendo" | "registrando"

function erroresDe(
  erroresCampo: Readonly<Record<string, string[]>> | undefined
): Partial<Record<Campo, string>> {
  return Object.fromEntries(
    ORDEN.flatMap((campo) => {
      const mensaje =
        erroresCampo?.[campo]?.[0] ??
        (campo === "archivo" ? erroresCampo?.archivoPath?.[0] : undefined)
      return mensaje ? [[campo, mensaje]] : []
    })
  )
}

export interface DialogoNotaAjusteProps {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  liquidacionId: string
  documentoId: string
  numeroDocumento: string | null
  focoAlCerrar?: () => HTMLElement | null | false
  onRegistrada: (numero: string) => void
}

/**
 * «Registrar nota de ajuste» (D38 del RF): un documento ya transmitido a la DIAN no se anula sin su nota
 * de ajuste, expedida en el software del proveedor. Número, CUDE (opcional) y PDF; después se puede
 * anular el documento y emitir otro.
 */
export function DialogoNotaAjuste({
  abierto,
  onAbiertoChange,
  liquidacionId,
  documentoId,
  numeroDocumento,
  focoAlCerrar,
  onRegistrada,
}: DialogoNotaAjusteProps) {
  const [valores, setValores] = useState<ValoresNotaAjuste>(VACIO)
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [fase, setFase] = useState<Fase>("editando")
  const [, iniciar] = useTransition()
  const pdf = usePdfDocumento(liquidacionId, "nota_ajuste")
  const pendiente = fase !== "editando"

  const id = useId()
  const ids = {
    numero: `${id}-numero`,
    cude: `${id}-cude`,
    ayudaCude: `${id}-ayuda-cude`,
  }
  const campoNumero = useRef<HTMLInputElement>(null)
  const campoCude = useRef<HTMLTextAreaElement>(null)
  const botonQuitar = useRef<HTMLButtonElement>(null)
  const zonaPdf = useRef<HTMLDivElement>(null)

  function reiniciar() {
    setValores(VACIO)
    setErrores({})
    setErrorGeneral(null)
    setFase("editando")
    pdf.quitar()
  }

  function cambiarAbierto(valor: boolean) {
    if (!valor) reiniciar()
    onAbiertoChange(valor)
  }

  function cambiar(campo: keyof ValoresNotaAjuste, valor: string) {
    setValores((previos) => ({ ...previos, [campo]: valor }))
    if (errores[campo]) {
      setErrores(({ [campo]: _, ...resto }) => resto)
    }
  }

  function enfocar(campos: Partial<Record<Campo, string>>) {
    switch (ORDEN.find((campo) => campos[campo])) {
      case "numero":
        return campoNumero.current?.focus()
      case "cude":
        return campoCude.current?.focus()
      case "archivo":
        return (
          botonQuitar.current ??
          zonaPdf.current?.querySelector<HTMLElement>("button")
        )?.focus()
    }
  }

  function mostrarErrores(campos: Partial<Record<Campo, string>>) {
    setErrores(campos)
    window.setTimeout(() => enfocar(campos), 0)
  }

  function enviar() {
    const validacion = esquemaCamposNotaAjuste.safeParse(valores)
    const campos = validacion.success
      ? {}
      : erroresDe(desdeErrorZod(validacion.error).erroresCampo)
    if (!pdf.archivo) campos.archivo = MENSAJES_CAMPOS.archivoRequerido
    setErrorGeneral(null)
    if (Object.keys(campos).length > 0) {
      mostrarErrores(campos)
      return
    }
    setErrores({})
    const numeroNota = validacion.success
      ? validacion.data.numero
      : valores.numero
    iniciar(async () => {
      setFase("subiendo")
      const carga = await pdf.asegurar()
      if (!carga.ok) {
        setFase("editando")
        setErrorGeneral(
          carga.cancelada
            ? "Cancelaste la subida del PDF. Pulsa «Registrar nota» cuando quieras subirlo."
            : "No pudimos subir el PDF (el motivo está junto al archivo). Pulsa «Registrar nota» para intentarlo de nuevo."
        )
        return
      }
      const cargado = carga.datos
      setFase("registrando")
      const resultado = await registrarNotaAjuste({
        ...valores,
        documentoId,
        archivoPath: cargado.ruta,
      })
      setFase("editando")
      if (!resultado.ok) {
        const porCampo = erroresDe(resultado.erroresCampo)
        if (porCampo.archivo) pdf.olvidarCarga()
        if (Object.keys(porCampo).length > 0) mostrarErrores(porCampo)
        else setErrorGeneral(resultado.error)
        return
      }
      onRegistrada(numeroNota)
      cambiarAbierto(false)
    })
  }

  const describir = (ayuda: string | null, campo: Campo) =>
    [errores[campo] ? `${id}-error-${campo}` : null, ayuda]
      .filter(Boolean)
      .join(" ") || undefined
  const mensaje = (campo: Campo) =>
    errores[campo] ? (
      <p
        id={`${id}-error-${campo}`}
        role="alert"
        className="text-sm text-destructive"
      >
        {errores[campo]}
      </p>
    ) : null

  return (
    <DialogoFormulario
      abierto={abierto}
      onAbiertoChange={cambiarAbierto}
      icono={FilePen}
      titulo="Registrar nota de ajuste"
      descripcion={`El documento soporte ${numeroDocumento ?? ""} ya se transmitió a la DIAN: se corrige con la nota de ajuste que expediste en el software del proveedor. Después podrás anularlo y emitir uno nuevo.`}
      textoConfirmar="Registrar nota"
      textoPendiente={fase === "subiendo" ? "Subiendo el PDF…" : "Registrando…"}
      pendiente={pendiente}
      errorGeneral={errorGeneral}
      focoAlCerrar={focoAlCerrar}
      onEnviar={enviar}
    >
      <div className="grid gap-2">
        <Label htmlFor={ids.numero}>Número de la nota</Label>
        <Input
          ref={campoNumero}
          id={ids.numero}
          value={valores.numero}
          onChange={(evento) => cambiar("numero", evento.target.value)}
          maxLength={LARGO_MAXIMO_NUMERO_NOTA}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={pendiente}
          className="uppercase"
          aria-invalid={errores.numero ? true : undefined}
          aria-describedby={describir(null, "numero")}
        />
        {mensaje("numero")}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={ids.cude}>
          CUDE{" "}
          <span className="font-normal text-muted-foreground">(opcional)</span>
        </Label>
        <Textarea
          ref={campoCude}
          id={ids.cude}
          value={valores.cude}
          onChange={(evento) => cambiar("cude", evento.target.value)}
          rows={2}
          maxLength={LARGO_MAXIMO_CUDE + 20}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="none"
          disabled={pendiente}
          className="font-mono text-xs break-all"
          aria-invalid={errores.cude ? true : undefined}
          aria-describedby={describir(ids.ayudaCude, "cude")}
        />
        <p
          id={ids.ayudaCude}
          className="text-xs text-pretty text-muted-foreground"
        >
          El código único de la nota, si el proveedor ya la transmitió.
        </p>
        {mensaje("cude")}
      </div>

      <CampoPdf
        pdf={pdf}
        titulo="PDF de la nota"
        ayuda="La nota de ajuste que expidió el proveedor tecnológico (PDF, hasta 10 MB)."
        error={errores.archivo}
        deshabilitado={pendiente}
        refQuitar={botonQuitar}
        refZona={zonaPdf}
      />
    </DialogoFormulario>
  )
}
