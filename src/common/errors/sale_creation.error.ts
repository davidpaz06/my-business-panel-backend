import { HttpException, HttpStatus } from '@nestjs/common';

export class SaleCreationError extends HttpException {
  constructor(detail?: string) {
    super(
      {
        message: detail
          ? `Error Creating the Sale: ${detail}`
          : 'Error Creating the Sale. Please Check the Request',
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );

    this.name = 'SaleCreationError';
  }
}
