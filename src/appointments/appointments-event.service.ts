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
    private readonly upcomingRefreshSubject = new Subject<void>();

    /** Observable that the SSE endpoint subscribes to (in-progress) */
    readonly refresh$ = this.refreshSubject.asObservable();

    /** Observable that the SSE endpoint subscribes to (upcoming) */
    readonly upcomingRefresh$ = this.upcomingRefreshSubject.asObservable();

    /** Called by the background job after refreshing in-progress data */
    notifyRefresh(): void {
        this.refreshSubject.next();
    }

    /** Called by the background job after refreshing upcoming data */
    notifyUpcomingRefresh(): void {
        this.upcomingRefreshSubject.next();
    }
}
