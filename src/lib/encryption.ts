import CryptoJS from "crypto-js";
import { v4 as uuidv4 } from "uuid";

export function generateEncryptionKey(): string {
  return uuidv4() + "-" + uuidv4();
}

export function encrypt(text: string, key: string): string {
  return CryptoJS.AES.encrypt(text, key).toString();
}

export function decrypt(ciphertext: string, key: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, key);
  return bytes.toString(CryptoJS.enc.Utf8);
}

export function encryptContact(
  contact: { name: string; email?: string; phone?: string; whatsapp?: string },
  key: string
) {
  return {
    encryptedName: encrypt(contact.name, key),
    encryptedEmail: contact.email ? encrypt(contact.email, key) : null,
    encryptedPhone: contact.phone ? encrypt(contact.phone, key) : null,
    encryptedWhatsApp: contact.whatsapp ? encrypt(contact.whatsapp, key) : null,
  };
}

export function decryptContact(
  encrypted: {
    encryptedName: string;
    encryptedEmail: string | null;
    encryptedPhone: string | null;
    encryptedWhatsApp: string | null;
  },
  key: string
) {
  return {
    name: decrypt(encrypted.encryptedName, key),
    email: encrypted.encryptedEmail
      ? decrypt(encrypted.encryptedEmail, key)
      : null,
    phone: encrypted.encryptedPhone
      ? decrypt(encrypted.encryptedPhone, key)
      : null,
    whatsapp: encrypted.encryptedWhatsApp
      ? decrypt(encrypted.encryptedWhatsApp, key)
      : null,
  };
}
