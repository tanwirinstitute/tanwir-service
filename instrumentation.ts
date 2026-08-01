export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startZakatConsentScheduler } = await import("@/server/scheduler");
    startZakatConsentScheduler();
  }
}
