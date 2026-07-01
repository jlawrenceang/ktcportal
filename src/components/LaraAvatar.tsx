export default function LaraAvatar({ size = 24 }: { size?: number }) {
  return (
    <img
      src="/lara-avatar.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        borderRadius: '999px',
        objectFit: 'cover',
        display: 'block',
      }}
      draggable={false}
    />
  )
}
