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
     * Get manifest information for containers monitoring.
     * Validates cargo type through vsl_vessel_visit_details.flex_string01.
     * Returns: gkey, manifest_id, vvd_gkey, vessel_name, cargo_type
     */
    getContainerManifest: `
        SELECT
                acv.gkey,
                acv.id AS manifest_id,
                vvvd.vvd_gkey,
                vv.name AS vessel_name,
                vvvd.flex_string01 AS cargo_type,
                vvvd.ib_vyg AS voyage
        FROM argo_carrier_visit acv
        INNER JOIN vsl_vessel_visit_details vvvd ON vvvd.vvd_gkey = acv.cvcvd_gkey
        INNER JOIN vsl_vessels vv ON vv.gkey = vvvd.vessel_gkey
        WHERE acv.id = @manifestId
    `,

    /**
     * Get vessel mapping by carrier visit gkeys (batch)
     * Returns: carrier_visit_gkey, manifest_id, vessel_name, line_id, line_name
     */
    getVesselsByCarrierVisitGkeys: `
        SELECT
                acv.gkey AS carrier_visit_gkey,
                acv.id AS manifest_id,
                vv.name AS vessel_name,
                line.id AS line_id,
                line.name AS line_name
        FROM argo_carrier_visit acv
        INNER JOIN argo_visit_details del ON del.gkey = acv.cvcvd_gkey
        INNER JOIN vsl_vessel_visit_details vis ON vis.vvd_gkey = del.gkey
        INNER JOIN vsl_vessels vv ON vv.gkey = vis.vessel_gkey
        INNER JOIN ref_bizunit_scoped line ON acv.operator_gkey = line.gkey
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
            rc.short_name AS commodity
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
     * Get not-arrived container data enriched with booking metadata.
     * Resolves order_gkey via COALESCE: depart_order_item > DOE appointment > PUM appointment.
     * Returns all fields needed for the not-arrived modal in a single query.
     */
    getNotArrivedContainerBaseByUnitGkeys: `
    SELECT
        COALESCE(CONVERT(VARCHAR(30), cita_recepcion.cita), '-') AS cita,
        COALESCE(CONVERT(VARCHAR(19), DATEADD(HOUR, 5, cita_recepcion.fecha_cita), 126) + 'Z', '-') AS fecha_cita,
        iu.gkey AS unit_gkey,
        iu.id AS container_number,
        ISNULL(bk.nbr, '-') AS booking,
        ISNULL(rc.short_name, '-') AS commodity,
        ISNULL(shipper.name, '-') AS shipper_name,
        ISNULL(ord_item.technology, '-') AS technology,
        COALESCE(cita_recepcion.operador, cita_despacho.operador, '-') AS operator,
        ISNULL(pod.id, '-') AS pod
    FROM inv_unit iu
    LEFT JOIN inv_eq_base_order_item bki
        ON bki.gkey = iu.depart_order_item_gkey
    LEFT JOIN inv_eq_base_order bk
        ON bk.gkey = bki.eqo_gkey
    OUTER APPLY (
        SELECT TOP 1
            rga.id AS cita,
            slot.start_date AS fecha_cita,
            rga.creator AS operador,
            rga.order_gkey AS order_gkey
        FROM road_gate_appointment rga
        LEFT JOIN road_appt_time_slot slot
            ON slot.gkey = rga.time_slot_gkey
        WHERE rga.trans_type = 'DOE'
            AND rga.gate_gkey = 53
            AND rga.order_gkey = bk.gkey
            AND rga.state <> 'CANCEL'
        ORDER BY slot.start_date DESC
    ) cita_recepcion
    OUTER APPLY (
        SELECT TOP 1
            rga.creator AS operador,
            rga.order_gkey AS order_gkey
        FROM road_gate_appointment rga
        LEFT JOIN road_appt_time_slot slot
            ON slot.gkey = rga.time_slot_gkey
        WHERE rga.trans_type = 'PUM'
            AND rga.gate_gkey = 53
            AND rga.order_gkey = bk.gkey
            AND rga.state <> 'CANCEL'
        ORDER BY slot.start_date DESC
    ) cita_despacho
    OUTER APPLY (
        SELECT TOP 1
            grade.id AS technology,
            ordeq.commodity_gkey
        FROM inv_eq_base_order_item ord
        LEFT JOIN ord_equipment_order_items ordeq ON ordeq.gkey = ord.gkey
        LEFT JOIN ref_equip_grades grade ON grade.gkey = ordeq.eq_grade_gkey
        WHERE ord.eqo_gkey = bk.gkey
    ) ord_item
    LEFT JOIN ref_commodity rc ON rc.gkey = ord_item.commodity_gkey
    LEFT JOIN ref_bizunit_scoped shipper ON shipper.gkey = bk.shipper_gkey
    LEFT JOIN ref_routing_point pod ON pod.gkey = iu.pod1_gkey
    WHERE iu.gkey IN (
        SELECT TRY_CONVERT(BIGINT, value)
        FROM STRING_SPLIT(@unitGkeys, ',')
        WHERE TRY_CONVERT(BIGINT, value) IS NOT NULL
    )
  `,

    /**
     * Get BL item mapping by BL item gkeys (batch)
     * Returns: bl_item_gkey, permiso, commodity
     */
    getBlItemInfoByBlItemGkeys: `
        SELECT
            cbi.gkey AS bl_item_gkey,
            cbi.nbr AS permiso,
            rc.short_name AS commodity,
            rbs.name AS cliente
        FROM crg_bl_item cbi
        LEFT JOIN ref_commodity rc
            ON rc.gkey = cbi.commodity_gkey
        LEFT JOIN crg_bills_of_lading cbol
            ON cbi.bl_gkey = cbol.gkey
        LEFT JOIN ref_bizunit_scoped rbs
            ON rbs.gkey = cbol.shipper_gkey
        WHERE cbi.gkey IN (
            SELECT TRY_CONVERT(BIGINT, value)
            FROM STRING_SPLIT(@blItemGkeys, ',')
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
     * Includes commodity_gkey for Redis-based MAÍZ detection (commodity_gkey IN 95,182)
     */
    getBLItems: `
    SELECT
      cbi.gkey AS gkey,
      cbi.nbr AS nbr,
      COALESCE(TRY_CONVERT(DECIMAL(18,2), cbi.CUSTDFF_MANIFESTWEIGHT), 0) AS manifested_weight,
      COALESCE(TRY_CONVERT(INT, cbi.CUSTDFF_BULTOS), 0) AS manifested_goods,
      rc.short_name AS commodity,
      cbi.commodity_gkey AS commodity_gkey
    FROM crg_bl_item cbi
    INNER JOIN crg_bills_of_lading cbol ON cbol.gkey = cbi.bl_gkey
    INNER JOIN ref_commodity rc ON rc.gkey = cbi.commodity_gkey
    WHERE cbol.cv_gkey = @cvGkey AND (cbi.flex_string01 <> 'Y' OR cbi.flex_string01 IS NULL)
  `,

    /**
     * Get BL Items for acopio -> AS false
     * Includes commodity_gkey for Redis-based MAÍZ detection (commodity_gkey IN 95,182)
     */
    getBLItemsAS: `
    SELECT
      cbi.gkey AS gkey,
      cbi.nbr AS nbr,
      COALESCE(TRY_CONVERT(DECIMAL(18,2), cbi.CUSTDFF_MANIFESTWEIGHT), 0) AS manifested_weight,
      COALESCE(TRY_CONVERT(INT, cbi.CUSTDFF_BULTOS), 0) AS manifested_goods,
      rc.short_name AS commodity,
      cbi.commodity_gkey AS commodity_gkey
    FROM crg_bl_item cbi
    INNER JOIN crg_bills_of_lading cbol ON cbol.gkey = cbi.bl_gkey
    INNER JOIN ref_commodity rc ON rc.gkey = cbi.commodity_gkey
    WHERE cbol.cv_gkey = @cvGkey AND cbi.flex_string01 = 'Y'
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
            rc.id AS commodity,
            cbi.commodity_gkey AS commodity_gkey
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
    OUTER APPLY (
        SELECT TOP 1 m.t_put
        FROM inv_move_event m
        WHERE m.ufv_gkey = iu.active_ufv 
          AND m.move_kind = 'LOAD'
        ORDER BY m.mve_gkey DESC
    ) move
    CROSS APPLY (
        SELECT
            ISNULL(UPPER(iu.flex_string12), 'SIN BODEGA') AS hold,
            CASE
                WHEN DATEPART(HOUR, move.t_put) < 8 THEN
                    FORMAT(move.t_put, 'dd-MM-yyyy') + ' 00:00 - 07:59'
                WHEN DATEPART(HOUR, move.t_put) < 16 THEN
                    FORMAT(move.t_put, 'dd-MM-yyyy') + ' 08:00 - 15:59'
                ELSE
                    FORMAT(move.t_put, 'dd-MM-yyyy') + ' 16:00 - 23:59'
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
     * Returns detailed information of tickets for stockpiling operations.
     * blItemNbr is resolved in the service layer from Redis cache (blItemGkey is returned instead).
     */
    getStockpilingTickets: `
    SELECT
        rtt.nbr AS codigo,
        rtt.bl_item_gkey AS blItemGkey,
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
        ISNULL(rtt.trkco_id, '') AS rucTransportista,
        ISNULL(iu.flex_string12, 'SIN BODEGA') AS bodega
    FROM road_truck_transactions rtt
    LEFT JOIN road_truck_visit_details truc ON truc.tvdtls_gkey = rtt.truck_visit_gkey
    LEFT JOIN inv_unit iu ON iu.gkey = rtt.unit_gkey
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
        rtt.bl_item_gkey,
        stg.fechaSalida;
  `,

    // ============================================
    // INDIRECT SHIPMENT TICKETS QUERY
    // ============================================

    /**
     * Get indirect shipment (embarque indirecto) tickets detail.
     * Filtered by BL item gkeys (CUSTOMWGTRAN_BL_ITEM IN ...).
     * blItemNbr is resolved in the service layer from Redis cache.
     * fechaSalida = last event type 17 per unit (OUTER APPLY TOP 1 ORDER BY gkey DESC).
     * pesoNeto calculated in SQL.
     * @param blItemGkeys - comma-separated BL item gkeys
     */
    getIndirectShipmentTickets: `
    SELECT
        ciwt.gkey AS codigo,
        ciwt.CUSTOMWGTRAN_CTRNBR AS unit,
        ciwt.CUSTOMWGTRAN_BL_ITEM AS blItemGkey,
        ISNULL(ciwt.CUSTOMWGTRAN_WEIGHT2, 0) AS pesoIngreso,
        ISNULL(ciwt.CUSTOMWGTRAN_TARE, 0) AS pesoSalida,
        ISNULL(ciwt.CUSTOMWGTRAN_WEIGHT2, 0) - ISNULL(ciwt.CUSTOMWGTRAN_TARE, 0) AS pesoNeto,
        ISNULL(iu.flex_string12, 'SIN BODEGA') AS bodega,
        ISNULL(ciwt.CUSTOMWGTRAN_TRUCK_ID, '') AS tracto,
        ISNULL(ciwt.CUSTOMWGTRAN_CHASSIS_NUM, '') AS chassis,
        ISNULL(driv.name, '') AS conductor,
        ISNULL(CONVERT(VARCHAR, move.t_put, 120), '') AS fechaSalida
    FROM CUSTOM_IND_WEIGHING_TRANS ciwt
    INNER JOIN inv_unit iu ON iu.id = ciwt.CUSTOMWGTRAN_CTRNBR
    LEFT JOIN road_truck_drivers driv ON driv.gkey = ciwt.CUSTOMWGTRAN_DRIVER
    OUTER APPLY (
        SELECT TOP 1 m.t_put
        FROM inv_move_event m
        WHERE m.ufv_gkey = iu.active_ufv 
          AND m.move_kind = 'LOAD'
        ORDER BY m.mve_gkey DESC
    ) move
    WHERE ciwt.CUSTOMWGTRAN_BL_ITEM IN (SELECT value FROM STRING_SPLIT(@blItemGkeys, ','))
    ORDER BY
        ciwt.CUSTOMWGTRAN_BL_ITEM,
        move.t_put;
  `,
    // ============================================
    // CONTAINER MONITORING QUERIES
    // ============================================

    /**
     * Full query — used on first load to populate planned_position cache.
     * Includes OUTER APPLY to inv_wi for planned positions.
     *
    * States covered:
    *  Discharge: IMPRT/S20_INBOUND (to_discharge), IMPRT/S30_ECIN|S50_ECOUT (discharging), STRGE/S40_YARD|S70_DEPARTED (discharged)
    *  Load:      EXPRT/S20_INBOUND (not_arrived), EXPRT/S30_ECIN (not_arrived_in_transit), EXPRT/S40_YARD (to_load), EXPRT/S50_ECOUT (loading), EXPRT/S60_LOADED|S70_DEPARTED (loaded)
     *  Restow:    THRGH+RESTOW / S20_INBOUND|S40_YARD|S60_LOADED|S70_DEPARTED
     */
    getContainerMonitoringFull: `
    SELECT
        iu.gkey AS unit_gkey,
        iu.id AS container_number,
        ret.id AS iso_type,
        reg.id AS technology,
        CAST(SUBSTRING(ret.nominal_length, 4, LEN(ret.nominal_length)) AS INT) AS nominal_length,
        iu.freight_kind,
        iu.category,
        fcy.transit_state,
        fcy.last_pos_slot AS position,
        fcy.arrive_pos_slot AS arrival_position,
        wi.pos_slot AS planned_position,
        fcy.actual_ib_cv,
        fcy.actual_ob_cv,
        fcy.restow_typ
    FROM inv_unit_fcy_visit fcy
    INNER JOIN inv_unit iu ON iu.gkey = fcy.unit_gkey
    LEFT JOIN ref_equipment re ON re.gkey = iu.eq_gkey
    LEFT JOIN ref_equip_type ret ON ret.gkey = re.eqtyp_gkey
    LEFT JOIN ref_equip_grades reg ON reg.gkey = iu.grade_gkey
    OUTER APPLY (
        SELECT TOP 1 w.pos_slot
        FROM inv_wi w
        WHERE w.uyv_gkey = iu.active_ufv
        ORDER BY gkey DESC
    ) wi
    WHERE (
            (
                fcy.actual_ib_cv = @carrierVisitGkey
                AND iu.category IN ('STRGE', 'IMPRT')
                AND fcy.transit_state IN ('S20_INBOUND', 'S30_ECIN', 'S40_YARD', 'S50_ECOUT', 'S60_LOADED', 'S70_DEPARTED')
            )
            OR
            (
                fcy.actual_ob_cv = @carrierVisitGkey
                AND iu.category = 'EXPRT'
                AND fcy.transit_state IN ('S20_INBOUND', 'S30_ECIN', 'S40_YARD', 'S50_ECOUT', 'S60_LOADED', 'S70_DEPARTED')
            )
            OR
            (
                fcy.actual_ib_cv = @carrierVisitGkey
                AND iu.category = 'THRGH'
                AND fcy.restow_typ = 'RESTOW'
                AND fcy.transit_state IN ('S20_INBOUND', 'S40_YARD', 'S60_LOADED', 'S70_DEPARTED')
            )
      )
  `,

    /**
     * Refresh query — used every 30s. No OUTER APPLY (planned_position comes from Redis cache).
     * Same WHERE conditions as full query.
     */
    getContainerMonitoringRefresh: `
    SELECT
        iu.gkey AS unit_gkey,
        iu.id AS container_number,
        ret.id AS iso_type,
        reg.id AS technology,
        CAST(SUBSTRING(ret.nominal_length, 4, LEN(ret.nominal_length)) AS INT) AS nominal_length,
        iu.freight_kind,
        iu.category,
        fcy.transit_state,
        fcy.last_pos_slot AS position,
        fcy.arrive_pos_slot AS arrival_position,
        fcy.actual_ib_cv,
        fcy.actual_ob_cv,
        fcy.restow_typ
    FROM inv_unit_fcy_visit fcy
    INNER JOIN inv_unit iu ON iu.gkey = fcy.unit_gkey
    LEFT JOIN ref_equipment re ON re.gkey = iu.eq_gkey
    LEFT JOIN ref_equip_type ret ON ret.gkey = re.eqtyp_gkey
    LEFT JOIN ref_equip_grades reg ON reg.gkey = iu.grade_gkey
    WHERE (
            (
                fcy.actual_ib_cv = @carrierVisitGkey
                AND iu.category IN ('STRGE', 'IMPRT')
                AND fcy.transit_state IN ('S20_INBOUND', 'S30_ECIN', 'S40_YARD', 'S50_ECOUT', 'S60_LOADED', 'S70_DEPARTED')
            )
            OR
            (
                fcy.actual_ob_cv = @carrierVisitGkey
                AND iu.category = 'EXPRT'
                AND fcy.transit_state IN ('S20_INBOUND', 'S30_ECIN', 'S40_YARD', 'S50_ECOUT', 'S60_LOADED', 'S70_DEPARTED')
            )
            OR
            (
                fcy.actual_ib_cv = @carrierVisitGkey
                AND iu.category = 'THRGH'
                AND fcy.restow_typ = 'RESTOW'
                AND fcy.transit_state IN ('S20_INBOUND', 'S40_YARD', 'S60_LOADED', 'S70_DEPARTED')
            )
      )
  `,

    /**
     * Get first/last movement timestamps per operation for containers.
     * RESTOW rule: move_kind='DSCH' over THRGH + RESTOW + actual_ib_cv.
     * Optimized single-scan query using CROSS APPLY for operation_type determination.
     */
    getContainerOperationTimeline: `
    SELECT
        op.operation_type,
        MIN(DATEADD(HOUR, 5, ime.t_put)) AS start_time,
        MAX(DATEADD(HOUR, 5, ime.t_put)) AS end_time
    FROM inv_move_event ime
    INNER JOIN inv_unit_fcy_visit iufv 
        ON iufv.gkey = ime.ufv_gkey
    INNER JOIN inv_unit iu 
        ON iu.gkey = iufv.unit_gkey
    CROSS APPLY (
        SELECT CASE 
            WHEN ime.move_kind = 'DSCH'
                 AND iufv.actual_ib_cv = @carrierVisitGkey
                 AND iu.category IN ('IMPRT', 'STRGE')
            THEN 'DISCHARGE'

            WHEN ime.move_kind = 'LOAD'
                 AND iufv.actual_ob_cv = @carrierVisitGkey
                 AND iu.category = 'EXPRT'
            THEN 'LOAD'

            WHEN ime.move_kind = 'DSCH'
                 AND iufv.actual_ib_cv = @carrierVisitGkey
                 AND iu.category = 'THRGH'
                 AND iufv.restow_typ = 'RESTOW'
            THEN 'RESTOW'
        END AS operation_type
    ) op
    WHERE ime.carrier_gkey = @carrierVisitGkey
      AND ime.t_put IS NOT NULL
      AND op.operation_type IS NOT NULL
    GROUP BY op.operation_type
  `,

    /**
     * Get pending appointments (Citas Pendientes)
     * For container operations at gate 53
     */
    getPendingAppointments: `
    SELECT
        appt.id AS Cita,
        DATEADD(HOUR, 5, slot.start_date) AS Fecha,
        appt.order_gkey AS OrderGkey,
        appt.truck_id AS Placa,
        appt.chassis_id AS Carreta,
        shipper.name AS Cliente,
        ISNULL(appt.ufv_flex_string09, 'N.E.') AS Tecnologia,
        ISNULL(unit.id, 'N.E.') AS Contenedor,
        appt.vessel_visit_gkey AS VesselVisitGkey,
        CASE appt.trans_type
            WHEN 'DOE' THEN 'Recepción Full'
            WHEN 'PUM' THEN 'Despacho'
            WHEN 'DOM' THEN 'Devolución'
            WHEN 'PUE' THEN 'Retiro Full'
            ELSE 'Otro'
        END AS Tipo
    FROM road_gate_appointment appt

    LEFT JOIN road_appt_time_slot slot
        ON slot.gkey = appt.time_slot_gkey

    LEFT JOIN inv_unit unit
        ON unit.gkey = appt.unit_gkey

    LEFT JOIN ref_bizunit_scoped shipper
        ON shipper.gkey = appt.shipper_gkey

    WHERE appt.state = 'CREATED'
    AND appt.gate_gkey = 53;
    `,


    /**
     * Get appointments in progress (Citas en Proceso de Atención)
     * For container operations at gate 53
     * 
     */
    getAppointmentsInProgress: `
    SELECT
        gat.gkey AS TranGkey,
        appt.id AS Cita,
        DATEADD(HOUR,5,slot.start_date) AS Fecha,
        gat.eqo_nbr AS Booking,
        appt.order_gkey AS OrderGkey,
        appt.vessel_visit_gkey AS VesselVisitGkey,
        shi.name AS Cliente,
        unit.id AS Contenedor,
        gat.flex_string24 AS Tecnologia,
        'N.E.' AS Producto,
        'N.E.' AS Nave,
        truc.truck_id AS Placa,
        gat.chs_id AS Carreta,
        CASE 
            WHEN gat.stage_id IN ('pre-gate','pre_gate') THEN 'pre_gate'
            WHEN gat.stage_id IN ('ingate','gate_in') THEN 'gate_in'
            ELSE gat.stage_id
        END AS Stage,
        CASE gat.sub_type
            WHEN 'RE' THEN 'Recepción Full'
            WHEN 'DM' THEN 'Despacho'
            WHEN 'RM' THEN 'Devolución'
            WHEN 'DI' THEN 'Ingreso Import'
            WHEN 'DE' THEN 'Ingreso Export'
            ELSE gat.sub_type
        END AS Tipo,
        pod.id AS PuertoDescarga,
        unit.active_ufv AS ActiveUfv,
        CASE
            WHEN unit.active_ufv IS NOT NULL
                AND EXISTS (
                    SELECT 1
                    FROM CUSTOM_INSPEIR ci
                    WHERE ci.CUSTOMINSEIR_UFV = unit.active_ufv
                )
            THEN 1
            ELSE 0
        END AS HasEir
    FROM road_truck_transactions gat
    LEFT JOIN inv_unit unit ON unit.gkey = gat.unit_gkey
    LEFT JOIN road_gate_appointment appt ON appt.id = gat.appointment_nbr
    LEFT JOIN ref_bizunit_scoped shi ON shi.gkey = appt.shipper_gkey
    LEFT JOIN road_truck_visit_details truc ON truc.tvdtls_gkey = gat.truck_visit_gkey
    LEFT JOIN road_appt_time_slot slot ON slot.gkey = appt.time_slot_gkey
    LEFT JOIN ref_routing_point pod ON pod.gkey = unit.pod1_gkey

    WHERE gat.status = 'OK'
    AND gat.gate_gkey = 53
  `,

    /**
     * Get appointment by appointment id for EIR print testing.
     * Does not depend on "in-progress" status.
     */
    getAppointmentByIdForEirPrint: `
    SELECT TOP 1
        appt.id AS Cita,
        COALESCE(gat.eqo_nbr, bk.nbr, 'N.E.') AS Booking,
        shipper.name AS Cliente,
        ISNULL(unit.id, 'N.E.') AS Contenedor,
        ISNULL(gat.flex_string24, appt.ufv_flex_string09, 'N.E.') AS Tecnologia,
        unit.active_ufv AS ActiveUfv,
        CASE
            WHEN unit.active_ufv IS NOT NULL
                AND EXISTS (
                    SELECT 1
                    FROM CUSTOM_INSPEIR ci
                    WHERE ci.CUSTOMINSEIR_UFV = unit.active_ufv
                )
            THEN 1
            ELSE 0
        END AS HasEir
    FROM road_gate_appointment appt
    LEFT JOIN inv_unit unit
        ON unit.gkey = appt.unit_gkey
    LEFT JOIN inv_eq_base_order bk
        ON bk.gkey = appt.order_gkey
    LEFT JOIN ref_bizunit_scoped shipper
        ON shipper.gkey = appt.shipper_gkey
    OUTER APPLY (
        SELECT TOP 1
            t.eqo_nbr,
            t.flex_string24,
            t.gkey
        FROM road_truck_transactions t
        WHERE t.appointment_nbr = appt.id
        ORDER BY t.gkey DESC
    ) gat
    WHERE appt.id = @appointmentId
  `,

    /**
     * Get booking info by booking number.
     * Used to enrich EIR print payload (booking section).
     */
    getBookingInfoByBooking: `
    SELECT TOP 1
        bk.nbr AS booking,
        acv.id AS manififesto,
        ves.name AS nave,
        vvvd.ob_vyg AS viaje,
        rc.short_name AS mercaderia,
        ord_item.temp_required AS tempRequerida,
        CONCAT(
            COALESCE(grade.id, ''), ' (',
            COALESCE(grade.description, ''), ')'
        ) AS tecnologia
    FROM inv_eq_base_order bk
    LEFT JOIN argo_carrier_visit acv
        ON acv.gkey = bk.vessel_visit_gkey
    LEFT JOIN vsl_vessel_visit_details vvvd
        ON vvvd.vvd_gkey = cvcvd_gkey
    LEFT JOIN vsl_vessels ves
        ON ves.gkey = vvvd.vessel_gkey
    OUTER APPLY (
        SELECT TOP 1
            eqi.commodity_gkey,
            eqi.eq_grade_gkey,
            eqi.temp_required
        FROM inv_eq_base_order_item ord
        LEFT JOIN ord_equipment_order_items eqi
            ON eqi.gkey = ord.gkey
        WHERE ord.eqo_gkey = bk.gkey
    ) ord_item
    LEFT JOIN ref_commodity rc
        ON rc.gkey = ord_item.commodity_gkey
    LEFT JOIN ref_equip_grades grade
        ON grade.gkey = ord_item.eq_grade_gkey
    WHERE bk.nbr = @booking
    ORDER BY bk.gkey DESC
  `,

    /**
     * Get latest EIR header by active UFV.
     * Returns TOP 1 ordered by ci.gkey DESC.
     */
    getLatestEirHeaderByActiveUfv: `
    SELECT TOP 1
        ci.gkey,
        ci.CUSTOMINSEIR_NBR AS codigo,
        ci.CUSTOMINSEIR_OPERATOR AS lineaNaviera,
	    ci.CUSTOMINSEIR_GATE AS gate,
        ci.CUSTOMINSEIR_STARTINSP AS inicio,
        COALESCE(ci.CUSTOMINSEIR_ENDINSPTARE, ci.CUSTOMINSEIR_ENDINSP) AS fin,
        CONCAT(bu.buser_firstName, ' ', bu.buser_lastName) AS tecnico,
        ci.CUSTOMINSEIR_UNITISO AS iso,
        CASE
            WHEN ci.CUSTOMINSEIR_UNITISO IN (
                '4839','48R9','48R0','4830','4832','4833','4834','4835','4836','4837','4838',
                '48R2','48R3','48R4','48R5','48R6','48R7','48R8','48R1','4831','4239','42R9',
                '4339','43R9','4330','4230','43R0','42R0','42R2','42R3','42R4','42R5','42R6',
                '42R7','42R8','43R2','43R3','43R4','43R5','43R6','43R7','43R8','4332','4333',
                '4334','4335','4336','4337','4338','4232','4233','4234','4235','4236','4237',
                '4238','4231','4331','42R1','43R1','4539','45R9','4530','45R0','45R1','45R8',
                '45R2','45RT','45R3','45R4','45R5','45R6','45R7','4532','4533','4534','4535',
                '4536','4537','4538','4531'
            ) THEN 'REEFER HIGH CUBE'
            WHEN ci.CUSTOMINSEIR_UNITISO IN (
                '4823','4824','4825','4826','4827','4828','4829','48B3','48B4','48B5',
                '48B6','48B7','48B8','48B9','4883','4884','4885','4886','4887','4888',
                '4889','48B0','48B1','48B2','4880','4881','4882','4820','4821','4822',
                '48G0','48G1','48G2','48G3','48G4','48G5','48G6','48G7','48G8','48G9',
                '4800','4801','4802','4803','4804','4805','4806','4807','4808','4809',
                '4863','4864','48P3','48P4','4861','4862','48P6','48P7','48P8','48P9',
                '48P1','48P2','4866','4867','4868','4869','48P0','4860','48P5','4865',
                '48S0','48S1','48S2','48S3','48S4','48S5','48S6','48S7','48S8','48S9',
                '48T3','48T4','48T5','48T6','4873','4874','4875','4876','4877','4878',
                '4879','48T7','48T8','48T9','4870','4871','4872','48T0','48T1','48T2',
                '48U6','4856','4857','4858','4859','48U0','48U1','48U2','48U3','48U4',
                '48U5','4850','4851','4852','4853','4854','4855','48U7','48U8','48U9',
                '4810','4811','4812','4813','4814','4815','4816','4817','4818','4819',
                '48V0','48V1','48V2','48V3','48V4','48V5','48V6','48V7','48V8','48V9',
                '4000','4060','4050','4223','4224','4225','4226','4227','4228','4229',
                '4283','4284','4285','4286','4287','4288','4289','42B3','42B4','42B5',
                '42B6','42B7','42B8','42B9','4323','4324','432getBookingInfoByBooking5','4326','4327','4328',
                '4329','4383','4384','4385','4386','4387','4388','4389','43B3','43B4',
                '43B5','43B6','43B7','43B8','43B9','4220','4221','4222','43B0','43B1',
                '43B2','4380','4381','4382','4320','4321','4322','42B0','42B1','42B2',
                '4280','4281','4282','4200','4300','4301','4302','4303','4304','4305',
                '4306','4307','4308','4309','42G0','42G1','42G2','42G3','42G4','42G5',
                '42G6','42G7','42G8','42G9','4201','4202','4203','4204','4205','4206',
                '4207','4208','4209','43G0','43G1','43G2','43G3','43G4','43G5','43G6',
                '43G7','43G8','43G9','43P3','43P4','4363','4364','4263','4264','42P3',
                '42P4','42P1','42P2','4266','4267','4268','4269','4361','4362','4366',
                '4367','4368','4369','4261','4262','42P6','42P7','42P8','42P9','43P1',
                '43P2','43P6','43P7','43P8','43P9','49P0','43P0','4360','4260','42P0',
                '4265','4365','43P5','42P5','42S0','42S1','42S2','42S3','42S4','42S5',
                '42S6','42S7','42S8','42S9','43S0','43S1','43S2','43S3','43S4','43S5',
                '43S6','43S7','43S8','43S9','4273','4274','4275','4276','4373','4374',
                '4375','4376','43T3','43T4','43T5','43T6','42T3','42T4','42T5','42T6',
                '42T7','42T8','42T9','43T7','43T8','43T9','4377','4378','4379','4277',
                '4278','4279','4370','4371','4372','43T0','43T1','43T2','4271','4272',
                '4270','42T0','42T1','42T2','4356','4256','43U6','42U6','4250','42U0',
                '42U1','42U2','42U3','42U4','42U5','4251','4252','4253','4254','4255',
                '42U7','42U8','42U9','4257','4258','4259','4357','4358','4359','43U7',
                '43U8','43U9','43U0','43U1','43U2','43U3','43U4','43U5','4350','4351',
                '4352','4353','4354','4355','4310','4311','4312','4313','4314','4315',
                '4316','4317','4318','4319','43V0','43V1','43V2','43V3','43V4','43V5',
                '43V6','43V7','43V8','43V9','4210','4211','4212','4213','4214','4215',
                '4216','4217','4218','4219','42V0','42V1','42V2','42V3','42V4','42V5',
                '42V6','42V7','42V8','42V9','4523','4524','4525','4526','4527','4528',
                '4529','4583','4584','4585','4586','4587','4588','4589','45B3','45B4',
                '45B5','45B6','45B7','45B8','45B9','45B0','45B1','45B2','4580','4581',
                '4582','4520','4521','4522','4500','45G0','45G1','45G2','45G3','45G4',
                '45G5','45G6','45G7','45G8','45G9','4501','4502','4503','4504','4505',
                '4506','4507','4508','4509','45P3','45P4','4563','4564','4561','4562',
                '4566','4567','4568','4569','45P1','45P2','45P6','45P7','45P8','45P9',
                '4560','45P0','4565','45P5','45S0','45S1','45S2','45S3','45S4','45S5',
                '45S6','45S7','45S8','45S9','45T3','45T4','45T5','45T6','4573','4574',
                '4575','4576','4577','4578','4579','45T7','45T8','45T9','4570','4571',
                '4572','45T0','45T1','45T2','45U6','4556','4557','4558','4559','4550',
                '4551','4552','4553','4554','4555','45U7','45U8','45U9','45U0','45U1',
                '45U2','45U3','45U4','45U5','4510','4511','4512','4513','4514','4515',
                '4516','4517','4518','4519','45V0','45V1','45V2','45V3','45V4','45V5',
                '45V6','45V7','45V8','45V9'
            ) THEN 'HIGH CUBE'
            ELSE 'DRY GENERAL'
        END AS tipo,
        ci.CUSTOMINSEIR_UNITTARE AS tara,
        ci.CUSTOMINSEIR_PAYLOAD AS pesoMaximo,
        ci.CUSTOMINSEIR_SAFEWT AS pesoBruto,
        CASE
            WHEN ci.CUSTOMINSEIR_FREIGHT = 'MTY' THEN 'ESTADO (VACIO / EMPTY)'
            WHEN ci.CUSTOMINSEIR_FREIGHT = 'FCL' THEN 'ESTADO (LLENO / FULL)'
            ELSE ci.CUSTOMINSEIR_FREIGHT
        END AS estado,
        resultado.CUSTOMEIRRES_DESC AS resultado,
        ci.CUSTOMINSEIR_FREIGHT AS tipoCarga,
        ci.CUSTOMINSEIR_CLASSIF AS clasificacion,
        ci.CUSTOMINSEIR_FREIGHT AS condicion,
        ci.CUSTOMINSEIR_BUILDDATE AS fabricacion,
        CONCAT(
            ci.CUSTOMINSEIR_SEAL1,' / ',ci.CUSTOMINSEIR_SEAL2,' / ',
            ci.CUSTOMINSEIR_SEAL3,' / ',ci.CUSTOMINSEIR_SEAL4
        ) AS precintos,
        ci.CUSTOMINSEIR_BOOK AS booking,
        ci.CUSTOMINSEIR_TRUCK AS placa,
        UPPER(CONCAT(ci.CUSTOMINSEIR_DRIVER, ' - ', rtd.name)) AS chofer,
        ci.CUSTOMINSEIR_HUMIDITY AS humedad,
        ci.CUSTOMINSEIR_VENT AS ventilacion,
        ci.CUSTOMINSEIR_TEMP AS temperatura,
        ci.CUSTOMINSEIR_O2 AS o2,
        ci.CUSTOMINSEIR_CO2 AS co2,
        ci.CUSTOMINSEIR_DOOR AS door,
        ci.CUSTOMINSEIR_FRONT AS front,
        ci.CUSTOMINSEIR_LEFT AS leftSide,
        ci.CUSTOMINSEIR_RIGHT AS rightSide,
        ci.CUSTOMINSEIR_ROOF AS topRoof,
        ci.CUSTOMINSEIR_INNER AS [inner],
        ci.CUSTOMINSEIR_UNDERSTRUCTURE AS understructure,
        ci.CUSTOMINSEIR_REMARKS AS observaciones
    FROM CUSTOM_INSPEIR ci
    INNER JOIN inv_unit_fcy_visit iufv
        ON iufv.gkey = ci.CUSTOMINSEIR_UFV
    LEFT JOIN base_user bu
        ON bu.buser_userid = ci.CUSTOMINSEIR_CREATOR
    LEFT JOIN road_truck_drivers rtd
        ON rtd.driver_license_nbr = ci.CUSTOMINSEIR_DRIVER
    LEFT JOIN CUSTOM_RESULTS_EIR resultado
        ON resultado.gkey = ci.CUSTOMINSEIR_RESULT
    WHERE ci.CUSTOMINSEIR_UFV = TRY_CONVERT(BIGINT, @activeUfv)
    ORDER BY ci.gkey DESC
  `,

    /**
     * Get EIR damage details by inspection EIR gkey.
     */
    getEirDamageDetailsByInspeirGkey: `
    SELECT
        dam.CUSTOMEIRDAM_CODE AS location,
        CONCAT(daty.CUSTOMEIRDMG_ID, ' - ', daty.CUSTOMEIRDMG_DESC) AS damageType,
        CONCAT(comp.CUSTOMEIRCOM_ID, ' - ', comp.CUSTOMEIRCOM_DESC) AS component,
        CONCAT(meth.CUSTOMMETREP_ID, ' - ', meth.CUSTOMMETREP_DESC) AS repairMethod,
        CONCAT(resp.CUSTOMRESPEI_ID, ' - ', resp.CUSTOMRESPEI_DESC) AS responsible,
        dam.CUSTOMEIRDAM_QTY AS quantity,
        dam.CUSTOMEIRDAM_INSPEIR AS eirNbr,
        dam.CUSTOMEIRDAM_LENGTH AS length,
        dam.CUSTOMEIRDAM_WIDTH AS width,
        dam.CUSTOMEIRDAM_AREA AS area
    FROM CUSTOM_INSPEIRDAM dam
    LEFT JOIN CUSTOM_DAMTYPE_EIR daty
        ON daty.gkey = dam.CUSTOMEIRDAM_DAMTYPE
    LEFT JOIN CUSTOM_COMP_EIR comp
        ON comp.gkey = dam.CUSTOMEIRDAM_COMP
    LEFT JOIN CUSTOM_REPAIRMETH_EIR meth
        ON meth.gkey = dam.CUSTOMEIRDAM_REPMET
    LEFT JOIN CUSTOM_RESPONSIBLE_EIR resp
        ON resp.gkey = dam.CUSTOMEIRDAM_RESP
    WHERE dam.CUSTOMEIRDAM_INSPEIR = TRY_CONVERT(BIGINT, @eirGkey)
    ORDER BY dam.gkey ASC
  `,

    /**
     * Get appointments in progress for general cargo operations
     * All road_truck_transactions except containers gate 53
     */
    getGeneralCargoAppointmentsInProgress: `
    SELECT
        gat.gkey AS TranGkey,
        gat.nbr AS codigo,
        gat.bl_item_gkey AS BlItemGkey,
        cbol.cv_gkey AS VesselVisitGkey,
        gat.gate_gkey AS GateGkey,
        'N.E.' AS Cliente,
        'N.E.' AS Producto,
        'N.E.' AS Nave,
        ISNULL(gat.chs_id, '') AS Carreta,
        ISNULL(truc.truck_id, '') AS Tracto,
        ISNULL(gat.chs_id, '') AS Chassis,
        CASE 
            WHEN gat.stage_id IN ('pre-gate','pre_gate') THEN 'pre_gate'
            WHEN gat.stage_id IN ('ingate','gate_in') THEN 'gate_in'
            WHEN gat.stage_id IN ('zona-espera','zona_de_espera') THEN 'zona_de_espera'
            WHEN gat.stage_id IN ('inicio-carguio','inicio_carguio') THEN 'inicio_de_carguio'
            ELSE gat.stage_id
        END AS Stage,
        CASE gat.sub_type
            WHEN 'RE' THEN 'Embarque'
            WHEN 'DI' THEN 'Descarga'
            ELSE  gat.sub_type
        END AS Tipo,
        CASE gat.gate_gkey
            WHEN 47 THEN 'Fraccionada'
            WHEN 48 THEN 'Granel'
            WHEN 49 THEN 'Proyecto'
            WHEN 50 THEN 'Granel_AS'
            WHEN 51 THEN 'Roro'
            WHEN 54 THEN 'Avituallamiento'
            ELSE CONCAT('Gate ', gat.gate_gkey)
        END AS TipoOperativa
    FROM road_truck_transactions gat
    LEFT JOIN road_truck_visit_details truc ON truc.tvdtls_gkey = gat.truck_visit_gkey
    LEFT JOIN crg_bl_item cbi ON cbi.gkey = gat.bl_item_gkey
    LEFT JOIN crg_bills_of_lading cbol ON cbol.gkey = cbi.bl_gkey

    WHERE gat.status = 'OK'
    AND gat.gate_gkey <> 53
    AND gat.sub_type NOT IN ('RI', 'DM')
  `,

    /**
     * Get appointment stages in batch by transaction gkeys.
     * Used to avoid correlated OUTER APPLY in appointments in-progress query.
     */
    getAppointmentStagesByTranGkeys: `
    SELECT
        s.tran_gkey AS TranGkey,
        DATEADD(HOUR,5,MAX(CASE WHEN s.id = 'tranquera' THEN s.stage_end END)) AS Tranquera,
        DATEADD(HOUR,5,MAX(CASE WHEN s.id IN ('pre_gate','pre-gate') THEN s.stage_end END)) AS PreGate,
        DATEADD(HOUR,5,MAX(CASE WHEN s.id IN ('gate_in','ingate') THEN s.stage_end END)) AS GateIn,
        DATEADD(HOUR,5,MAX(CASE WHEN s.id IN ('zona_de_espera','zona-de_espera','zona_de_espera') THEN s.stage_end END)) AS ZonaEspera,
        DATEADD(HOUR,5,MAX(CASE WHEN s.id IN ('inicio_de_carguio','inicio-carguio','inicio_carguio') THEN s.stage_end END)) AS InicioCarguio,
        DATEADD(HOUR,5,MAX(CASE WHEN s.id = 'yard' THEN s.stage_end END)) AS Yard,
        DATEADD(HOUR,5,MAX(CASE WHEN s.id = 'gate_out' THEN s.stage_end END)) AS GateOut
    FROM road_truck_transaction_stages s
    WHERE s.tran_gkey IN (
        SELECT TRY_CONVERT(BIGINT, value)
        FROM STRING_SPLIT(@tranGkeys, ',')
        WHERE TRY_CONVERT(BIGINT, value) IS NOT NULL
    )
    GROUP BY s.tran_gkey
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
