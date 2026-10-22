"use client"

import { Plus } from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { rutaAnunciante } from "@/features/operacion/rutas"

import type { AnuncianteRegistrado, CatalogosAnunciante } from "../tipos"
import { HojaRegistroAnunciante } from "./hoja-anunciante"

/** `?registrar=1` (p. ej. desde la hoja de usuarios) abre la hoja al llegar. */
const parametroRegistrar = parseAsStringLiteral(["1"] as const)

/**
 * Botón «Registrar anunciante» del listado y su hoja. Al registrar lleva a la
 * ficha nueva; quien puede invitar llega a la pestaña Usuarios (si la ve)
 * para invitar a su equipo.
 */
export function BotonRegistrarAnunciante({
  catalogos,
  invitarEquipo,
  abrirUsuarios,
}: {
  catalogos: CatalogosAnunciante | null
  /** `usuarios.invitar`: el siguiente paso es invitar a su equipo. */
  invitarEquipo: boolean
  /** `usuarios.invitar` y `usuarios.ver`: la ficha se abre en la pestaña Usuarios. */
  abrirUsuarios: boolean
}) {
  const router = useRouter()
  const [registrar, setRegistrar] = useQueryState(
    "registrar",
    parametroRegistrar
  )
  const [abierta, setAbierta] = useState(registrar === "1")
  // El parámetro puede llegar con la página ya montada (enlace a la misma ruta).
  const [parametroVisto, setParametroVisto] = useState(registrar)
  if (registrar !== parametroVisto) {
    setParametroVisto(registrar)
    if (registrar === "1") setAbierta(true)
  }

  function cambiarAbierta(valor: boolean) {
    setAbierta(valor)
    if (!valor && registrar) void setRegistrar(null)
  }

  async function alRegistrar(datos: AnuncianteRegistrado) {
    toast.success("Anunciante registrado", {
      description: invitarEquipo
        ? `Ahora invita al equipo de ${datos.nombreComercial}.`
        : datos.nombreComercial,
    })
    // Sin el parámetro en el historial, «Atrás» no vuelve a abrir la hoja vacía.
    if (registrar) await setRegistrar(null)
    const ficha = rutaAnunciante(datos.id)
    router.push(abrirUsuarios ? (`${ficha}?pestana=usuarios` as Route) : ficha)
  }

  return (
    <>
      <Button onClick={() => setAbierta(true)}>
        <Plus data-icon="inline-start" aria-hidden />
        Registrar anunciante
      </Button>
      <HojaRegistroAnunciante
        abierta={abierta}
        onAbiertaChange={cambiarAbierta}
        catalogos={catalogos}
        invitarEquipo={invitarEquipo}
        onRegistrado={(datos) => void alRegistrar(datos)}
      />
    </>
  )
}

/** Mientras llegan los catálogos: el mismo botón, inactivo (sin salto de diseño). */
export function BotonRegistrarAnuncianteCargando() {
  return (
    <Button disabled aria-busy="true">
      <Plus data-icon="inline-start" aria-hidden />
      Registrar anunciante
    </Button>
  )
}
