import { createQueries } from '@resonance-components/datahandler';

export const conceptQueries = createQueries({
  concept: {
    getConceptById: `
      SELECT * FROM hr_schema.payroll_concept WHERE concept_id = $1 LIMIT 1
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
  },
});
