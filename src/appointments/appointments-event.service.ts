import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

/**
 * Shared service that holds the SSE refresh Subject.
 * Both the controller (SSE endpoint) and the background job
 * inject the same singleton, so signals reach all subscribers.
 */
@Injectable()
export class AppointmentsEventService {
    private readonly refreshSubject = new Subject<void>();

    /** Observable that the SSE endpoint subscribes to */
    readonly refresh$ = this.refreshSubject.asObservable();

    /** Called by the background job after refreshing data */
    notifyRefresh(): void {
        this.refreshSubject.next();
    }
}
