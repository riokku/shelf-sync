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
});
