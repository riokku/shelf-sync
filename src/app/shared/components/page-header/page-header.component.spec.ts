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

  it('renders a subtitle when given', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.icon = 'bar_chart';
    fixture.componentInstance.title = 'Reports';
    fixture.componentInstance.subtitle = 'A snapshot of where things stand right now.';
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.page-header-subtitle')?.textContent)
      .toContain('A snapshot of where things stand right now.');
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
