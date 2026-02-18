export class HoldAlertDto {
    type: 'missing' | 'unrecognized';
    hold: string;
    units: string[];
}
