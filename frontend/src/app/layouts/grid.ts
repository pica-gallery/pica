import type {Child, LayoutHelper} from '../components/list-view/list-view.component';
import {columnCount} from '../util';

export type GridLayoutConfig = {
  maxColumnWidth: number,
  gapX: number,
  gapY: number,
  paddingTop?: string,
}

export function gridLayout(config: GridLayoutConfig) {
  return function gridLayout(helper: LayoutHelper): void {
    const columns = columnCount(window.innerWidth - 2 * config.gapX, config.maxColumnWidth);

    const itemWidth = (window.innerWidth - config.gapX * (columns + 1)) / columns;
    const anchorIdx = ((helper.anchorScroll.index / columns) | 0) * columns;

    let idx = anchorIdx;
    let nextTop = helper.anchorScroll.offsetY;

    while (idx < helper.itemCount) {
      if (nextTop > helper.offsetY + helper.height + helper.bufferSize) {
        break
      }

      let rowHeight = 0;

      for (let column = 0; column < columns && idx < helper.itemCount; column++) {
        const left = config.gapX + column * (config.gapX + itemWidth);

        const paddingTop = idx < columns ? config.paddingTop : null;

        const child = helper.getChild(idx, {width: `${itemWidth}px`, 'padding-top': paddingTop ?? null});
        helper.layoutChild(child, left, nextTop);

        if (child.height > rowHeight) {
          rowHeight = child.height
        }

        idx++;
      }

      nextTop += rowHeight + config.gapY;
    }

    idx = anchorIdx;
    let prevTop = helper.anchorScroll.offsetY;

    while (idx > 0) {
      if (prevTop < helper.offsetY - helper.bufferSize) {
        break
      }

      let pending: { child: Child, left: number }[] = [];
      for (let column = columns - 1; column >= 0 && idx > 0; column--) {
        idx--;


        const left = config.gapX + column * (config.gapX + itemWidth);
        const paddingTop = idx < columns ? config.paddingTop : null;
        const child = helper.getChild(idx, {width: `${itemWidth}px`, 'padding-top': paddingTop ?? null});
        pending.push({child, left})
      }

      const rowHeight = Math.max(...pending.map(p => p.child.height));

      for (const p of pending) {
        helper.layoutChild(p.child, p.left, prevTop - rowHeight - config.gapY);
      }

      prevTop -= rowHeight + config.gapY;
    }
  }
}
