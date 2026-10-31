/** Runs once when the server starts, after `docker-migrate.mjs` has committed every migration. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build")
    return;
  const { sortStoredRejectionsOnce } = await import("@/features/mail/rejection-sort");
  // A new enum value can't be used in the transaction that adds it, so this can't be a migration.
  await sortStoredRejectionsOnce().catch((error) =>
    console.error("Sorting stored rejection mail failed", error),
  );
}
