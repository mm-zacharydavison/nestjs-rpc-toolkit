import { Injectable } from '@nestjs/common';
import { RpcController, RpcMethod } from '@zdavison/nestjs-rpc-toolkit';

/**
 * Test case for type generation bugs (mirrors oddjob-contacts pattern):
 * 1. Type aliases should be exported
 * 2. Transitive type dependencies should be copied
 * 3. All locally-defined interfaces should be exported
 * 4. Forward-referenced types should also be included
 */

/**
 * JSON-like object type for RPC serialization
 */
type SerializableObject = { [key: string]: SerializableValue };
type SerializableValue = string | number | boolean | null | SerializableObject | SerializableValue[];

/**
 * Field definition for forms (RPC serializable version)
 */
interface RpcFormFieldDefinition {
  name: string;
  label: string;
  type: string;
  required: boolean | null;
  default: string | null;
  options: string[] | null;
  placeholder: string | null;
}

/**
 * RPC parameters for creating a dynamic form
 */
interface CreateFormRpcParams {
  purpose: string;
  title: string;
  description: string | null;
  fields: RpcFormFieldDefinition[];
  context: SerializableObject | null;
  submitButtonText: string | null;
}

/**
 * Full RPC request for creating a dynamic form
 */
interface CreateDynamicFormRequest {
  params: CreateFormRpcParams;
  userId: string;
  messengerAccountId: string;
}

/**
 * RPC response for form creation
 */
interface CreateDynamicFormResponse {
  formId: string;
  schema: SerializableObject;
  createdAt: string;
}

/**
 * RPC response for form data
 */
interface FormDataRpcResponse {
  schema: SerializableObject;
  uiSchema: SerializableObject | null;
  title: string;
  description: string | null;
  submitButtonText: string | null;
}

/**
 * RPC response for form status check
 */
interface FormStatusResponse {
  valid: boolean;
  reason: string | null;
}

@Injectable()
@RpcController('forms')
export class FormsService {
  /**
   * Create a dynamic form from field definitions
   */
  @RpcMethod()
  createDynamicForm(request: CreateDynamicFormRequest): Promise<CreateDynamicFormResponse> {
    return Promise.resolve({
      formId: `form-${Math.random().toString(36).substring(7)}`,
      schema: { type: 'object', properties: {} },
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Load form data by token (for rendering in the web UI)
   */
  @RpcMethod()
  async loadFormByToken(token: string): Promise<FormDataRpcResponse> {
    return {
      schema: { type: 'object' },
      uiSchema: null,
      title: 'Test Form',
      description: null,
      submitButtonText: null,
    };
  }

  /**
   * Check if a form is still valid (not expired or submitted)
   */
  @RpcMethod()
  async checkFormStatus(token: string): Promise<FormStatusResponse> {
    return { valid: true, reason: null };
  }

  /**
   * Get the form context (for callback processing)
   */
  @RpcMethod()
  async getFormContext(token: string): Promise<SerializableObject> {
    return {};
  }

  /**
   * Get callback route for a form
   */
  @RpcMethod()
  getFormCallbackRoute(token: string): Promise<string> {
    return Promise.resolve('/callback');
  }
}
