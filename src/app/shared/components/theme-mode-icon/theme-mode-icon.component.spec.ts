import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ThemeModeIconComponent } from './theme-mode-icon.component';

async function createComponent(): Promise<ComponentFixture<ThemeModeIconComponent>> {
  await TestBed.configureTestingModule({
    imports: [ThemeModeIconComponent]
  }).compileComponents();
  return TestBed.createComponent(ThemeModeIconComponent);
}

describe('ThemeModeIconComponent', () => {
  it('adds the is-dark class in dark mode', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.mode = 'dark';
    fixture.detectChanges();

    const svg: SVGElement = fixture.nativeElement.querySelector('.theme-mode-icon');
    expect(svg.classList.contains('is-dark')).toBe(true);
  });

  it('omits the is-dark class in light mode', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.mode = 'light';
    fixture.detectChanges();

    const svg: SVGElement = fixture.nativeElement.querySelector('.theme-mode-icon');
    expect(svg.classList.contains('is-dark')).toBe(false);
  });

  it('renders eight rays around the body circle', async () => {
    const fixture = await createComponent();
    fixture.detectChanges();

    const rays = fixture.nativeElement.querySelectorAll('.theme-mode-icon-ray');
    expect(rays.length).toBe(8);
  });

  it('gives each instance its own mask id, so two icons on the same page never collide', async () => {
    await TestBed.configureTestingModule({ imports: [ThemeModeIconComponent] }).compileComponents();
    const first = TestBed.createComponent(ThemeModeIconComponent);
    first.detectChanges();
    const second = TestBed.createComponent(ThemeModeIconComponent);
    second.detectChanges();

    const firstMaskId = first.componentInstance.maskId;
    const secondMaskId = second.componentInstance.maskId;

    expect(firstMaskId).not.toBe(secondMaskId);
    expect(first.nativeElement.querySelector(`mask#${firstMaskId}`)).toBeTruthy();
    expect(first.nativeElement.querySelector('.theme-mode-icon-body').getAttribute('mask')).toBe(`url(#${firstMaskId})`);
  });
});
