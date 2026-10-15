/**
 * Lámina de pruebas: isotipo en tamaños críticos, logos sobre ambos fondos,
 * iconos de app y ampliación de píxeles reales del favicon.
 */
import { LILA, NEUTRO } from "../../src/components/brand/colores"

export interface EntradaLamina {
  readonly svgs: Readonly<
    Record<
      | "isotipo"
      | "isotipoProfundo"
      | "isotipoMono"
      | "isotipoCompacto"
      | "horizontalOscuro"
      | "horizontalClaro"
      | "horizontalDescriptorOscuro"
      | "horizontalDescriptorClaro"
      | "verticalOscuro"
      | "verticalClaro"
      | "verticalDescriptorOscuro"
      | "verticalDescriptorClaro"
      | "mono"
      | "appIcon"
      | "maskable"
      | "favicon",
      string
    >
  >
  readonly pixeles: Readonly<
    Record<"favicon16" | "favicon32" | "ico16" | "ico32", Buffer>
  >
}

const svgUrl = (svg: string) =>
  `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
const pngUrl = (png: Buffer) =>
  `data:image/png;base64,${png.toString("base64")}`

const img = (svg: string, alto: number) =>
  `<img src="${svgUrl(svg)}" style="height:${alto}px;width:auto;display:block" alt="">`

/** Dentro de <img> no se hereda `color`: se fija el tono de las versiones mono. */
const mono = (svg: string, color: string, alto: number) =>
  img(svg.replaceAll("currentColor", color), alto)

const ampliado = (png: Buffer, lado: number, factor: number) =>
  `<img src="${pngUrl(png)}" style="width:${lado * factor}px;height:${lado * factor}px;image-rendering:pixelated;display:block" alt="">`

function fila(etiqueta: string, contenido: string) {
  return `<div class="fila"><span class="etiqueta">${etiqueta}</span><div class="items">${contenido}</div></div>`
}

function panel(fondo: "oscuro" | "claro", contenido: string) {
  return `<section class="panel ${fondo}">${contenido}</section>`
}

function pestana(fondo: "oscuro" | "claro", favicon: string) {
  return `<div class="pestana ${fondo}"><img src="${svgUrl(favicon)}" width="16" height="16" alt=""><span>Inicio · AMO</span></div>`
}

export function construirLamina({ svgs, pixeles }: EntradaLamina): string {
  const tamanos = [16, 24, 32, 48, 64, 128]
  const isotipos = (svg: string) => tamanos.map((t) => img(svg, t)).join("")

  const bloqueTema = (tema: "oscuro" | "claro") => {
    const oscuro = tema === "oscuro"
    const iso = oscuro ? svgs.isotipo : svgs.isotipoProfundo
    return panel(
      tema,
      `<h2>Fondo ${oscuro ? "oscuro " + NEUTRO.fondoOscuro : "claro " + NEUTRO.fondoClaro}</h2>` +
        fila("Isotipo 16–128", isotipos(iso)) +
        fila(
          "Compacto 16/24/32",
          [16, 24, 32].map((t) => img(svgs.isotipoCompacto, t)).join("")
        ) +
        fila(
          "Mono",
          [16, 32, 64]
            .map((t) =>
              mono(svgs.isotipoMono, oscuro ? "#FFFFFF" : NEUTRO.fondoOscuro, t)
            )
            .join("")
        ) +
        fila(
          "Horizontal 24/32/48",
          [24, 32, 48]
            .map((t) =>
              img(oscuro ? svgs.horizontalOscuro : svgs.horizontalClaro, t)
            )
            .join("")
        ) +
        fila(
          "Horizontal 96",
          img(oscuro ? svgs.horizontalOscuro : svgs.horizontalClaro, 96)
        ) +
        fila(
          "Con descriptor 72",
          img(
            oscuro
              ? svgs.horizontalDescriptorOscuro
              : svgs.horizontalDescriptorClaro,
            72
          )
        ) +
        fila(
          "Vertical",
          img(oscuro ? svgs.verticalOscuro : svgs.verticalClaro, 150) +
            img(
              oscuro
                ? svgs.verticalDescriptorOscuro
                : svgs.verticalDescriptorClaro,
              200
            )
        )
    )
  }

  const iconos = panel(
    "oscuro",
    `<h2>Iconos de app y favicon</h2>` +
      fila(
        "App 180/64/32",
        [180, 64, 32].map((t) => img(svgs.appIcon, t)).join("") +
          `<div class="seguro">${img(svgs.maskable, 180)}<i></i></div>`
      ) +
      fila(
        "Píxeles reales ×8/×4",
        ampliado(pixeles.favicon16, 16, 8) +
          ampliado(pixeles.favicon32, 32, 4) +
          ampliado(pixeles.ico16, 16, 8) +
          ampliado(pixeles.ico32, 32, 4)
      ) +
      fila(
        "Pestañas",
        pestana("oscuro", svgs.favicon) + pestana("claro", svgs.favicon)
      )
  )

  const sobreLila = `<section class="panel lila">${fila("Mono sobre lila", mono(svgs.mono, "#FFFFFF", 48))}</section>`

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
    body{margin:0;font:13px/1.4 system-ui,sans-serif;background:#000}
    .panel{padding:24px 32px}
    .oscuro{background:${NEUTRO.fondoOscuro};color:#b9b0cc}
    .claro{background:${NEUTRO.fondoClaro};color:#5d5670}
    .lila{background:${LILA[600]};color:#fff}
    h2{margin:0 0 12px;font-size:14px;font-weight:600;letter-spacing:.02em}
    .fila{display:flex;align-items:center;gap:24px;padding:10px 0;border-top:1px solid #8881}
    .etiqueta{width:150px;flex:none;opacity:.8}
    .items{display:flex;align-items:center;gap:28px;flex-wrap:wrap}
    .seguro{position:relative}
    .seguro i{position:absolute;inset:10%;border:1px dashed #fff9;border-radius:50%}
    .pestana{display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:8px 8px 0 0;width:200px}
    .pestana.oscuro{background:#35363a;color:#e8eaed}
    .pestana.claro{background:#fff;color:#202124;box-shadow:0 0 0 1px #dadce0}
  </style></head><body>${bloqueTema("oscuro")}${bloqueTema("claro")}${iconos}${sobreLila}</body></html>`
}
