"use client"

import type { Route } from "next"
import { type ComponentProps, useEffect } from "react"

import { EnlaceBoton } from "@/components/layout/enlace-boton"

import { tituloCola } from "../colas"

/**
 * Cuándo se pulsó «Anteriores» o «Siguientes»: la lista que llegue lleva el
 * foco al título de la cola. Vive en el módulo (no en un estado) porque el
 * enlace pulsado se desmonta con la página que deja.
 */
let paginadoEn = 0

/**
 * Una navegación que no llegó (se fue a otra parte) no mueve el foco la
 * próxima vez que se abra la cola.
 */
const VIGENCIA_MS = 15_000

/** Marca la paginación para `FocoTrasPaginar` (exportada para las pruebas). */
export function marcarPaginacion(): void {
  paginadoEn = Date.now()
}

/**
 * Enlace de paginación de una cola de validación. Cambiar de página monta la
 * lista de nuevo (con el enlace que tenía el foco) y, sin esto, el foco
 * caería en `<body>` con la vista al pie de la página.
 */
export function EnlacePaginaCola({
  href,
  onClick,
  ...props
}: Omit<ComponentProps<typeof EnlaceBoton>, "href"> & { href: Route }) {
  return (
    <EnlaceBoton
      href={href}
      scroll={false}
      onClick={(evento) => {
        marcarPaginacion()
        onClick?.(evento)
      }}
      {...props}
    />
  )
}

/**
 * Montado con la lista de la cola: si llegó por paginación, lleva el foco al
 * título de la cola (lo anuncia el lector de pantalla y la vista sube hasta
 * él) para recorrer la página nueva desde el principio.
 */
export function FocoTrasPaginar() {
  useEffect(() => {
    if (Date.now() - paginadoEn > VIGENCIA_MS) return
    paginadoEn = 0
    tituloCola()?.focus()
  }, [])
  return null
}
