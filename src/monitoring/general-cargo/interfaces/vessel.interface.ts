import { OperationType } from "../enums/operation-type.enum";
import { Manifest } from "./manifest.interface";
import { Summary } from "./summary.interface";
import { Transaction } from "./transaction.interface";

export interface Vessel {
    manifest: Manifest;
    operationType: OperationType;
    summary: {
        holds: Summary[];
        services: Summary[];
    };
    last_update: string;
    shifts_worked: string[];
    transactions: Transaction[];
}