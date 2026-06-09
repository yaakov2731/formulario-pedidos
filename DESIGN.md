# DESIGN.md — Sistema de Pedidos Docks del Puerto

## Theme

Light. Escena: encargado en el local, de día, con el celular, apurado entre tareas.
Fondo claro, alto contraste, lectura rápida bajo luz ambiente fuerte. Nada de dark
"porque queda pro", nada de violeta decorativo.

## Color (OKLCH)

Neutros tintados hacia el azul portuario. Nunca `#000` / `#fff`.

| Rol | Valor | Uso |
|---|---|---|
| `--bg` | `oklch(0.985 0.004 230)` | fondo app |
| `--surface` | `oklch(1 0 0 / 1)` tint `oklch(0.995 0.003 230)` | tarjetas, panel |
| `--ink` | `oklch(0.27 0.02 240)` | texto principal |
| `--ink-soft` | `oklch(0.50 0.02 240)` | texto secundario |
| `--line` | `oklch(0.90 0.008 240)` | bordes |
| `--brand` | `oklch(0.55 0.11 225)` | acento marino (puerto) — primario |
| `--brand-strong` | `oklch(0.45 0.12 235)` | hover / activo |
| `--green` | `oklch(0.62 0.13 150)` | GreenFresh + urgencia baja |
| `--amber` | `oklch(0.74 0.14 75)` | urgencia normal |
| `--red` | `oklch(0.58 0.18 25)` | urgencia urgente, eliminar |

Estrategia de color: **restrained**. Neutros + un acento marino. GreenFresh y los
estados de urgencia son los únicos colores fuertes, y siempre con significado.

## Typography

- `Inter` (ya en uso), fallback system-ui.
- Escala con contraste (ratio ≥1.25): 13 / 15 / 18 / 22 / 28.
- Jerarquía por tamaño + peso (500/600/700), no por bordes gruesos de colores.
- Line-length de observaciones ≤ 70ch.

## Buttons & controls

- **Normales.** Radio 10px. Sin `scale`, sin `translateY` saltarín, sin glow, sin shimmer.
- Estado hover: oscurecer fondo levemente + sombra sutil. Transición 150ms ease-out.
- Tap target ≥ 44px alto, pero proporción sana (no botones gigantes).
- Selección de local/urgencia: borde + relleno tenue del color del rol + check discreto.

## Layout

- Form centrado, `max-width: 720px` en desktop. Cómodo, no estirado.
- Grilla de locales: `repeat(auto-fill, minmax(108px, 1fr))`.
- Ritmo de spacing variado por sección (no el mismo padding en todo).
- Una sola tarjeta de superficie por sección. Sin tarjetas anidadas.

## Motion

- Solo `opacity` y `transform` puntuales (entrada de filas, check). Ease-out.
- Nada de gradientes animados de fondo.

## Bans (heredados de impeccable)

Sin side-stripe borders, sin gradient text, sin glassmorphism decorativo, sin
hero-metric template, sin grilla de tarjetas idénticas infinitas, sin em dashes en copy.
