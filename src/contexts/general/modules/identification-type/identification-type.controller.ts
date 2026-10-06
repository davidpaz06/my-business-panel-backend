import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { RoleAuthorizationGuard } from '@/common/guards/role_authorization.guard';
import { RequiredRole } from '@/common/decorators/role_metadata.decorator';
import { IdentificationTypeService } from './identification-type.service';
import { Controller, Delete, Get, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  getAllDocumentTypesDoc,
  getOneDocumentTypeDoc,
  deleteDocumentTypeDoc,
} from '@/docs/contexts/general/identification-type';

// Catalogo global: lectura con sesion; borrar solo el superusuario de plataforma.
@ApiTags('Document Type')
@UseGuards(AuthenticationGuard, RoleAuthorizationGuard)
@Controller('document')
export class IdentificationTypeController {
  constructor(
    private readonly documentTypeService: IdentificationTypeService,
  ) {}

  @ApiOperation(getAllDocumentTypesDoc.operation)
  @ApiResponse(getAllDocumentTypesDoc.responses[200])
  @ApiResponse(getAllDocumentTypesDoc.responses[401])
  @Get()
  getAll() {
    return this.documentTypeService.getAll();
  }

  @ApiOperation(getOneDocumentTypeDoc.operation)
  @ApiResponse(getOneDocumentTypeDoc.responses[200])
  @ApiResponse(getOneDocumentTypeDoc.responses[401])
  @ApiResponse(getOneDocumentTypeDoc.responses[404])
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.documentTypeService.getById(id);
  }

  @ApiOperation(deleteDocumentTypeDoc.operation)
  @ApiResponse(deleteDocumentTypeDoc.responses[200])
  @ApiResponse(deleteDocumentTypeDoc.responses[401])
  @ApiResponse(deleteDocumentTypeDoc.responses[404])
  @RequiredRole('superuser')
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.documentTypeService.delete(id);
  }
}
