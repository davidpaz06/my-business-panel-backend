import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Patch,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { Session } from '@/common/decorators/session.decorator';
import {
  createSupplierDoc,
  createSuppliersBulkDoc,
  getAllSuppliersDoc,
  getSupplierByIdDoc,
  updateSupplierDoc,
  deleteSupplierDoc,
} from '@/docs/contexts/purchase/suppliers';
import { RateLimitGuard } from '@/common/rate-limit/rate-limit.guard';
import { RateLimit } from '@/common/rate-limit/rate-limit.decorator';

@ApiTags('Suppliers')
@UseGuards(AuthenticationGuard, RateLimitGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @ApiOperation(createSupplierDoc.operation)
  @ApiResponse(createSupplierDoc.responses[201])
  @ApiResponse(createSupplierDoc.responses[401])
  @Post()
  createSupplier(
    @Body() createSupplierDto: CreateSupplierDto,
    @Session() userSession: IUserSession,
  ) {
    return this.suppliersService.createSupplier(createSupplierDto, userSession);
  }

  @ApiOperation(createSuppliersBulkDoc.operation)
  @ApiResponse(createSuppliersBulkDoc.responses[201])
  @ApiResponse(createSuppliersBulkDoc.responses[401])
  @Post('bulk')
  @RateLimit('bulk')
  createSuppliersBulk(
    @Body() createSuppliersDto: CreateSupplierDto[],
    @Session() userSession: IUserSession,
  ) {
    return this.suppliersService.createSuppliersBulk(
      createSuppliersDto,
      userSession,
    );
  }

  @ApiOperation(getAllSuppliersDoc.operation)
  @ApiResponse(getAllSuppliersDoc.responses[200])
  @ApiResponse(getAllSuppliersDoc.responses[401])
  @Get()
  getAllSuppliers(@Session() userSession: IUserSession) {
    return this.suppliersService.getAllSuppliersByTenant(userSession.tenant_id);
  }

  @ApiOperation(getSupplierByIdDoc.operation)
  @ApiResponse(getSupplierByIdDoc.responses[200])
  @ApiResponse(getSupplierByIdDoc.responses[401])
  @Get(':id')
  getSupplierById(
    @Param('id') id: string,
    @Session() userSession: IUserSession,
  ) {
    return this.suppliersService.getSupplierById(id, userSession.tenant_id);
  }

  @ApiOperation(updateSupplierDoc.operation)
  @ApiResponse(updateSupplierDoc.responses[200])
  @ApiResponse(updateSupplierDoc.responses[401])
  @Patch(':id')
  updateSupplier(
    @Param('id') id: string,
    @Body() updateSupplierDto: UpdateSupplierDto,
    @Session() userSession: IUserSession,
  ) {
    return this.suppliersService.updateSupplier(
      id,
      updateSupplierDto,
      userSession.tenant_id,
    );
  }

  @ApiOperation(deleteSupplierDoc.operation)
  @ApiResponse(deleteSupplierDoc.responses[200])
  @ApiResponse(deleteSupplierDoc.responses[401])
  @Delete(':id')
  deleteSupplier(
    @Param('id') id: string,
    @Session() userSession: IUserSession,
  ) {
    return this.suppliersService.deleteSupplier(id, userSession.tenant_id);
  }
}
