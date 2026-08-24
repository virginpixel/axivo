/**
 * Single source of truth for the asset-handover terms of responsibility, shown
 * on the acknowledgement page and in the generated handover document, and hashed
 * into the acknowledgement evidence.
 *
 * Bump HANDOVER_TERMS_VERSION whenever the wording below changes. The version in
 * force at signing is stored on each handover, so what a given employee agreed
 * to can always be proven even after the terms are later revised.
 */
export const HANDOVER_TERMS_VERSION = "2026-08-1";

export const HANDOVER_TERMS =
  "I hereby acknowledge that I have received the above mentioned asset/s. I understand that this/these asset/s belong to Dream Islands Development 2 Pvt. Ltd and is/are under my possession for carrying out my office work. I hereby assure that I will take care of the assets of the company to the best possible extent. Also, I am bound to return the specific asset/s when required by the company or at the termination of my employment.";
