import Letterhead from "@/components/Letterhead";

export default function Home() {
  return (
    <main className="page-shell">
      <div className="document">
        <div className="document-card">
          <Letterhead title="Tanwir Institute" />
          <div className="message-body">
            <p>This link only works from a scholarship consent email.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
