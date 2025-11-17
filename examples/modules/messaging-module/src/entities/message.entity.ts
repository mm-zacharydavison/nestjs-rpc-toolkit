/**
 * Source of a message
 */
export enum MessageSource {
  TELEGRAM = 'telegram',
  WHATSAPP = 'whatsapp',
  SMS = 'sms',
}

/**
 * An incoming message from a user
 */
export interface IncomingMessage {
  /** Unique identifier for the message */
  id: string;
  /** Source platform of the message */
  source: MessageSource;
  /** Chat ID where the message was sent */
  chatId: string;
  /** User ID who sent the message */
  userId: string;
  /** Username of the sender */
  username: string | null;
  /** Text content of the message */
  text: string;
  /** ISO 8601 timestamp when the message was received */
  timestamp: string;
  /** Additional metadata for the message */
  metadata: Record<string, string | number | boolean | null> | null;
}

/**
 * A queued message waiting to be processed
 */
export interface QueuedMessage extends IncomingMessage {
  /** ISO 8601 timestamp when the message was queued */
  queuedAt: string;
  /** Workflow ID processing this message */
  workflowId: string;
}
