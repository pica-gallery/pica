export type int = number;

export interface Callback {
  readonly oldListSize: int
  readonly newListSize: int

  /**
   * Called by the DiffUtil to decide whether two object represent the same Item.
   * <p>
   * For example, if your items have unique ids, this method should check their id equality.
   *
   * @param oldItemPosition The position of the item in the old list
   * @param newItemPosition The position of the item in the new list
   * @return True if the two items represent the same object or false if they are different.
   */
  sameItem(oldItemPosition: int, newItemPosition: int): boolean

  /**
   * Called by the DiffUtil when it wants to check whether two items have the same data.
   * DiffUtil uses this information to detect if the contents of an item has changed.
   * <p>
   * DiffUtil uses this method to check equality instead of {@link Object#equals(Object)}
   * so that you can change its behavior depending on your UI.
   * For example, if you are using DiffUtil with a
   * {@link RecyclerView.Adapter RecyclerView.Adapter}, you should
   * return whether the items' visual representations are the same.
   * <p>
   * This method is called only if {@link #areItemsTheSame(int, int)} returns
   * {@code true} for these items.
   *
   * @param oldItemPosition The position of the item in the old list
   * @param newItemPosition The position of the item in the new list which replaces the
   *                        oldItem
   * @return True if the contents of the items are the same or false if they are different.
   */
  sameContents(oldItemPosition: int, newItemPosition: int): boolean
}

export class ItemCallback<T> implements Callback {
  readonly oldListSize: number = this.oldItems.length;
  readonly newListSize: number = this.newItems.length;

  constructor(
    private readonly oldItems: T[],
    private readonly newItems: T[],
    private readonly compare: {
      readonly sameItem: (oItem: T, nItem: T) => boolean,
      readonly sameContents: (oItem: T, nItem: T) => boolean,
    }
  ) {
  }

  sameItem(oldItemPosition: number, newItemPosition: number): boolean {
    return this.compare.sameItem(this.oldItems[oldItemPosition], this.newItems[newItemPosition])
  }

  sameContents(oldItemPosition: number, newItemPosition: number): boolean {
    return this.compare.sameContents(this.oldItems[oldItemPosition], this.newItems[newItemPosition])
  }
}

export interface ListUpdateCallback {
  /**
   * Called when {@code count} number of items are inserted at the given position.
   *
   * @param position The position of the new item.
   * @param count    The number of items that have been added.
   */
  onInserted(position: int, count: int): void

  /**
   * Called when {@code count} number of items are removed from the given position.
   *
   * @param position The position of the item which has been removed.
   * @param count    The number of items which have been removed.
   */
  onRemoved(position: int, count: int): void

  /**
   * Called when an item changes its position in the list.
   *
   * @param fromPosition The previous position of the item before the move.
   * @param toPosition   The new position of the item.
   */
  onMoved(fromPosition: int, toPosition: int): void

  /**
   * Called when {@code count} number of items are updated at the given position.
   *
   * @param position The position of the item which has been updated.
   * @param count    The number of items which has changed.
   * @param payload  The payload for the changed items.
   */
  onChanged(position: int, count: int, payload: unknown | null): void
}

class Diagonal {
  constructor(
    readonly x: int,
    readonly y: int,
    readonly size: int,
  ) {
  }

  public get endX() {
    return this.x + this.size;
  }

  public get endY() {
    return this.y + this.size;
  }
}

function diagonalCompare(o1: Diagonal, o2: Diagonal): number {
  return o1.x - o2.x
}


class Snake {
  public startX: int = 0
  public startY: int = 0
  public endX: int = 0
  public endY: int = 0
  public reverse: boolean = false;

  get hasAdditionOrRemoval(): boolean {
    return this.endY - this.startY !== this.endX - this.startX;
  }

  get isAddition(): boolean {
    return this.endY - this.startY > this.endX - this.startX;
  }

