const CONTAINER_CTES = `
WITH configuracion_operacion AS (
    SELECT *
    FROM (VALUES
        ('STRGE','DSCH','11','1','Container Vessel Discharge','Local'),
        ('TRSHP','DSCH','11','2','Container Vessel Discharge','T/S-ment'),
        ('THRGH','DSCH','11','3','Container Vessel Discharge','Restow'),
        ('EXPRT','LOAD','12','1','Container Vessel Loading','Local'),
        ('TRSHP','LOAD','12','2','Container Vessel Loading','T/S-ment'),
        ('THRGH','LOAD','12','3','Container Vessel Loading','Restow')
    ) v(categoria,movimiento,operation_code,movement_code,
        operacion_descripcion,movimiento_descripcion)
),
configuracion_carga AS (
    SELECT *
    FROM (VALUES
        ('FULL','DRY','1','10','BDRY','Full','Dry'),
        ('EMPTY','DRY','1','20','BDRY','Empty','Dry'),
        ('FULL','REEFER','1','10','BREF','Full','Reefer')
    ) v(estado_normalizado,equipo_normalizado,freight_code,cargo_code,
        equipment_code,estado_descripcion,equipo_descripcion)
),
configuracion_tamano AS (
    SELECT *
    FROM (VALUES
        ('NOM20','20FT','20'''),
        ('NOM40','40FT','40''')
    ) v(nominal_length,size_code,size_description)
),
catalogo AS (
    SELECT
        CONCAT('5X',o.operation_code,o.movement_code,c.freight_code,
               c.cargo_code,c.equipment_code,t.size_code) AS unique_id,
        CONCAT(o.operacion_descripcion,' ',o.movimiento_descripcion,' ',
               c.estado_descripcion,' ',c.equipo_descripcion,' ',
               t.size_description) AS account_description,
        o.categoria,o.movimiento,c.estado_normalizado,
        c.equipo_normalizado,t.nominal_length,t.size_description
    FROM configuracion_operacion o
    CROSS JOIN configuracion_carga c
    CROSS JOIN configuracion_tamano t
),
movimientos_base AS (
    SELECT
        ime.mve_gkey,
        ime.ufv_gkey,
        ime.t_put AS fecha_movimiento,
        CASE
            WHEN ime.move_kind = 'RECV' AND acv.operator_gkey = 10 THEN 'LOAD'
            ELSE ime.move_kind
        END AS move_kind,
        iu.gkey AS unit_gkey,
        iu.id AS contenedor,
        CASE
            WHEN ime.move_kind = 'RECV' AND acv.operator_gkey = 10 THEN 'EXPRT'
            ELSE iu.category
        END AS categoria,
        iu.freight_kind,
        ret.id AS iso,
        ret.description AS tipo_contenedor,
        ret.nominal_length,
        acv.gkey AS carrier_visit_gkey,
        acv.id AS manifiesto,
        line.id AS linea,
        line.name AS nombre_linea,
        vessel.name AS nave,
        CASE WHEN ime.move_kind = 'LOAD' THEN 1
             WHEN ime.move_kind = 'RECV' THEN 2
             ELSE 1 END AS prioridad_fuente
    FROM inv_move_event ime
    INNER JOIN inv_unit_fcy_visit iufv ON iufv.gkey = ime.ufv_gkey
    INNER JOIN inv_unit iu ON iu.gkey = iufv.unit_gkey
    INNER JOIN ref_equipment re ON re.gkey = iu.eq_gkey
    INNER JOIN ref_equip_type ret ON ret.gkey = re.eqtyp_gkey
    INNER JOIN argo_carrier_visit acv
        ON acv.gkey = CASE
            WHEN ime.move_kind = 'DSCH' THEN iufv.actual_ib_cv
            WHEN ime.move_kind IN ('LOAD','RECV') THEN iufv.actual_ob_cv
        END
    LEFT JOIN ref_bizunit_scoped line ON line.gkey = iu.line_op
    LEFT JOIN argo_visit_details visit_details
        ON visit_details.gkey = acv.cvcvd_gkey
    LEFT JOIN vsl_vessel_visit_details vessel_visit
        ON vessel_visit.vvd_gkey = visit_details.gkey
    LEFT JOIN vsl_vessels vessel ON vessel.gkey = vessel_visit.vessel_gkey
    WHERE ime.t_put >= @fecha_inicio
      AND ime.t_put < @fecha_fin
      AND (
          (ime.move_kind='DSCH'
           AND ime.fm_pos_loctype='VESSEL'
           AND ime.to_pos_loctype='YARD'
           AND iu.category IN ('STRGE','TRSHP','THRGH'))
          OR
          (ime.move_kind='LOAD'
           AND ime.fm_pos_loctype='YARD'
           AND ime.to_pos_loctype='VESSEL'
           AND iu.category IN ('EXPRT','TRSHP','THRGH'))
          OR
          (ime.move_kind='RECV'
           AND ime.fm_pos_loctype='TRUCK'
           AND ime.to_pos_loctype='YARD'
           AND iu.category='EXPRT'
           AND acv.operator_gkey=10)
      )
      AND iu.freight_kind IN ('FCL','LCL','MTY')
      AND ret.nominal_length IN ('NOM20','NOM40')
      AND ret.id NOT IN ('BLKS','FRAC')
      AND ret.class='CONTAINER'
),
movimientos_unicos AS (
    SELECT *
    FROM (
        SELECT mb.*,
               ROW_NUMBER() OVER (
                   PARTITION BY mb.ufv_gkey,mb.move_kind,mb.carrier_visit_gkey
                   ORDER BY mb.prioridad_fuente ASC,
                            mb.fecha_movimiento DESC,
                            mb.mve_gkey DESC
               ) AS rn
        FROM movimientos_base mb
    ) x
    WHERE x.rn=1
),
movimientos_normalizados AS (
    SELECT mu.*,
        CASE WHEN mu.freight_kind IN ('FCL','LCL') THEN 'FULL'
             WHEN mu.freight_kind='MTY' THEN 'EMPTY' END AS estado_normalizado,
        CASE WHEN mu.freight_kind='MTY' THEN 'DRY'
             WHEN mu.tipo_contenedor LIKE '%reefer%' THEN 'REEFER'
             ELSE 'DRY' END AS equipo_normalizado
    FROM movimientos_unicos mu
),
movimientos_clasificados AS (
    SELECT
        CONCAT('5X',op.operation_code,op.movement_code,cg.freight_code,
               cg.cargo_code,cg.equipment_code,tm.size_code) AS unique_id,
        tm.size_description,
        mn.*
    FROM movimientos_normalizados mn
    INNER JOIN configuracion_operacion op
        ON op.categoria=mn.categoria AND op.movimiento=mn.move_kind
    INNER JOIN configuracion_carga cg
        ON cg.estado_normalizado=mn.estado_normalizado
       AND cg.equipo_normalizado=mn.equipo_normalizado
    INNER JOIN configuracion_tamano tm
        ON tm.nominal_length=mn.nominal_length
)
`;

