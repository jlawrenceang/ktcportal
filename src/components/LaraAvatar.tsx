// Lara's face — a friendly young-woman assistant avatar (replaces the old chat-bubble
// glyph). White face + hair via currentColor; eyes + smile in the brand accent. Sized to
// sit inside the orange launcher / header circles. (SVG generated with codex/GPT, then
// theme-colored + tidied.)
export default function LaraAvatar({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 2.6c-4 0-7.1 3.1-7.1 7.3v4.5c0 3.9 3.2 7 7.1 7s7.1-3.1 7.1-7V9.9c0-4.2-3.1-7.3-7.1-7.3Zm0 2.1c2.8 0 4.9 2.1 4.9 5.2v.4c-2.5-.2-4.5-1.1-5.9-2.7-1.1 1.8-2.5 2.8-3.9 3.1v-.8c0-3.1 2.1-5.2 4.9-5.2Z" />
      <path fill="currentColor" d="M7.1 11.1c1.6-.3 3-1.2 4-2.7 1.5 1.4 3.4 2.2 5.8 2.4v3.5c0 2.7-2.2 4.9-4.9 4.9s-4.9-2.2-4.9-4.9v-3.2Z" />
      <path fill="currentColor" d="M6.2 13.2c-.9 0-1.6.7-1.6 1.7s.7 1.7 1.6 1.7h1v-3.4h-1Zm11.6 0h-1v3.4h1c.9 0 1.6-.7 1.6-1.7s-.7-1.7-1.6-1.7Z" />
      <path fill="var(--acc-2)" d="M9.4 12.4a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Zm5.2 0a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Z" />
      <path d="M9.7 16.1c.6.7 1.4 1.1 2.3 1.1s1.7-.4 2.3-1.1" fill="none" stroke="var(--acc-2)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}
