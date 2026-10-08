export interface YNABRegisterGridService {
  saveColumnSizes(): void;
  /**
   * Percentage width (0-100) YNAB has persisted for each currently-visible
   * register column, keyed by column id (e.g. "date", "accountName",
   * "memo"). A column that's hidden (including Toolkit's CSS-only
   * ToggleAccountColumns memo hide) is simply absent from this object.
   * Verified live 2026-09-05 via `service:registerGrid` - see
   * docs/ynab-internals.md for how to re-check this against the running app.
   */
  columnSizes: Record<string, number>;
}
