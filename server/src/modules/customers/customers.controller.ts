import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PERMISSIONS } from '../../common/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../users/user.types';
import { CreateCustomerDto, ListCustomersQueryDto, UpdateCustomerDto } from './customers.dto';
import { CustomersService } from './customers.service';

const uuidPipe = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CUSTOMERS_VIEW)
  list(@Query() query: ListCustomersQueryDto) {
    return this.customers.list(query);
  }

  @Get('options')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_VIEW)
  options(@Query('search') search?: string) {
    return this.customers.options(search);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_VIEW)
  get(@Param('id', uuidPipe) id: string) {
    return this.customers.getById(id);
  }

  @Get(':id/devices')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_VIEW)
  devices(@Param('id', uuidPipe) id: string) {
    return this.customers.devices(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CUSTOMERS_MANAGE)
  create(@Body() dto: CreateCustomerDto, @CurrentUser() user: AuthUser) {
    return this.customers.create(dto, { id: user.id, username: user.username });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_MANAGE)
  update(
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.customers.update(id, dto, { id: user.id, username: user.username });
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_MANAGE)
  remove(@Param('id', uuidPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.customers.remove(id, { id: user.id, username: user.username });
  }
}
