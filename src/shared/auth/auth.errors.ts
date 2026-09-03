export class AuthConfigurationError extends Error {
	constructor() {
		super("Authentication configuration is invalid");
		this.name = "AuthConfigurationError";
	}
}
