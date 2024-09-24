import {
  type AfterContentInit,
  type AfterViewInit,
  ApplicationRef,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ContentChildren,
  Directive,
  ElementRef,
  EnvironmentInjector,
  EventEmitter,
  inject, input,
  Input,
  NgZone,
  numberAttribute,
  type OnChanges,
  type OnDestroy,
  Output,
  QueryList,
  type SimpleChanges,
  TemplateRef,
  type Type,
  ViewChild
} from '@angular/core';
import {observeElementSize} from '../../util';
import {distinctUntilChanged, filter, map, Subscription} from 'rxjs';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {type DetachedChild, type View, ViewRecycler, type ViewType} from './view-recycler';
import {ArrayDataSource, type DataSource, type Edit} from './datasource';

export type TemplateListItem = {
  viewType: string,
  context: unknown,
}


export type TemplateRefListItem = {
  viewType: TemplateRef<unknown>,
  context: unknown,
}

export type ComponentListItem = {
  viewType: Type<unknown>,
  inputs?: Record<string, unknown>,
  outputs?: Record<string, (value: any) => void>,
}

export type ListItem =
  | TemplateListItem
  | TemplateRefListItem
  | ComponentListItem

export type Child = {
  node: HTMLElement,
  view: View,
  index: number,
  top: number,
  left: number,
  width: number,
  height: number,
}

function debug(...args: any[]) {
  console.debug(...args);
}

function removeInplace(children: Child[], child: Child) {
  const idx = children.findIndex(ch => ch === child);
  if (idx >= 0) {
    children.splice(idx, 1);
  }
}

export type SavedScroll = {
  index: number,
  offsetY: number,
}

@Directive({
  standalone: true,
  selector: '[listViewItem]',
})
export class ListViewItemDirective {
  public readonly name = input.required<string>({alias: "listViewItem"})

  constructor(
    readonly templateRef: TemplateRef<unknown>,
  ) {
  }
}

class TemplateLookup {
  private lookup = new Map<string, TemplateRef<unknown>>();

  constructor(private readonly templates: QueryList<ListViewItemDirective>) {
    this.update();
    templates.changes.subscribe(() => this.update())
  }

  public get(name: string): TemplateRef<unknown> | null {
    return this.lookup.get(name) ?? null;
  }

  private update() {
    const pairs = this.templates.map(item => [item.name(), item.templateRef] as const);
    this.lookup = new Map(pairs);
  }
}

