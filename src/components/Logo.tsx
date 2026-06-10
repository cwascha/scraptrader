export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg
        width="40"
        height="40"
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="40" height="40" rx="8" fill="#2d5f8a" />
        <path
          d="M10 28L15 12H19L14 28H10Z"
          fill="#e8a838"
        />
        <path
          d="M18 28L23 12H27L22 28H18Z"
          fill="#e8a838"
        />
        <path
          d="M26 28L31 12H35L30 28H26Z"
          fill="white"
        />
        <rect x="8" y="18" width="26" height="3" rx="1.5" fill="white" opacity="0.3" />
      </svg>
      <div className="flex flex-col leading-tight">
        <span className="text-xl font-black tracking-tight text-brand-dark">
          SCRAP
        </span>
        <span className="text-xl font-black tracking-tight text-accent">
          TRADER
        </span>
      </div>
    </div>
  );
}

export function LogoMark() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="40" height="40" rx="8" fill="#2d5f8a" />
      <path d="M10 28L15 12H19L14 28H10Z" fill="#e8a838" />
      <path d="M18 28L23 12H27L22 28H18Z" fill="#e8a838" />
      <path d="M26 28L31 12H35L30 28H26Z" fill="white" />
      <rect x="8" y="18" width="26" height="3" rx="1.5" fill="white" opacity="0.3" />
    </svg>
  );
}
