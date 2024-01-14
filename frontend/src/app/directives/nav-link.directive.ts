import {Directive, ElementRef, HostListener, Input, type OnChanges, Renderer2, type SimpleChanges} from '@angular/core';
import {UrlTree} from '@angular/router';
import {type NavAction, NavigationService} from '../service/navigation';

@Directive({
  standalone: true,
  selector: '[appNavLink]'
})
export class NavLinkDirective implements OnChanges {
  public tree!: UrlTree;

  @Input({alias: 'appNavLink'})
  public action!: NavAction

  constructor(
    private readonly navigationService: NavigationService,
    private readonly host: ElementRef,
    private readonly renderer2: Renderer2,
  ) {
  }

  ngOnChanges(_changes: SimpleChanges) {
    this.tree = this.navigationService.urlTreeOf(this.action);
    this.renderer2.setAttribute(this.host.nativeElement, 'href', this.tree.toString());
  }

  @HostListener("click")
  public onClick() {
    this.navigationService.navigate(this.action);
  }
}
