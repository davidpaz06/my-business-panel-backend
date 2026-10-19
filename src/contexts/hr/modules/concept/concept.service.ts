import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@resonance-components/datahandler';
import { hrQueries } from '@hr/hr.queries';
import { PayrollConceptRow } from '../payroll/interface/payroll-db.interface';
import { NewConceptDto } from './dto/newConcept.dto';
import { UpdateConceptDto } from './dto/updateConcept.dto';

const { concept } = hrQueries;

@Injectable()
export class ConceptService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getAllConceptsByTenant(tenantId: string): Promise<PayrollConceptRow[]> {
    const result = await this.db.query(concept.getAllByTenant, [tenantId]);
    return result.rows;
  }

  async reactivateConcept(conceptId: number) {
    const existing = await this.db.query(concept.getConceptById, [conceptId]);
    if (existing.rows.length === 0) throw new Error('Concept not found');

    const result = await this.db.query(concept.reactivate, [conceptId]);
    if (result.rows.length === 0)
      throw new Error('Error reactivating concept.');

    return {
      message: 'Concepto reactivado correctamente',
      concept: result.rows[0],
    };
  }

  async createNewConcept(data: NewConceptDto) {
    const { tenantId, name, type, calcMethod, isTaxable, baseValue, code } =
      data;

    const newConcept = await this.db.query(concept.createConcept, [
      tenantId,
      name,
      type,
      calcMethod,
      isTaxable,
      baseValue,
      code,
    ]);

    if (newConcept.rows.length === 0) {
      throw new Error('Error creating new concept');
    }

    return {
      message: 'Concept created successfully',
      conceptId: newConcept.rows[0].concept_id,
    };
  }

  async updateConcept(data: UpdateConceptDto, conceptId: number) {
    const existingConcept = await this.db.query(concept.getConceptById, [
      conceptId,
    ]);

    if (existingConcept.rows.length === 0) {
      throw new Error('Concept not found');
    }

    const { name, type, calcMethod, isTaxable, baseValue } = data;

    const updatedConcept = await this.db.query(concept.updateConcept, [
      name,
      type,
      calcMethod,
      isTaxable,
      baseValue,
      conceptId,
    ]);

    if (updatedConcept.rows.length === 0) {
      throw new Error('Error updating concept. Check input data.');
    }

    return {
      message: 'Concept updated successfully',
      concept: updatedConcept.rows[0],
    };
  }

  async softDeleteConcept(conceptId: number) {
    const existingConcept = await this.db.query(concept.getConceptById, [
      conceptId,
    ]);

    if (existingConcept.rows.length === 0) {
      throw new Error('Concept not found');
    }

    const softDeletedConcept = await this.db.query(concept.softDelete, [
      conceptId,
    ]);

    if (softDeletedConcept.rows.length === 0) {
      throw new Error('Error deactivating concept.');
    }

    return {
      message: 'Concept deactivated successfully',
      concept: softDeletedConcept.rows[0],
    };
  }

  async provisionDefaults(tenantId: string) {
    const result = await this.db.query(concept.provisionDefaults, [tenantId]);
    const created = Number(result.rows[0]?.created ?? 0);

    return {
      message:
        created > 0
          ? `${created} conceptos predeterminados creados correctamente`
          : 'El tenant ya tiene conceptos; no se crearon conceptos predeterminados',
      created,
    };
  }

  async deleteConcept(conceptId: number) {
    const existingConcept = await this.db.query(concept.getConceptById, [
      conceptId,
    ]);

    if (existingConcept.rows.length === 0) {
      throw new Error('Concept not found');
    }

    await this.db.query(concept.deleteConcept, [conceptId]);

    return {
      message: `Concept with id: ${conceptId} deleted successfully.`,
    };
  }
}
