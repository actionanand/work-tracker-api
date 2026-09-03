const textEncoder = new TextEncoder();

export function base64UrlEncode(bytes: Uint8Array): string {
	let binary = "";

	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}

export function base64UrlDecode(value: string): Uint8Array | null {
	if (!/^[A-Za-z0-9_-]*$/.test(value)) {
		return null;
	}

	if (value.length % 4 === 1) {
		return null;
	}

	const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(
		Math.ceil(value.length / 4) * 4,
		"=",
	);

	try {
		const binary = atob(padded);
		const bytes = new Uint8Array(binary.length);

		for (let index = 0; index < binary.length; index += 1) {
			bytes[index] = binary.charCodeAt(index);
		}

		return bytes;
	} catch {
		return null;
	}
}

export function base64UrlEncodeJson(value: unknown): string {
	return base64UrlEncode(textEncoder.encode(JSON.stringify(value)));
}

export function base64UrlDecodeJson<TValue>(value: string): TValue | null {
	const bytes = base64UrlDecode(value);

	if (!bytes) {
		return null;
	}

	try {
		return JSON.parse(new TextDecoder().decode(bytes)) as TValue;
	} catch {
		return null;
	}
}

export function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
	const length = Math.max(left.length, right.length);
	let difference = left.length ^ right.length;

	for (let index = 0; index < length; index += 1) {
		difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
	}

	return difference === 0;
}

type HmacKeyUsage = "sign" | "verify";

async function importHmacKey(
	secret: string,
	usages: HmacKeyUsage[],
): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		"raw",
		textEncoder.encode(secret),
		{
			name: "HMAC",
			hash: "SHA-256",
		},
		false,
		usages,
	);
}

export async function signHmacSha256(
	secret: string,
	value: string,
): Promise<Uint8Array> {
	const key = await importHmacKey(secret, ["sign"]);

	return new Uint8Array(
		await crypto.subtle.sign("HMAC", key, textEncoder.encode(value)),
	);
}

export async function verifyHmacSha256(
	secret: string,
	value: string,
	signature: Uint8Array,
): Promise<boolean> {
	const key = await importHmacKey(secret, ["verify"]);

	return crypto.subtle.verify("HMAC", key, signature, textEncoder.encode(value));
}
