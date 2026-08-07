import { Global, Module } from '@nestjs/common';
import { UsersService } from './users.service';

/**
 * Global porque el FirebaseAuthGuard —que es global— necesita resolver el
 * usuario local en cada petición.
 */
@Global()
@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
