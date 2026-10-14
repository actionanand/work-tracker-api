export interface CredentialEnvelope {
	cryptoVersion: 1;
	iv: string;
	ciphertext: string;
}

export interface Credential extends CredentialEnvelope {
	id: string;
	revision: number;
	createdAt: string;
	updatedAt: string;
}

export interface CredentialUpdate extends CredentialEnvelope {
	expectedRevision: number;
}

export interface VaultInitialization {
	cryptoVersion: 1;
	kdf: "PBKDF2-SHA-256";
	kdfIterations: number;
	salt: string;
	keyCheckIv: string;
	keyCheckCiphertext: string;
}

export type CredentialVault = { initialized: false } | (VaultInitialization & {
	initialized: true;
	createdAt: string;
	updatedAt: string;
});
