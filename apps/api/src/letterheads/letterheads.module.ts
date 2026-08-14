import { Module } from '@nestjs/common';
import { LetterheadsService } from './letterheads.service';
import { LetterheadsController } from './letterheads.controller';

@Module({
  providers: [LetterheadsService],
  controllers: [LetterheadsController],
})
export class LetterheadsModule {}
