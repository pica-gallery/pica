import {Directive, effect, ElementRef, HostListener, input, Renderer2} from '@angular/core';
import {UrlTree} from '@angular/router';
import {type NavAction, NavigationService} from '../service/navigation';

@Directive({
  standalone: true,
  selector: '[appNavLink]'
})
export class NavLinkDirective {
  public tree!: UrlTree;

  public readonly action = input.required<NavAction>({alias: 'appNavLink'});

  constructor(
    private readonly navigationService: NavigationService,
    private readonly host: ElementRef,
    private readonly renderer2: Renderer2,
  ) {
    effect(() => {
      this.tree = this.navigationService.urlTreeOf(this.action());
      this.renderer2.setAttribute(this.host.nativeElement, 'href', this.tree.toString());
    });
  }

  @HostListener('click')
  public onClick() {
    this.navigationService.navigate(this.action());
  }
}