@Component({
  selector: 'app-list-view',
  standalone: true,
  imports: [],
  templateUrl: './list-view.component.html',
  styleUrl: './list-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ListViewComponent implements AfterViewInit, AfterContentInit, OnChanges, OnDestroy {
  private readonly applicationRef = inject(ApplicationRef);
  private readonly ngZone = inject(NgZone);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);

  private readonly root: ElementRef<HTMLElement> = inject(ElementRef);

  @ViewChild('Canvas')
  private canvas!: ElementRef<HTMLElement>;

  @ContentChildren(ListViewItemDirective, {descendants: false})
  private templates!: QueryList<ListViewItemDirective>
  private lookupTemplates!: TemplateLookup

  private canvasHeight: number = 0;
  private lastRootHeight: number = 0;
  private readonly children: Child[] = [];

  private readonly observer = new ResizeObserver(entries => this.resizeObserverCallback(entries));
  private readonly recycler = new ViewRecycler(inject(EnvironmentInjector));

  private firstLayout: boolean = true;

  private items: ListItem[] = [];
  private _dataSource: DataSource = new ArrayDataSource();
  private dataSourceSubscription: Subscription | null = null;


  @Input()
  public set dataSource(newValue: DataSource | ListItem[]) {
    this.updateDataSource(newValue);
  }

  public get dataSource(): DataSource {
    return this._dataSource
  }

  @Input()
  public initialScroll: SavedScroll | null = null;

  /**
   * Number of pixels to fill above and below the visible area.
   */
  @Input({transform: numberAttribute})
  public bufferSize: number = 256;

  /**
   * Maximum number of children to layout in one go
   */
  @Input({transform: numberAttribute})
  public maxChildrenToLayout: number = 64;

  /**
   * Number of detached views to store per component.
   */
  @Input({transform: numberAttribute})
  public perComponentCacheSize: number = 4;

  @Input()
  public layout: ((layouter: LayoutHelper) => void) | null = null;

  @Output()
  scrollChanged = new EventEmitter<SavedScroll>();

  constructor() {
    this.offsetY = 0;

    observeElementSize(this.root.nativeElement)
      .pipe(
        map(sizes => sizes.height),
        filter(height => height > 0),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe(height => this.updateContent(height));
  }

  protected get offsetY(): number {
    return this.root.nativeElement.scrollTop;
  }

  protected set offsetY(value: number) {
    this.root.nativeElement.scrollTop = value;
  }

  ngAfterContentInit() {
    this.lookupTemplates = new TemplateLookup(this.templates);
  }

  ngAfterViewInit() {
    // ensure we're scrolled to the top
    this.offsetY = 0;

    this.observe(this._dataSource);

    this.ngZone.runOutsideAngular(() => {
      this.root.nativeElement.addEventListener('scroll', () => this.updateContent());
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    debug('Changes', changes);

    // forward config to the recycler
    this.recycler.perComponentCacheSize = this.perComponentCacheSize;

    /*
        // recycle all
        for (const child of this.children.splice(0)) {
          this.recycleChild(child);
        }

        this.updateContent();
        */
  }

  ngOnDestroy(): void {
    this.observer.disconnect();

    // destroy the cached nodes. We do not need to destroy
    // the attached nodes, as they are getting cleaned up by angular.
    this.recycler.destroyAll();
  }

  private updateDataSource(dataSourceOrItems: DataSource | ListItem[]) {
    if (Array.isArray(dataSourceOrItems)) {
      // ensure we have a simple data source configured
      let dataSource: SimpleArrayDataSource;

      if (this.dataSource instanceof SimpleArrayDataSource) {
        dataSource = this.dataSource;
      } else {
        this.dataSource = dataSource = new SimpleArrayDataSource();
        this.observe(dataSource);
      }

      // and set the new values
      dataSource.items = dataSourceOrItems;
      return;
    }

    // we got a new real data source
    this._dataSource = dataSourceOrItems;
    this.observe(dataSourceOrItems);
  }

  private observe(dataSource: DataSource) {
    this.dataSourceSubscription?.unsubscribe();
    this.dataSourceSubscription = null;

    if (this.canvas == null) {
      return;
    }

    this.dataSourceSubscription = dataSource.observe().subscribe(update => {
      if (update.type === 'full' || !update.items.length || !update.previous.length || !this.children.length) {

        if (update.type === 'full') {
          for (const child of [...this.children]) {
            const item = update.items[child.index];
            if (item != null && child.view.viewType === this.viewTypeOf(item)) {
              // same view type, just require a rebind
              child.view.bindValues(item)
            } else {
              this.recycleChild(child);
            }
          }
        } else {
          // need to recycle all children
          for (const child of this.children.splice(0)) {
            this.recycleChild(child);
          }
        }

        // store items
        this.items = update.items;

      } else {
        // partial update
        this.items = update.items;
        this.applyEditsToChildren(update.edits);
      }

      // now trigger a layout pass
      this.updateContent();

      // and run change detection
      this.changeDetectorRef.detectChanges();
    })
  }

  private applyEditsToChildren(edits: Edit[]) {
    const minChildIndex = this.children[0].index
    const maxChildIndex = this.children[this.children.length - 1].index;

    // incremental update
    for (const edit of edits) {
      switch (edit.type) {
        case 'insert':
          if (edit.position <= maxChildIndex) {
            for (const child of this.children) {
              if (child.index >= edit.position) {
                child.index += edit.count;
                child.node.dataset['index'] = child.index.toString();
              }
            }
          }

          break;

        case 'change':
          if (minChildIndex <= edit.position && edit.position <= maxChildIndex) {
            for (const child of this.children) {
              if (child.index >= edit.position && child.index < edit.position + edit.count) {
                child.view.bindValues(this.items[child.index])
              }
            }
          }

          break;

        case 'remove':
          if (edit.position <= maxChildIndex) {
            for (const child of [...this.children]) {
              if (child.index >= edit.position) {
                if (child.index < edit.position + edit.count) {
                  this.recycleChild(child);
                  continue
                }

                child.index -= edit.count;
                child.node.dataset['index'] = child.index.toString();
              }
            }
          }

          break;

        case 'move':
          console.warn('move currently unsupported, recycle all children');

          for (const child of [...this.children]) {
            this.recycleChild(child);
          }

          break;
      }
    }
  }

  protected updateContent(height: number = this.lastRootHeight) {
    if (height === 0) {
      console.warn('Skip layout for zero height');
      return;
    }

    const now = performance.now();

    this.lastRootHeight = height;

    // we might need to reset scrolling if we have no anchor to work with
    this.resetScrolling();

    // keep a list of children that we actually layout, so we can
    // later remove all children from the canvas, that were not layout.
    const childrenToKeep = new Set();

    // function to track children that were layout
    const layoutChild = (child: Child, left: number, top: number): boolean => {
      childrenToKeep.add(child);
      this.layoutChild(child, left, top);
      return childrenToKeep.size < this.maxChildrenToLayout
    }

    const firstLayout = this.firstLayout;
    this.firstLayout = false;

    const helper: LayoutHelper = {
      height,
      layoutChild,
      getChild: this.getChild.bind(this),
      offsetY: this.offsetY,
      bufferSize: this.bufferSize,
      maxChildrenToLayout: this.maxChildrenToLayout,
      item: idx => this.items[idx],
      itemCount: this.items.length,
      anchorScroll: this.anchorScroll(firstLayout),
    }

    // run the actual layout
    if (this.items.length > 0) {
      (this.layout ?? layout)(helper);
    }

    // remove all the children that we did not layout this time
    for (const child of [...this.children]) {
      if (!childrenToKeep.has(child)) {
        this.recycleChild(child);
      }
    }

    // fix any children that were layout outside of the container
    this.fixOverflow();

    // calculate new height for the canvas based on the now layouted children
    this.updateCanvasSize();

    // build the new scroll and emit it
    const anchorChild = this.anchorChild()
    if (anchorChild != null) {
      const offsetY = anchorChild.top - this.offsetY;
      this.scrollChanged.emit({index: anchorChild.index, offsetY})
    }


    const duration = performance.now() - now;
    if (duration >= 16) {
      debug('[slow] updateContent() took %sms', duration.toFixed(2));
    }
  }

  private anchorScroll(firstLayout: boolean): SavedScroll {
    if (firstLayout) {
      // use initial scroll if it has valid values
      if (this.initialScroll) {
        if (this.initialScroll.index >= 0 && this.initialScroll.index < this.items.length) {
          return this.initialScroll
        }
      }

    } else {
      if (this.offsetY === 0) {
        // if we've scrolled to the top, we're anchored there
        return {index: 0, offsetY: 0}
      }

      // find the child we want to anchor all the views to
      const anchorChild = this.anchorChild();
      if (anchorChild != null) {
        return {
          index: anchorChild.index,
          offsetY: anchorChild.top,
        }
      }
    }

    return {index: 0, offsetY: 0}
  }

  private layoutChild(child: Child, left: number, top: number) {
    if (child.left != left || child.top != top) {
      child.top = top;
      child.left = left;
      child.node.style.left = left + 'px';
      child.node.style.top = top + 'px';
    }
  }

  private findChild(index: number): Child | null {
    return this.children.find(child => child.index === index) ?? null;
  }

  private resetScrolling() {
    for (const child of this.children) {
      const visible = child.top + child.height > this.offsetY && child.top < this.offsetY + this.lastRootHeight;
      if (visible) {
        return;
      }
    }

    // it looks like someone scrolled so fast that no child is visible
    // anymore. In this case we just reset scrolling to the position
    // of the first child that we have
    this.offsetY = this.children[0]?.top ?? 0;
  }

  private anchorChild(): Child | null {
    return this.children.find(child => child.top >= this.offsetY) ?? null;
  }

  private minChild(): Child | null {
    let minChild = this.children[0] ?? null;

    for (let i = 1; i < this.children.length; i++) {
      if (this.children[i].top < minChild.top) {
        minChild = this.children[i];
      }
    }

    return minChild;
  }

  private maxChild(): Child | null {
    let maxChild = this.children[0] ?? null;

    for (let i = 1; i < this.children.length; i++) {
      if (this.children[i].top + this.children[i].height >= maxChild.top + maxChild.height) {
        maxChild = this.children[i];
      }
    }

    return maxChild;
  }

  private fixOverflow() {
    // fix scroll offset if we've layouted children to the outside of the scroll container.
    const minChild = this.minChild();
    if (minChild == null) {
      return
    }

    if (minChild.index === 0 && minChild.top > 0) {
      const removedSpace = -minChild.top;
      debug('First child not at zero, moving views up by %d', removedSpace);
      this.offsetChildrenKeepScroll(removedSpace);

    } else if (minChild.top < 0) {
      // if we have layouted some content "before" the container, we need to correct all children
      // again to move them out of the container area. We also need to offset the current scroll
      // by the same amount.
      const newSpace = -minChild.top;
      debug('Children are overflowing on top, moving everything down by %d', newSpace);
      this.offsetChildrenKeepScroll(newSpace)
    }
  }

  private updateCanvasSize() {
    if (this.children.length === 0) {
      this.canvas.nativeElement.style.height = '200%';
      return;
    }

    const maxChild = this.maxChild()!;

    if (maxChild.index === this.items.length - 1) {
      // actually the last one
      this.canvasHeight = maxChild.top + maxChild.height;
    } else {
      // estimate on how many more rows we might need to add
      const extraSpace = 100 * (this.items.length - maxChild.index + 1);
      this.canvasHeight = Math.max(this.canvasHeight, maxChild.top + maxChild.height + extraSpace);
    }

    this.canvas.nativeElement.style.height = this.canvasHeight + 'px';
  }

  private attachChild(detachedChild: DetachedChild, idx: number, item: ListItem): Child {
    const child: Child = {
      node: detachedChild.node,
      view: detachedChild.view,
      index: idx,

      // not yet layouted
      left: Number.NaN,
      top: Number.NaN,

      // not yet measured
      width: Number.NaN,
      height: Number.NaN,
    }

    child.view.appendTo(child.node);
    child.node.dataset['index'] = child.index.toString();

    // check for the next child so we can insert this one before
    const next = this.findChild(child.index + 1);
    this.canvas.nativeElement.insertBefore(child.node, next?.node ?? null);
    child.view.attach(this.applicationRef);
    this.observer.observe(child.node, {box: 'border-box'});

    const idxToInsert = this.children.findIndex(ch => ch.index > child.index)
    this.children.splice(idxToInsert === -1 ? this.children.length : idxToInsert, 0, child);

    // bind inputs and run change detection to be able to correctly measure the
    // view in the next step.
    child.view.bindValues(item)
    child.view.detectChanges();

    // measure child
    child.width = child.node.offsetWidth;
    child.height = child.node.offsetHeight;

    return child;
  }

  private detachChild(child: Child): DetachedChild {
    removeInplace(this.children, child);

    this.observer.unobserve(child.node);
    child.view.detach(this.applicationRef);

    this.canvas.nativeElement.removeChild(child.node);

    // measure child now
    child.height = child.node.offsetHeight;

    return {
      node: child.node,
      view: child.view,
    }
  }

  private resizeObserverCallback(entries: ResizeObserverEntry[]) {
    let hasChanges = false;

    for (const entry of entries) {
      // get the child by matching it via the resized node
      const child = this.children.find(child => child.node === entry.target);
      if (child == null) {
        // if we did not find a child for this change, it might have been the
        // list view itself. In this case we also need a layout pass.
        hasChanges ||= entry.target === this.root.nativeElement;

        continue;
      }

      // get the new height of the child
      const width = entry.borderBoxSize[0].inlineSize;
      const height = entry.borderBoxSize[0].blockSize;

      // only mark the child dirty if it has changed to our previous value.
      if (Math.abs(child.width - width) >= 1 || Math.abs(child.height - height) >= 1) {
        if (width === 0 || height === 0) {
          console.warn('Got zero size for child', child);
        }

        debug('Child size changed from %sx%s to %sx%s', child.width, child.height, width, height)

        child.width = width;
        child.height = height;

        hasChanges = true;
      }
    }

    if (hasChanges) {
      // trigger a re-layout if something has actually changed
      this.updateContent();
    }
  }

  private viewTypeOf(item: ListItem): ViewType {
    if (typeof item.viewType === 'string') {
      const templateType = this.lookupTemplates.get(item.viewType);
      if (templateType == null) {
        throw new Error(`template '${item.viewType}' not found`)
      }

      return templateType;
    }

    return item.viewType
  }

  /**
   * Returns a Child instance bound with the given item data
   * attached to the list view container.
   * If the view is already attached, it is not rebound.
   */
  private getChild(index: number, style?: Record<string, StyleValue>): Child {
    const existingChild = this.findChild(index);
    if (existingChild != null) {
      // TODO do we need to do this every time?
      if (style != null) {
        for (const [key, value] of Object.entries(style)) {
          existingChild.node.style.setProperty(key, value);
        }
      }

      return existingChild;
    }

    const item = this.items[index];

    return this.ngZone.runTask(() => {
      // create the child and insert it into the view at the right place
      const child = this.recycler.get(this.viewTypeOf(item));

      child.node.setAttribute('style', '');

      if (style != null) {
        for (const [key, value] of Object.entries(style)) {
          child.node.style.setProperty(key, value);
        }
      }

      return this.attachChild(child, index, item);
    });
  }

  /**
   * Detaches a view and gives it back to the recycler.
   */
  private recycleChild(child: Child) {
    this.recycler.cacheChild(this.detachChild(child))
  }

  private offsetChildrenKeepScroll(space: number) {
    for (const child of this.children) {
      child.top += space;
      child.node.style.top = child.top + 'px';
    }

    this.offsetY += space;
  }
}

export type StyleValue = string | null;

export type LayoutHelper = {
  height: number,
  offsetY: number,
  bufferSize: number,
  maxChildrenToLayout: number,
  itemCount: number,
  item: (idx: number) => ListItem,
  getChild: (idx: number, style?: Record<string, StyleValue>) => Child,
  layoutChild: (child: Child, left: number, top: number, width?: string, height?: string) => boolean,
  anchorScroll: SavedScroll,
}

function layout(helper: LayoutHelper) {
  const {index: indexStart, offsetY: anchorTop} = helper.anchorScroll

  // fill elements starting at the first one to show
  let nextTop = anchorTop;
  for (let index = indexStart; index < helper.itemCount; index++) {
    const child = helper.getChild(index);

    if (!helper.layoutChild(child, 0, nextTop)) {
      break;
    }

    nextTop += child.height;

    if (nextTop > helper.offsetY + helper.height + helper.bufferSize) {
      break;
    }
  }

  // go backwards starting at the child before the anchor
  let previousTop = anchorTop;
  for (let index = indexStart - 1; index >= 0; index--) {
    const child = helper.getChild(index);

    if (!helper.layoutChild(child, 0, previousTop - child.height)) {
      break;
    }

    previousTop -= child.height;

    if (previousTop < helper.offsetY - helper.bufferSize) {
      break;
    }
  }
}

class SimpleArrayDataSource extends ArrayDataSource<ListItem> {
  constructor() {
    super();
  }
}
