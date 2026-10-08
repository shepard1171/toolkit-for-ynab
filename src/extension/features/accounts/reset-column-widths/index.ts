import { Feature } from 'toolkit/extension/features/feature';
import { getRegisterGridService, isCurrentRouteAccountsPage } from 'toolkit/extension/utils/ynab';

const STYLE_ELEMENT_ID = 'tk-column-width-balance';

// Preferred minimum pixel widths for columns YNAB's percentage-based grid can
// otherwise squeeze illegibly thin. Dragging any column's resize handle moves
// its entire width delta onto the single next column in the row (see
// adjustColumnsAfterChange in registerGrid) rather than spreading it out, and
// YNAB's own minimum-width guards on the Flag/Image columns can in turn steal
// from Account when the window narrows - there's nothing stopping that chain
// from reaching Date. 85px fits "MM/DD/YYYY" in YNAB's UI font; 180px shows
// most real account names without truncation; 150px covers most real
// "Group: Category" combinations (measured samples ran 84-323px, with most
// everyday ones under 160px) without trying to fit the longest outliers.
// Measured live 2026-09-05.
const PREFERRED_COLUMN_WIDTHS_PX: Record<string, number> = {
  date: 85,
  accountName: 180,
  subCategoryName: 150,
};

// Memo is the column to shrink first to make room: it's frequently empty or
// short, unlike Date/Account/Category which always hold content. Never take
// it below this so a memo that does have text stays readable. Category used
// to be the free fallback for whatever Memo couldn't cover, since it's the
// one column YNAB never assigns an explicit width rule (see
// _buildCSSWidthRule) and so absorbs any remainder automatically under this
// grid's table-layout: fixed - but now that it has its own floor above, that
// only holds while Category is comfortably above its floor already. If Memo
// alone can't cover every deficit once all three floors are in play, the
// leftover simply isn't reclaimed from anywhere (better an honest overflow
// than silently crushing one more column to compensate).
const DONOR_COLUMN = 'memo';
const DONOR_MIN_WIDTH_PX = 60;

export class ResetColumnWidths extends Feature {
  addButton() {
    if (document.querySelector('#tk-reset-column-widths')) {
      return;
    }

    $('.modal-account-view-options .modal-actions').append(
      $('<button>', {
        class: 'button button-cancel',
        text: 'Reset Column Widths',
      })
        .css({ float: 'left' })
        .on('click', () => {
          getRegisterGridService()?.saveColumnSizes();
        }),
    );
  }

  observe(changedNodes: Set<string>) {
    if (changedNodes.has('modal')) {
      this.addButton();
    }

    if (isCurrentRouteAccountsPage()) {
      this.balanceColumnWidths();
    }
  }

  onRouteChanged() {
    if (isCurrentRouteAccountsPage()) {
      this.balanceColumnWidths();
    }
  }

  destroy() {
    document.getElementById(STYLE_ELEMENT_ID)?.remove();
  }

  /**
   * Tops up Date/Account/Category toward their preferred widths by borrowing
   * from Memo, based on YNAB's own persisted percentages rather than the
   * currently-rendered DOM (which may already carry our own prior override)
   * - so this settles back down on its own if Memo gets longer or the
   * columns get manually resized to something already comfortable.
   */
  balanceColumnWidths() {
    const registerGrid = getRegisterGridService();
    const header = document.querySelector<HTMLElement>('.ynab-grid-header');
    const columnSizes = registerGrid?.columnSizes;

    if (!registerGrid || !header || !columnSizes) {
      return;
    }

    const totalWidth = header.getBoundingClientRect().width;
    if (!totalWidth) {
      return;
    }

    let remainingDeficitPx = 0;
    const overrides: Record<string, number> = {};

    for (const [column, preferredPx] of Object.entries(PREFERRED_COLUMN_WIDTHS_PX)) {
      const currentPercent = columnSizes[column];
      if (currentPercent === undefined) {
        // Column isn't currently visible (native hide, or Toolkit's
        // ToggleAccountColumns for memo) - nothing to balance.
        continue;
      }

      const currentPx = (currentPercent / 100) * totalWidth;
      if (currentPx < preferredPx) {
        remainingDeficitPx += preferredPx - currentPx;
        overrides[column] = preferredPx;
      }
    }

    if (remainingDeficitPx > 0) {
      const donorPercent = columnSizes[DONOR_COLUMN];
      if (donorPercent !== undefined) {
        const donorPx = (donorPercent / 100) * totalWidth;
        const donorAvailablePx = Math.max(0, donorPx - DONOR_MIN_WIDTH_PX);
        const donorGivePx = Math.min(donorAvailablePx, remainingDeficitPx);

        if (donorGivePx > 0) {
          overrides[DONOR_COLUMN] = donorPx - donorGivePx;
        }
      }
      // Any deficit Memo still can't cover past this point just isn't
      // reclaimed - see the DONOR_COLUMN comment above.
    }

    this.applyOverrides(overrides, totalWidth);
  }

  applyOverrides(overrides: Record<string, number>, totalWidth: number) {
    let styleElement = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;

    if (Object.keys(overrides).length === 0) {
      styleElement?.remove();
      return;
    }

    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = STYLE_ELEMENT_ID;
      document.head.appendChild(styleElement);
    }

    const cssText = Object.entries(overrides)
      .map(
        ([column, px]) =>
          `.ynab-grid-cell-${column} { width: ${(px / totalWidth) * 100}% !important; }`,
      )
      .join(' ');

    if (styleElement.textContent !== cssText) {
      styleElement.textContent = cssText;
    }
  }
}
