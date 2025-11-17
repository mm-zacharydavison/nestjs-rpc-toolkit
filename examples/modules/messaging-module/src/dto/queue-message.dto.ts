import { IncomingMessage } from '../entities/message.entity';

/**
 * DTO for queueing a message
 */
export interface QueueMessageDto {
  /** The incoming message to queue */
  message: IncomingMessage;
}