  get diagonalSize(): int {
    return Math.min(this.endX - this.startX, this.endY - this.startY);
  }

  /**
   * Extract the diagonal of the snake to make reasoning easier for the rest of the
   * algorithm where we try to produce a path and also find moves.
   */
  toDiagonal(): Diagonal {
    if (this.hasAdditionOrRemoval) {
      if (this.reverse) {
        return new Diagonal(this.startX, this.startY, this.diagonalSize)
      } else {
        // snake edge it at the beginning
        if (this.isAddition) {
          return new Diagonal(this.startX, this.startY + 1, this.diagonalSize);
        } else {
          return new Diagonal(this.startX + 1, this.startY, this.diagonalSize);
        }
      }
    } else {
      // we are a pure diagonal
      return new Diagonal(this.startX, this.startY, this.endX - this.startX);
    }
  }
}

class IndexRange {
  constructor(
    public oldListStart: int = 0,
    public oldListEnd: int = 0,
    public newListStart: int = 0,
    public newListEnd: int = 0,
  ) {
  }

  get oldSize(): int {
    return this.oldListEnd - this.oldListStart;
  }

  get newSize(): int {
    return this.newListEnd - this.newListStart;
  }
}

type PostponedUpdate = {
  posInOwnerList: int,
  currentPos: int,
  removal: boolean,
}

/**
 * Array wrapper w/ negative index support.
 * We use this array instead of a regular array so that algorithm is easier to read without
 * too many offsets when accessing the "k" array in the algorithm.
 */
class CenteredArray {
  readonly data: int[];
  private readonly mid: int;

  constructor(size: int) {
    this.data = Array(size).fill(0);
    this.mid = makeInt(size / 2);
  }

  public get(idx: int): int {
    return this.data[this.mid + idx]
  }

  public set(idx: int, value: int) {
    this.data[this.mid + idx] = value;
  }
}

interface Diff {
  dispatchUpdatesTo(updateCallback: ListUpdateCallback): void;

  /**
   * Given a position in the new list, returns the position in the old list, or
   * {@code null} if it was removed.
   *
   * @param newListPosition Position of item in new list
   * @return Position of item in old list, or {@code null} if not present.
   * @see #convertOldPositionToNew(int)
   */
  convertNewPositionToOld(newListPosition: int): int | null;

  /**
   * Given a position in the old list, returns the position in the new list, or
   * null if it was removed.
   *
   * @param oldListPosition Position of item in old list
   * @return Position of item in new list, or {@code null} if not present.
   * @see #convertNewPositionToOld(int)
   */
  convertOldPositionToNew(oldListPosition: int): int | null;
}

export async function diffOf(cb: Callback, detectMoves: boolean = true): Promise<Diff> {
  const oldSize = cb.oldListSize
  const newSize = cb.newListSize

  const diagonals: Diagonal[] = [];

  // instead of a recursive implementation, we keep our own stack to avoid potential stack
  // overflow exceptions
  const stack: IndexRange[] = [];

  stack.push(new IndexRange(0, oldSize, 0, newSize));

  const max = makeInt((oldSize + newSize + 1) / 2);

  const forward = new CenteredArray(max * 2 + 1);
  const backward = new CenteredArray(max * 2 + 1);

  // We pool the ranges to avoid allocations for each recursive call.
  const ranges: IndexRange[] = [];

  while (stack.length) {
    const range = stack.pop()!;
    const snake = await midpoint(range, cb, forward, backward);
    if (snake != null) {
      // if it has a diagonal, save it
      if (snake.diagonalSize > 0) {
        diagonals.push(snake.toDiagonal());
      }

      // add new ranges for left and right
      const left = ranges.pop() ?? new IndexRange();
      left.oldListStart = range.oldListStart;
      left.newListStart = range.newListStart;
      left.oldListEnd = snake.startX;
      left.newListEnd = snake.startY;
      stack.push(left);

      // re-use range for right
      const right = range;
      right.oldListEnd = range.oldListEnd;
      right.newListEnd = range.newListEnd;
      right.oldListStart = snake.endX;
      right.newListStart = snake.endY;
      stack.push(right);
    } else {
      ranges.push(range);
    }
  }

  diagonals.sort(diagonalCompare)

  return new DiffResult(cb, diagonals, forward.data, backward.data, detectMoves)
}


