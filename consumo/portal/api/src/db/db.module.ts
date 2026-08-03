import { Global, Module } from '@nestjs/common';
import { types } from 'pg';

import { ControlDbService } from './control-db.service';
import { TenantPoolsService } from './tenant-pools.service';

// Los bigint (int8) llegan como string por default; los ids del portal caben en
// Number sin pérdida. Aplica a TODOS los pools del proceso.
types.setTypeParser(types.builtins.INT8, (valor) => Number(valor));

@Global()
@Module({
  providers: [ControlDbService, TenantPoolsService],
  exports: [ControlDbService, TenantPoolsService],
})
export class DbModule {}
