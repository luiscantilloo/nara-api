import { Global, Module } from '@nestjs/common';
import { MongoStore } from './mongo.store';

export const DOCUMENT_STORE = 'DOCUMENT_STORE';

@Global()
@Module({
  providers: [MongoStore, { provide: DOCUMENT_STORE, useExisting: MongoStore }],
  exports: [MongoStore, DOCUMENT_STORE],
})
export class DatabaseModule {}
