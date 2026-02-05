# Terminal Operations API - Architecture Plan

## Overview

This document outlines the architecture for a NestJS API that provides terminal operations data from an N4 (Navis) database. The system consists of two main modules:

1. **Shipping Module (General Cargo)**: Vessel monitoring with operations like ACOPIO, EMBARQUE_INDIRECTO, DESPACHO, EMBARQUE_DIRECTO, DESCARGA
2. **Appointments Module (Containers)**: Real-time tracking of container appointments in progress (Citas en Proceso de Atención)

## System Architecture

```mermaid
flowchart TB
    subgraph Client
        API[API Client]
    end

    subgraph NestJS Application
        subgraph Auth Layer
            AuthModule[Auth Module]
            AuthGuard[JWT Guard]
        end

        subgraph Business Modules
            subgraph Shipping - General Cargo
                ShippingController[Shipping Controller]
                ShippingService[Shipping Service]
            end
            subgraph Appointments - Containers
                ApptsController[Appointments Controller]
                ApptsService[Appointments Service]
            end
        end

        subgraph Background Jobs
            TxRefreshJob[Transaction Refresh - 15s]
            ApptsRefreshJob[Appointments Refresh - 5s]
        end

        subgraph Data Layer
            N4Service[N4 Database Service]
            RedisService[Redis Service]
            PrismaService[Prisma Service]
        end

        subgraph Queries
            QueryRepository[Query Repository]
        end
    end

    subgraph Databases
        PostgreSQL[(PostgreSQL - Users/Auth)]
        SQLServer[(SQL Server - N4 Terminal)]
        Redis[(Redis - Cache)]
    end

    API --> AuthGuard
    AuthGuard --> ShippingController
    AuthGuard --> ApptsController
    ShippingController --> ShippingService
    ApptsController --> ApptsService
    ShippingService --> RedisService
    ApptsService --> RedisService
    TxRefreshJob --> N4Service
    TxRefreshJob --> RedisService
    ApptsRefreshJob --> N4Service
    ApptsRefreshJob --> RedisService
    N4Service --> QueryRepository
    N4Service --> SQLServer
    RedisService --> Redis
    AuthModule --> PrismaService
    PrismaService --> PostgreSQL
```

## Data Flow

```mermaid
sequenceDiagram
    participant Client
    participant Controller
    participant Service
    participant Cache
    participant N4DB as N4 Database

    Client->>Controller: GET /shipping/operations?manifestId=XXX&type=ACOPIO
    Controller->>Service: getOperations - manifestId, type

    Service->>Cache: Check manifest cache
    alt Cache Hit
        Cache-->>Service: Return cached manifest
    else Cache Miss
        Service->>N4DB: getManifest - manifestId
        N4DB-->>Service: cvGkey, vvdGkey, vesselName
        Service->>Cache: Store manifest - TTL 1h
    end

    Service->>Cache: Check bodegas cache
    alt Cache Hit
        Cache-->>Service: Return cached bodegas
    else Cache Miss
        Service->>N4DB: getBodegas - vvdGkey
        N4DB-->>Service: bodegas list
        Service->>Cache: Store bodegas - TTL 24h
    end

    Service->>Cache: Check BL items cache
    alt Cache Hit
        Cache-->>Service: Return cached BL items
    else Cache Miss
        Service->>N4DB: getBLItems - cvGkey, pattern
        N4DB-->>Service: BL items list
        Service->>Cache: Store BL items - TTL 24h
    end

    Service->>N4DB: getTransactions - blItemGkeys, type
    N4DB-->>Service: transactions data

    Service->>Service: Aggregate and format response
    Service-->>Controller: Formatted response
    Controller-->>Client: JSON Response
```

## Module Structure