/**
 * While reading the flags below, keep in mind that when multiple items move in a list,
 * Myers's may pick any of them as the anchor item and consider that one NOT_CHANGED while
 * picking others as additions and removals. This is completely fine as we later detect
 * all moves.
 * <p>
 * Below, when an item is mentioned to stay in the same "location", it means we won't
 * dispatch a move/add/remove for it, it DOES NOT mean the item is still in the same
 * position.
 */

// item stayed the same.
const FLAG_NOT_CHANGED: int = 1;

// item stayed in the same location but changed.
const FLAG_CHANGED: int = FLAG_NOT_CHANGED << 1;

// Item has moved and also changed.
const FLAG_MOVED_CHANGED: int = FLAG_CHANGED << 1;

// Item has moved but did not change.
const FLAG_MOVED_NOT_CHANGED: int = FLAG_MOVED_CHANGED << 1;

// Item moved
const FLAG_MOVED: int = FLAG_MOVED_CHANGED | FLAG_MOVED_NOT_CHANGED;

// since we are re-using the int arrays that were created in the Myers' step, we mask
// change flags
const FLAG_OFFSET: int = 4;

const FLAG_MASK: int = (1 << FLAG_OFFSET) - 1;

class DiffResult implements Diff {
  constructor(
    private readonly cb: Callback,
    private readonly diagonals: Diagonal[],
    private readonly oldItemStatuses: int[],
    private readonly newItemStatuses: int[],
    private readonly detectMoves: boolean) {

    // arrays are repurposed to safe an allocation or two
    oldItemStatuses.fill(0);
    newItemStatuses.fill(0);

    this.addEdgeDiagonals();
    this.findMatchingItems();
  }

  /**
   * Add edge diagonals so that we can iterate as long as there are diagonals w/o lots of
   * null checks around
   */
  private addEdgeDiagonals(): void {
    const first = this.diagonals[0] ?? null;

    // see if we should add 1 to the 0,0
    if (first === null || first.x !== 0 || first.y !== 0) {
      // insert at first place
      this.diagonals.splice(0, 0, new Diagonal(0, 0, 0));
    }

    // always add one last
    this.diagonals.push(new Diagonal(this.cb.oldListSize, this.cb.newListSize, 0));
  }

  /**
   * Find position mapping from old list to new list.
   * If moves are requested, we'll also try to do an n^2 search between additions and
   * removals to find moves.
   */
  private findMatchingItems(): void {
    for (const diagonal of this.diagonals) {
      for (let offset: int = 0; offset < diagonal.size; offset++) {
        const posX = diagonal.x + offset;
        const posY = diagonal.y + offset;
        const theSame: boolean = this.cb.sameContents(posX, posY);
        const changeFlag: int = theSame ? FLAG_NOT_CHANGED : FLAG_CHANGED;
        this.oldItemStatuses[posX] = (posY << FLAG_OFFSET) | changeFlag;
        this.newItemStatuses[posY] = (posX << FLAG_OFFSET) | changeFlag;
      }
    }
    // now all matches are marked, lets look for moves
    if (this.detectMoves) {
      // traverse each addition / removal from the end of the list, find matching
      // addition removal from before
      this.findMoveMatches();
    }
  }

  private findMoveMatches(): void {
    // for each removal, find matching addition
    let posX: int = 0;
    for (const diagonal of this.diagonals) {
      while (posX < diagonal.x) {
        if (this.oldItemStatuses[posX] === 0) {
          // there is a removal, find matching addition from the rest
          this.findMatchingAddition(posX);
        }
        posX++;
      }
      // snap back for the next diagonal
      posX = diagonal.endX;
    }
  }

