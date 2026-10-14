import { ManagedWriteError } from "../../shared/http/managed-write";
import { isRecord } from "../../shared/http/request-body";
import { invalidRequest } from "../../shared/http/validation";
import type { CredentialEnvelope, CredentialUpdate, VaultInitialization } from "./credential.types";

export const MAX_CREDENTIAL_BYTES = 65536;
export const MAX_CREDENTIAL_REQUEST_BYTES = 100 * 1024;
export const MAX_CREDENTIAL_BULK_DELETE = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

function reject(message: string, field?: string): never {
	throw new ManagedWriteError(invalidRequest(message, field));
}

function fields(body: Record<string, unknown>, allowed: readonly string[]) {
	if (Object.keys(body).some((key) => !allowed.includes(key))) reject("Unknown or read-only field");
}

function version(value: unknown): 1 {
	if (value !== 1) reject("Unsupported crypto version", "cryptoVersion");
	return 1;
}

function encoded(value: unknown, field: string, minBytes: number, maxBytes: number): string {
	if (typeof value !== "string" || value.length > Math.ceil(maxBytes * 4 / 3) || !BASE64URL.test(value) || value.length % 4 === 1) {
		reject("Expected bounded unpadded base64url", field);
	}
	const bytes = Math.floor(value.length * 3 / 4);
	// Reject noncanonical trailing bits without decoding or interpreting the payload.
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
	const remainder = value.length % 4;
	const last = alphabet.indexOf(value[value.length - 1]);
	if (bytes < minBytes || bytes > maxBytes || (remainder === 2 && last % 16 !== 0) || (remainder === 3 && last % 4 !== 0)) {
		reject("Invalid base64url size or encoding", field);
	}
	return value;
}

export function parseVaultInitialization(body: Record<string, unknown>): VaultInitialization {
	fields(body, ["cryptoVersion", "kdf", "kdfIterations", "salt", "keyCheckIv", "keyCheckCiphertext"]);
	const cryptoVersion = version(body.cryptoVersion);
	if (body.kdf !== "PBKDF2-SHA-256") reject("Unsupported KDF", "kdf");
	if (typeof body.kdfIterations !== "number" || !Number.isInteger(body.kdfIterations) || body.kdfIterations < 100000 || body.kdfIterations > 2000000) {
		reject("Expected an integer from 100000 to 2000000", "kdfIterations");
	}
	return {
		cryptoVersion, kdf: "PBKDF2-SHA-256", kdfIterations: body.kdfIterations,
		salt: encoded(body.salt, "salt", 16, 64),
		keyCheckIv: encoded(body.keyCheckIv, "keyCheckIv", 12, 12),
		keyCheckCiphertext: encoded(body.keyCheckCiphertext, "keyCheckCiphertext", 16, 1024),
	};
}

export function parseCredentialEnvelope(body: Record<string, unknown>, update: true): CredentialUpdate;
export function parseCredentialEnvelope(body: Record<string, unknown>, update?: false): CredentialEnvelope;
export function parseCredentialEnvelope(body: Record<string, unknown>, update = false): CredentialEnvelope | CredentialUpdate {
	fields(body, ["cryptoVersion", "iv", "ciphertext", ...(update ? ["expectedRevision"] : [])]);
	const envelope: CredentialEnvelope = {
		cryptoVersion: version(body.cryptoVersion),
		iv: encoded(body.iv, "iv", 12, 12),
		ciphertext: encoded(body.ciphertext, "ciphertext", 16, MAX_CREDENTIAL_BYTES),
	};
	if (!update) return envelope;
	if (typeof body.expectedRevision !== "number" || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1 || body.expectedRevision >= Number.MAX_SAFE_INTEGER) {
		reject("Expected a positive safe revision integer", "expectedRevision");
	}
	return { ...envelope, expectedRevision: body.expectedRevision };
}

export function parseCredentialId(value: unknown): string {
	if (typeof value !== "string" || !UUID.test(value.trim())) reject("Expected a credential UUID", "credentialId");
	return value.trim().toLowerCase();
}

export function parseCredentialIdSegment(value: string): string {
	let decoded: string;
	try { decoded = decodeURIComponent(value); } catch { reject("Expected a credential UUID", "credentialId"); }
	return parseCredentialId(decoded);
}

export function parseCredentialBulkDelete(body: Record<string, unknown>): string[] {
	fields(body, ["credentialIds"]);
	if (!Array.isArray(body.credentialIds) || body.credentialIds.length < 1 || body.credentialIds.length > MAX_CREDENTIAL_BULK_DELETE) {
		reject("Expected 1 to 25 credential UUIDs", "credentialIds");
	}
	const ids = body.credentialIds.map(parseCredentialId);
	if (new Set(ids).size !== ids.length) reject("Duplicate credential UUID", "credentialIds");
	return ids;
}

export async function credentialRequestBody(request: Request): Promise<Record<string, unknown>> {
	const contentType = request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
	if (contentType !== "application/json") {
		throw new ManagedWriteError(Response.json({ error: "Expected application/json" }, { status: 415 }));
	}
	if (!request.body) reject("Expected a JSON object");
	const reader = request.body.getReader();
	const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
	let text = "";
	let size = 0;
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > MAX_CREDENTIAL_REQUEST_BYTES) {
				await reader.cancel();
				throw new ManagedWriteError(Response.json({ error: "Credential request too large" }, { status: 413 }));
			}
			text += decoder.decode(value, { stream: true });
		}
		text += decoder.decode();
	} catch (error) {
		if (error instanceof ManagedWriteError) throw error;
		reject("Invalid request body");
	} finally {
		reader.releaseLock();
	}
	let parsed: unknown;
	try { parsed = JSON.parse(text); } catch { reject("Invalid JSON"); }
	if (!isRecord(parsed)) reject("Expected a JSON object");
	return parsed;
}
