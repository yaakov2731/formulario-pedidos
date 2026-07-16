# DESIGN.md — Sistema de Pedidos Docks del Puerto

## Theme

Light. Escena: encargado en el local, de día, con el celular, apurado entre tareas.
Fondo claro, alto contraste, lectura rápida bajo luz ambiente fuerte. Nada de dark
"porque queda pro", nada de violeta decorativo.

## Color (OKLCH)

Neutros tintados hacia el azul portuario. Nunca `#000` / `#fff`.

| Rol | Valor | Uso |
|---|---|---|
| `--bg` | `oklch(0.975 0.009 86)` | fondo marfil |
| `--surface` | `oklch(0.993 0.005 86)` | tarjetas y paneles |
| `--ink` | `oklch(0.245 0.026 230)` | grafito azulado principal |
| `--ink-soft` | `oklch(0.47 0.025 225)` | texto secundario |
| `--line` | `oklch(0.865 0.016 220)` | bordes acero |
| `--brand` | `oklch(0.405 0.082 215)` | azul petróleo primario |
| `--brand-strong` | `oklch(0.31 0.068 220)` | azul petróleo profundo |
| `--steel` | `oklch(0.58 0.038 220)` | acento secundario acero |
| `--copper` | `oklch(0.61 0.105 55)` | detalle cobre restringido |
| `--green` | `oklch(0.62 0.13 150)` | GreenFresh + urgencia baja |
| `--amber` | `oklch(0.74 0.14 75)` | urgencia normal |
| `--red` | `oklch(0.58 0.18 25)` | urgencia urgente, eliminar |

Estrategia de color: **restrained**. Marfil, petróleo y acero forman la identidad.
El cobre aparece únicamente en líneas de profundidad, foco o marca. GreenFresh y
los estados de urgencia conservan sus colores semánticos.

## Typography

- `Inter` (ya en uso), fallback system-ui.
- Escala con contraste (ratio ≥1.25): 13 / 15 / 18 / 22 / 28.
- Jerarquía por tamaño + peso (500/600/700), no por bordes gruesos de colores.
- Line-length de observaciones ≤ 70ch.

## Profundidad 3D

- Tres niveles compartidos: `--depth-low`, `--depth-mid` y `--depth-high`.
- La profundidad se construye con borde iluminado, sombra azulada y base inferior
  corta. No se usan perspectiva, WebGL, tilt ni recursos gráficos pesados.
- En mouse el hover puede elevar como máximo 1px. En táctil cambia la sombra sin
  desplazar el control. `prefers-reduced-motion` elimina todo desplazamiento.
- En pantallas de hasta 560px las sombras pierden alcance y no usan blur decorativo.

## Buttons & controls

- **Normales.** Radio 10px. Sin `scale`, glow, shimmer ni movimientos mayores a 1px.
- Estado hover: oscurecer fondo levemente + sombra sutil. Transición 150ms ease-out.
- Tap target ≥ 44px alto, pero proporción sana (no botones gigantes).
- Selección de local/urgencia: borde + relleno tenue del color del rol + check discreto.

## Layout

- Form centrado, `max-width: 720px` en desktop. Cómodo, no estirado.
- Grilla de locales: `repeat(auto-fill, minmax(108px, 1fr))`.
- Ritmo de spacing variado por sección (no el mismo padding en todo).
- Una sola tarjeta de superficie por sección. Sin tarjetas anidadas.

## Motion

- Solo `opacity` y `transform` puntuales (entrada de filas, check y hover de 1px). Ease-out.
- Nada de gradientes animados de fondo.
- Todos los efectos deben tener alternativa bajo `prefers-reduced-motion`.

## Bans (heredados de impeccable)

Sin side-stripe borders, sin gradient text, sin glassmorphism decorativo, sin
hero-metric template, sin grilla de tarjetas idénticas infinitas, sin em dashes en copy.