  /**
   * Search the whole list to find the addition for the given removal of position posX
   *
   * @param posX position in the old list
   */
  private findMatchingAddition(posX: int): void {
    let posY: int = 0;

    for (const diagonal of this.diagonals) {
      while (posY < diagonal.y) {
        // found some additions, evaluate
        if (this.newItemStatuses[posY] === 0) { // not evaluated yet
          const matching = this.cb.sameItem(posX, posY);
          if (matching) {
            // yay found it, set values
            const contentsMatching = this.cb.sameContents(posX, posY);
            const changeFlag: int = contentsMatching ? FLAG_MOVED_NOT_CHANGED : FLAG_MOVED_CHANGED;

            // once we process one of these, it will mark the other one as ignored.
            this.oldItemStatuses[posX] = (posY << FLAG_OFFSET) | changeFlag;
            this.newItemStatuses[posY] = (posX << FLAG_OFFSET) | changeFlag;
            return;
          }
        }

        posY++;
      }

      posY = diagonal.endY;
    }
  }

  public convertOldPositionToNew(oldListPosition: int): int | null {
    if (oldListPosition < 0 || oldListPosition >= this.cb.oldListSize) {
      throw new Error(`Index out of bounds - passed position = ${oldListPosition}, old list size = ${this.cb.oldListSize}`);
    }
    const status: int = this.oldItemStatuses[oldListPosition];
    if ((status & FLAG_MASK) === 0) {
      return null;
    } else {
      return status >> FLAG_OFFSET;
    }
  }

  public convertNewPositionToOld(newListPosition: int): int | null {
    if (newListPosition < 0 || newListPosition >= this.cb.newListSize) {
      throw new Error(`Index out of bounds - passed position = ${newListPosition}, new list size = ${this.cb.newListSize}`);
    }

    const status = this.newItemStatuses[newListPosition];
    if ((status & FLAG_MASK) === 0) {
      return null;
    } else {
      return status >> FLAG_OFFSET;
    }
  }

