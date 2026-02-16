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
      COALESCE(TRY_CONVERT(INT, cbi.CUSTDFF_BULTOS), 0) AS manifested_goods
    FROM crg_bl_item cbi
    INNER JOIN crg_bills_of_lading cbol ON cbol.gkey = cbi.bl_gkey
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
      COALESCE(TRY_CONVERT(INT, cbi.CUSTDFF_BULTOS), 0) AS manifested_goods
    FROM crg_bl_item cbi
    INNER JOIN crg_bills_of_lading cbol ON cbol.gkey = cbi.bl_gkey
    WHERE cbol.cv_gkey = @cvGkey AND cbi.flex_string01 = 'Y'
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
        COUNT(*) AS totalTickets,
        SUM(ISNULL(CAST(iu.flex_string09 AS INT), 0)) AS total_goods,
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
        SUM(ISNULL(CAST(iu.flex_string09 AS INT), 0)) AS total_goods,
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
      AND fcy.transit_state = 'S60_LOADED'
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
        ISNULL(CONVERT(VARCHAR, stg.fechaSalida, 120), '') AS fechaSalida
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
     * Get appointments in progress (Citas en Proceso de Atención)
     * For container operations at gate 53
     */
    getAppointmentsInProgress: `
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
        CASE gat.sub_type
            WHEN 'RE' THEN 'Recepción Full'
            WHEN 'DM' THEN 'Despacho'
            WHEN 'RM' THEN 'Devolución'
            WHEN 'DI' THEN 'Ingreso Import'
            WHEN 'DE' THEN 'Ingreso Export'
            ELSE 'OTRO'
        END AS Tipo
    FROM (
        SELECT *
        FROM road_truck_transactions
        WHERE status = 'OK' AND gate_gkey = 53
    ) gat
    OUTER APPLY (
        SELECT
            MAX(CASE WHEN s.id = 'tranquera' THEN s.stage_end END) AS Tranquera,
            MAX(CASE WHEN s.id IN ('pre_gate','pre-gate') THEN s.stage_end END) AS PreGate,
            MAX(CASE WHEN s.id IN ('gate_in','ingate') THEN s.stage_end END) AS GateIn,
            MAX(CASE WHEN s.id = 'yard' THEN s.stage_end END) AS Yard
        FROM road_truck_transaction_stages s
        WHERE s.tran_gkey = gat.gkey
    ) stg
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
  `,

};
