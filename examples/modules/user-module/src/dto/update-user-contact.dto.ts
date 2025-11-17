import { ContactInfo } from '@shared/types';

/**
 * DTO for updating user contact information
 */
export interface UpdateUserContactDto {
  /** User ID to update */
  userId: number;
  /** Contact information from external package */
  contactInfo: ContactInfo;
}

/**
 * Response after updating user contact information
 */
export interface UpdateUserContactResponse {
  /** Whether the update was successful */
  success: boolean;
  /** The updated contact information */
  contactInfo: ContactInfo;
}
