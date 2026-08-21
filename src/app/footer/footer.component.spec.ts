import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';

import { FooterComponent } from './footer.component';

describe('FooterComponent', () => {
  let component: FooterComponent;
  let fixture: ComponentFixture<FooterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FooterComponent],
      providers: [provideRouter([])]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FooterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the Pricing/Privacy/Terms links by default', () => {
    expect(fixture.debugElement.query(By.css('.footer-links'))).not.toBeNull();
  });

  it('hides the Pricing/Privacy/Terms links when showLegalLinks is false — AppComponent\'s own usage, for every signed-in page', () => {
    component.showLegalLinks = false;
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.footer-links'))).toBeNull();
  });

  it('shows the "Created by Studio Rio" credit next to the logo', () => {
    const brand = fixture.debugElement.query(By.css('.footer-brand'));
    expect(brand).not.toBeNull();
    expect(brand.nativeElement.textContent).toContain('Created by');
    expect(brand.nativeElement.textContent).toContain('Studio Rio');
    expect(brand.query(By.css('img'))).not.toBeNull();
  });

  // Regression coverage: .footer-wrapper used to wrap its content in a
  // Bootstrap .row/.col-12 pair, whose negative margin only partially
  // canceled this element's own padding, leaving the column's own gutter
  // padding stacked on top — an uneven double-inset instead of the single,
  // predictable one this padding alone now provides on its own (matching
  // HeaderComponent's own plain .header-wrapper, no Bootstrap grid at all).
  it('renders .footer-content directly under .footer-wrapper, with no Bootstrap grid wrapper in between', () => {
    const wrapper = fixture.nativeElement.querySelector('.footer-wrapper') as HTMLElement;
    const content = fixture.nativeElement.querySelector('.footer-content') as HTMLElement;

    expect(content.parentElement).toBe(wrapper);
    expect(fixture.nativeElement.querySelector('.row')).toBeNull();
    expect(fixture.nativeElement.querySelector('.col-12')).toBeNull();
  });

  it('keeps the brand block (logo + credit text) as the last flex child, flush against the content\'s own right edge', () => {
    const content = fixture.nativeElement.querySelector('.footer-content') as HTMLElement;
    expect(content.lastElementChild?.classList.contains('footer-brand')).toBeTrue();
  });
});