```
src/
├── app.module.ts
├── main.ts
├── prisma.service.ts
│
├── auth/                          # Authentication module - existing
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   └── guards/
│       └── jwt-auth.guard.ts
│
├── users/                         # Users module - existing
│   └── ...
│
├── common/                        # Shared utilities
│   ├── constants/
│   │   └── cache-keys.constant.ts
│   └── interfaces/
│       └── cache-config.interface.ts
│
├── database/                      # Database connections
│   ├── database.module.ts
│   ├── n4/
│   │   ├── n4.module.ts
│   │   ├── n4.service.ts         # SQL Server connection
│   │   └── n4.queries.ts         # All N4 SQL queries
│   └── redis/
│       ├── redis.module.ts
│       └── redis.service.ts      # Redis connection using ioredis
│
├── shipping/                      # General Cargo - Vessel monitoring
│   ├── shipping.module.ts
│   ├── shipping.controller.ts
│   ├── shipping.service.ts
│   ├── dto/
│   │   ├── get-operations.dto.ts
│   │   ├── operation-response.dto.ts
│   │   ├── manifest.dto.ts
│   │   ├── bodega.dto.ts
│   │   └── bl-item.dto.ts
│   ├── enums/
│   │   └── operation-type.enum.ts
│   └── interfaces/
│       ├── transaction.interface.ts
│       └── aggregated-data.interface.ts
│
├── appointments/                  # Containers - Appointments in progress
│   ├── appointments.module.ts
│   ├── appointments.controller.ts
│   ├── appointments.service.ts
│   ├── dto/
│   │   └── appointment-in-progress.dto.ts
│   └── interfaces/
│       └── appointment.interface.ts
│
├── cache/                         # Cache management module
│   ├── cache.module.ts
│   ├── cache.controller.ts       # Cache invalidation endpoints
│   └── cache.service.ts          # Cache operations
│
├── jobs/                          # Background jobs module
│   ├── jobs.module.ts
│   ├── transaction-refresh.job.ts # 15-second refresh for shipping
│   └── appointments-refresh.job.ts # 5-second refresh for appointments (optional)
│
└── config/                        # Configuration
    ├── config.module.ts
    ├── database.config.ts
    └── redis.config.ts
```

## Database Connections

### PostgreSQL - Prisma - Users/Auth

- Keep existing Prisma setup for user management
- Used for authentication and authorization

### SQL Server - N4 Database

- New connection using `mssql` package
- Read-only access to N4 terminal data
- Connection pooling for performance

### Environment Variables

```env
# PostgreSQL - Prisma
DATABASE_URL=postgresql://user:password@host:5432/dbname

# SQL Server - N4
N4_DB_HOST=n4-server-host
N4_DB_PORT=1433
N4_DB_USER=n4_user
N4_DB_PASSWORD=n4_password
N4_DB_NAME=n4_database

# Cache Configuration
CACHE_TTL_MANIFEST=3600        # 1 hour
CACHE_TTL_BODEGAS=86400        # 24 hours
CACHE_TTL_BL_ITEMS=86400       # 24 hours

# JWT
JWT_SECRET=your-jwt-secret
JWT_EXPIRATION=3600
```

## API Endpoints

### Shipping Operations

| Method | Endpoint                                  | Description                            |
| ------ | ----------------------------------------- | -------------------------------------- |
| GET    | `/shipping/manifest/:manifestId`          | Get manifest info - vessel name, gkeys |
| GET    | `/shipping/manifest/:manifestId/bodegas`  | Get bodegas for a manifest             |
| GET    | `/shipping/manifest/:manifestId/bl-items` | Get BL items for a manifest            |
| GET    | `/shipping/operations`                    | Get aggregated operations data         |

### Operations Query Parameters

```typescript
// GET /shipping/operations
interface GetOperationsQuery {
  manifestId: string; // Required - Manifest ID
  operationType: OperationType; // Required - ACOPIO, EMBARQUE_INDIRECTO, DESPACHO, etc.
}
```

## DTOs and Interfaces

### Operation Types Enum

```typescript
enum OperationType {
  ACOPIO = 'ACOPIO',
  EMBARQUE_INDIRECTO = 'EMBARQUE_INDIRECTO',
  DESPACHO = 'DESPACHO',
  EMBARQUE_DIRECTO = 'EMBARQUE_DIRECTO',
  DESCARGA = 'DESCARGA',
}
```

### Unified Response Structure

All transaction queries return the same structure:

```typescript
interface TransactionRecord {
  bodega: string;
  blItemGkey: number;
  jornada: string;
  totalBultos: number;
  totalPeso: number;
}
```

### Aggregated Response

```typescript
interface OperationsResponse {
  manifest: {
    id: string;
    cvGkey: number;
    vvdGkey: number;
    vesselName: string;
  };
  bodegas: BodegaDto[];
  blItems: BlItemDto[];
  transactions: TransactionRecord[];
  summary: {
    totalBultos: number;
    totalPeso: number;
    byBodega: Record<string, { bultos: number; peso: number }>;
    byJornada: Record<string, { bultos: number; peso: number }>;
  };
}
```

