import Letterhead from "@/components/Letterhead";

export default function ConsentNotFound() {
  return (
    <main className="page-shell">
      <div className="document">
        <div className="document-card">
          <Letterhead title="We Couldn't Find That Record" />
          <div className="message-body">
            <p>Please contact us if this is unexpected.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
