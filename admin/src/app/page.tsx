import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/session";
import SignOutButton from "./SignOutButton";

// Reads the session cookie, so it can never be statically cached.
export const dynamic = "force-dynamic";

/**
 * Admin tools reachable from the home hub. Add entries here as pages are
 * exposed; each still enforces its own session check server-side.
 */
const TOOLS: { href: string; title: string; description: string }[] = [
  {
    href: "/dashboard",
    title: "Registrations",
    description: "Course registrations and materials pickup",
  },
  {
    href: "/email",
    title: "Email Console",
    description: "Compose and send email to students",
  },
];

export default async function HomePage() {
  const session = await verifySession();
  if (!session) {
    redirect("/login");
  }

  return (
    <main className="home-shell">
      <header className="home-header">
        <div className="brand">
          <Image src="/logo.webp" alt="Tanwir Institute" width={44} height={48} className="brand-logo" priority />
          <div>
            <h1>Tanwir Admin</h1>
            {session.email && <p className="home-subtitle">{session.email}</p>}
          </div>
        </div>
        <SignOutButton />
      </header>

      <nav className="home-grid">
        {TOOLS.map((tool) => (
          <Link key={tool.href} href={tool.href} className="home-card">
            <span className="home-card-title">{tool.title}</span>
            <span className="home-card-desc">{tool.description}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