## Caching Strategy - Redis

All caching will use **Redis** to support horizontal scaling and shared cache across instances.

```mermaid
flowchart TB
    subgraph Background Jobs
        TxJob[Transaction Refresh Job - Every 15s]
    end

    subgraph Redis Cache
        Manifest[Manifest - No expiry]
        Bodegas[Bodegas - No expiry]
        BLItems[BL Items - No expiry]
        Transactions[Transactions - 15s refresh]
    end

    subgraph Manual Invalidation
        ResetBodegas[POST /cache/bodegas/reset]
        ResetBLItems[POST /cache/bl-items/reset]
    end

    TxJob -->|Updates| Transactions
    ResetBodegas -->|Invalidates| Bodegas
    ResetBLItems -->|Invalidates| BLItems
```

### Cache Strategy Details

| Data Type    | TTL        | Refresh Strategy | Invalidation    |
| ------------ | ---------- | ---------------- | --------------- |
| Manifest     | No expiry  | On first request | Manual endpoint |
| Bodegas      | No expiry  | On first request | Manual endpoint |
| BL Items     | No expiry  | On first request | Manual endpoint |
| Transactions | 15 seconds | Background job   | Automatic       |

### Transaction Data Flow

```mermaid
sequenceDiagram
    participant Job as Background Job
    participant Redis
    participant N4DB as N4 Database
    participant Client

    loop Every 15 seconds
        Job->>N4DB: Query all active transactions
        N4DB-->>Job: Transaction data
        Job->>Redis: Update transaction cache
    end

    Client->>Redis: GET transactions
    Redis-->>Client: Cached transaction data

    Note over Client,Redis: Users NEVER query N4 directly for transactions
```

### Cache Keys Structure

```typescript
// Redis key patterns
const CACHE_KEYS = {
  manifest: 'shipping:manifest:{manifestId}',
  bodegas: 'shipping:bodegas:{vvdGkey}',
  blItems: 'shipping:blitems:{cvGkey}:{pattern}', // pattern = SSP or OS
  transactions: 'shipping:transactions:{manifestId}:{operationType}',
  activeManifests: 'shipping:active-manifests', // Set of manifests being tracked
};
```

### Cache Invalidation Endpoints

| Method | Endpoint                            | Description                                   |
| ------ | ----------------------------------- | --------------------------------------------- |
| POST   | `/cache/bodegas/:vvdGkey/reset`     | Invalidate bodegas cache for a vessel visit   |
| POST   | `/cache/bl-items/:cvGkey/reset`     | Invalidate BL items cache for a carrier visit |
| POST   | `/cache/manifest/:manifestId/reset` | Invalidate manifest cache                     |
| POST   | `/cache/reset-all/:manifestId`      | Invalidate all caches for a manifest          |

### Background Job Implementation

The transaction refresh job will:

1. Run every 15 seconds using `@nestjs/schedule`
2. Get list of active manifests being tracked
3. For each manifest and operation type combination:
   - Query N4 database for latest transactions
   - Update Redis cache
4. Handle failures gracefully without affecting user requests

```typescript
// Using @nestjs/schedule
@Injectable()
export class TransactionRefreshJob {
  @Cron('*/15 * * * * *') // Every 15 seconds
  async refreshTransactions() {
    const activeManifests = await this.redis.smembers(
      'shipping:active-manifests',
    );

    for (const manifestId of activeManifests) {
      for (const operationType of Object.values(OperationType)) {
        try {
          const transactions = await this.n4Service.getTransactions(
            manifestId,
            operationType,
          );
          await this.redis.set(
            `shipping:transactions:${manifestId}:${operationType}`,
            JSON.stringify(transactions),
          );
        } catch (error) {
          this.logger.error(
            `Failed to refresh ${manifestId}:${operationType}`,
            error,
          );
        }
      }
    }
  }
}
```

### Active Manifest Tracking

When a user requests data for a manifest, it gets added to the active manifests set:

```typescript
// Add manifest to tracking when first requested
await this.redis.sadd('shipping:active-manifests', manifestId);

// Optionally: Remove inactive manifests after X hours of no requests
// This can be done with a separate cleanup job
```

## Query Repository

All SQL queries centralized in [`n4.queries.ts`](src/database/n4/n4.queries.ts):

