import { TestBed } from '@angular/core/testing';
import { GlobalErrorHandler } from './global-error-handler';
import { SupabaseService } from './supabase.service';
import { createFakeSupabaseService } from '../testing/fakes';

describe('GlobalErrorHandler', () => {
  let handler: GlobalErrorHandler;
  let rpcSpy: jasmine.Spy;

  beforeEach(() => {
    const supabase = createFakeSupabaseService();
    rpcSpy = spyOn(supabase.client, 'rpc').and.callThrough();

    TestBed.configureTestingModule({
      providers: [
        GlobalErrorHandler,
        { provide: SupabaseService, useValue: supabase }
      ]
    });

    handler = TestBed.inject(GlobalErrorHandler);
    spyOn(console, 'error');
  });

  it('should create', () => {
    expect(handler).toBeTruthy();
  });

  it('logs a real Error with its message and stack', () => {
    const error = new Error('boom');

    handler.handleError(error);

    expect(rpcSpy).toHaveBeenCalledWith('log_client_error', jasmine.objectContaining({
      p_message: 'boom',
      p_stack: error.stack
    }));
  });

  it('normalizes a thrown string (no stack available)', () => {
    handler.handleError('something went wrong');

    expect(rpcSpy).toHaveBeenCalledWith('log_client_error', jasmine.objectContaining({
      p_message: 'something went wrong',
      p_stack: undefined
    }));
  });

  it('still logs to the console (preserves Angular default dev visibility)', () => {
    handler.handleError(new Error('boom'));

    expect(console.error).toHaveBeenCalled();
  });
});
