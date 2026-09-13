export default function Logo({ className = 'size-7' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="capashio-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0a0a0a" />
          <stop offset="1" stopColor="#6b6b6b" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#capashio-gradient)" />
      <circle
        cx="16"
        cy="16"
        r="7.5"
        fill="none"
        stroke="white"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeDasharray="34 13.1"
        transform="rotate(50 16 16)"
      />
      <circle cx="16" cy="16" r="2.6" fill="white" />
    </svg>
  )
}
