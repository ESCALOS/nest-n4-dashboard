export interface ContainerBookingExportItemDto {
    line: string;
    manifest: string;
    vessel: string;
    poo: string;
    pol: string;
    pod: string;
    fds: string;
    appointment: string;
    booking: string;
    container_number: string;
    iso_code: string;
    type: string;
    total: number;
    status: 'CLIENT' | 'FULL' | 'EMPTY';
    status2: 'ATENDIDO' | 'PENDIENTE';
    commodity: string;
    temperature: string | number;
    reefer_technology: string;
    shipper: string;
}
