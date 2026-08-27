import Image from "next/image";

export default function Page() {
  return (
    <main className="landing-shell">
      <Image src="/logo.webp" alt="Tanwir Institute" width={56} height={60} className="brand-logo" priority />
      <h1>Tanwir Admin</h1>
      <p>Coming soon.</p>
    </main>
  );
}
