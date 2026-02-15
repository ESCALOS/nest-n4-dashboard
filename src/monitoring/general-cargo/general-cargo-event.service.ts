import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

/**
 * Shared service that holds the SSE refresh Subject for general cargo monitoring.
 * Both the controller (SSE endpoint) and the background job
 * inject the same singleton, so signals reach all subscribers.
 */
@Injectable()
export class GeneralCargoEventService {
    private readonly refreshSubject = new Subject<void>();
    private readonly operationsSubject = new Subject<void>();

    /** Observable that the SSE stream endpoint subscribes to */
    readonly refresh$ = this.refreshSubject.asObservable();

    /** Observable that the SSE operations/stream endpoint subscribes to */
    readonly operations$ = this.operationsSubject.asObservable();

    /** Called by the background job after refreshing transactions */
    notifyRefresh(): void {
        this.refreshSubject.next();
    }

    /** Called when monitored operations list changes (add/remove) */
    notifyOperationsChanged(): void {
        this.operationsSubject.next();
    }
}