const TRUCK_CTES = `
WITH configuracion_operacion AS (
    SELECT * FROM (VALUES
        ('TRUCK_IN','31','1','Truck IN','Local'),
        ('TRUCK_OUT','32','1','Truck OUT','Local')
    ) v(tipo_operacion,operation_code,movement_code,
        operacion_descripcion,movimiento_descripcion)
),
configuracion_carga AS (
    SELECT * FROM (VALUES
        ('FULL','DRY','1','10','BDRY','Full','Dry'),
        ('EMPTY','DRY','1','20','BDRY','Empty','Dry'),
        ('FULL','REEFER','1','10','BREF','Full','Reefer')
    ) v(estado_normalizado,equipo_normalizado,freight_code,cargo_code,
        equipment_code,estado_descripcion,equipo_descripcion)
),
configuracion_tamano AS (
    SELECT * FROM (VALUES
        ('NOM20','20FT','20'''),
        ('NOM40','40FT','40''')
    ) v(nominal_length,size_code,size_description)
),
catalogo_truck AS (
    SELECT
        CONCAT('5X',op.operation_code,op.movement_code,cg.freight_code,
               cg.cargo_code,cg.equipment_code,tm.size_code) AS unique_id,
        CONCAT(op.operacion_descripcion,' ',op.movimiento_descripcion,' ',
               cg.estado_descripcion,' ',cg.equipo_descripcion,' ',
               tm.size_description) AS account_description,
        op.tipo_operacion,cg.estado_normalizado,
        cg.equipo_normalizado,tm.nominal_length,tm.size_description
    FROM configuracion_operacion op
    CROSS JOIN configuracion_carga cg
    CROSS JOIN configuracion_tamano tm
),
transacciones_base AS (
    SELECT
        rt.gkey AS road_transaction_gkey,
        gate_out.stage_end AS fecha_movimiento,
        rt.sub_type,
        rt.unit_gkey,
        iu.id AS contenedor,
        iu.category,
        iu.line_op,
        ret.id AS iso,
        ret.description AS tipo_contenedor,
        ret.nominal_length,
        CASE WHEN rt.sub_type IN ('RE','RM') THEN 'TRUCK_IN'
             WHEN rt.sub_type IN ('DE','DI','DM') THEN 'TRUCK_OUT' END
             AS tipo_operacion,
        CASE WHEN rt.sub_type IN ('DE','DI','RE') THEN 'FULL'
             WHEN rt.sub_type IN ('DM','RM') THEN 'EMPTY' END
             AS estado_normalizado,
        CASE
            WHEN iu.category IN ('STRGE','IMPRT') THEN iufv.actual_ib_cv
            WHEN iu.category='EXPRT' THEN iufv.actual_ob_cv
            WHEN iu.category='TRSHP' AND rt.sub_type IN ('RE','RM')
                THEN iufv.actual_ib_cv
            WHEN iu.category='TRSHP' AND rt.sub_type IN ('DE','DI','DM')
                THEN iufv.actual_ob_cv
            WHEN iu.category='THRGH'
                THEN COALESCE(iufv.actual_ib_cv,iufv.actual_ob_cv)
            ELSE NULL
        END AS carrier_visit_gkey
    FROM road_truck_transactions rt
    CROSS APPLY (
        SELECT TOP 1 rts.stage_end
        FROM road_truck_transaction_stages rts
        WHERE rts.tran_gkey=rt.gkey
          AND rts.id='gate_out'
          AND rts.status='COMPLETE'
        ORDER BY rts.stage_end DESC,rts.gkey DESC
    ) gate_out
    INNER JOIN inv_unit iu ON iu.gkey=rt.unit_gkey
    INNER JOIN ref_equipment re ON re.gkey=iu.eq_gkey
    INNER JOIN ref_equip_type ret ON ret.gkey=re.eqtyp_gkey
    LEFT JOIN inv_unit_fcy_visit iufv ON iufv.gkey=iu.active_ufv
    WHERE rt.gate_gkey=@gate_gkey
      AND rt.status='COMPLETE'
      AND gate_out.stage_end>=@fecha_inicio
      AND gate_out.stage_end<@fecha_fin
      AND rt.sub_type IN ('RE','RM','DE','DI','DM')
      AND ret.nominal_length IN ('NOM20','NOM40')
      AND ret.id NOT IN ('BLKS','FRAC')
      AND ret.class='CONTAINER'
),
transacciones_normalizadas AS (
    SELECT tb.*,
        CASE WHEN tb.estado_normalizado='EMPTY' THEN 'DRY'
             WHEN tb.tipo_contenedor LIKE '%reefer%' THEN 'REEFER'
             ELSE 'DRY' END AS equipo_normalizado
    FROM transacciones_base tb
),
transacciones_enriquecidas AS (
    SELECT
        tn.*,
        acv.id AS manifiesto,
        line.id AS linea,
        line.name AS nombre_linea,
        vessel.name AS nave
    FROM transacciones_normalizadas tn
    LEFT JOIN argo_carrier_visit acv ON acv.gkey=tn.carrier_visit_gkey
    LEFT JOIN ref_bizunit_scoped line ON line.gkey=tn.line_op
    LEFT JOIN argo_visit_details visit_details
        ON visit_details.gkey=acv.cvcvd_gkey
    LEFT JOIN vsl_vessel_visit_details vessel_visit
        ON vessel_visit.vvd_gkey=visit_details.gkey
    LEFT JOIN vsl_vessels vessel ON vessel.gkey=vessel_visit.vessel_gkey
),
transacciones_clasificadas AS (
    SELECT
        ct.unique_id,
        ct.account_description,
        ct.size_description,
        te.*
    FROM transacciones_enriquecidas te
    INNER JOIN catalogo_truck ct
        ON ct.tipo_operacion=te.tipo_operacion
       AND ct.estado_normalizado=te.estado_normalizado
       AND ct.equipo_normalizado=te.equipo_normalizado
       AND ct.nominal_length=te.nominal_length
)
`;

