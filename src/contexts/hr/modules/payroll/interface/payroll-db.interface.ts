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

/**
 * Deduccion individual activa (hr_schema.employee_deduction, Arts. 152,
 * 154, 412, 413) pendiente de aplicar en la planilla del periodo.
 */
export interface ActiveDeductionRow {
  deduction_id: string;
  employee_id: string;
  kind: 'deuda_patrono' | 'sindical' | 'alimentaria' | 'otra';
  installment_amount: string;
  outstanding_balance: string;
}

/** Mapea employee_deduction.kind al code de hr_schema.payroll_concept
 *  que absorbe su movimiento en la planilla mensual (ver seeds/catalog/hr/004). */
export const DEDUCTION_KIND_CONCEPT_CODE: Record<
  ActiveDeductionRow['kind'],
  string
> = {
  deuda_patrono: 'DPAT',
  sindical: 'SIND',
  alimentaria: 'ALIM',
  otra: 'OTRA',
};
