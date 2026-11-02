export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { seedDatabase } = await import("@/lib/seed");
    const result = await seedDatabase();
    if (!result.skipped) {
      console.log(`[E-SURAT] Data awal berhasil dibuat (${result.summary}).`);
    }
  } catch (error) {
    console.error(
      "[E-SURAT] Inisialisasi data awal dilewati:",
      error instanceof Error ? error.message : error,
    );
  }
}
