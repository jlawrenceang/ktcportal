import { useEffect, useRef, useState } from 'react'

// Public landing hero background — a dependency-free crossfade slideshow of the
// owner's real KTC terminal aerials. Five 1920px-wide optimized JPEGs
// (public/photos/*.jpg — the owner's real KTC aerials) are stacked + cross-faded ~5s apart.
//
// Behaviour:
//  · prefers-reduced-motion → no timer, no transition; ONLY the first slide is
//    mounted and shown (a single static still — nothing animates, nothing else
//    even downloads).
//  · pause-on-hover → advancing pauses while the pointer is anywhere over the
//    hero. Listeners attach to this component's positioned parent (the hero
//    wrapper), so hovering the sign-in card sitting on top counts too. It also
//    pauses while the browser tab is hidden.
//  · the first image loads eagerly (it is the landing's LCP); the rest decode
//    async and load lazily so they never block first paint.
// Decorative only — aria-hidden with empty alts.

type Slide = { src: string; pos: string }

// pos = object-position focal point so the cranes / yard / waterline stay in
// frame when the 16:9 photo is cover-cropped (notably a phone's tall viewport).
const SLIDES: Slide[] = [
  { src: '/photos/1.jpg', pos: 'center 55%' },  // wide aerial — terminal peninsula, cranes, water
  { src: '/photos/16.jpg', pos: 'center 50%' }, // two vessels berthed at the quay
  { src: '/photos/8.jpg', pos: 'center 50%' },  // yard + teal waterline + cement silos
  { src: '/photos/3.jpg', pos: 'center 50%' },  // terminal aerial
  { src: '/photos/11.jpg', pos: 'center 50%' }, // terminal aerial
]

const INTERVAL_MS = 5000
const FADE_MS = 1200

export default function HeroSlideshow() {
  const rootRef = useRef<HTMLDivElement>(null)
  const pausedRef = useRef(false)
  const [index, setIndex] = useState(0)
  const [reduced, setReduced] = useState(false)

  // Track the reduced-motion preference (and react to live changes).
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduced(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  // Pause advancing while the pointer is over the hero, or the tab is hidden.
  useEffect(() => {
    const host = rootRef.current?.parentElement
    if (!host) return
    const enter = () => { pausedRef.current = true }
    const leave = () => { pausedRef.current = false }
    host.addEventListener('pointerenter', enter)
    host.addEventListener('pointerleave', leave)
    return () => {
      host.removeEventListener('pointerenter', enter)
      host.removeEventListener('pointerleave', leave)
    }
  }, [])

  // Auto-advance. Disabled entirely under reduced-motion or with a single slide.
  useEffect(() => {
    if (reduced || SLIDES.length < 2) return
    const id = window.setInterval(() => {
      if (pausedRef.current || document.hidden) return
      setIndex((i) => (i + 1) % SLIDES.length)
    }, INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [reduced])

  // Reduced-motion shows a single still — mount only the first slide.
  const slides = reduced ? SLIDES.slice(0, 1) : SLIDES
  const current = reduced ? 0 : index

  return (
    <div ref={rootRef} aria-hidden="true" className="ktc-landing__media">
      {slides.map((s, i) => (
        <img
          key={s.src}
          src={s.src}
          alt=""
          loading={i === 0 ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: s.pos,
            opacity: i === current ? 1 : 0,
            transition: reduced ? 'none' : `opacity ${FADE_MS}ms ease-in-out`,
            willChange: 'opacity',
          }}
        />
      ))}
    </div>
  )
}