```typescript
export const N4Queries = {
  // Manifest lookup
  getManifest: `SELECT acv.gkey, vis.vvd_gkey, vv.name...`,

  // BL Items - SSP pattern for embarque/despacho
  getBLItems: `SELECT cbi.gkey AS gkey, cbi.nbr AS nbr...`,

  // BL Items - OS pattern for acopio
  getBLItemsAcopio: `SELECT cbi.gkey AS gkey, cbi.nbr AS nbr...`,

  // Bodegas
  getBodegas: `SELECT ccb.gkey AS gkey...`,

  // Transactions by type
  getTransactionsAcopio: `SELECT calc.bodega...`,
  getTransactionsEmbarqueIndirecto: `SELECT calc.bodega...`,
  getTransactionsDespacho: `...`, // To be added
  getTransactionsEmbarqueDirecto: `...`, // To be added
  getTransactionsDescarga: `...`, // To be added
};
```

## Dependencies to Add

```json
{
  "dependencies": {
    "mssql": "^10.0.0",
    "@nestjs/config": "^3.0.0",
    "@nestjs/schedule": "^4.0.0",
    "ioredis": "^5.3.0"
  }
}
```

### Environment Variables Update

```env
# PostgreSQL - Prisma
DATABASE_URL=postgresql://user:password@host:5432/dbname

# SQL Server - N4
N4_DB_HOST=n4-server-host
N4_DB_PORT=1433
N4_DB_USER=n4_user
N4_DB_PASSWORD=n4_password
N4_DB_NAME=n4_database

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=optional_password

# Transaction Refresh
TRANSACTION_REFRESH_INTERVAL=15000  # 15 seconds in ms

# JWT
JWT_SECRET=your-jwt-secret
JWT_EXPIRATION=3600
```

## Implementation Steps

### Phase 1: Infrastructure Setup

- [ ] Install required dependencies: mssql, @nestjs/config, @nestjs/schedule, ioredis
- [ ] Create environment configuration module with validation
- [ ] Set up Redis connection service using ioredis
- [ ] Set up N4 database connection service with connection pooling

### Phase 2: Core Module Development

- [ ] Create query repository with all SQL queries (n4.queries.ts)
- [ ] Create DTOs and interfaces for all data types
- [ ] Implement N4 service with parameterized queries
- [ ] Create Redis service for cache operations

### Phase 3: Shipping Module

- [ ] Create shipping module structure
- [ ] Implement shipping service with Redis caching
- [ ] Create shipping controller with endpoints
- [ ] Add input validation using class-validator

### Phase 4: Cache Management

- [ ] Create cache module with invalidation endpoints
- [ ] Implement cache controller for manual reset operations
- [ ] Add active manifest tracking in Redis

### Phase 5: Background Jobs

- [ ] Create jobs module with @nestjs/schedule
- [ ] Implement transaction refresh job (every 15 seconds)
- [ ] Add error handling and logging for job failures
- [ ] Implement manifest cleanup job (optional)

### Phase 6: Security and Testing

- [ ] Integrate JWT authentication for all endpoints
- [ ] Add request logging middleware
- [ ] Write unit tests for services
- [ ] Write integration tests for endpoints

### Phase 7: Documentation and Deployment

- [ ] Add Swagger/OpenAPI documentation
- [ ] Create Docker configuration for Redis
- [ ] Create deployment configuration
- [ ] Performance testing with load simulation

## Security Considerations

1. **SQL Injection Prevention**: Use parameterized queries with `mssql` package
2. **Authentication**: JWT tokens for all shipping endpoints
3. **Rate Limiting**: Consider adding rate limiting for API endpoints
4. **Input Validation**: Validate all query parameters using class-validator
5. **Read-Only Access**: N4 connection should have read-only permissions

## Error Handling

```typescript
// Custom exceptions
class ManifestNotFoundException extends NotFoundException {}
class N4ConnectionException extends ServiceUnavailableException {}
class InvalidOperationTypeException extends BadRequestException {}
```

## Monitoring and Logging

- Log all N4 queries with execution time
- Monitor cache hit/miss ratios
- Track API response times
- Alert on N4 connection failures

---

# Module 2: Appointments in Progress (Citas en Proceso de Atención)

## Overview

This module provides real-time tracking of container appointments currently being processed at the terminal gate. Unlike the shipping module which uses background jobs, this module queries N4 directly for each request since the data changes frequently.

