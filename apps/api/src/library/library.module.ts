import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CirculationService } from './circulation.service';
import { LibraryController } from './library.controller';

@Module({ controllers: [LibraryController], providers: [CatalogService, CirculationService] })
export class LibraryModule {}
