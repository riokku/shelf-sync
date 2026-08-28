import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PageHeaderComponent } from './page-header.component';

describe('PageHeaderComponent', () => {
  async function createComponent(): Promise<ComponentFixture<PageHeaderComponent>> {
    await TestBed.configureTestingModule({
      imports: [PageHeaderComponent]
    }).compileComponents();
    return TestBed.createComponent(PageHeaderComponent);
  }

  it('renders the icon and title', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.icon = 'bar_chart';
    fixture.componentInstance.title = 'Reports';
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('mat-icon')?.textContent).toContain('bar_chart');
    expect(el.querySelector('h2')?.textContent).toContain('Reports');
  });

  it('omits the subtitle paragraph entirely when none is given', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.icon = 'bar_chart';
    fixture.componentInstance.title = 'Reports';
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.page-header-subtitle')).toBeNull();
  });

  it('applies the danger icon variant only when requested', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.icon = 'warning';
    fixture.componentInstance.title = 'Danger Zone';
    fixture.componentInstance.variant = 'danger';
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.page-header-icon-danger')).not.toBeNull();
  });

  it('renders an <img> instead of the mat-icon when logoUrl is set', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.icon = 'apartment';
    fixture.componentInstance.title = 'Gatherwell Events Co.';
    fixture.componentInstance.logoUrl = 'https://example.com/logo.png';
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.page-header-icon-logo img')?.getAttribute('src')).toBe('https://example.com/logo.png');
    expect(el.querySelector('mat-icon')).toBeNull();
  });

  it('falls back to the mat-icon when logoUrl is unset', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.icon = 'apartment';
    fixture.componentInstance.title = 'Gatherwell Events Co.';
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('mat-icon')?.textContent).toContain('apartment');
  });

  it('renders a subtitle when given', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.icon = 'bar_chart';
    fixture.componentInstance.title = 'Reports';
    fixture.componentInstance.subtitle = 'A snapshot of where things stand right now.';
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.page-header-subtitle')?.textContent)
      .toContain('A snapshot of where things stand right now.');
  });

  it('stays plain when zone is unset, even with an icon', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.icon = 'storefront';
    fixture.componentInstance.title = 'Suppliers';
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.page-header-zone')).toBeNull();
    expect(el.querySelector('.page-header-ghost-icon')).toBeNull();
    expect(el.querySelector('.page-header-rule')).toBeNull();
  });

  it('adds the zone wash, watermark, and rule once a zone is set', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.icon = 'storefront';
    fixture.componentInstance.title = 'Suppliers';
    fixture.componentInstance.zone = 'inventory';
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.page-header-zone-inventory')).not.toBeNull();
    expect(el.querySelector('.page-header-ghost-icon')?.textContent).toContain('storefront');
    expect(el.querySelector('.page-header-rule')).not.toBeNull();
  });

  it('omits the watermark when a zone is set but there is no icon', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.title = 'Reports';
    fixture.componentInstance.zone = 'insights';
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.page-header-ghost-icon')).toBeNull();
  });
});

@Component({
  standalone: true,
  imports: [PageHeaderComponent],
  template: `
    <app-page-header icon="local_shipping" title="Orders">
      <span headerTitleExtra>(extra)</span>
      <button type="button">Place order</button>
    </app-page-header>
  `
})
class PageHeaderProjectionHost { }

describe('PageHeaderComponent content projection', () => {
  it('projects headerTitleExtra content inside the title and default content into the actions slot', async () => {
    await TestBed.configureTestingModule({
      imports: [PageHeaderProjectionHost]
    }).compileComponents();

    const fixture = TestBed.createComponent(PageHeaderProjectionHost);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('h2')?.textContent).toContain('Orders');
    expect(el.querySelector('h2')?.textContent).toContain('(extra)');
    expect(el.querySelector('.page-header-actions button')?.textContent).toContain('Place order');
  });
});

@Component({
  standalone: true,
  imports: [PageHeaderComponent],
  template: `
    <app-page-header title="Task throughput" zone="insights">
      <span headerFigure class="fake-ring">72%</span>
    </app-page-header>
  `
})
class PageHeaderFigureHost { }

describe('PageHeaderComponent headerFigure projection', () => {
  it('projects headerFigure content in place of the plain icon chip', async () => {
    await TestBed.configureTestingModule({
      imports: [PageHeaderFigureHost]
    }).compileComponents();

    const fixture = TestBed.createComponent(PageHeaderFigureHost);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.page-header-figure .fake-ring')?.textContent).toContain('72%');
    expect(el.querySelector('.page-header-icon')).toBeNull();
  });
});