  /**
   * Dispatches update operations to the given Callback.
   * <p>
   * These updates are atomic such that the first update call affects every update call that
   * comes after it (the same as RecyclerView).
   *
   * @param updateCallback The callback to receive the update operations.
   * @see #dispatchUpdatesTo(RecyclerView.Adapter)
   */
  public dispatchUpdatesTo(updateCallback: ListUpdateCallback): void {
    let batchingCallback: BatchingListUpdateCallback;

    if (updateCallback instanceof BatchingListUpdateCallback) {
      batchingCallback = updateCallback;
    } else {
      batchingCallback = new BatchingListUpdateCallback(updateCallback);

      // replace updateCallback with a batching callback and override references to
      // updateCallback so that we don't call it directly by mistake
      // noinspection JSUnusedAssignment
      updateCallback = batchingCallback;
    }

    // track up to date current list size for moves
    // when a move is found, we record its position from the end of the list (which is
    // less likely to change since we iterate in reverse).
    // Later when we find the match of that move, we dispatch the update
    let currentListSize = this.cb.oldListSize;

    // list of postponed moves (TODO use better deque type?)
    const postponedUpdates: PostponedUpdate[] = [];

    // posX and posY are exclusive
    let posX: int = this.cb.oldListSize;
    let posY: int = this.cb.newListSize;

    // iterate from end of the list to the beginning.
    // this just makes offsets easier since changes in the earlier indices has an effect
    // on the later indices.
    for (let diagonalIndex: int = this.diagonals.length - 1; diagonalIndex >= 0; diagonalIndex--) {
      const diagonal = this.diagonals[diagonalIndex];

      const endX = diagonal.endX;
      const endY = diagonal.endY;
      // dispatch removals and additions until we reach to that diagonal
      // first remove then add so that it can go into its place and we don't need
      // to offset values
      while (posX > endX) {
        posX--;
        // REMOVAL
        const status: int = this.oldItemStatuses[posX];
        if ((status & FLAG_MOVED) != 0) {
          const newPos = status >> FLAG_OFFSET;
          // get postponed addition
          const postponedUpdate = getPostponedUpdate(postponedUpdates, newPos, false);
          if (postponedUpdate != null) {
            // this is an addition that was postponed. Now dispatch it.
            const updatedNewPos: int = currentListSize - postponedUpdate.currentPos;
            batchingCallback.onMoved(posX, updatedNewPos - 1);
            if ((status & FLAG_MOVED_CHANGED) != 0) {
              // const changePayload: unknown | null = this.cb.getChangePayload(posX, newPos);
              const changePayload: unknown | null = null;
              batchingCallback.onChanged(updatedNewPos - 1, 1, changePayload);
            }

          } else {
            // first time we are seeing this, we'll see a matching addition
            postponedUpdates.push({
              posInOwnerList: posX,
              currentPos: currentListSize - posX - 1,
              removal: true,
            });
          }
        } else {
          // simple removal
          batchingCallback.onRemoved(posX, 1);
          currentListSize--;
        }
      }

      while (posY > endY) {
        posY--;

        // ADDITION
        const status = this.newItemStatuses[posY];
        if ((status & FLAG_MOVED) != 0) {
          // this is a move not an addition.
          // see if this is postponed
          const oldPos = status >> FLAG_OFFSET;

          // get postponed removal
          const postponedUpdate = getPostponedUpdate(postponedUpdates, oldPos, true);

          // empty size returns 0 for indexOf
          if (postponedUpdate == null) {
            // postpone it until we see the removal
            postponedUpdates.push({
              posInOwnerList: posY,
              currentPos: currentListSize - posX,
              removal: false,
            });
          } else {
            // oldPosFromEnd = foundListSize - posX
            // we can find posX if we swap the list sizes
            // posX = listSize - oldPosFromEnd
            const updatedOldPos = currentListSize - postponedUpdate.currentPos - 1;
            batchingCallback.onMoved(updatedOldPos, posX);
            if ((status & FLAG_MOVED_CHANGED) != 0) {
              // const changePayload: unknown | null = this.cb.getChangePayload(oldPos, posY);
              const changePayload: unknown | null = null;
              batchingCallback.onChanged(posX, 1, changePayload);
            }
          }
        } else {
          // simple addition
          batchingCallback.onInserted(posX, 1);
          currentListSize++;
        }
      }

      // now dispatch updates for the diagonal
      posX = diagonal.x;
      posY = diagonal.y;

      for (let i = 0; i < diagonal.size; i++) {
        // dispatch changes
        if ((this.oldItemStatuses[posX] & FLAG_MASK) == FLAG_CHANGED) {
          // const changePayload: unknown | null = this.cb.getChangePayload(posX, posY);
          const changePayload: unknown | null = null;
          batchingCallback.onChanged(posX, 1, changePayload);
        }

        posX++;
        posY++;
      }

      // snap back for the next diagonal
      posX = diagonal.x;
      posY = diagonal.y;
    }

    batchingCallback.dispatchLastEvent();
  }
}

function getPostponedUpdate(
  postponedUpdates: PostponedUpdate[],
  posInList: int,
  removal: boolean): PostponedUpdate | null {

  let postponedUpdate: PostponedUpdate | null = null;

  let itr: int = 0;

  while (itr < postponedUpdates.length) {
    const update = postponedUpdates[itr++];
    if (update.posInOwnerList === posInList && update.removal === removal) {
      postponedUpdate = update;

      // remove the current element, decrement the iterator, otherwise
      // we would skip the next element
      postponedUpdates.splice(--itr, 1);

      break;
    }
  }

  while (itr < postponedUpdates.length) {
    // re-offset all others
    const update = postponedUpdates[itr++];
    if (removal) {
      update.currentPos--;
    } else {
      update.currentPos++;
    }
  }

  return postponedUpdate;
}

