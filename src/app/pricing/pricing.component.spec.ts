import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PricingComponent } from './pricing.component';

describe('PricingComponent', () => {
  let component: PricingComponent;
  let fixture: ComponentFixture<PricingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PricingComponent],
      providers: [provideRouter([])]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PricingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders all three tiers, with Basic highlighted as most popular', () => {
    const cards = (fixture.nativeElement as HTMLElement).querySelectorAll('.tier-card');
    expect(cards.length).toBe(3);

    const highlighted = (fixture.nativeElement as HTMLElement).querySelectorAll('.tier-highlighted');
    expect(highlighted.length).toBe(1);
    expect(highlighted[0].textContent).toContain('Basic');
  });
});
