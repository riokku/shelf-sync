import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';

import { HelpComponent } from './help.component';
import { NotificationService } from '../core/notification.service';
import { FeedbackModalComponent } from '../shared/components/feedback-modal/feedback-modal.component';
import { HELP_FAQ_SECTIONS } from '../shared/models/help-faq';

describe('HelpComponent', () => {
  let component: HelpComponent;
  let fixture: ComponentFixture<HelpComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HelpComponent],
      providers: [provideRouter([])]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HelpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('filteredSections', () => {
    it('returns every section unfiltered when the search box is empty', () => {
      expect(component.filteredSections).toEqual(HELP_FAQ_SECTIONS);
    });

    it('matches against the question text, case-insensitively', () => {
      component.searchTerm = 'INVITE MY TEAM';

      const questions = component.filteredSections.flatMap(section => section.items.map(item => item.question));
      expect(questions).toEqual(['How do I invite my team?']);
    });

    it('also matches against the answer text, not just the question', () => {
      // "reservation" only appears in this question's answer text, not in
      // any question itself worded that way — proves this isn't just a
      // question-only match.
      component.searchTerm = 'double-booked';

      const questions = component.filteredSections.flatMap(section => section.items.map(item => item.question));
      expect(questions).toContain('What\'s a reservation?');
    });

    it('drops a section entirely once none of its items match', () => {
      component.searchTerm = 'invite my team';

      expect(component.filteredSections.map(section => section.title)).toEqual(['Getting started']);
    });

    it('is empty for a term matching nothing', () => {
      component.searchTerm = 'xyzzy-not-a-real-word';

      expect(component.filteredSections).toEqual([]);
    });
  });

  describe('hasNoResults', () => {
    it('is false with an empty search box', () => {
      expect(component.hasNoResults).toBeFalse();
    });

    it('is true once a search matches nothing', () => {
      component.searchTerm = 'xyzzy-not-a-real-word';
      expect(component.hasNoResults).toBeTrue();
    });

    it('is false again once clearSearch() runs', () => {
      component.searchTerm = 'xyzzy-not-a-real-word';
      component.clearSearch();
      expect(component.hasNoResults).toBeFalse();
      expect(component.searchTerm).toBe('');
    });
  });

  describe('openFeedback()', () => {
    it('opens the feedback modal', () => {
      const dialog = TestBed.inject(MatDialog);
      const openSpy = spyOn(dialog, 'open').and.returnValue({ afterClosed: () => of(undefined) } as never);

      component.openFeedback();

      expect(openSpy).toHaveBeenCalledWith(FeedbackModalComponent, jasmine.anything());
    });

    it('toasts once the modal closes having actually sent feedback', () => {
      const dialog = TestBed.inject(MatDialog);
      spyOn(dialog, 'open').and.returnValue({ afterClosed: () => of(true) } as never);
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      component.openFeedback();

      expect(successSpy).toHaveBeenCalledWith('Thanks — your feedback has been sent.');
    });

    it('does not toast when the modal is dismissed without sending', () => {
      const dialog = TestBed.inject(MatDialog);
      spyOn(dialog, 'open').and.returnValue({ afterClosed: () => of(undefined) } as never);
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      component.openFeedback();

      expect(successSpy).not.toHaveBeenCalled();
    });
  });
});
