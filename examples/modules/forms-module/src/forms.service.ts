import { Injectable } from '@nestjs/common';
import { RpcController, RpcMethod } from '@zdavison/nestjs-rpc-toolkit';

/**
 * Test case for type generation bugs:
 * 1. Type aliases should be exported
 * 2. Transitive type dependencies should be copied
 * 3. All locally-defined interfaces should be exported
 */

// Bug 1 & 2: Type alias with recursive reference - both should be copied to generated file
type SerializableValue = string | number | boolean | null | SerializableObject | SerializableValue[];

// Type alias using above - should reference SerializableValue which must also be copied
type SerializableObject = { [key: string]: SerializableValue };

// Bug 3: Locally-defined interface should be exported (not just `interface`, but `export interface`)
interface RpcFormFieldDefinition {
  /** Name of the field */
  name: string;
  /** Display label for the field */
  label: string;
  /** Type of form field (text, number, select, etc.) */
  type: string;
  /** Whether the field is required */
  required: boolean;
  /** Default value for the field */
  defaultValue?: SerializableValue;
}

// Bug 2: Transitive dependency - CreateFormRpcParams references RpcFormFieldDefinition
interface CreateFormRpcParams {
  /** Purpose of the form */
  purpose: string;
  /** Field definitions for the form */
  fields: RpcFormFieldDefinition[];
  /** Optional metadata for the form */
  metadata?: SerializableObject;
}

// This is the type directly used by RPC method - it should be copied AND exported,
// but its dependencies (CreateFormRpcParams, RpcFormFieldDefinition, SerializableValue, SerializableObject)
// should ALSO be copied and exported
interface CreateDynamicFormRequest {
  /** Form creation parameters */
  params: CreateFormRpcParams;
  /** User ID creating the form */
  userId: string;
  /** Messenger account ID */
  messengerAccountId: string;
}

// Response type that also uses local types
interface CreateDynamicFormResponse {
  /** ID of the created form */
  formId: string;
  /** Schema of the created form */
  schema: SerializableObject;
  /** Creation timestamp */
  createdAt: string;
}

@Injectable()
@RpcController('forms')
export class FormsService {
  /**
   * Creates a dynamic form based on the provided parameters
   * @param request - The form creation request containing params, userId, and messengerAccountId
   * @returns The created form with its ID and schema
   */
  @RpcMethod()
  async createDynamicForm(request: CreateDynamicFormRequest): Promise<CreateDynamicFormResponse> {
    return {
      formId: `form-${Math.random().toString(36).substring(7)}`,
      schema: {
        type: 'object',
        properties: {},
      },
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Gets a form field definition by name
   * @param fieldName - The name of the field to get
   * @returns The field definition or null if not found
   */
  @RpcMethod()
  async getFieldDefinition(fieldName: string): Promise<RpcFormFieldDefinition | null> {
    return null;
  }
}
