import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfettiBurstComponent } from './confetti-burst.component';

describe('ConfettiBurstComponent', () => {
  let fixture: ComponentFixture<ConfettiBurstComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfettiBurstComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(ConfettiBurstComponent);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('generates a full burst of pieces, each with its own randomized fall', () => {
    const pieces = fixture.componentInstance.pieces;

    expect(pieces.length).toBe(70);
    // Not every piece landing on the exact same left offset is itself proof
    // of randomization, but it's a cheap smoke check that Math.random() is
    // actually driving this rather than every piece sharing one fixed spot.
    expect(new Set(pieces.map(p => p.left)).size).toBeGreaterThan(1);
  });

  it('renders one .confetti-piece element per generated piece', () => {
    const rendered = fixture.nativeElement.querySelectorAll('.confetti-piece');
    expect(rendered.length).toBe(fixture.componentInstance.pieces.length);
  });
});
