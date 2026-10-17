import Image from "next/image";

export function EraLogo({ className }: { className: string }) {
  return (
    <span className={`era-logo ${className}`}>
      <Image
        className="era-logo-image"
        src="/era-logo.png"
        alt="ERA Technology"
        width={1254}
        height={1254}
        priority
        sizes="(max-width: 640px) 190px, 250px"
      />
    </span>
  );
}

