import {ComponentRef, createComponent, EnvironmentInjector, type Type} from '@angular/core';

export type DetachedChild = {
  node: HTMLElement,
  ref: ComponentRef<unknown>,
}

export class ViewRecycler {
  constructor(
    private readonly injector: EnvironmentInjector,
    public perComponentCacheSize: number = 10,
  ) {
  }

  readonly _views = new Map<Type<unknown>, DetachedChild[]>();

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
    let cache = this._views.get(child.ref.componentType);
    if (cache == null) {
      this._views.set(child.ref.componentType, cache = []);
    }

    if (cache.length >= this.perComponentCacheSize) {
      // we have enough items in the views, remove this one.
      this.destroyChild(child);
      return;
    }

    cache.push(child);
  }

  public get(componentType: Type<unknown>): DetachedChild {
    return this.cachedChild(componentType) ?? this.createChild(componentType)
  }

  private cachedChild(componentType: Type<unknown>): DetachedChild | null {
    const child = this._views.get(componentType)?.pop();
    if (child == null) {
      return null;
    }

    return child;
  }


  private createChild(componentType: Type<unknown>): DetachedChild {
    const node = document.createElement('div');

    const ref = createComponent(componentType, {
      environmentInjector: this.injector,
    })

    return {node, ref}
  }

  private destroyChild(child: DetachedChild) {
    child.ref.destroy();
    child.node.innerHTML = '';
  }
}
