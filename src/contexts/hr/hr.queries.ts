import { createQueries } from '@crane-technologies/database';

export const hrQueryDefs = {
  contract: {
    byId: `
    SELECT * FROM hr_schema.contract WHERE contract_id = $1 LIMIT 1
    `,
    update: `
      UPDATE hr_schema.contract
      SET
        start_date = COALESCE($1, start_date),
        end_date = COALESCE($2, end_date),
        hours = COALESCE($3, hours),
        base_salary = COALESCE($4, base_salary),
        duties_type_id = COALESCE($5, duties_type_id),
        turn_type = COALESCE($6, turn_type),
        turn_id = COALESCE($7, turn_id),
        journey_type = COALESCE($9, journey_type),
        weekly_hours = COALESCE($10, weekly_hours)
      WHERE contract_id = $8
      RETURNING contract_id, journey_type, weekly_hours
    `,
    getSchedule: `
    SELECT * FROM hr_schema.payment_schedule
    `,
  },

  dutiesType: {
    listByTenant: `
      SELECT duties_type_id, tenant_id, name, description, is_active, created_at
      FROM hr_schema.duties_type
      WHERE tenant_id = $1 AND is_active = true
      ORDER BY name ASC
    `,
    getById: `
      SELECT duties_type_id, tenant_id, name, description, is_active, created_at
      FROM hr_schema.duties_type
      WHERE duties_type_id = $1 LIMIT 1
    `,
    create: `
      INSERT INTO hr_schema.duties_type (tenant_id, name, description)
      VALUES ($1, $2, $3)
      RETURNING duties_type_id, tenant_id, name, description, is_active, created_at
    `,
    update: `
      UPDATE hr_schema.duties_type
      SET
        name = COALESCE($1, name),
        description = COALESCE($2, description)
      WHERE duties_type_id = $3
      RETURNING duties_type_id, name, description
    `,
    softDelete: `
      UPDATE hr_schema.duties_type SET is_active = false WHERE duties_type_id = $1 RETURNING duties_type_id
    `,
  },

  employee: {
    getById: `
      SELECT e.first_name, e.last_name, e.doc_number, e.phone, e.email, e.is_active, c.start_date, c.end_date, c.hours, c.base_salary, c.duties, c.turn_id, e.branch_id
      FROM hr_schema.employee e
      INNER JOIN hr_schema.contract c USING(contract_id)
      WHERE e.employee_id = $1 LIMIT 1
    `,
    getByUserId: `
      SELECT e.employee_id, e.contract_id, e.first_name, e.last_name, e.doc_number, e.phone, e.email, e.is_active, e.payment_schedule_id, e.branch_id, c.start_date::text AS start_date, c.end_date::text AS end_date, c.hours, c.base_salary, c.duties, c.turn_type, c.turn_id
      FROM hr_schema.employee e
      INNER JOIN hr_schema.contract c USING(contract_id)
      WHERE e.user_id = $1 LIMIT 1
    `,
    getByTenant: `
      SELECT
        e.employee_id,
        e.user_id,
        e.tenant_id,
        e.branch_id,
        b.branch_name,
        e.contract_id,
        e.first_name,
        e.last_name,
        e.doc_number,
        e.identification_type_id,
        e.phone,
        e.email,
        e.payment_schedule_id,
        e.is_active,
        e.created_at,
        e.updated_at,
        c.start_date::text AS start_date,
        c.end_date::text AS end_date,
        c.hours,
        c.base_salary,
        c.duties,
        c.duties_type_id,
        dt.name AS duties_type_name,
        dt.description AS duties_type_description,
        c.turn_type,
        c.turn_id
      FROM hr_schema.employee e
      INNER JOIN hr_schema.contract c USING(contract_id)
      INNER JOIN general_schema.branch b ON b.branch_id = e.branch_id
      LEFT JOIN hr_schema.duties_type dt ON dt.duties_type_id = c.duties_type_id
      WHERE e.tenant_id = $1
      ORDER BY e.created_at DESC
    `,
    getByBranchAndTenant: `
      SELECT * FROM hr_schema.employee 
      WHERE branch_id = $1 AND tenant_id = $2 AND is_active = true
    `,
    create: `
      INSERT INTO hr_schema.employee (user_id, tenant_id, first_name, last_name, doc_number, phone, email, payment_schedule_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING employee_id
    `,
    update: `
      UPDATE hr_schema.employee
      SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        doc_number = COALESCE($3, doc_number),
        phone = COALESCE($4, phone),
        email = COALESCE($5, email),
        payment_schedule_id = COALESCE($6, payment_schedule_id),
        branch_id = COALESCE($7, branch_id),
        identification_type_id = COALESCE($8, identification_type_id)
      WHERE employee_id = $9
      RETURNING employee_id
    `,
    delete: `
      DELETE FROM hr_schema.employee WHERE employee_id = $1 RETURNING employee_id
    `,
    deactivate: `
      UPDATE hr_schema.employee SET is_active = false WHERE employee_id = $1 RETURNING employee_id
    `,
    full: `
    SELECT hr_schema.create_new_employee(
      $1::date,
      $2::date,
      $3::integer,
      $4::numeric,
      $5::text,
      $6::integer,
      $7::integer,
      $8::uuid,
      $9::uuid,
      $10::varchar,
      $11::varchar,
      $12::varchar,
      $13::varchar,
      $14::varchar,
      $15::integer,
      $16::uuid,
      $17::integer,
      $18::integer
    ) AS employee_id
  `,
    getTenantId: `
      SELECT tenant_id FROM hr_schema.employee WHERE employee_id = $1 LIMIT 1
    `,
    getForSalary: `
      SELECT e.employee_id, e.tenant_id, e.hire_date::text AS hire_date, c.journey_type, c.weekly_hours
      FROM hr_schema.employee e
      INNER JOIN hr_schema.contract c USING(contract_id)
      WHERE e.employee_id = $1 LIMIT 1
    `,
    terminate: `
      UPDATE hr_schema.employee
      SET termination_date = $1, termination_type = $2, termination_reason = $3,
          is_active = ($1::DATE > CURRENT_DATE)
      WHERE employee_id = $4 AND tenant_id = $5
      RETURNING employee_id, tenant_id, hire_date::text AS hire_date, termination_date::text AS termination_date,
        termination_type, termination_reason, is_active
    `,
    listActiveForTenant: `
      SELECT employee_id, hire_date::text AS hire_date
      FROM hr_schema.employee
      WHERE tenant_id = $1 AND is_active = true
    `,
    getTerminationInfo: `
      SELECT employee_id, tenant_id, hire_date::text AS hire_date,
        termination_date::text AS termination_date, termination_type, termination_reason
      FROM hr_schema.employee WHERE employee_id = $1 LIMIT 1
    `,
  },

  payrollParameters: {
    listByTenant: `
      SELECT parameter_id, tenant_id, param_key, param_value, valid_from, valid_to, source, created_at
      FROM hr_schema.payroll_parameters
      WHERE tenant_id = $1
      ORDER BY param_key ASC, valid_from DESC
    `,
    resolve: `
      SELECT param_value FROM hr_schema.payroll_parameters
      WHERE tenant_id = $1 AND param_key = $2
        AND valid_from <= $3 AND (valid_to IS NULL OR valid_to >= $3)
      ORDER BY valid_from DESC LIMIT 1
    `,
    create: `
      INSERT INTO hr_schema.payroll_parameters (tenant_id, param_key, param_value, valid_from, source)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING parameter_id, tenant_id, param_key, param_value, valid_from, valid_to, source, created_at
    `,
    listByKey: `
      SELECT param_value, valid_from, valid_to
      FROM hr_schema.payroll_parameters
      WHERE tenant_id = $1 AND param_key = $2
      ORDER BY valid_from ASC
    `,
  },

  salaryHistory: {
    listByEmployee: `
      SELECT salary_history_id, employee_id, tenant_id, monthly_salary, valid_from, valid_to, reason, created_at
      FROM hr_schema.salary_history
      WHERE employee_id = $1
      ORDER BY valid_from DESC
    `,
    resolve: `
      SELECT monthly_salary FROM hr_schema.salary_history
      WHERE employee_id = $1
        AND valid_from <= $2 AND (valid_to IS NULL OR valid_to >= $2)
      ORDER BY valid_from DESC LIMIT 1
    `,
    create: `
      INSERT INTO hr_schema.salary_history (employee_id, tenant_id, monthly_salary, valid_from, reason)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING salary_history_id, employee_id, tenant_id, monthly_salary, valid_from, valid_to, reason, created_at
    `,
  },

  clocking: {
    clock_in: `
      INSERT INTO hr_schema.clocking (employee_id, branch_id, clock_in, clock_out)
      VALUES ($1, $2, NOW(), NULL)
      RETURNING clocking_id
    `,
    manual_clock_in: `
      INSERT INTO hr_schema.clocking (employee_id, branch_id, clock_in, clock_out)
      VALUES ($1, $2, $3::timestamptz, NULL)
      RETURNING clocking_id
    `,
    manual_clock_out: `
      UPDATE hr_schema.clocking
      SET
        clock_out   = $2::timestamptz,
        turn_hours  = GREATEST(0, EXTRACT(EPOCH FROM ($2::timestamptz - clock_in)) / 3600)
      WHERE clocking_id = $1
        AND clock_out IS NULL
      RETURNING clocking_id
    `,
    get_open: `
      SELECT
        c.clocking_id,
        c.employee_id,
        c.branch_id,
        c.clock_in,
        c.clock_out,
        c.turn_hours
      FROM hr_schema.clocking c
      WHERE c.employee_id = $1
        AND c.clock_out IS NULL
      ORDER BY c.clock_in DESC
      LIMIT 1
    `,
    clock_out: `
      WITH open_clock AS (
        SELECT clocking_id
        FROM hr_schema.clocking
        WHERE employee_id = $1
          AND clock_out IS NULL
        ORDER BY clock_in DESC
        LIMIT 1
      )
      UPDATE hr_schema.clocking c
      SET 
        clock_out = NOW(),
        turn_hours = GREATEST(0, EXTRACT(EPOCH FROM (NOW() - c.clock_in)) / 3600)
      FROM open_clock oc
      WHERE c.clocking_id = oc.clocking_id
      RETURNING c.clocking_id 
    `,
    get_by_branch: `
      SELECT
        c.clocking_id,
        c.employee_id,
        c.branch_id,
        b.branch_name,
        e.first_name,
        e.last_name,
        c.clock_in::text AS clock_in,
        c.clock_out::text AS clock_out,
        c.turn_hours
      FROM hr_schema.clocking c
      INNER JOIN hr_schema.employee e USING(employee_id)
      INNER JOIN general_schema.branch b ON b.branch_id = c.branch_id
      WHERE c.branch_id = $1
      ORDER BY c.clock_in DESC
    `,
    get_by_employee: `
      SELECT
        c.clocking_id,
        c.employee_id,
        c.branch_id,
        b.branch_name,
        e.first_name,
        e.last_name,
        c.clock_in::text AS clock_in,
        c.clock_out::text AS clock_out,
        c.turn_hours
      FROM hr_schema.clocking c
      INNER JOIN hr_schema.employee e USING(employee_id)
      INNER JOIN general_schema.branch b ON b.branch_id = c.branch_id
      WHERE c.employee_id = $1
      ORDER BY c.clock_in DESC
    `,
  },
  payroll: {
    createPaysheet: `
      INSERT INTO hr_schema.paysheet (
        tenant_id, 
        branch_id, 
        period_start, 
        period_end, 
        status_id
      ) VALUES ($1, $2, $3, $4, 1) -- 1 suele ser 'Pendiente' o 'Abierta'
      RETURNING paysheet_id;
    `,
    checkExistingPeriod: `
      SELECT paysheet_id 
      FROM hr_schema.paysheet 
      WHERE branch_id = $1 
        AND tenant_id = $2 
        AND (
          (period_start <= $4 AND period_end >= $3) 
        )
        AND status_id != 3; 
    `,
    getEmployeeContractForPayroll: `
      SELECT
        e.employee_id,
        e.tenant_id,
        e.branch_id,
        c.contract_id,
        c.base_salary,
        c.hours,
        c.turn_type,
        c.journey_type,
        e.payment_schedule_id
      FROM hr_schema.employee e
      INNER JOIN hr_schema.contract c USING(contract_id)
      WHERE e.tenant_id = $1 AND e.branch_id = $2 AND e.is_active = true
    `,
    getConcepts: `
      SELECT 
        concept_id,
        name,
        type,
        calculation_method,
        is_taxable,
        base_value,
        code
      FROM hr_schema.payroll_concept
      WHERE tenant_id = $1 AND is_active = true;
    `,
    insertDetail: `
      INSERT INTO hr_schema.paysheet_detail (
        paysheet_id, employee_id, contract_id, payment_method_id, 
        gross_salary, total_earnings, total_deduction, net_salary, pay_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING detail_id;
    `,
    insertMovement: `
      INSERT INTO hr_schema.payroll_movement (
        detail_id, concept_id, base_amount, calculated_amount, description
      ) VALUES ($1, $2, $3, $4, $5);
    `,
    insertPayrollExpense: `
      INSERT INTO accounting_schema.expense
        (tenant_id, branch_id, category_id, description, amount, tax_amount,
         total_amount, currency_id, expense_date, payment_method, reference_number)
      SELECT
        $1::uuid, $2::uuid, ec.category_id,
        'Nómina ' || to_char($5::date, 'DD/MM/YYYY') || ' al ' || to_char($6::date, 'DD/MM/YYYY'),
        $3::numeric, 0, $3::numeric, 1, NOW()::date, 'TRANSFER', $4
      FROM accounting_schema.expense_category ec
      WHERE ec.tenant_id = $1::uuid AND ec.account_code = '5-1-001'
      LIMIT 1
    `,
    insertPaysheet: `
      INSERT INTO hr_schema.paysheet (
        tenant_id, 
        branch_id, 
        period_start, 
        period_end, 
        status_id
      ) VALUES ($1, $2, $3, $4, 1)
      RETURNING paysheet_id;
    `,
    closePaysheet: `
      UPDATE hr_schema.paysheet p
      SET
        payment_date = NOW(),
        total_earnings = sub.earnings,
        total_deductions = sub.deductions,
        net_total = sub.net,
        status_id = 2 -- Cerrada
      FROM (
        SELECT
          paysheet_id,
          SUM(gross_salary) AS gross,
          SUM(total_earnings) AS earnings,
          SUM(total_deduction) AS deductions,
          SUM(net_salary) AS net
        FROM hr_schema.paysheet_detail
        WHERE paysheet_id = $1
        GROUP BY paysheet_id  
      ) AS sub
      WHERE p.paysheet_id = sub.paysheet_id
      RETURNING p.paysheet_id, p.tenant_id, p.total_earnings, p.total_deductions, p.net_total;
    `,
    verifyPaysheet: `
      SELECT COUNT(*) AS total
      FROM hr_schema.paysheet_detail
      WHERE paysheet_id = $1;
    `,
    getIncapacities: `
      SELECT
        employee_id,
        type,
        period_start,
        period_end,
        days_paying,
        percentage_to_pay
      FROM hr_schema.incapacity
      WHERE branch_id = $1
        AND (period_start, period_end) OVERLAPS ($2, $3)
        AND is_active = true
    `,
    getSuspentionPeriod: `
      SELECT employee_id, suspention_start, suspention_end FROM hr_schema.suspention
      WHERE is_active = true
      AND (suspention_start, suspention_end) OVERLAPS ($1, $2)
    `,
    /**
     * Deducciones individuales activas por sucursal (Arts. 152, 154, 412,
     * 413), para aplicarlas por planilla mensual. installment_amount
     * IS NOT NULL descarta registros que solo tienen total_amount (sin
     * cuota periodica definida, ej. compensacion unica en liquidacion).
     */
    getActiveDeductionsForBranch: `
      SELECT ed.deduction_id, ed.employee_id, ed.kind, ed.installment_amount, ed.outstanding_balance
      FROM hr_schema.employee_deduction ed
      INNER JOIN hr_schema.employee e USING(employee_id)
      WHERE e.branch_id = $1
        AND ed.is_active = true
        AND ed.outstanding_balance > 0
        AND ed.installment_amount IS NOT NULL
    `,
  },

  payrollMovement: {
    getMovementsByPaysheet: `
      SELECT
        pm.movement_id,
        pm.detail_id,
        pm.concept_id,
        pm.base_amount,
        pm.calculated_amount,
        pm.description,
        pd.employee_id,
        pc.name AS concept_name,
        pc.type AS concept_type
      FROM hr_schema.payroll_movement pm
      INNER JOIN hr_schema.paysheet_detail pd USING(detail_id)
      INNER JOIN hr_schema.payroll_concept pc USING(concept_id)
      WHERE pd.paysheet_id = $1
    `,
    getMovementsByDetail: `
      SELECT * FROM hr_schema.payroll_movement WHERE detail_id = $1
    `,
  },

  incapacities: {
    create: `
      INSERT INTO hr_schema.incapacity (
          employee_id, branch_id, type,
          period_start, period_end, days_paying, percentage_to_pay
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING incapacity_id;
    `,
    byBranch: `
      SELECT * FROM hr_schema.incapacity
      WHERE branch_id = $1 AND is_active = true
    `,
    byEmployee: `
      SELECT * FROM hr_schema.incapacity
      WHERE employee_id = $1
    `,
    update: `
      UPDATE hr_schema.incapacity
      SET
        type = COALESCE($2, type),
        period_start = COALESCE($3, period_start),
        period_end = COALESCE($4, period_end),
        days_paying = COALESCE($5, days_paying),
        percentage_to_pay = COALESCE($6, percentage_to_pay),
        is_active = COALESCE($7, is_active)
      WHERE incapacity_id = $1
      RETURNING incapacity_id;
    `,
    deactivate: `
      UPDATE hr_schema.incapacity
      SET is_active = false
      WHERE incapacity_id = $1
      RETURNING incapacity_id;  
    `,
  },
  concept: {
    getAllByTenant: `
      SELECT
        concept_id, name, type, calculation_method,
        is_taxable, is_active, base_value, code
      FROM hr_schema.payroll_concept
      WHERE tenant_id = $1
      ORDER BY type DESC, name ASC
    `,
    getConceptById: `
      SELECT * FROM hr_schema.payroll_concept WHERE concept_id = $1 LIMIT 1
    `,
    reactivate: `
      UPDATE hr_schema.payroll_concept SET is_active = true
      WHERE concept_id = $1 RETURNING concept_id
    `,
    createConcept: `
      INSERT INTO hr_schema.payroll_concept (
        tenant_id, 
        name, 
        type,
        calculation_method,
        is_taxable,
        base_value,
        code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING concept_id;
    `,
    updateConcept: `
      UPDATE hr_schema.payroll_concept
      SET
        name = COALESCE($1, name),
        type = COALESCE($2, type),
        calculation_method = COALESCE($3, calculation_method),
        is_taxable = COALESCE($4, is_taxable),
        base_value = COALESCE($5, base_value)
      WHERE concept_id = $6
      RETURNING concept_id;
    `,
    softDelete: `
      UPDATE hr_schema.payroll_concept
      SET is_active = false
      WHERE concept_id = $1
      RETURNING concept_id;
    `,
    deleteConcept: `
      DELETE FROM hr_schema.payroll_concept WHERE concept_id = $1 RETURNING concept_id;
    `,
    provisionDefaults: `
      SELECT hr_schema.provision_tenant_payroll_concepts($1::uuid) AS created;
    `,
  },

  paysheet: {
    getTenantPaysheets: `
      SELECT * FROM hr_schema.paysheet WHERE tenant_id = $1
      ORDER BY created_at DESC
    `,
    getPaysheetById: `
      SELECT * FROM hr_schema.paysheet WHERE paysheet_id = $1 LIMIT 1
    `,
    getBranchPaysheets: `
      SELECT * FROM hr_schema.paysheet 
      WHERE  branch_id = $1
      ORDER BY created_at DESC
    `,
    getDetails: `
      SELECT * FROM hr_schema.paysheet_detail WHERE paysheet_id = $1
    `,
    filtrateByDate: `
      SELECT 
        p.paysheet_id,
        p.tenant_id,
        p.branch_id,
        p.period_start,
        p.period_end,
        p.payment_date,
        p.net_total,
        ps.status_description as paysheet_status
      FROM hr_schema.paysheet p
      INNER JOIN hr_schema.paysheet_status ps USING(status_id)
      WHERE p.branch_id = $1
        AND p.period_start >= $2
        AND p.period_end <= $3
      ORDER BY p.created_at DESC
    `,
  },

  suspention: {
    create: `
      INSERT INTO hr_schema.suspention(employee_id, suspention_start, suspention_end, reason, branch_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING suspention_id;
    `,
    getByBranch: `
      SELECT * FROM hr_schema.suspention WHERE branch_id = $1 AND is_active = true
    `,
    getById: `
      SELECT * FROM hr_schema.suspention WHERE suspention_id = $1 LIMIT 1
    `,
    getByEmployee: `
      SELECT * FROM hr_schema.suspention WHERE employee_id = $1 AND is_active = true
    `,
    updateSuspention: `
      UPDATE hr_schema.suspention
      SET
        suspention_start = COALESCE($1, suspention_start),
        suspention_end = COALESCE($2, suspention_end),
        reason = COALESCE($3, reason)
      WHERE suspention_id = $4 AND is_active = true
      RETURNING suspention_id;
    `,
    closeSuspention: `
      UPDATE hr_schema.suspention
      SET
        is_active = false
      WHERE suspention_id = $1
      RETURNING suspention_id;
    `,
    cronJobSuspention: `
      SELECT hr_schema.close_suspention()
    `,
  },
  turns: {
    create: `
      INSERT INTO hr_schema.turn (branch_id, entry, out)
      VALUES ($1, $2, $3)
      RETURNING turn_id;
    `,
    getEntry: `
      SELECT entry FROM hr_schema.turn WHERE turn_id = $1 LIMIT 1
    `,
    getOut: `
      SELECT out FROM hr_schema.turn WHERE turn_id = $1 LIMIT 1
    `,
    getByBranch: `
      SELECT * FROM hr_schema.turn WHERE branch_id = $1
    `,
    getById: `
      SELECT * FROM hr_schema.turn WHERE turn_id = $1
    `,
    updateTurn: `
      UPDATE hr_schema.turn
      SET
        entry = COALESCE($1, entry),
        out = COALESCE($2, out)
      WHERE turn_id = $3
      RETURNING turn_id;
    `,
    deleteTurn: `
      DELETE FROM hr_schema.turn WHERE turn_id = $1 RETURNING turn_id;
    `,
  },
  foul: {
    create: `
      INSERT INTO hr_schema.foul(employee_id, branch_id, identificator, foul_date, foul_hour, description)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING foul_id;
    `,
    foulCounts: `
      SELECT COUNT(*) AS total_fouls
      FROM hr_schema.foul
      WHERE employee_id = $1
        AND foul_date >= (CURRENT_DATE - INTERVAL '30 days')
      GROUP BY employee_id;
    `,
    getByBranch: `
      SELECT employee_id, identificator, foul_date, foul_hour, description
      FROM hr_schema.foul
      WHERE branch_id = $1
        AND foul_date >= (CURRENT_DATE - INTERVAL '30 days')
    `,
    foulCountByBranch: `
      SELECT COUNT(*) AS total_fouls
      FROM hr_schema.foul
      WHERE branch_id = $1
        AND foul_date >= (CURRENT_DATE - INTERVAL '30 days')
    `,
    getByEmployee: `
      SELECT * FROM hr_schema.foul WHERE employee_id = $1
    `,
    getByPeriod: `
      SELECT * FROM hr_schema.foul
      WHERE foul_date >= $1 AND foul_date <= $2 
    `,
    cleanOldFouls: `
      DELETE FROM hr_schema.foul
      WHERE branch_id = $1 AND foul_date < (CURRENT_DATE - INTERVAL '1 month' * $2)
    `,
    getConfigforBranch: `
      SELECT branch_id, foul_expiration_months FROM hr_schema.config 
    `,
  },
  tardiness: {
    getByBranch: `
      SELECT type, log, registered_at FROM hr_schema.tardiness
      WHERE branch_id = $1
        AND registered_at >= (CURRENT_DATE - INTERVAL '30 days')
    `,
    getByEmployee: `
      SELECT type, log, registered_at FROM hr_schema.tardiness
      WHERE employee_id = $1
        AND registered_at >= (CURRENT_DATE - INTERVAL '30 days')
    `,
    getByPeriod: `
      SELECT type, log, registered_at FROM hr_schema.tardiness
      WHERE registered_at >= $1 AND registered_at <= $2 AND branch_id = $3 
    `,
    create: `
      INSERT INTO hr_schema.tardiness (employee_id, branch_id, type, log, registered_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING tardiness_id;
    `,
    getCountByEmployee: `
      SELECT COUNT(*) AS total FROM hr_schema.tardiness
      WHERE employee_id = $1
        AND registered_at >= (CURRENT_DATE - INTERVAL '30 days')
    `,
    getCountByBranch: `
      SELECT COUNT(*) AS total FROM hr_schema.tardiness
      WHERE branch_id = $1
        AND registered_at >= (CURRENT_DATE - INTERVAL '30 days')
    `,
    getCountByPeriod: `
      SELECT COUNT(*) AS total FROM hr_schema.tardiness
      WHERE registered_at >= $1 AND registered_at <= $2 AND branch_id = $3
    `,
  },

  holidayLottt: {
    listByYear: `
      SELECT holiday_id, date, holiday_name, is_freeday, is_payable,
        tenant_id, holiday_year, is_recurring, source
      FROM hr_schema.holiday
      WHERE (holiday_year = $1 OR is_recurring = true)
        AND (tenant_id IS NULL OR tenant_id = $2)
      ORDER BY is_recurring DESC, date ASC
    `,
    checkDate: `
      SELECT holiday_id, holiday_name, source, is_recurring
      FROM hr_schema.holiday
      WHERE (tenant_id IS NULL OR tenant_id = $2)
        AND (
          (is_recurring = true
            AND EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM $1::date)
            AND EXTRACT(DAY FROM date) = EXTRACT(DAY FROM $1::date))
          OR (is_recurring = false AND date::date = $1::date)
        )
      LIMIT 1
    `,
    countDeclared: `
      SELECT COUNT(*) AS total FROM hr_schema.holiday
      WHERE holiday_year = $1 AND source <> 'ley'
        AND (tenant_id = $2 OR tenant_id IS NULL)
    `,
    create: `
      INSERT INTO hr_schema.holiday
        (date, holiday_name, is_freeday, is_payable, tenant_id, holiday_year, is_recurring, source)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING holiday_id, date, holiday_name, is_freeday, is_payable, tenant_id, holiday_year, is_recurring, source
    `,
  },

  overtimeRecord: {
    create: `
      INSERT INTO hr_schema.overtime_record
        (employee_id, branch_id, tenant_id, work_date, kind, hours, rate_factor, inspectoria_authorized, authorization_ref)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING overtime_id, employee_id, branch_id, tenant_id, work_date, kind, hours, rate_factor, inspectoria_authorized, authorization_ref, created_at
    `,
    listByEmployeeRange: `
      SELECT overtime_id, employee_id, branch_id, work_date, kind, hours, rate_factor, inspectoria_authorized, authorization_ref
      FROM hr_schema.overtime_record
      WHERE employee_id = $1 AND work_date BETWEEN $2 AND $3
      ORDER BY work_date ASC
    `,
    listByEmployeeRangeKind: `
      SELECT overtime_id, employee_id, branch_id, work_date, kind, hours, rate_factor, inspectoria_authorized, authorization_ref
      FROM hr_schema.overtime_record
      WHERE employee_id = $1 AND kind = $2 AND work_date BETWEEN $3 AND $4
      ORDER BY work_date ASC
    `,
    sumHoursByKindRange: `
      SELECT COALESCE(SUM(hours), 0) AS total
      FROM hr_schema.overtime_record
      WHERE employee_id = $1 AND kind = $2 AND work_date BETWEEN $3 AND $4
    `,
    listByEmployeeDateKind: `
      SELECT overtime_id, hours, rate_factor, inspectoria_authorized
      FROM hr_schema.overtime_record
      WHERE employee_id = $1 AND work_date = $2 AND kind = $3
    `,
    sumWeightedByBranchPeriod: `
      SELECT
        employee_id,
        kind,
        SUM(hours) AS raw_hours,
        SUM(hours * rate_factor) AS weighted_hours
      FROM hr_schema.overtime_record
      WHERE branch_id = $1 AND work_date BETWEEN $2 AND $3
      GROUP BY employee_id, kind
    `,
  },

  severanceDeposit: {
    create: `
      INSERT INTO hr_schema.severance_deposit
        (employee_id, tenant_id, quarter_start, quarter_end, days, integral_daily_salary, amount, deposit_made, deposit_date, location)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (employee_id, quarter_start) DO NOTHING
      RETURNING deposit_id, employee_id, quarter_start, quarter_end, days, integral_daily_salary, amount, deposit_made, deposit_date, location
    `,
    listByEmployee: `
      SELECT deposit_id, employee_id, tenant_id, quarter_start::text AS quarter_start, quarter_end::text AS quarter_end,
        days, integral_daily_salary, amount, deposit_made, deposit_date::text AS deposit_date, location
      FROM hr_schema.severance_deposit
      WHERE employee_id = $1
      ORDER BY quarter_start ASC
    `,
    getById: `
      SELECT deposit_id, employee_id, tenant_id, quarter_start::text AS quarter_start, quarter_end::text AS quarter_end,
        days, integral_daily_salary, amount, deposit_made, deposit_date::text AS deposit_date, location
      FROM hr_schema.severance_deposit
      WHERE deposit_id = $1 LIMIT 1
    `,
    listPending: `
      SELECT deposit_id, employee_id, quarter_start::text AS quarter_start, quarter_end::text AS quarter_end, amount
      FROM hr_schema.severance_deposit
      WHERE employee_id = $1 AND deposit_made = false
      ORDER BY quarter_start ASC
    `,
    updateDepositMade: `
      UPDATE hr_schema.severance_deposit
      SET deposit_made = $1, deposit_date = $2
      WHERE deposit_id = $3
      RETURNING deposit_id, employee_id, quarter_start, quarter_end, amount, deposit_made, deposit_date, location
    `,
    sumMadeAmount: `
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM hr_schema.severance_deposit
      WHERE employee_id = $1 AND deposit_made = true
    `,
  },

  severanceInterest: {
    create: `
      INSERT INTO hr_schema.severance_interest
        (deposit_id, employee_id, tenant_id, period_month, balance_base, applied_rate, rate_kind, amount)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (employee_id, deposit_id, period_month) DO NOTHING
      RETURNING interest_id, deposit_id, employee_id, period_month, balance_base, applied_rate, rate_kind, amount, capitalized
    `,
    listByEmployeeRange: `
      SELECT interest_id, deposit_id, employee_id, period_month, balance_base, applied_rate, rate_kind, amount, capitalized, paid_at
      FROM hr_schema.severance_interest
      WHERE employee_id = $1 AND period_month BETWEEN $2 AND $3
      ORDER BY period_month ASC
    `,
    sumCapitalized: `
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM hr_schema.severance_interest
      WHERE employee_id = $1 AND capitalized = true
    `,
    settleYear: `
      UPDATE hr_schema.severance_interest
      SET capitalized = $1, paid_at = CASE WHEN $1 = false THEN CURRENT_DATE ELSE paid_at END
      WHERE employee_id = $2 AND EXTRACT(YEAR FROM period_month) = $3
      RETURNING interest_id, period_month, amount, capitalized, paid_at
    `,
  },

  severanceAdvance: {
    create: `
      INSERT INTO hr_schema.severance_advance
        (employee_id, tenant_id, requested_amount, reason, reason_detail, guarantee_balance_at_request)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING advance_id, employee_id, requested_amount, reason, reason_detail, request_date, status, guarantee_balance_at_request
    `,
    listByEmployee: `
      SELECT advance_id, employee_id, requested_amount, approved_amount, reason, reason_detail, request_date, resolution_date, status
      FROM hr_schema.severance_advance
      WHERE employee_id = $1
      ORDER BY request_date DESC
    `,
    getById: `
      SELECT advance_id, employee_id, tenant_id, requested_amount, approved_amount, reason, status
      FROM hr_schema.severance_advance
      WHERE advance_id = $1 LIMIT 1
    `,
    sumApproved: `
      SELECT COALESCE(SUM(approved_amount), 0) AS total
      FROM hr_schema.severance_advance
      WHERE employee_id = $1 AND status = 'aprobado'
    `,
    approve: `
      UPDATE hr_schema.severance_advance
      SET status = 'aprobado', approved_amount = $1, resolution_date = $2
      WHERE advance_id = $3
      RETURNING advance_id, status, approved_amount, resolution_date
    `,
    reject: `
      UPDATE hr_schema.severance_advance
      SET status = 'rechazado', approved_amount = 0, resolution_date = $1
      WHERE advance_id = $2
      RETURNING advance_id, status, resolution_date
    `,
  },

  vacationPeriod: {
    create: `
      INSERT INTO hr_schema.vacation_period
        (employee_id, tenant_id, service_year, period_start, period_end, days_earned, bonus_days_earned)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (employee_id, service_year) DO NOTHING
      RETURNING vacation_period_id, employee_id, service_year, period_start, period_end, days_earned, bonus_days_earned, status
    `,
    listByEmployee: `
      SELECT vacation_period_id, employee_id, tenant_id, service_year,
        period_start::text AS period_start, period_end::text AS period_end,
        days_earned, bonus_days_earned, days_taken,
        enjoyed_from::text AS enjoyed_from, enjoyed_to::text AS enjoyed_to,
        normal_daily_salary, paid_amount, bonus_paid_amount, is_fractional, status
      FROM hr_schema.vacation_period
      WHERE employee_id = $1
      ORDER BY service_year ASC
    `,
    getById: `
      SELECT vacation_period_id, employee_id, tenant_id, service_year,
        period_start::text AS period_start, period_end::text AS period_end,
        days_earned, bonus_days_earned, days_taken,
        enjoyed_from::text AS enjoyed_from, enjoyed_to::text AS enjoyed_to,
        normal_daily_salary, paid_amount, bonus_paid_amount, status
      FROM hr_schema.vacation_period
      WHERE vacation_period_id = $1 LIMIT 1
    `,
    listPending: `
      SELECT vacation_period_id, employee_id, service_year, days_earned, days_taken,
        bonus_days_earned, bonus_paid_amount, status
      FROM hr_schema.vacation_period
      WHERE employee_id = $1 AND status IN ('causado', 'disfrutado')
      ORDER BY service_year ASC
    `,
    listBonusPending: `
      SELECT vacation_period_id, employee_id, service_year, bonus_days_earned, status
      FROM hr_schema.vacation_period
      WHERE employee_id = $1 AND bonus_paid_amount IS NULL AND status <> 'pagado'
      ORDER BY service_year ASC
    `,
    enjoy: `
      UPDATE hr_schema.vacation_period
      SET days_taken = $1, enjoyed_from = $2, enjoyed_to = $3,
        normal_daily_salary = $4, paid_amount = $5, status = 'disfrutando'
      WHERE vacation_period_id = $6
      RETURNING vacation_period_id, days_taken, days_earned, enjoyed_from, enjoyed_to, normal_daily_salary, paid_amount, status
    `,
    payBonus: `
      UPDATE hr_schema.vacation_period
      SET bonus_paid_amount = $1
      WHERE vacation_period_id = $2
      RETURNING vacation_period_id, bonus_paid_amount
    `,
  },

  profitSharingPeriod: {
    create: `
      INSERT INTO hr_schema.profit_sharing_period
        (tenant_id, fiscal_year, fiscal_year_start, fiscal_year_end, is_non_profit, payment_deadline)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING profit_period_id, tenant_id, fiscal_year, fiscal_year_start::text AS fiscal_year_start, fiscal_year_end::text AS fiscal_year_end,
        liquid_benefits, distribution_percentage, distributable_amount, total_earned_salaries,
        is_non_profit, status, closed_at, payment_deadline::text AS payment_deadline
    `,
    getById: `
      SELECT profit_period_id, tenant_id, fiscal_year, fiscal_year_start::text AS fiscal_year_start, fiscal_year_end::text AS fiscal_year_end,
        liquid_benefits, distribution_percentage, distributable_amount, total_earned_salaries,
        is_non_profit, status, closed_at, payment_deadline::text AS payment_deadline
      FROM hr_schema.profit_sharing_period
      WHERE profit_period_id = $1 LIMIT 1
    `,
    getByYear: `
      SELECT profit_period_id, tenant_id, fiscal_year, fiscal_year_start::text AS fiscal_year_start, fiscal_year_end::text AS fiscal_year_end,
        liquid_benefits, distribution_percentage, distributable_amount, total_earned_salaries,
        is_non_profit, status, closed_at, payment_deadline::text AS payment_deadline
      FROM hr_schema.profit_sharing_period
      WHERE tenant_id = $1 AND fiscal_year = $2 LIMIT 1
    `,
    listByTenant: `
      SELECT profit_period_id, tenant_id, fiscal_year, fiscal_year_start::text AS fiscal_year_start, fiscal_year_end::text AS fiscal_year_end,
        liquid_benefits, distribution_percentage, distributable_amount, total_earned_salaries,
        is_non_profit, status, closed_at, payment_deadline::text AS payment_deadline
      FROM hr_schema.profit_sharing_period
      WHERE tenant_id = $1
      ORDER BY fiscal_year DESC
    `,
    setLiquidBenefits: `
      UPDATE hr_schema.profit_sharing_period
      SET liquid_benefits = $1,
        distributable_amount = $1 * distribution_percentage
      WHERE profit_period_id = $2
      RETURNING profit_period_id, liquid_benefits, distribution_percentage, distributable_amount
    `,
    updatePercentage: `
      UPDATE hr_schema.profit_sharing_period
      SET distribution_percentage = $1,
        distributable_amount = COALESCE(liquid_benefits, 0) * $1
      WHERE profit_period_id = $2
      RETURNING profit_period_id, distribution_percentage, distributable_amount
    `,
    setTotals: `
      UPDATE hr_schema.profit_sharing_period
      SET total_earned_salaries = $1, status = 'calculado'
      WHERE profit_period_id = $2
      RETURNING profit_period_id, total_earned_salaries, status
    `,
    close: `
      UPDATE hr_schema.profit_sharing_period
      SET status = 'cerrado', closed_at = NOW()
      WHERE profit_period_id = $1
      RETURNING profit_period_id, status, closed_at
    `,
  },

  profitSharingDetail: {
    upsert: `
      INSERT INTO hr_schema.profit_sharing_detail
        (profit_period_id, employee_id, earned_salary, complete_months, daily_salary, raw_quota, min_cap, max_cap, final_amount)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (profit_period_id, employee_id) DO UPDATE SET
        earned_salary = EXCLUDED.earned_salary,
        complete_months = EXCLUDED.complete_months,
        daily_salary = EXCLUDED.daily_salary,
        raw_quota = EXCLUDED.raw_quota,
        min_cap = EXCLUDED.min_cap,
        max_cap = EXCLUDED.max_cap,
        final_amount = EXCLUDED.final_amount
      RETURNING profit_detail_id, profit_period_id, employee_id, earned_salary, complete_months,
        daily_salary, raw_quota, min_cap, max_cap, final_amount, advance_paid
    `,
    listByPeriod: `
      SELECT profit_detail_id, profit_period_id, employee_id, earned_salary, complete_months,
        daily_salary, raw_quota, min_cap, max_cap, final_amount, advance_paid, advance_paid_at
      FROM hr_schema.profit_sharing_detail
      WHERE profit_period_id = $1
    `,
    getByEmployee: `
      SELECT profit_detail_id, profit_period_id, employee_id, earned_salary, complete_months,
        daily_salary, raw_quota, min_cap, max_cap, final_amount, advance_paid, advance_paid_at
      FROM hr_schema.profit_sharing_detail
      WHERE profit_period_id = $1 AND employee_id = $2 LIMIT 1
    `,
    upsertAdvance: `
      INSERT INTO hr_schema.profit_sharing_detail
        (profit_period_id, employee_id, earned_salary, complete_months, daily_salary, min_cap, max_cap, advance_paid, advance_paid_at)
      VALUES ($1, $2, 0, 0, 0, 0, 0, $3, $4)
      ON CONFLICT (profit_period_id, employee_id) DO UPDATE SET
        advance_paid = hr_schema.profit_sharing_detail.advance_paid + EXCLUDED.advance_paid,
        advance_paid_at = EXCLUDED.advance_paid_at
      RETURNING profit_detail_id, profit_period_id, employee_id, advance_paid, advance_paid_at
    `,
  },

  settlement: {
    create: `
      INSERT INTO hr_schema.settlement
        (employee_id, tenant_id, branch_id, termination_date, payment_due_date, hire_date,
         complete_years, remainder_months, last_integral_daily_salary, last_normal_daily_salary,
         via1_amount, via2_amount, selected_via, severance_amount, advances_deducted,
         deductions_amount, subtotal, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'calculada')
      RETURNING settlement_id, employee_id, termination_date, payment_due_date, subtotal, status
    `,
    getById: `
      SELECT settlement_id, employee_id, tenant_id, branch_id,
        termination_date::text AS termination_date, payment_due_date::text AS payment_due_date,
        payment_date::text AS payment_date, hire_date::text AS hire_date, complete_years, remainder_months,
        last_integral_daily_salary, last_normal_daily_salary, via1_amount, via2_amount, selected_via, severance_amount,
        advances_deducted, deductions_amount, subtotal, mora_days, mora_rate, mora_amount, total, status
      FROM hr_schema.settlement
      WHERE settlement_id = $1 LIMIT 1
    `,
    getByEmployeeAndDate: `
      SELECT settlement_id FROM hr_schema.settlement
      WHERE employee_id = $1 AND termination_date = $2 LIMIT 1
    `,
    pay: `
      UPDATE hr_schema.settlement
      SET payment_date = $1, mora_days = $2, mora_rate = $3, mora_amount = $4,
        total = subtotal + $4, status = 'pagada'
      WHERE settlement_id = $5
      RETURNING settlement_id, payment_date, mora_days, mora_amount, total, status
    `,
    void: `
      UPDATE hr_schema.settlement
      SET status = 'anulada'
      WHERE settlement_id = $1
      RETURNING settlement_id, status
    `,
    listOverdue: `
      SELECT settlement_id, employee_id, tenant_id, termination_date, payment_due_date, subtotal
      FROM hr_schema.settlement
      WHERE tenant_id = $1 AND payment_date IS NULL AND status <> 'anulada'
        AND payment_due_date < CURRENT_DATE
      ORDER BY payment_due_date ASC
    `,
  },

  settlementItem: {
    create: `
      INSERT INTO hr_schema.settlement_item
        (settlement_id, code, concept_name, article, salary_basis, base_amount, days, amount, formula_text, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING settlement_item_id, code, concept_name, article, salary_basis, base_amount, days, amount, formula_text
    `,
    listBySettlement: `
      SELECT settlement_item_id, code, concept_name, article, salary_basis, base_amount, days, amount, formula_text, sort_order
      FROM hr_schema.settlement_item
      WHERE settlement_id = $1
      ORDER BY sort_order ASC
    `,
  },

  employeeBeneficiary: {
    create: `
      INSERT INTO hr_schema.employee_beneficiary
        (employee_id, tenant_id, full_name, doc_number, relationship, claim_date)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING beneficiary_id, employee_id, full_name, doc_number, relationship, claim_date, validated
    `,
    listByEmployee: `
      SELECT beneficiary_id, employee_id, full_name, doc_number, relationship, claim_date,
        validated, validated_at, share_percentage, share_amount, settlement_id
      FROM hr_schema.employee_beneficiary
      WHERE employee_id = $1 AND tenant_id = $2
        AND ($3::BOOLEAN IS NULL OR validated = $3::BOOLEAN)
      ORDER BY claim_date ASC
    `,
    listValidatedByEmployee: `
      SELECT beneficiary_id FROM hr_schema.employee_beneficiary
      WHERE employee_id = $1 AND tenant_id = $2 AND validated = true
    `,
    getById: `
      SELECT beneficiary_id, employee_id, tenant_id, full_name, doc_number, relationship, claim_date, validated
      FROM hr_schema.employee_beneficiary
      WHERE beneficiary_id = $1 LIMIT 1
    `,
    validate: `
      UPDATE hr_schema.employee_beneficiary
      SET validated = true, validated_at = $1
      WHERE beneficiary_id = $2 AND tenant_id = $3
      RETURNING beneficiary_id, validated, validated_at
    `,
    updateShare: `
      UPDATE hr_schema.employee_beneficiary
      SET share_percentage = $1, share_amount = $2, settlement_id = $3
      WHERE beneficiary_id = $4 AND tenant_id = $5
    `,
  },

  employeeDeduction: {
    create: `
      INSERT INTO hr_schema.employee_deduction
        (employee_id, tenant_id, kind, description, total_amount, installment_amount, outstanding_balance,
         authorized, authorization_date, authorization_ref, union_organization, start_date)
      VALUES ($1, $2, $3, $4, $5, $6, $5, $7, $8, $9, $10, $11)
      RETURNING deduction_id, employee_id, kind, description, total_amount, installment_amount,
        outstanding_balance, authorized, authorization_date, union_organization, start_date, is_active
    `,
    listByEmployee: `
      SELECT deduction_id, employee_id, kind, description, total_amount, installment_amount,
        outstanding_balance, authorized, authorization_date, union_organization, start_date, end_date, is_active
      FROM hr_schema.employee_deduction
      WHERE employee_id = $1
      ORDER BY start_date DESC
    `,
    listActiveByEmployee: `
      SELECT deduction_id, kind, installment_amount, outstanding_balance
      FROM hr_schema.employee_deduction
      WHERE employee_id = $1 AND is_active = true AND outstanding_balance > 0
        AND kind <> 'alimentaria'
    `,
    getById: `
      SELECT deduction_id, employee_id, tenant_id, kind, total_amount, installment_amount,
        outstanding_balance, authorized, is_active
      FROM hr_schema.employee_deduction
      WHERE deduction_id = $1 LIMIT 1
    `,
    update: `
      UPDATE hr_schema.employee_deduction
      SET
        authorized = COALESCE($1, authorized),
        is_active = COALESCE($2, is_active),
        end_date = COALESCE($3, end_date),
        outstanding_balance = COALESCE($4, outstanding_balance)
      WHERE deduction_id = $5
      RETURNING deduction_id, authorized, is_active, end_date, outstanding_balance
    `,
    applyPayment: `
      UPDATE hr_schema.employee_deduction
      SET outstanding_balance = outstanding_balance - $1,
          is_active = (outstanding_balance - $1 > 0)
      WHERE deduction_id = $2
      RETURNING deduction_id, outstanding_balance, is_active
    `,
    listOutstandingByEmployee: `
      SELECT deduction_id, kind, outstanding_balance
      FROM hr_schema.employee_deduction
      WHERE employee_id = $1 AND is_active = true AND outstanding_balance > 0
    `,
  },
};

export const hrQueries = createQueries(hrQueryDefs);
