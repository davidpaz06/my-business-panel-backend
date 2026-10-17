import { Module } from '@nestjs/common';
import { AccountingModule } from '@/contexts/finances/modules/accounting/accounting.module';
import { CreditDebitNoteController } from './credit-debit-note.controller';
import { CreditDebitNoteService } from './credit-debit-note.service';

@Module({
  imports: [AccountingModule],
  controllers: [CreditDebitNoteController],
  providers: [CreditDebitNoteService],
  exports: [CreditDebitNoteService],
})
export class CreditDebitNoteModule {}
