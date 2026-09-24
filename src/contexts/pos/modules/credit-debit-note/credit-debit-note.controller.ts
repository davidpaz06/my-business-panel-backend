import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreditDebitNoteService } from './credit-debit-note.service';
import {
  CreateCreditDebitNoteDto,
  VoidCreditDebitNoteDto,
} from './dto/credit-debit-note.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';

@ApiTags('Credit/Debit Notes')
@Controller('credit-debit-notes')
@UseGuards(AuthenticationGuard)
export class CreditDebitNoteController {
  constructor(private readonly service: CreditDebitNoteService) {}

  @Post()
  create(
    @Body() body: CreateCreditDebitNoteDto,
    @Session() user: IUserSession,
  ) {
    return this.service.create(user.tenant_id, user.user_id, body);
  }

  @Get('invoice/:invoiceId')
  listByInvoice(
    @Param('invoiceId') invoiceId: string,
    @Session() user: IUserSession,
  ) {
    return this.service.listByInvoice(user.tenant_id, invoiceId);
  }

  @Get()
  listByTenant(@Session() user: IUserSession) {
    return this.service.listByTenant(user.tenant_id);
  }

  @Patch(':noteId/void')
  voidNote(
    @Param('noteId') noteId: string,
    @Body() body: VoidCreditDebitNoteDto,
    @Session() user: IUserSession,
  ) {
    return this.service.voidNote(user.tenant_id, noteId, body);
  }
}
