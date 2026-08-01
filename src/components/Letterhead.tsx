import Image from "next/image";

const LOGO_URL =
  "https://images.squarespace-cdn.com/content/66a00d45db79b1271d17284d/f596f1b5-33ae-4fde-b6e1-3a6c9beb0deb/tanwir-horizontal.png";

export default function Letterhead({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="letterhead">
      <div className="logo-chip">
        <Image
          src={LOGO_URL}
          alt="Tanwir Institute — Knowledge and Remembrance"
          width={2500}
          height={733}
          priority
        />
      </div>
      <h1>{title}</h1>
      {subtitle && <p className="subtitle">{subtitle}</p>}
    </div>
  );
}