async function midpoint(range: IndexRange, cb: Callback, forward: CenteredArray, backward: CenteredArray): Promise<Snake | null> {
  if (range.oldSize < 1 || range.newSize < 1) {
    return null
  }

  const max = makeInt((range.oldSize + range.newSize + 1) / 2);
  forward.set(1, range.oldListStart);
  backward.set(1, range.oldListEnd);

  let yieldAt = Date.now() + 8;

  for (let d: int = 0; d < max; d++) {
    if (d % 100 === 0 && Date.now() >= yieldAt) {
      await yieldToIdle();
      yieldAt = Date.now() + 8;
    }

    let snake = forwards(range, cb, forward, backward, d);
    if (snake != null) {
      return snake;
    }

    snake = backwards(range, cb, forward, backward, d);
    if (snake != null) {
      return snake;
    }
  }

  return null;
}

async function yieldToIdle(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve));
}

function forwards(range: IndexRange, cb: Callback, forward: CenteredArray, backward: CenteredArray, d: int): Snake | null {
  const checkForSnake = Math.abs(range.oldSize - range.newSize) % 2 === 1;
  const delta = range.oldSize - range.newSize;

  for (let k: int = -d; k <= d; k += 2) {
    // we either come from d-1, k-1 OR d-1. k+1
    // as we move in steps of 2, array always holds both current and previous d values
    // k = x - y and each array value holds the max X, y = x - k
    let startX: int;
    let startY: int;
    let x: int = 0, y: int = 0;

    if (k === -d || (k !== d && forward.get(k + 1) > forward.get(k - 1))) {
      // picking k + 1, incrementing Y (by simply not incrementing X)
      x = startX = forward.get(k + 1);
    } else {
      // picking k - 1, incrementing X
      startX = forward.get(k - 1);
      x = startX + 1;
    }

    y = range.newListStart + (x - range.oldListStart) - k;
    startY = (d === 0 || x !== startX) ? y : y - 1;

    // now find snake size
    while (x < range.oldListEnd && y < range.newListEnd && cb.sameItem(x, y)) {
      x++;
      y++;
    }

    // now we have furthest reaching x, record it
    forward.set(k, x);

    if (checkForSnake) {
      // see if we did pass over a backwards array
      // mapping function: delta - k
      const backwardsK: int = delta - k;

      // if backwards K is calculated and it passed me, found match
      if (backwardsK >= -d + 1 && backwardsK <= d - 1 && backward.get(backwardsK) <= x) {
        const snake = new Snake();
        snake.startX = startX;
        snake.startY = startY;
        snake.endX = x;
        snake.endY = y;
        snake.reverse = false;
        return snake;
      }
    }
  }

  return null;
}

function backwards(range: IndexRange, cb: Callback, forward: CenteredArray, backward: CenteredArray, d: int): Snake | null {
  const checkForSnake = (range.oldSize - range.newSize) % 2 === 0;
  const delta = range.oldSize - range.newSize;

  // same as forward but we go backwards from end of the lists to be beginning
  // this also means we'll try to optimize for minimizing x instead of maximizing it
  for (let k: int = -d; k <= d; k += 2) {
    // we either come from d-1, k-1 OR d-1, k+1
    // as we move in steps of 2, array always holds both current and previous d values
    // k = x - y and each array value holds the MIN X, y = x - k
    // when x's are equal, we prioritize deletion over insertion
    let startX: int;
    let startY: int;
    let x: int = 0, y: int = 0;

    if (k === -d || (k !== d && backward.get(k + 1) < backward.get(k - 1))) {
      // picking k + 1, decrementing Y (by simply not decrementing X)
      x = startX = backward.get(k + 1);
    } else {
      // picking k - 1, decrementing X
      startX = backward.get(k - 1);
      x = startX - 1;
    }

    y = range.newListEnd - ((range.oldListEnd - x) - k);
    startY = (d === 0 || x !== startX) ? y : y + 1;

    // now find snake size
    while (x > range.oldListStart && y > range.newListStart && cb.sameItem(x - 1, y - 1)) {
      x--;
      y--;
    }

    // now we have furthest point, record it (min X)
    backward.set(k, x);

    if (checkForSnake) {
      // see if we did pass over a backwards array
      // mapping function: delta - k
      const forwardsK: int = delta - k;

      // if forwards K is calculated and it passed me, found match
      if (forwardsK >= -d && forwardsK <= d && forward.get(forwardsK) >= x) {
        // match
        const snake = new Snake();
        // assignment are reverse since we are a reverse snake
        snake.startX = x;
        snake.startY = y;
        snake.endX = startX;
        snake.endY = startY;
        snake.reverse = true;
        return snake;
      }
    }
  }
  return null;
}