## Data Structure

```typescript
interface AppointmentInProgress {
  cita: string; // Appointment ID
  fecha: Date; // Slot start date
  booking: string; // Equipment order number
  linea: string; // Line ID
  cliente: string; // Shipper name
  contenedor: string; // Container ID
  tecnologia: string; // Technology type
  producto: string; // Commodity
  nave: string; // Vessel - format: "ID - Name"
  placa: string; // Truck plate
  carreta: string; // Chassis ID
  stage: string; // Current stage - normalized
  tranquera: Date | null; // Gate timestamp
  preGate: Date | null; // Pre-gate timestamp
  gateIn: Date | null; // Gate-in timestamp
  yard: Date | null; // Yard timestamp
  tipo: string; // Transaction type - translated
}
```

### Transaction Types

| Code | Description    |
| ---- | -------------- |
| RE   | Recepción Full |
| DM   | Despacho       |
| RM   | Devolución     |
| DI   | Ingreso Import |
| DE   | Ingreso Export |

### Stages

| Stage ID           | Normalized |
| ------------------ | ---------- |
| pre-gate, pre_gate | pre_gate   |
| gate_in, ingate    | gate_in    |
| tranquera          | tranquera  |
| yard               | yard       |

## API Endpoint

| Method | Endpoint                    | Description                                |
| ------ | --------------------------- | ------------------------------------------ |
| GET    | `/appointments/in-progress` | Get all appointments currently in progress |

### Response Example

```json
{
  "data": [
    {
      "cita": "APT-12345",
      "fecha": "2026-02-05T08:00:00.000Z",
      "booking": "BK-001",
      "linea": "MSC",
      "cliente": "ACME Corp",
      "contenedor": "MSCU1234567",
      "tecnologia": "REEFER",
      "producto": "FROZEN FISH",
      "nave": "123 - MSC OSCAR",
      "placa": "ABC-123",
      "carreta": "CHS-456",
      "stage": "gate_in",
      "tranquera": "2026-02-05T08:15:00.000Z",
      "preGate": "2026-02-05T08:20:00.000Z",
      "gateIn": "2026-02-05T08:25:00.000Z",
      "yard": null,
      "tipo": "Recepción Full"
    }
  ],
  "count": 1,
  "timestamp": "2026-02-05T08:30:00.000Z"
}
```

## Module Structure

```
src/
├── appointments/                    # Appointments module
│   ├── appointments.module.ts
│   ├── appointments.controller.ts
│   ├── appointments.service.ts
│   ├── dto/
│   │   └── appointment-in-progress.dto.ts
│   └── interfaces/
│       └── appointment.interface.ts
```

## Caching Strategy

### Short TTL Cache

- Cache results in Redis with 5-10 second TTL
- Reduces database load while maintaining near real-time data
- Background job refreshes cache every 5 seconds

```typescript
// Cache key
const CACHE_KEY = 'appointments:in-progress';
const CACHE_TTL = 5; // seconds
```

## Query

```sql
SELECT
    appt.id AS Cita,
    slot.start_date AS Fecha,
    gat.eqo_nbr AS Booking,
    gat.line_id AS Linea,
    shi.name AS Cliente,
    gat.ctr_id AS Contenedor,
    gat.flex_string24 AS Tecnologia,
    com.id AS Producto,
    CONCAT(car.id, ' - ', ves.name) AS Nave,
    truc.truck_id AS Placa,
    gat.chs_id AS Carreta,
    CASE
        WHEN gat.stage_id IN ('pre-gate', 'pre_gate') THEN 'pre_gate'
        ELSE gat.stage_id
    END AS Stage,
    stg.Tranquera,
    stg.PreGate,
    stg.GateIn,
    stg.Yard,
    CASE gat.sub_type
        WHEN 'RE' THEN 'Recepción Full'
        WHEN 'DM' THEN 'Despacho'
        WHEN 'RM' THEN 'Devolución'
        WHEN 'DI' THEN 'Ingreso Import'
        WHEN 'DE' THEN 'Ingreso Export'
        ELSE 'OTRO'
    END AS Tipo
FROM road_truck_transactions gat
-- ... (full query with joins)
WHERE gat.status = 'OK' AND gat.gate_gkey = 53
```

## Integration with Main Architecture

The appointments module shares:

- N4 database connection service
- Redis service
- Authentication guards
- Error handling patterns
