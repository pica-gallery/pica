import type {ListItem} from './list-view.component';
import {BehaviorSubject, distinctUntilChanged, map, Observable, type OperatorFunction, type Subscriber} from 'rxjs';
import {operate} from 'rxjs/internal/util/lift';
import {createOperatorSubscriber} from 'rxjs/internal/operators/OperatorSubscriber';
import {diffOf, type int, type ListUpdateCallback} from './diffutil';

export type Edit =
  | { type: 'insert', position: number, count: number }
  | { type: 'change', position: number, count: number }
  | { type: 'remove', position: number, count: number }
  | { type: 'move', from: number, to: number }

export type IncrementalUpdate = {
  type: 'incremental',
  items: ListItem[],
  previous: ListItem[],
  edits: Edit[],
}

/**
 * Triggers a full update of the data, possibly leading to a rebind of
 * all components.
 */
export type FullUpdate = {
  type: 'full',
  items: ListItem[],
}

export type Update =
  | FullUpdate
  | IncrementalUpdate

export interface DataSource {
  /**
   * Returns an observable that provides a stream of updates that brings
   * a list view to the current state. This should always start
   * with a FullUpdate and followed by incremental updates.
   */
  observe(): Observable<Update>
}

export class ArrayDataSource<T extends ListItem> implements DataSource {
  private readonly itemsSubject = new BehaviorSubject<T[]>([])

  constructor(private readonly comparator: ItemComparator<T> | null = null) {
  }

  public set items(items: T[]) {
    this.itemsSubject.next(items);
  }

  public get items(): T[] {
    return this.itemsSubject.value
  }

  observe(): Observable<Update> {
    if (this.comparator != null) {
      return this.itemsSubject.pipe(
        distinctUntilChanged(),
        calculateIncrementalUpdate(this.comparator),
      );
    }

    return this.itemsSubject.pipe(
      distinctUntilChanged(),
      map(items => ({type: 'full', items})),
    )
  }
}

export interface ItemComparator<T> {
  sameItem(lhs: T, rhs: T): boolean

  sameContents(lhs: T, rhs: T): boolean
}

function calculateIncrementalUpdate<T extends ListItem>(comparator: ItemComparator<T>): OperatorFunction<T[], Update> {
  return operate((source: Observable<T[]>, subscriber: Subscriber<Update>) => {
    let version = 0;
    let oldItems: T[] | null = null;

    const onNext = async (newItems: T[]) => {
      try {
        const lockVersion = ++version;

        if (oldItems == null) {
          oldItems = newItems;
          subscriber.next({type: 'full', items: newItems})
          return;
        }

        const oldItemsRef = oldItems;

        const diff = await diffOf({
          oldListSize: oldItems.length,
          newListSize: newItems.length,
          sameItem(oldItemPosition: int, newItemPosition: int): boolean {
            return comparator.sameItem(oldItemsRef[oldItemPosition], newItems[newItemPosition]);
          },

          sameContents(oldItemPosition: int, newItemPosition: int): boolean {
            return comparator.sameContents(oldItemsRef[oldItemPosition], newItems[newItemPosition]);
          }
        })

        if (lockVersion !== version || subscriber.closed) {
          return;
        }

        const editsCollector = new EditsCollector();
        diff.dispatchUpdatesTo(editsCollector);

        oldItems = newItems;

        subscriber.next({
          type: 'incremental',
          edits: editsCollector.edits,
          previous: oldItemsRef,
          items: newItems,
        })
      } catch (err) {
        if (!subscriber.closed) {
          subscriber.error(err);
        }
      }
    };

    const onComplete = () => {
      subscriber.complete();
    };

    const onError = (error?: any) => {
      subscriber.error(error);
    };

    source.subscribe(createOperatorSubscriber(subscriber, onNext, onComplete, onError));
  });
}

class EditsCollector implements ListUpdateCallback {
  readonly edits: Edit[] = [];

  onInserted(position: number, count: number): void {
    this.edits.push({type: 'insert', position, count});
  }

  onRemoved(position: number, count: number): void {
    this.edits.push({type: 'remove', position, count});
  }

  onMoved(from: number, to: number): void {
    this.edits.push({type: 'move', from, to});
  }

  onChanged(position: number, count: number, payload: unknown): void {
    this.edits.push({type: 'change', position, count});
  }
}