function makeInt(value: number): int {
  return value | 0;
}

const TYPE_NONE: int = 0;
const TYPE_ADD: int = 1;
const TYPE_REMOVE: int = 2;
const TYPE_CHANGE: int = 3;

class BatchingListUpdateCallback implements ListUpdateCallback {
  private lastEventType: int = TYPE_NONE;
  private lastEventPosition: int = -1;
  private lastEventCount: int = -1;
  private lastEventPayload: unknown | null = null;

  constructor(private readonly delegate: ListUpdateCallback) {
  }

  onInserted(position: number, count: number): void {
    if (this.lastEventType === TYPE_ADD && position >= this.lastEventPosition
      && position <= this.lastEventPosition + this.lastEventCount) {
      this.lastEventCount += count;
      this.lastEventPosition = Math.min(position, this.lastEventPosition);
      return;
    }

    this.dispatchLastEvent();
    this.lastEventPosition = position;
    this.lastEventCount = count;
    this.lastEventType = TYPE_ADD;
  }

  onRemoved(position: number, count: number): void {
    if (this.lastEventType === TYPE_REMOVE && this.lastEventPosition >= position &&
      this.lastEventPosition <= position + count) {
      this.lastEventCount += count;
      this.lastEventPosition = position;
      return;
    }
    this.dispatchLastEvent();
    this.lastEventPosition = position;
    this.lastEventCount = count;
    this.lastEventType = TYPE_REMOVE;
  }

  onChanged(position: number, count: number, payload: unknown): void {
    if (this.lastEventType === TYPE_CHANGE &&
      !(position > this.lastEventPosition + this.lastEventCount
        || position + count < this.lastEventPosition || this.lastEventPayload !== payload)) {

      // take potential overlap into account
      const previousEnd = this.lastEventPosition + this.lastEventCount;
      this.lastEventPosition = Math.min(position, this.lastEventPosition);
      this.lastEventCount = Math.max(previousEnd, position + count) - this.lastEventPosition;
      return;
    }
    this.dispatchLastEvent();
    this.lastEventPosition = position;
    this.lastEventCount = count;
    this.lastEventPayload = payload;
    this.lastEventType = TYPE_CHANGE;
  }

  onMoved(fromPosition: number, toPosition: number): void {
    this.dispatchLastEvent(); // moves are not merged
    this.delegate.onMoved(fromPosition, toPosition);
  }

  dispatchLastEvent(): void {
    if (this.lastEventType === TYPE_NONE) {
      return;
    }
    switch (this.lastEventType) {
      case TYPE_ADD:
        this.delegate.onInserted(this.lastEventPosition, this.lastEventCount);
        break;
      case TYPE_REMOVE:
        this.delegate.onRemoved(this.lastEventPosition, this.lastEventCount);
        break;
      case TYPE_CHANGE:
        this.delegate.onChanged(this.lastEventPosition, this.lastEventCount, this.lastEventPayload);
        break;
    }

    this.lastEventPayload = null;
    this.lastEventType = TYPE_NONE;
  }
}
