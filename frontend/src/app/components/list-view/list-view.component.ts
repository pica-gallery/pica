import {
  type AfterViewInit,
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  ContentChild,
  ElementRef,
  inject,
  Input,
  NgZone,
  TemplateRef,
  ViewChild,
  ViewRef
} from '@angular/core';
import {enterNgZone, observeElementSize} from '../../util';
import {distinctUntilChanged, filter, map} from 'rxjs';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import PointerTracker from 'pointer-tracker';

type Item = {
  id: unknown,
}

type Child = {
  id: unknown,
  node: HTMLElement,
  ref: ViewRef,
  height: number | null,
  top: number | null,
  dirty: boolean,
  index: number,
}

@Component({
  selector: 'app-list-view',
  standalone: true,
  imports: [],
  templateUrl: './list-view.component.html',
  styleUrl: './list-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ListViewComponent implements AfterViewInit {
  private readonly applicationRef = inject(ApplicationRef);
  private readonly ngZone = inject(NgZone);

  private readonly root: ElementRef<HTMLElement> = inject(ElementRef);

  @ViewChild('Canvas')
  protected canvas!: ElementRef<HTMLElement>;

  @ContentChild(TemplateRef)
  private readonly rowTemplate!: TemplateRef<unknown>

  // the index of the first visible item
  protected firstVisible: number = 0;

  // top position of the first visible item
  protected firstTop: number = 0;

  protected offsetY: number = 0;

  protected lastRootHeight = 0;
  protected children: Child[] = [];

  private flingSpeed: number = 0;
  private flingRAF: number | null = null;

  private readonly observer = new ResizeObserver(entries => this.resizeObserver(entries));

  @Input({required: true})
  public items!: Item[]

  @Input()
  public minHeight = 100;

  constructor() {
    observeElementSize(this.root.nativeElement)
      .pipe(
        map(sizes => sizes.height),
        filter(height => height > 0),
        distinctUntilChanged(),
        takeUntilDestroyed(),
        enterNgZone(this.ngZone),
      )
      .subscribe(height => this.updateContent(height));
  }

  ngAfterViewInit() {
    this.ngZone.runOutsideAngular(() => {
      let dy = 0;

      const tracker: PointerTracker = new PointerTracker(this.root.nativeElement, {
        start: () => {
          // stop flinging now
          this.fling(0);
          dy = 0;

          return tracker.currentPointers.length == 0;
        },

        move: previousPointers => {
          const prev = previousPointers[0];
          dy = prev.pageY - tracker.currentPointers[0].pageY;
          this.offsetY += dy;
          this.updateContent();
        },

        end: () => {
          if (Math.abs(dy) >= 1) {
            this.fling(2*dy);
          }
        }
      })

      this.root.nativeElement.addEventListener('wheel', event => {
        this.offsetY += event.deltaY;
        this.updateContent();
      })
    });
  }

  protected fling(speed: number) {
    this.flingSpeed = speed;

    if (speed != 0 && this.flingRAF == null) {
      const callback = () => {
        this.flingRAF = null;
        this.animate();
      };

      this.flingRAF = this.ngZone.runOutsideAngular(() => requestAnimationFrame(callback));
    }

    if (speed == 0 && this.flingRAF != null) {
      cancelAnimationFrame(this.flingRAF);
      this.flingRAF = null;
    }
  }

  private animate() {
    let newSpeed = Math.abs(this.flingSpeed) < 1 ? 0 : this.flingSpeed * 0.95;
    this.fling(newSpeed);

    this.offsetY += newSpeed;
    this.updateContent();
  }

  protected updateContent(height: number = this.lastRootHeight) {
    this.lastRootHeight = height;

    const amountToShow = Math.ceil(height / this.minHeight);
    // console.debug('Want to show %d items', amountToShow);

    const firstVisibleChild = this.children.find(child => {
      return child.top != null
        && child.height != null
        && child.top <= this.offsetY && this.offsetY < child.top + child.height
    })

    if (firstVisibleChild) {
      const firstVisibleIdx = firstVisibleChild.index;

      if (this.firstVisible !== firstVisibleIdx) {
        console.info('First visible is now', firstVisibleIdx);
        this.firstVisible = Math.max(0, firstVisibleIdx);
        this.firstTop = firstVisibleChild.top!;
      }
    }

    // only keep a few elements above the window
    for (const child of [...this.children]) {
      if (child.index < this.firstVisible - 3 || child.index > this.firstVisible + amountToShow) {
        console.info('Remove child', child.index);
        this.children = this.children.filter(ch => ch !== child);
        this.canvas.nativeElement.removeChild(child.node);
        this.destroyChild(child);
      }
    }

    // fill elements starting at the first one to show
    for (let i = -3; i < amountToShow; i++) {
      const index = i + this.firstVisible;

      const item = this.items[index];
      if (item == null) {
        // no such item, stop here
        continue;
      }

      let child = this.children.find(child => child.id === item.id);
      if (child != null) {
        // the child already exists, nothing to do here
        continue;
      }

      console.info('Create child', index);

      // create the child and insert it into the view at the right place
      child = this.createChild(item, index);
      this.children.push(child);
      this.canvas.nativeElement.append(child.node);
    }

    this.layout();

    if (this.children.length) {
      const last = this.children[this.children.length - 1];
      if (last.top != null && last.height) {
        if (this.offsetY + this.lastRootHeight > last.top + last.height) {
          this.offsetY = last.top + last.height - this.lastRootHeight
        }
      }

      const first = this.children[0];
      if (first.top != null && this.offsetY < first.top) {
        this.offsetY = first.top;
      }
    } else {
      this.offsetY = 0;
    }

    // apply transform
    this.canvas.nativeElement.style.setProperty('--offset-y', (-this.offsetY) + 'px');
  }

  private layout() {
    let top = this.firstTop;

    this.children.sort((lhs, rhs) => {
      return lhs.index - rhs.index;
    })

    for (const child of this.children) {
      if (child.height == null) {
        continue;
      }

      if (child.index >= this.firstVisible) {
        if (child.top == null) {
          child.node.classList.add('layouted');
        }

        child.dirty = false;
        child.top = top;
        child.node.style.top = top + 'px';

        top += child.height;
      }
    }

    top = this.firstTop;

    // layout the children above the anchor
    for (const child of [...this.children].reverse()) {
      if (child.height == null) {
        continue;
      }

      if (child.index < this.firstVisible) {
        if (child.top == null) {
          child.node.classList.add('layouted');
        }

        top -= child.height;

        child.dirty = false;
        child.top = top;
        child.node.style.top = top + 'px';
      }
    }
  }

  private createChild(item: Item, idx: number): Child {
    return this.ngZone.run(() => {
      const ref = this.rowTemplate.createEmbeddedView({$implicit: item})
      this.applicationRef.attachView(ref);

      const node = document.createElement('div');
      node.append(...ref.rootNodes);

      this.observer.observe(node, {box: 'border-box'});

      return {id: item.id, node, top: null, height: null, dirty: false, index: idx, ref}
    });
  }

  private destroyChild(child: Child) {
    this.observer.unobserve(child.node);
    child.ref.destroy();
  }

  private resizeObserver(entries: ResizeObserverEntry[]) {
    for (const entry of entries) {
      const child = this.children.find(child => child.node === entry.target);
      if (child == null) {
        continue;
      }

      const height = entry.borderBoxSize[0].blockSize;
      if (child.height != height && height > 0) {
        console.info('Got size for child', child.index);
        child.height = height;
        child.dirty = true;
      }
    }

    requestAnimationFrame(() => this.layout());
  }
}
