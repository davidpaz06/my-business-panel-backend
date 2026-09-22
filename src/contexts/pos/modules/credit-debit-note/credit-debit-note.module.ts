import { Module } from '@nestjs/common';
import { CreditDebitNoteController } from './credit-debit-note.controller';
import { CreditDebitNoteService } from './credit-debit-note.service';

@Module({
  controllers: [CreditDebitNoteController],
  providers: [CreditDebitNoteService],
  exports: [CreditDebitNoteService],
})
export class CreditDebitNoteModule {}
