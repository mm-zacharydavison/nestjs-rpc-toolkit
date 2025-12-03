import { Module } from '@nestjs/common';
import { FormsService } from './forms.service';

@Module({
  providers: [FormsService],
  exports: [FormsService],
})
export class FormsModule {}
