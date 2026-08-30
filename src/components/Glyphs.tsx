import type { Archetype } from '../data/types'

/**
 * Ten hand-inked glyphs, one per archetype. A pin on this map should tell you
 * what kind of room you are looking at before you ever tap it — a drum means
 * somebody roasts here, a keyhole means you will walk past the door twice.
 */

export function Glyph({ archetype, color }: { archetype: Archetype; color: string }) {
  const s = {
    fill: 'none',
    stroke: color,
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (archetype) {
    case 'standing-bar':
      return (
        <g {...s}>
          <path d="M-5.4 3.2 h10.8" />
          <path d="M-2.8 -3.6 h5.2 v3.4 a2.6 2.6 0 0 1 -5.2 0 z" />
          <path d="M2.4 -2.9 a1.9 1.9 0 0 1 0 3.1" />
          <path d="M-0.2 0.8 v2.3" />
        </g>
      )
    case 'lane-house':
      return (
        <g {...s}>
          <path d="M-5.2 0.4 l5.2 -4.4 l5.2 4.4" />
          <path d="M-3.9 0 v4 h7.8 v-4" />
          <path d="M-1 4 v-2.6 h2 v2.6" />
        </g>
      )
    case 'roastery':
      return (
        <g {...s}>
          <circle cx="0" cy="0" r="4.4" />
          <path d="M-2.2 1.4 a2.4 2.4 0 0 1 2.2 -3.4 a2.4 2.4 0 0 1 1.6 4" />
          <path d="M-5.6 4.6 h11.2" />
        </g>
      )
    case 'garden':
      return (
        <g {...s}>
          <path d="M0 4.6 v-4" />
          <path d="M0 0.6 a3.6 3.2 0 1 1 0.1 0 z" />
          <path d="M-2 2.2 l2 -1.4 l2 1.4" />
        </g>
      )
    case 'laboratory':
      return (
        <g {...s}>
          <path d="M-1.5 -4.4 h3" />
          <path d="M-0.9 -4.2 v3.1 l-3.1 4.6 a1.4 1.4 0 0 0 1.2 2.2 h5.6 a1.4 1.4 0 0 0 1.2 -2.2 l-3.1 -4.6 v-3.1" />
          <path d="M-2.6 1.6 h5.2" />
        </g>
      )
    case 'gallery':
      return (
        <g {...s}>
          <rect x="-4.6" y="-4.2" width="9.2" height="8.4" rx="0.6" />
          <path d="M-3 2.2 l2.6 -3.4 l1.9 2.2 l1.4 -1.4 l1.3 2.6" />
          <circle cx="2.2" cy="-2" r="0.9" />
        </g>
      )
    case 'riverside':
      return (
        <g {...s}>
          <path d="M-5.2 -1.6 q2.6 -2.2 5.2 0 q2.6 2.2 5.2 0" />
          <path d="M-5.2 1.6 q2.6 -2.2 5.2 0 q2.6 2.2 5.2 0" />
          <path d="M-5.2 4.4 q2.6 -2.2 5.2 0 q2.6 2.2 5.2 0" />
        </g>
      )
    case 'neighborhood':
      return (
        <g {...s}>
          <path d="M-3.6 -2.6 h6.2 v3.6 a3.1 3.1 0 0 1 -6.2 0 z" />
          <path d="M2.6 -1.8 a2 2 0 0 1 0 3.4" />
          <path d="M-5.4 4.4 h10.4" />
        </g>
      )
    case 'bakery':
      return (
        <g {...s}>
          <path d="M-4.8 2.6 a5.4 5.4 0 0 1 9.6 0" />
          <path d="M-2.2 2.6 a3 4.4 0 0 1 4.4 0" />
          <path d="M-4.8 2.6 h9.6" />
        </g>
      )
    case 'hidden-door':
      return (
        <g {...s}>
          <path d="M-3.6 4.4 v-5.2 a3.6 3.6 0 0 1 7.2 0 v5.2 z" />
          <circle cx="0" cy="0.4" r="1.2" />
          <path d="M0 1.6 v1.6" />
        </g>
      )
  }
}
