export interface EmployeePayrollData {
  employee_id: string;
  tenant_id: string;
  branch_id: string;
  contract_id: string;
  base_salary: string;
  hours: number;
  turn_type: number;
  /** diurna | nocturna | mixta (Art. 173) — fuente de horas de jornada, ver JOURNEY_LIMITS. */
  journey_type: string;
  payment_schedule_id: number;
}

export interface PayrollConceptRow {
  concept_id: number;
  name: string;
  type: 'earning' | 'deduction';
  calculation_method: 'fixed' | 'percentage' | 'formula' | 'manual';
  is_taxable: boolean;
  is_active?: boolean;
  base_value: string;
  code?: string;
}

/**
 * Suma de horas con recargo por empleado y tipo (Arts. 117, 118, 120),
 * agregada desde hr_schema.overtime_record. weighted_hours ya incluye
 * el rate_factor efectivo del registro (1+recargo, o 2x el recargo sin
 * autorizacion de Inspectoria en horas extra, Art. 182): el monto se
 * obtiene multiplicando por el valor-hora normal, sin reaplicar el factor.
 */
export interface OvertimeSummary {
  employee_id: string;
  kind: 'nocturna' | 'extra' | 'feriado' | 'descanso';
  raw_hours: number;
  weighted_hours: number;
}

export interface Incapacities {
  employee_id: string;
  type: string;
  period_start: string;
  period_end: string;
  days_paying: number;
  percentage_to_pay: number;
}
