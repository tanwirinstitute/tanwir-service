"use client";

import Letterhead from "@/components/Letterhead";

export default function ConsentError() {
  return (
    <main className="page-shell">
      <div className="document">
        <div className="document-card">
          <Letterhead title="Something Went Wrong" />
          <div className="message-body">
            <p>Please try again, or contact us if the problem persists.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
