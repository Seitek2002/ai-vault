import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { AuthModule } from './auth/auth.module';
import { DocumentsModule } from './documents/documents.module';
import { CounterpartiesModule } from './counterparties/counterparties.module';
import { FilesModule } from './files/files.module';
import { ExportModule } from './export/export.module';
import { SettingsModule } from './settings/settings.module';
import { TemplatesModule } from './templates/templates.module';
import { PositionsModule } from './positions/positions.module';
import { DocumentCategoriesModule } from './document-categories/document-categories.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),
    PrismaModule,
    StorageModule,
    AuthModule,
    DocumentsModule,
    CounterpartiesModule,
    FilesModule,
    ExportModule,
    SettingsModule,
    TemplatesModule,
    PositionsModule,
    DocumentCategoriesModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
