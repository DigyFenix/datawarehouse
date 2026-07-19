import { Module } from '@nestjs/common';

import { BootstrapService } from './bootstrap.service';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';

@Module({
  controllers: [UsuariosController],
  providers: [UsuariosService, BootstrapService],
  exports: [UsuariosService],
})
export class UsuariosModule {}
