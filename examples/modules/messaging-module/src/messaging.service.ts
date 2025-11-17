import { Injectable } from '@nestjs/common';
import { RpcController, RpcMethod } from '@zdavison/nestjs-rpc-toolkit';
import { IncomingMessage, QueuedMessage } from './entities/message.entity';
import { QueueMessageDto } from './dto/queue-message.dto';

@Injectable()
@RpcController()
export class MessagingService {
  private queue: QueuedMessage[] = [];

  /**
   * Queue a message for processing
   * @param message - The incoming message to queue
   * @returns The queued message with additional metadata
   */
  @RpcMethod()
  async queueMessage(message: IncomingMessage): Promise<QueuedMessage> {
    const queuedMessage: QueuedMessage = {
      ...message,
      queuedAt: new Date().toISOString(),
      workflowId: `workflow-${Math.random().toString(36).substring(7)}`,
    };
    this.queue.push(queuedMessage);
    return queuedMessage;
  }

  /**
   * Get the current queue status
   * @returns Information about the message queue
   */
  @RpcMethod()
  async getQueueStatus(): Promise<{ connected: boolean; service: string; queueLength: number }> {
    return {
      connected: true,
      service: 'messaging',
      queueLength: this.queue.length,
    };
  }
}
