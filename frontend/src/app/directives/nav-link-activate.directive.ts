import {Directive, effect, ElementRef, input, Renderer2} from '@angular/core';
import {NavigationEnd, Router} from '@angular/router';
import {NavLinkDirective} from './nav-link.directive';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';

@Directive({
  standalone: true,
  selector: '[appNavLinkActive]'
})
export class NavLinkActivateDirective {
  public readonly activeClass = input('', {alias: 'appNavLinkActive'});

  constructor(
    private readonly host: ElementRef<HTMLElement>,
    private readonly renderer: Renderer2,
    private readonly router: Router,
    private readonly link: NavLinkDirective,
  ) {
    router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.update();
      }
    });

    effect(() => {
      // force read the signal to run updates on changes
      this.activeClass();
      this.update()
    });
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
      this.renderer.addClass(this.host.nativeElement, this.activeClass());
    } else {
      this.renderer.removeClass(this.host.nativeElement, this.activeClass());
    }
  }
}
