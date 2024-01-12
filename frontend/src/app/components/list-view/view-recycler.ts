import {
  type ApplicationRef,
  ComponentRef,
  createComponent,
  EmbeddedViewRef,
  EnvironmentInjector,
  EventEmitter,
  TemplateRef,
  type Type
} from '@angular/core';
import type {ListItem} from './list-view.component';
import {Subscription} from 'rxjs';

export type ViewType = Type<unknown> | TemplateRef<unknown>;

export type DetachedChild = {
  node: HTMLElement,
  view: View,
}

export class ViewRecycler {
  constructor(
    private readonly injector: EnvironmentInjector,
    public perComponentCacheSize: number = 10,
  ) {
  }

  readonly _views = new Map<ViewType, DetachedChild[]>();

  public get views(): DetachedChild[] {
    return [...this._views.values()].flat(1)
  }

  public destroyAll() {
    for (const child of this.views) {
      this.destroyChild(child);
    }

    this._views.clear();
  }

  public cacheChild(child: DetachedChild) {
    let cache = this._views.get(child.view.viewType);
    if (cache == null) {
      this._views.set(child.view.viewType, cache = []);
    }

    if (cache.length >= this.perComponentCacheSize) {
      // we have enough items in the views, remove this one.
      this.destroyChild(child);
      return;
    }

    cache.push(child);
  }

  public get(componentType: ViewType): DetachedChild {
    return this.cachedChild(componentType) ?? this.createChild(componentType)
  }

  private cachedChild(componentType: ViewType): DetachedChild | null {
    return this._views.get(componentType)?.pop() ?? null;
  }

  private createChild(componentType: ViewType): DetachedChild {
    const node = document.createElement('div');

    if (componentType instanceof TemplateRef) {
      const view = new TemplateView(
        componentType,
        componentType.createEmbeddedView({$implicit: null}, this.injector),
      )

      return {node, view}
    }

    // instantiate component directly
    const view = new ComponentView(
      createComponent(componentType, {
        environmentInjector: this.injector,
      }),
    );

    return {node, view}
  }

  private destroyChild(child: DetachedChild) {
    child.view.destroy();
    child.node.innerHTML = '';
  }
}

export interface View {
  viewType: ViewType

  bindValues(item: ListItem): void

  appendTo(container: HTMLElement): void

  attach(app: ApplicationRef): void

  detach(app: ApplicationRef): void;

  destroy(): void

  detectChanges(): void
}

class ComponentView implements View {
  private subscription: Subscription | null = null;

  constructor(
    private readonly ref: ComponentRef<unknown>,
  ) {
  }

  get viewType(): ViewType {
    return this.ref.componentType
  }

  bindValues(item: ListItem): void {
    if ('inputs' in item) {
      if (item.inputs) {
        for (const [key, value] of Object.entries(item.inputs)) {
          this.ref.setInput(key, value)
        }
      }

      this.subscription?.unsubscribe();

      if (item.outputs) {
        this.subscription = new Subscription();

        for (const [key, value] of Object.entries(item.outputs)) {
          const output = (this.ref.instance as any)[key];

          if (output instanceof EventEmitter) {
            this.subscription.add(
              output.subscribe(event => value(event))
            );
          }
        }
      }
    }
  }

  appendTo(container: HTMLElement): void {
    container.appendChild(this.ref.location.nativeElement);
  }

  attach(app: ApplicationRef): void {
    app.attachView(this.ref.hostView)
  }

  detach(app: ApplicationRef): void {
    app.detachView(this.ref.hostView);
  }

  detectChanges(): void {
    this.ref.changeDetectorRef.detectChanges()
  }

  destroy() {
    this.ref.destroy();
  }
}

class TemplateView implements View {
  constructor(
    readonly viewType: TemplateRef<unknown>,
    private readonly ref: EmbeddedViewRef<unknown>) {
  }

  bindValues(item: ListItem): void {
    if ('context' in item) {
      const context: any = this.ref.context;
      context.$implicit = item.context
      this.ref.markForCheck()
    }
  }

  appendTo(container: HTMLElement): void {
    container.append(...this.ref.rootNodes);
  }

  attach(app: ApplicationRef): void {
    app.attachView(this.ref);
  }

  detach(app: ApplicationRef): void {
    app.detachView(this.ref);
  }

  detectChanges(): void {
    this.ref.detectChanges()
  }

  destroy() {
    this.ref.destroy();
  }
}
