import { ClientProxy, ReadPacket, WritePacket } from '@nestjs/microservices';
import { InProcessTransportStrategy } from './in-process.transport';

export class InProcessClientProxy extends ClientProxy {
  private transport = InProcessTransportStrategy.getInstance();

  async connect(): Promise<void> {
    return Promise.resolve();
  }

  close(): void {
    // Nothing to close for in-memory transport
  }

  protected async dispatchEvent(packet: ReadPacket): Promise<any> {
    const { pattern, data } = packet;
    this.transport.emitEvent(pattern as string, data);
    return Promise.resolve();
  }

  protected publish(packet: ReadPacket, callback: (packet: WritePacket) => void): () => void {
    const { pattern, data } = packet;

    this.transport.sendMessage(pattern as string, data)
      .then(result => {
        callback({ response: result });
      })
      .catch(error => {
        callback({ err: error });
      });

    return () => {}; // Return cleanup function (no-op for in-memory)
  }
}