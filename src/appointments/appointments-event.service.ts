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
    private readonly pendingRefreshSubject = new Subject<void>();

    /** Observable that the SSE endpoint subscribes to (in-progress) */
    readonly refresh$ = this.refreshSubject.asObservable();

    /** Observable that the SSE endpoint subscribes to (pending) */
    readonly pendingRefresh$ = this.pendingRefreshSubject.asObservable();

    /** Called by the background job after refreshing in-progress data */
    notifyRefresh(): void {
        this.refreshSubject.next();
    }

    /** Called by the background job after refreshing pending data */
    notifyPendingRefresh(): void {
        this.pendingRefreshSubject.next();
    }
}
