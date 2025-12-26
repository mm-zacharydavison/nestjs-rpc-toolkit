import { Observable } from 'rxjs';

/**
 * Minimal interface for ClientProxy that works with both NestJS 10 and 11.
 * NestJS 11 uses generic ClientProxy<EventsMap, Status>, while NestJS 10 uses non-generic.
 * This duck-typed interface ensures compatibility with both versions.
 */
export interface RpcClientProxy {
  send<TResult = any, TInput = any>(pattern: any, data: TInput): Observable<TResult>;
  emit<TResult = any, TInput = any>(pattern: any, data: TInput): Observable<TResult>;
}

export interface ModularModule {
  name: string;
  version: string;
  dependencies?: string[];
}

export interface ModuleEvent<T = any> {
  moduleId: string;
  eventName: string;
  payload: T;
  timestamp: Date;
}

export interface ModuleMessage<T = any> {
  id: string;
  from: string;
  to: string;
  type: string;
  payload: T;
  timestamp: Date;
}