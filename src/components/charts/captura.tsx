"use client"

import type { ReactNode } from "react"
import { createRoot } from "react-dom/client"

import {
  componerImagenGrafico,
  lienzoAPng,
  type OpcionesImagenGrafico,
} from "@/lib/export/imagen"
import type { ImagenPng } from "@/lib/export/logo"

import {
  ContextoRegistroGrafico,
  type GraficoRegistrado,
} from "./contexto-grafico"
import type { ModoTema } from "./paleta"
import { construirTemaGraficos, estiloLienzo } from "./tema"
import { ContextoTemaForzado } from "./use-tema-graficos"

type Composicion = Pick<
  OpcionesImagenGrafico,
  "titulo" | "descripcion" | "pie" | "conSello"
>

export interface OpcionesCaptura extends Composicion {
  /** Tamaño CSS del área del gráfico. */
  ancho?: number
  alto?: number
  /** Tema de la imagen: los PDF van en claro aunque la app esté en oscuro. */
  modo?: ModoTema
  /** Píxeles por punto CSS (2 = nítido al imprimir). */
  densidad?: number
  /** Espera máxima a que el gráfico se dibuje. */
  esperaMaximaMs?: number
}

const siguienteCuadro = () =>
  new Promise<void>((resolver) => requestAnimationFrame(() => resolver()))

async function esperarLienzo(
  leer: () => HTMLCanvasElement | null,
  esperaMaximaMs: number
): Promise<HTMLCanvasElement> {
  const limite = performance.now() + esperaMaximaMs
  while (performance.now() < limite) {
    const lienzo = leer()
    if (lienzo && lienzo.width > 0 && lienzo.height > 0) {
      // Chart.js ajusta el tamaño al observar el contenedor: dos cuadros más.
      await siguienteCuadro()
      await siguienteCuadro()
      return lienzo
    }
    await siguienteCuadro()
  }
  throw new Error("El gráfico no se dibujó a tiempo para la captura")
}

function contenedorFueraDePantalla(ancho: number, alto: number) {
  const contenedor = document.createElement("div")
  contenedor.setAttribute("aria-hidden", "true")
  Object.assign(contenedor.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${ancho}px`,
    height: `${alto}px`,
    pointerEvents: "none",
  })
  document.body.append(contenedor)
  return contenedor
}

/**
 * Dibuja un gráfico fuera de pantalla en el tema pedido (claro por defecto),
 * sin animación y a doble densidad, y devuelve el lienzo compuesto con su
 * leyenda. Lo usa "Exportar PNG"; para documentos, `capturarGrafico`.
 */
export async function capturarLienzo(
  grafico: ReactNode,
  {
    ancho = 960,
    alto = 380,
    modo = "claro",
    densidad = 2,
    esperaMaximaMs = 4000,
    conSello = false,
    ...composicion
  }: OpcionesCaptura = {}
): Promise<HTMLCanvasElement> {
  // Salir del contexto síncrono del llamador: dentro de una acción de
  // `useTransition`, React retendría este render hasta que la acción
  // termine (y la acción espera a este render).
  await siguienteCuadro()
  const contenedor = contenedorFueraDePantalla(ancho, alto)
  const raiz = createRoot(contenedor)
  // Objeto contenedor: el gráfico se registra desde un efecto (otro turno).
  const captura: { grafico: GraficoRegistrado | null } = { grafico: null }
  const registrar = (registrado: GraficoRegistrado | null) => {
    if (registrado) captura.grafico = registrado
  }

  try {
    raiz.render(
      <ContextoTemaForzado value={{ modo, densidad }}>
        <ContextoRegistroGrafico value={registrar}>
          {grafico}
        </ContextoRegistroGrafico>
      </ContextoTemaForzado>
    )
    const lienzo = await esperarLienzo(
      () => captura.grafico?.instancia.current?.canvas ?? null,
      esperaMaximaMs
    )
    const fuente = getComputedStyle(document.documentElement).getPropertyValue(
      "--font-geist-sans"
    )
    return componerImagenGrafico(lienzo, {
      estilo: estiloLienzo(construirTemaGraficos({ modo, fuente })),
      leyenda: captura.grafico?.leyenda,
      leyendaAlLado: captura.grafico?.leyendaAlLado,
      conSello,
      ...composicion,
    })
  } finally {
    raiz.unmount()
    contenedor.remove()
  }
}

/**
 * Imagen de un gráfico para incrustar en un PDF (`SeccionPdf` de tipo
 * "imagen"): en claro, sin animación, a doble densidad y con su leyenda.
 *
 * @example
 * const imagen = await capturarGrafico(
 *   <GraficoCombo titulo="GMV y take rate" etiquetas={meses} barras={…} linea={…} />,
 *   { ancho: 960, alto: 380 }
 * )
 */
export async function capturarGrafico(
  grafico: ReactNode,
  opciones: OpcionesCaptura = {}
): Promise<ImagenPng> {
  return lienzoAPng(await capturarLienzo(grafico, opciones))
}
