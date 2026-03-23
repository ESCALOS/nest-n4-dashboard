import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

/**
 * Shared service that holds the SSE refresh Subject for container monitoring.
 * Both the controller (SSE endpoint) and the background job
 * inject the same singleton, so signals reach all subscribers.
 */
@Injectable()
export class ContainersEventService {
    private readonly refreshSubject = new Subject<void>();
    private readonly vesselsSubject = new Subject<void>();

    /** Observable that the SSE stream endpoint subscribes to */
    readonly refresh$ = this.refreshSubject.asObservable();

    /** Observable that the SSE vessels/stream endpoint subscribes to */
    readonly vessels$ = this.vesselsSubject.asObservable();

    /** Called by the background job after refreshing container data */
    notifyRefresh(): void {
        this.refreshSubject.next();
    }

    /** Called when monitored vessels list changes (add/remove) */
    notifyVesselsChanged(): void {
        this.vesselsSubject.next();
    }
}
