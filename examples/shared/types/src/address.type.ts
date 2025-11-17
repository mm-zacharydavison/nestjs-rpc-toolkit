/**
 * Address information for a user
 */
export interface Address {
  /** Street address line 1 */
  street: string;
  /** Street address line 2 (optional) */
  street2?: string;
  /** City name */
  city: string;
  /** State or province */
  state: string;
  /** Postal or ZIP code */
  postalCode: string;
  /** Country name */
  country: string;
}

/**
 * Contact information
 */
export interface ContactInfo {
  /** Primary phone number */
  phone: string;
  /** Alternative phone number */
  alternatePhone?: string;
  /** Physical address */
  address: Address;
}