export const TprReportQueries = {
  containerSummary: `
${CONTAINER_CTES}
SELECT
    c.unique_id,
    c.account_description,
    COUNT(mc.mve_gkey) AS total
FROM catalogo c
LEFT JOIN movimientos_clasificados mc
    ON c.unique_id=mc.unique_id
   AND c.categoria=mc.categoria
   AND c.movimiento=mc.move_kind
   AND c.estado_normalizado=mc.estado_normalizado
   AND c.equipo_normalizado=mc.equipo_normalizado
   AND c.nominal_length=mc.nominal_length
GROUP BY c.unique_id,c.account_description

UNION ALL

SELECT
    '5X101000BDUMSDUM' AS unique_id,
    'Container Vessel calls' AS account_description,
    COUNT(*) AS total
FROM argo_carrier_visit acv
INNER JOIN argo_visit_details visit_details
    ON visit_details.gkey=acv.cvcvd_gkey
INNER JOIN vsl_vessel_visit_details vessel_visit
    ON vessel_visit.vvd_gkey=visit_details.gkey
WHERE vessel_visit.flex_string01='CONT'
  AND acv.phase IN ('60DEPARTED','70CLOSED')
  AND acv.atd>=@fecha_inicio
  AND acv.atd<@fecha_fin;
`,

  containerDetails: `
${CONTAINER_CTES}
SELECT
    c.account_description,
    mc.fecha_movimiento AS movement_date,
    mc.contenedor AS container,
    mc.move_kind AS operation,
    mc.estado_normalizado AS normalized_status,
    mc.equipo_normalizado AS normalized_equipment,
    mc.size_description,
    mc.iso,
    mc.tipo_contenedor AS container_type,
    mc.categoria AS category,
    mc.linea AS shipping_line,
    mc.nombre_linea AS shipping_line_name,
    mc.manifiesto AS manifest,
    mc.nave AS vessel,
    COUNT(*) OVER() AS total_count
FROM movimientos_clasificados mc
INNER JOIN catalogo c
    ON c.unique_id=mc.unique_id
   AND c.categoria=mc.categoria
   AND c.movimiento=mc.move_kind
   AND c.estado_normalizado=mc.estado_normalizado
   AND c.equipo_normalizado=mc.equipo_normalizado
   AND c.nominal_length=mc.nominal_length
WHERE mc.unique_id=@unique_id
ORDER BY mc.fecha_movimiento,mc.mve_gkey
OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
`,

  vesselCallsDetails: `
SELECT
    'Container Vessel calls' AS account_description,
    acv.atd,
    acv.id AS manifest,
    vessel.name AS vessel,
    COUNT(*) OVER() AS total_count
FROM argo_carrier_visit acv
INNER JOIN argo_visit_details visit_details
    ON visit_details.gkey=acv.cvcvd_gkey
INNER JOIN vsl_vessel_visit_details vessel_visit
    ON vessel_visit.vvd_gkey=visit_details.gkey
LEFT JOIN vsl_vessels vessel ON vessel.gkey=vessel_visit.vessel_gkey
WHERE vessel_visit.flex_string01='CONT'
  AND acv.phase IN ('60DEPARTED','70CLOSED')
  AND acv.atd>=@fecha_inicio
  AND acv.atd<@fecha_fin
ORDER BY acv.atd,acv.gkey
OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
`,

  truckSummary: `
${TRUCK_CTES}
SELECT
    ct.unique_id,
    ct.account_description,
    COUNT(tc.road_transaction_gkey) AS total
FROM catalogo_truck ct
LEFT JOIN transacciones_clasificadas tc
    ON tc.unique_id=ct.unique_id
GROUP BY ct.unique_id,ct.account_description
ORDER BY ct.unique_id;
`,

  truckDetails: `
${TRUCK_CTES}
SELECT
    tc.account_description,
    tc.fecha_movimiento AS movement_date,
    tc.contenedor AS container,
    CASE WHEN tc.tipo_operacion='TRUCK_IN' THEN 'TRUCK IN'
         ELSE 'TRUCK OUT' END AS operation,
    tc.estado_normalizado AS normalized_status,
    tc.equipo_normalizado AS normalized_equipment,
    tc.size_description,
    tc.iso,
    tc.tipo_contenedor AS container_type,
    tc.category,
    tc.linea AS shipping_line,
    tc.nombre_linea AS shipping_line_name,
    tc.manifiesto AS manifest,
    tc.nave AS vessel,
    COUNT(*) OVER() AS total_count
FROM transacciones_clasificadas tc
WHERE tc.unique_id=@unique_id
ORDER BY tc.fecha_movimiento,tc.road_transaction_gkey
OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
`,
} as const;
