import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TurnsService } from './turns.service';
import { RegisterTurnDto, UpdateTurnDto } from './dto/create_turn.dto';
import {
  createTurnDoc,
  getTurnsByBranchDoc,
  updateTurnDoc,
  deleteTurnDoc,
} from '@/docs/contexts/hr/turns';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';

@ApiTags('Turns')
@Controller('turns')
@UseGuards(AuthenticationGuard)
export class TurnsController {
  constructor(private readonly turnsService: TurnsService) {}

  @ApiOperation(createTurnDoc.operation)
  @ApiResponse(createTurnDoc.responses[201])
  @ApiResponse(createTurnDoc.responses[400])
  @ApiResponse(createTurnDoc.responses[401])
  @Post()
  async createTurn(@Body() body: RegisterTurnDto) {
    return this.turnsService.createNewTurn(body);
  }

  @ApiOperation(getTurnsByBranchDoc.operation)
  @ApiResponse(getTurnsByBranchDoc.responses[200])
  @ApiResponse(getTurnsByBranchDoc.responses[401])
  @Get('/branch/:branchId')
  async getTurnsByBranch(@Param('branchId') branchId: string) {
    return this.turnsService.getTurnsByBranch(branchId);
  }

  @ApiOperation(updateTurnDoc.operation)
  @ApiResponse(updateTurnDoc.responses[200])
  @ApiResponse(updateTurnDoc.responses[401])
  @Patch('/:turnId')
  async updateTurn(
    @Param('turnId') turnId: number,
    @Body() body: UpdateTurnDto,
  ) {
    return this.turnsService.updateTurn(turnId, body);
  }

  @ApiOperation(deleteTurnDoc.operation)
  @ApiResponse(deleteTurnDoc.responses[200])
  @ApiResponse(deleteTurnDoc.responses[401])
  @Delete('/:turnId')
  async deleteTurn(@Param('turnId') turnId: number) {
    return this.turnsService.deleteTurn(turnId);
  }
}
