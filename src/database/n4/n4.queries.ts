/**
 * N4 Database Queries
 * All SQL queries for the N4 terminal database
 */

export const N4Queries = {
    // ============================================
    // MANIFEST & VESSEL QUERIES
    // ============================================

    /**
     * Get manifest information by manifest ID
     * Returns: gkey, vvd_gkey, vessel_name
     */
    getManifest: `
    SELECT acv.gkey, vis.vvd_gkey, vv.name AS vessel_name
    FROM argo_carrier_visit acv
    INNER JOIN vsl_vessel_visit_details vis ON vis.vvd_gkey = acv.cvcvd_gkey
    INNER JOIN vsl_vessels vv ON vv.gkey = vis.vessel_gkey
    WHERE acv.id = @manifestId
  `,

    /**
     * Get vessel mapping by carrier visit gkeys (batch)
     * Returns: carrier_visit_gkey, manifest_id, vessel_name
     */
    getVesselsByCarrierVisitGkeys: `
        SELECT
                acv.gkey AS carrier_visit_gkey,
                acv.id AS manifest_id,
                vv.name AS vessel_name
        FROM argo_carrier_visit acv
        INNER JOIN argo_visit_details del ON del.gkey = acv.cvcvd_gkey
        INNER JOIN vsl_vessel_visit_details vis ON vis.vvd_gkey = del.gkey
        INNER JOIN vsl_vessels vv ON vv.gkey = vis.vessel_gkey
        WHERE acv.gkey IN (
                SELECT TRY_CONVERT(BIGINT, value)
                FROM STRING_SPLIT(@carrierVisitGkeys, ',')
                WHERE TRY_CONVERT(BIGINT, value) IS NOT NULL
        )
    `,

    /**
     * Get order mapping by order gkeys (batch)
     * Returns: order_gkey, booking, commodity
     */
    getOrderInfoByOrderGkeys: `
        SELECT
            bk.gkey AS order_gkey,
            bk.nbr AS booking,
            rc.id AS commodity
        FROM inv_eq_base_order bk
        OUTER APPLY (
            SELECT MIN(oreq.commodity_gkey) AS commodity_gkey
            FROM inv_eq_base_order_item ord
            JOIN ord_equipment_order_items oreq
                ON oreq.gkey = ord.gkey
            WHERE ord.eqo_gkey = bk.gkey
        ) ord_item
        LEFT JOIN ref_commodity rc
            ON rc.gkey = ord_item.commodity_gkey
        WHERE bk.gkey IN (
            SELECT TRY_CONVERT(BIGINT, value)
            FROM STRING_SPLIT(@orderGkeys, ',')
            WHERE TRY_CONVERT(BIGINT, value) IS NOT NULL
        )
    `,

    /**
     * Get vessels currently in WORKING phase
     * Returns: manifest_id, vessel_name
     */
    getWorkingVessels: `
    SELECT acv.id AS manifest_id, vv.name AS vessel_name
    FROM argo_carrier_visit acv
    INNER JOIN vsl_vessel_visit_details vis ON vis.vvd_gkey = acv.cvcvd_gkey
    INNER JOIN vsl_vessels vv ON vv.gkey = vis.vessel_gkey
    WHERE acv.phase = '40WORKING' AND acv.operator_gkey = 10
  `,

    // ============================================
    // BL ITEMS QUERIES
    // ============================================

    /**
     * Get BL Items for regular operations
     */
    getBLItems: `
    SELECT
      cbi.gkey AS gkey,
      cbi.nbr AS nbr,
      COALESCE(TRY_CONVERT(DECIMAL(18,2), cbi.CUSTDFF_MANIFESTWEIGHT), 0) AS manifested_weight,
      COALESCE(TRY_CONVERT(INT, cbi.CUSTDFF_BULTOS), 0) AS manifested_goods,
      rc.id AS commodity
    FROM crg_bl_item cbi
    INNER JOIN crg_bills_of_lading cbol ON cbol.gkey = cbi.bl_gkey
    INNER JOIN ref_commodity rc ON rc.gkey = cbi.commodity_gkey
    WHERE cbol.cv_gkey = @cvGkey AND (cbi.flex_string01 <> 'Y' OR cbi.flex_string01 IS NULL)
  `,

    /**
     * Get BL Items for acopio -> AS false
     */
    getBLItemsAS: `
    SELECT
      cbi.gkey AS gkey,
      cbi.nbr AS nbr,
      COALESCE(TRY_CONVERT(DECIMAL(18,2), cbi.CUSTDFF_MANIFESTWEIGHT), 0) AS manifested_weight,
      COALESCE(TRY_CONVERT(INT, cbi.CUSTDFF_BULTOS), 0) AS manifested_goods,
      rc.id AS commodity
    FROM crg_bl_item cbi
    INNER JOIN crg_bills_of_lading cbol ON cbol.gkey = cbi.bl_gkey
    INNER JOIN ref_commodity rc ON rc.gkey = cbi.commodity_gkey
    WHERE cbol.cv_gkey = @cvGkey AND cbi.flex_string01 = 'Y'
  `,

    /**
     * Check if manifest has MAÍZ commodity (commodity_gkey = 95 or 182)
     */
    hasMaizCommodity: `
        SELECT TOP 1 1 AS has_maiz
        FROM crg_bl_item cbi
        INNER JOIN crg_bills_of_lading cbol ON cbol.gkey = cbi.bl_gkey
        WHERE cbi.commodity_gkey IN (95,182)
            AND cbol.cv_gkey = @cvGkey
    `,

    /**
     * Get BL Items by BL number prefix (special-case behavior)
     */
    getBLItemsByPrefix: `
        SELECT
            cbi.gkey AS gkey,
            cbi.nbr AS nbr,
            COALESCE(TRY_CONVERT(DECIMAL(18,2), cbi.CUSTDFF_MANIFESTWEIGHT), 0) AS manifested_weight,
            COALESCE(TRY_CONVERT(INT, cbi.CUSTDFF_BULTOS), 0) AS manifested_goods,
            rc.id AS commodity
        FROM crg_bl_item cbi
        INNER JOIN crg_bills_of_lading cbol ON cbol.gkey = cbi.bl_gkey
        INNER JOIN ref_commodity rc ON rc.gkey = cbi.commodity_gkey
        WHERE cbol.cv_gkey = @cvGkey
            AND cbi.nbr LIKE @blPrefix
    `,

    // ============================================
    // HOLDS QUERY
    // ============================================

    /**
     * Get holds for a vessel visit
     */
    getHolds: `
    SELECT
      ccb.gkey AS gkey,
      ccb.CUSTOMCATBOG_DESCRIPCION AS nbr,
      ISNULL(cr.CUSTOMRESUME_PESOMANIFESTADO, 0) AS manifested_weight,
      ISNULL(cr.CUSTOMRESUME_BULTOSMANIFESTADO, 0) AS manifested_goods
    FROM CUSTOM_RESUMENCARGA cr
    INNER JOIN CUSTOM_CATALOGO_BODEGAS ccb ON ccb.gkey = cr.CUSTOMRESUME_UBICACION1
    WHERE cr.CUSTOMRESUME_VESSELVISITIT = @vvdGkey
  `,

    // ============================================
    // TRANSACTION QUERIES - MONITORING GENERAL CARGO MODULE
    // ============================================

    /**
     * Get GATE transactions
     * Filtered by BL item gkeys
     */
    getGateTransactions: `
    SELECT
        calc.hold,
        ISNULL(rtt.bl_item_gkey, 0) AS bl_item_gkey,
        calc.shift,
        COUNT(*) AS total_tickets,
        SUM(ISNULL(TRY_CAST(iu.flex_string09 AS INT), 0)) AS total_goods,
        SUM(ISNULL(rtt.ctr_gross_weight, 0)) AS total_weight
    FROM road_truck_transactions rtt
    LEFT JOIN inv_unit iu 
        ON iu.gkey = rtt.unit_gkey
    CROSS APPLY (
        SELECT TOP 1 s.stage_end
        FROM road_truck_transaction_stages s
        WHERE s.tran_gkey = rtt.gkey
        ORDER BY s.seq DESC
    ) stg
    CROSS APPLY (
        SELECT
            ISNULL(UPPER(iu.flex_string12), 'SIN BODEGA') AS hold,
            CASE
                WHEN DATEPART(HOUR, stg.stage_end) < 8 THEN
                    FORMAT(stg.stage_end, 'dd-MM-yyyy') + ' 00:00 - 07:59'
                WHEN DATEPART(HOUR, stg.stage_end) < 16 THEN
                    FORMAT(stg.stage_end, 'dd-MM-yyyy') + ' 08:00 - 15:59'
                ELSE
                    FORMAT(stg.stage_end, 'dd-MM-yyyy') + ' 16:00 - 23:59'
            END AS shift
    ) calc
    WHERE rtt.bl_item_gkey IN (SELECT value FROM STRING_SPLIT(@blItemGkeys, ','))
      AND rtt.status = 'COMPLETE'
      AND rtt.gate_gkey <> 54
    GROUP BY
        calc.hold,
        ISNULL(rtt.bl_item_gkey, 0),
        calc.shift
    ORDER BY
        calc.hold,
        bl_item_gkey,
        calc.shift
  `,

    /**
     * Get CONTROL_PESAJE transactions
     * Filtered by BL item gkeys
     */
    getControlPesajeTransactions: `
    SELECT
        calc.hold,
        ISNULL(ciwt.CUSTOMWGTRAN_BL_ITEM, 0) AS bl_item_gkey,
        calc.shift,
        COUNT(*) AS total_tickets,
        SUM(ISNULL(TRY_CAST(iu.flex_string09 AS INT), 0)) AS total_goods,
        SUM(ISNULL(ciwt.CUSTOMWGTRAN_NETWEIGHT, 0)) AS total_weight
    FROM CUSTOM_IND_WEIGHING_TRANS ciwt
    LEFT JOIN inv_unit iu 
        ON iu.id = ciwt.CUSTOMWGTRAN_CTRNBR
    LEFT JOIN inv_unit_fcy_visit fcy 
        ON fcy.unit_gkey = iu.gkey
    LEFT JOIN srv_event evento 
        ON evento.applied_to_natural_key = iu.id
        AND evento.event_type_gkey = 17
    CROSS APPLY (
        SELECT
            ISNULL(UPPER(iu.flex_string12), 'SIN BODEGA') AS hold,
            CASE
                WHEN DATEPART(HOUR, evento.placed_time) < 8 THEN
                    FORMAT(evento.placed_time, 'dd-MM-yyyy') + ' 00:00 - 07:59'
                WHEN DATEPART(HOUR, evento.placed_time) < 16 THEN
                    FORMAT(evento.placed_time, 'dd-MM-yyyy') + ' 08:00 - 15:59'
                ELSE
                    FORMAT(evento.placed_time, 'dd-MM-yyyy') + ' 16:00 - 23:59'
            END AS shift
    ) calc
    WHERE iu.category = 'EXPRT'
      AND fcy.transit_state IN ('S70_DEPARTED','S60_LOADED')
      AND ciwt.CUSTOMWGTRAN_BL_ITEM IN (SELECT value FROM STRING_SPLIT(@blItemGkeys, ','))
    GROUP BY
        calc.hold,
        ISNULL(ciwt.CUSTOMWGTRAN_BL_ITEM, 0),
        calc.shift
    ORDER BY
        calc.hold,
        bl_item_gkey,
        calc.shift
  `,


    // ============================================
    // HOLD ALERT QUERIES - UNITS WITH INVALID HOLDS
    // ============================================

    /**
     * Get units with invalid holds from GATE transactions.
     * Only called when transactions with missing or unrecognized holds are detected.
     * Returns individual unit IDs for correction.
     * @param blItemGkeys - comma-separated BL item gkeys
     * @param validHolds - comma-separated valid hold names
     */
    getGateUnitsWithInvalidHolds: `
    SELECT TOP 50
        iu.id AS unit_id,
        ISNULL(UPPER(iu.flex_string12), 'SIN BODEGA') AS hold
    FROM road_truck_transactions rtt
    LEFT JOIN inv_unit iu
        ON iu.gkey = rtt.unit_gkey
    WHERE rtt.bl_item_gkey IN (SELECT value FROM STRING_SPLIT(@blItemGkeys, ','))
      AND rtt.status = 'COMPLETE'
      AND rtt.gate_gkey <> 54
      AND (
          iu.flex_string12 IS NULL
          OR LTRIM(RTRIM(iu.flex_string12)) = ''
          OR UPPER(iu.flex_string12) NOT IN (SELECT UPPER(LTRIM(RTRIM(value))) FROM STRING_SPLIT(@validHolds, ','))
      )
    ORDER BY iu.id
  `,

    /**
     * Get units with invalid holds from CONTROL_PESAJE transactions.
     * Only called when transactions with missing or unrecognized holds are detected.
     * Returns individual unit IDs for correction.
     * @param blItemGkeys - comma-separated BL item gkeys
     * @param validHolds - comma-separated valid hold names
     */
    getControlPesajeUnitsWithInvalidHolds: `
    SELECT TOP 50
        iu.id AS unit_id,
        ISNULL(UPPER(iu.flex_string12), 'SIN BODEGA') AS hold
    FROM CUSTOM_IND_WEIGHING_TRANS ciwt
    LEFT JOIN inv_unit iu
        ON iu.id = ciwt.CUSTOMWGTRAN_CTRNBR
    LEFT JOIN inv_unit_fcy_visit fcy
        ON fcy.unit_gkey = iu.gkey
    WHERE iu.category = 'EXPRT'
      AND fcy.transit_state = 'S60_LOADED'
      AND ciwt.CUSTOMWGTRAN_BL_ITEM IN (SELECT value FROM STRING_SPLIT(@blItemGkeys, ','))
      AND (
          iu.flex_string12 IS NULL
          OR LTRIM(RTRIM(iu.flex_string12)) = ''
          OR UPPER(iu.flex_string12) NOT IN (SELECT UPPER(LTRIM(RTRIM(value))) FROM STRING_SPLIT(@validHolds, ','))
      )
    ORDER BY iu.id
  `,

    // ============================================
    // STOCKPILING TICKETS QUERY
    // ============================================

    /**
     * Get stockpiling tickets detail
     * Returns detailed information of tickets for stockpiling operations
     */
    getStockpilingTickets: `
    SELECT
        rtt.nbr AS codigo,
        cbi.nbr AS blItemNbr,
        rtt.flex_string20 AS gRemision,
        rtt.flex_string21 AS gTransportista,
        ISNULL(rtt.scale_weight, 0) AS pesoIngreso,
        ISNULL(rtt.truck_tare_weight, 0) AS pesoSalida,
        ISNULL(rtt.scale_weight, 0) - ISNULL(rtt.truck_tare_weight, 0) AS pesoNeto,
        ISNULL(truc.truck_id, '') AS tracto,
        ISNULL(rtt.chs_id, '') AS carreta,
        ISNULL(truc.driver_name, '') AS conductor,
        ISNULL(CONVERT(VARCHAR, stg.fechaSalida, 120), '') AS fechaSalida,
        ISNULL(rtt.notes, '') AS notas,
        ISNULL(rtt.trkco_id, '') AS rucTransportista
    FROM road_truck_transactions rtt
    INNER JOIN crg_bl_item cbi ON cbi.gkey = rtt.bl_item_gkey
    LEFT JOIN road_truck_visit_details truc ON truc.tvdtls_gkey = rtt.truck_visit_gkey
    OUTER APPLY (
        SELECT
            MAX(CASE WHEN s.id = 'gate_out' THEN s.stage_end END) AS fechaSalida
        FROM road_truck_transaction_stages s
        WHERE s.tran_gkey = rtt.gkey
    ) stg
    WHERE rtt.bl_item_gkey IN (SELECT value FROM STRING_SPLIT(@blItemGkeys, ','))
      AND rtt.status = 'COMPLETE'
      AND rtt.gate_gkey <> 54
    ORDER BY
        cbi.nbr,
        stg.fechaSalida;
  `,
    // ============================================
    // APPOINTMENTS QUERIES - CONTAINERS MODULE
    // ============================================

    /**
     * Get pending appointments (Citas Pendientes)
     * For container operations at gate 53
     */
    getPendingAppointments: `
    WITH Appt AS (
        SELECT
            id,
            time_slot_gkey,
            unit_gkey,
            vessel_visit_gkey,
            line_op_gkey,
            shipper_gkey,
            order_gkey,
            truck_id,
            chassis_id,
            trans_type,
            ufv_flex_string09
        FROM road_gate_appointment
        WHERE state = 'CREATED'
        AND gate_gkey = 53
    )

    SELECT
        appt.id AS Cita,
        DATEADD(HOUR,5,slot.start_date) AS Fecha,
        line.id AS Linea,
        appt.order_gkey AS OrderGkey,
        appt.truck_id AS Placa,
        appt.chassis_id AS Carreta,
        shipper.name AS Cliente,
        COALESCE(appt.ufv_flex_string09,'N.E.') AS Tecnologia,
        COALESCE(unit.id,'N.E.') AS Contenedor,
        appt.vessel_visit_gkey AS VesselVisitGkey,

        CASE appt.trans_type
            WHEN 'DOE' THEN 'Recepción Full'
            WHEN 'PUM' THEN 'Despacho'
            WHEN 'DOM' THEN 'Devolución'
            WHEN 'PUE' THEN 'Retiro Full'
            ELSE 'Otro'
        END AS Tipo

    FROM Appt appt

    LEFT JOIN road_appt_time_slot slot
        ON slot.gkey = appt.time_slot_gkey

    LEFT JOIN inv_unit unit
        ON unit.gkey = appt.unit_gkey

    LEFT JOIN ref_bizunit_scoped line
        ON line.gkey = appt.line_op_gkey

    LEFT JOIN ref_bizunit_scoped shipper
        ON shipper.gkey = appt.shipper_gkey
    `,


    /**
     * Get appointments in progress (Citas en Proceso de Atención)
     * For container operations at gate 53
     * 
     * Returns transaction stages and inspection time (TiempoEir) for time calculations:
     * - TiempoEir: inspection duration in minutes (from CUSTOM_INSPEIR table)
     *   Used to calculate effective handling time by subtracting inspection duration
     *   Returns NULL if no inspection records exist for the unit
     */
    getAppointmentsInProgress: `
    WITH Stages AS (
        SELECT
            tran_gkey,
            MAX(CASE WHEN id = 'tranquera' THEN stage_end END) AS Tranquera,
            MAX(CASE WHEN id IN ('pre_gate','pre-gate') THEN stage_end END) AS PreGate,
            MAX(CASE WHEN id IN ('gate_in','ingate') THEN stage_end END) AS GateIn,
            MAX(CASE WHEN id = 'yard' THEN stage_end END) AS Yard
        FROM road_truck_transaction_stages
        GROUP BY tran_gkey
    )
    SELECT
        appt.id AS Cita,
        DATEADD(HOUR, 5, slot.start_date) AS Fecha,
        gat.eqo_nbr AS Booking,
        appt.order_gkey AS OrderGkey,
        appt.vessel_visit_gkey AS VesselVisitGkey,
        gat.line_id AS Linea,
        shi.name AS Cliente,
        unit.id AS Contenedor,
        gat.flex_string24 AS Tecnologia,
        'N.E.' AS Producto,
        'N.E.' AS Nave,
        truc.truck_id AS Placa,
        gat.chs_id AS Carreta,
        CASE 
            WHEN gat.stage_id IN ('pre-gate', 'pre_gate') THEN 'pre_gate'
            ELSE gat.stage_id
        END AS Stage,
        DATEADD(HOUR, 5, stg.Tranquera) AS Tranquera,
        DATEADD(HOUR, 5, stg.PreGate) AS PreGate,
        DATEADD(HOUR, 5, stg.GateIn) AS GateIn,
        DATEADD(HOUR, 5, stg.Yard) AS Yard,
        CASE gat.sub_type
            WHEN 'RE' THEN 'Recepción Full'
            WHEN 'DM' THEN 'Despacho'
            WHEN 'RM' THEN 'Devolución'
            WHEN 'DI' THEN 'Ingreso Import'
            WHEN 'DE' THEN 'Ingreso Export'
            ELSE gat.sub_type
        END AS Tipo,
        eir.TiempoEir,
        pod.id AS PuertoDescarga
    FROM road_truck_transactions gat
    LEFT JOIN inv_unit unit ON unit.gkey = gat.unit_gkey
    LEFT JOIN road_gate_appointment appt ON appt.id = gat.appointment_nbr
    LEFT JOIN ref_bizunit_scoped shi ON shi.gkey = appt.shipper_gkey
    LEFT JOIN road_truck_visit_details truc ON truc.tvdtls_gkey = gat.truck_visit_gkey
    LEFT JOIN road_appt_time_slot slot ON slot.gkey = appt.time_slot_gkey
    LEFT JOIN ref_routing_point pod ON pod.gkey = unit.pod1_gkey
    LEFT JOIN Stages stg ON stg.tran_gkey = gat.gkey
    OUTER APPLY (
        SELECT TOP 1
            DATEDIFF(MINUTE, CUSTOMINSEIR_STARTINSP, CUSTOMINSEIR_ENDINSP) AS TiempoEir
        FROM CUSTOM_INSPEIR
        WHERE CUSTOMINSEIR_UFV = unit.active_ufv
          AND (
              (gat.sub_type = 'RE' AND CUSTOMINSEIR_GATE = 'IN' AND CUSTOMINSEIR_FREIGHT = 'FCL')
              OR (gat.sub_type = 'DM' AND CUSTOMINSEIR_GATE = 'OUT' AND CUSTOMINSEIR_FREIGHT = 'MTY')
              OR (gat.sub_type = 'RM' AND CUSTOMINSEIR_GATE = 'IN' AND CUSTOMINSEIR_FREIGHT = 'MTY')
              OR (gat.sub_type NOT IN ('RE', 'DM', 'RM'))
          )
        ORDER BY gkey DESC
    ) eir
    WHERE gat.status = 'OK' AND gat.gate_gkey = 53
  `,

    /**
     * Get completed appointments for export (Citas Completadas)
     * For container operations at gate 53
     * 
     * Returns only appointments completed within the last 3 months.
     * Uses gate_out stage timestamp instead of current time for calculations.
     * Maximum 3 month range to prevent downloading excessive data.
     * 
     * - TiempoEir: inspection duration in minutes (from CUSTOM_INSPEIR table)
     *   Used to calculate effective handling time by subtracting inspection duration
     *   Returns NULL if no inspection records exist for the unit
     */
    getCompletedAppointmentsForExport: `
    WITH Stages AS (
        SELECT
            tran_gkey,
            MAX(CASE WHEN id = 'tranquera' THEN stage_end END) AS Tranquera,
            MAX(CASE WHEN id IN ('pre_gate','pre-gate') THEN stage_end END) AS PreGate,
            MAX(CASE WHEN id IN ('gate_in','ingate') THEN stage_end END) AS GateIn,
            MAX(CASE WHEN id = 'yard' THEN stage_end END) AS Yard,
            MAX(CASE WHEN id = 'gate_out' THEN stage_end END) AS GateOut
        FROM road_truck_transaction_stages
        GROUP BY tran_gkey
    ),
    EIR AS (
        SELECT
            CUSTOMINSEIR_UFV,
            DATEDIFF(MINUTE, CUSTOMINSEIR_STARTINSP, CUSTOMINSEIR_ENDINSP) AS TiempoEir,
            ROW_NUMBER() OVER (
                PARTITION BY CUSTOMINSEIR_UFV
                ORDER BY gkey DESC
            ) rn
        FROM CUSTOM_INSPEIR
    )
    SELECT
        appt.id AS Cita,
        DATEADD(HOUR, 5, slot.start_date) AS Fecha,
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
        DATEADD(HOUR, 5, stg.Tranquera) AS Tranquera,
        DATEADD(HOUR, 5, stg.PreGate) AS PreGate,
        DATEADD(HOUR, 5, stg.GateIn) AS GateIn,
        DATEADD(HOUR, 5, stg.Yard) AS Yard,
        DATEADD(HOUR, 5, stg.GateOut) AS GateOut,
        CASE gat.sub_type
            WHEN 'RE' THEN 'Recepción Full'
            WHEN 'DM' THEN 'Despacho'
            WHEN 'RM' THEN 'Devolución'
            WHEN 'DI' THEN 'Ingreso Import'
            WHEN 'DE' THEN 'Ingreso Export'
            ELSE gat.sub_type
        END AS Tipo,
        eir.TiempoEir
    FROM road_truck_transactions gat
    LEFT JOIN inv_unit unit ON unit.gkey = gat.unit_gkey
    LEFT JOIN road_gate_appointment appt ON appt.id = gat.appointment_nbr
    LEFT JOIN inv_eq_base_order ordb ON ordb.gkey = appt.order_gkey
    LEFT JOIN inv_eq_base_order_item ord ON ord.eqo_gkey = ordb.gkey
    LEFT JOIN ord_equipment_order_items oreq ON oreq.gkey = ord.gkey
    LEFT JOIN ref_commodity com ON com.gkey = oreq.commodity_gkey
    LEFT JOIN ref_bizunit_scoped shi ON shi.gkey = appt.shipper_gkey
    LEFT JOIN road_truck_visit_details truc ON truc.tvdtls_gkey = gat.truck_visit_gkey
    LEFT JOIN argo_carrier_visit car ON car.gkey = ordb.vessel_visit_gkey
    LEFT JOIN argo_visit_details del ON car.cvcvd_gkey = del.gkey
    LEFT JOIN vsl_vessel_visit_details vis ON del.gkey = vis.vvd_gkey
    LEFT JOIN vsl_vessels ves ON ves.gkey = vis.vessel_gkey
    LEFT JOIN road_appt_time_slot slot ON slot.gkey = appt.time_slot_gkey
    LEFT JOIN Stages stg ON stg.tran_gkey = gat.gkey
    LEFT JOIN EIR eir 
        ON eir.CUSTOMINSEIR_UFV = unit.active_ufv
        AND eir.rn = 1
    WHERE gat.status = 'COMPLETE' 
      AND gat.gate_gkey = 53
      AND stg.GateOut >= DATEADD(MONTH, -3, CAST(GETDATE() AS DATE))
    ORDER BY stg.GateOut DESC
  `,

};
