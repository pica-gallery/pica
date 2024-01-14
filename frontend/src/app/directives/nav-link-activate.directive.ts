import {
  Directive,
  ElementRef,
  Input,
  type OnChanges,
  type OnDestroy,
  Renderer2,
  type SimpleChanges
} from '@angular/core';
import {NavigationEnd, Router} from '@angular/router';
import type {Subscription} from 'rxjs';
import {NavLinkDirective} from './nav-link.directive';

@Directive({
  standalone: true,
  selector: '[appNavLinkActive]'
})
export class NavLinkActivateDirective implements OnChanges, OnDestroy {
  private readonly subscription: Subscription;

  @Input({alias: 'appNavLinkActive'})
  public activeClass: string = '';

  constructor(
    private readonly host: ElementRef<HTMLElement>,
    private readonly renderer: Renderer2,
    private readonly router: Router,
    private readonly link: NavLinkDirective,
  ) {
    this.subscription = router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.update();
      }
    });
  }

  ngOnChanges(_changes: SimpleChanges) {
    this.update();
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  private update() {
    if (!this.router.navigated) {
      return
    }

    const isActive = this.router.isActive(this.link.tree, {
      paths: 'exact',
      fragment: 'ignored',
      queryParams: 'ignored',
      matrixParams: 'ignored',
    });

    if (isActive) {
      this.renderer.addClass(this.host.nativeElement, this.activeClass);
    } else {
      this.renderer.removeClass(this.host.nativeElement, this.activeClass);
    }
  }
}
