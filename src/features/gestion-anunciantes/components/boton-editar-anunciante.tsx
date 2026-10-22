"use client"

import { PencilLine } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"

import type { AnuncianteEditable, CatalogosAnunciante } from "../tipos"
import { HojaEdicionAnunciante } from "./hoja-anunciante"

/** Botón «Editar datos» de la ficha del anunciante y su hoja. */
export function BotonEditarAnunciante({
  anunciante,
  catalogos,
}: {
  anunciante: AnuncianteEditable
  catalogos: CatalogosAnunciante | null
}) {
  const [abierta, setAbierta] = useState(false)
  return (
    <>
      <Button variant="outline" onClick={() => setAbierta(true)}>
        <PencilLine data-icon="inline-start" aria-hidden />
        Editar datos
      </Button>
      <HojaEdicionAnunciante
        abierta={abierta}
        onAbiertaChange={setAbierta}
        catalogos={catalogos}
        anunciante={anunciante}
      />
    </>
  )
}
