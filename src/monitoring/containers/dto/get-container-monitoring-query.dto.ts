import { IsNotEmpty, IsString } from 'class-validator';

export class GetContainerMonitoringQueryDto {
    @IsString()
    @IsNotEmpty()
    manifest_id: string;
}
