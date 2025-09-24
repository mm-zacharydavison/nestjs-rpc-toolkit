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