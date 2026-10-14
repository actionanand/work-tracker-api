import type { Env } from "../../shared/env";
import { ManagedWriteError, noStore } from "../../shared/http/managed-write";
import { bulkDeleteCredentials, createCredential, deleteCredential, getCredential, getCredentialVault, initializeCredentialVault, listCredentials, updateCredential } from "./credential.service";
import { credentialRequestBody, parseCredentialBulkDelete, parseCredentialEnvelope, parseCredentialIdSegment, parseVaultInitialization } from "./credential.validation";

export const isCredentialPath = (pathname: string) => pathname === "/api/credentials" || pathname.startsWith("/api/credentials/");

export function credentialResponse(response: Response): Response {
	if (response.headers.get("Cache-Control") === "no-store" && response.headers.get("Pragma") === "no-cache") return response;
	const result = noStore(response);
	result.headers.set("Pragma", "no-cache");
	return result;
}

export async function handleCredentialRoutes(request: Request, url: URL, env: Env): Promise<Response | null> {
	if (!isCredentialPath(url.pathname)) return null;
	try {
		return credentialResponse(await dispatch(request, url.pathname, env));
	} catch (error) {
		if (error instanceof ManagedWriteError) return credentialResponse(error.response);
		// Never log request data, envelopes, metadata, or upstream SQL errors.
		console.error("CREDENTIAL_VAULT_INTERNAL_ERROR");
		return credentialResponse(Response.json({ error: "Credential Vault unavailable", code: "CREDENTIAL_VAULT_INTERNAL_ERROR" }, { status: 500 }));
	}
}

async function dispatch(request: Request, path: string, env: Env): Promise<Response> {
	let allow: string;
	if (path === "/api/credentials/vault") {
		if (request.method === "GET") return Response.json(await getCredentialVault(env));
		if (request.method === "POST") return Response.json(await initializeCredentialVault(env, parseVaultInitialization(await credentialRequestBody(request))), { status: 201 });
		allow = "GET, POST, OPTIONS";
	} else if (path === "/api/credentials/bulk-delete") {
		if (request.method === "POST") return Response.json(await bulkDeleteCredentials(env, parseCredentialBulkDelete(await credentialRequestBody(request))));
		allow = "POST, OPTIONS";
	} else if (path === "/api/credentials") {
		if (request.method === "GET") return Response.json(await listCredentials(env));
		if (request.method === "POST") return Response.json({ data: await createCredential(env, parseCredentialEnvelope(await credentialRequestBody(request))) }, { status: 201 });
		allow = "GET, POST, OPTIONS";
	} else {
		const match = path.match(/^\/api\/credentials\/([^/]+)$/);
		if (!match) return Response.json({ error: "Not found" }, { status: 404 });
		const id = parseCredentialIdSegment(match[1]);
		if (request.method === "GET") return Response.json({ data: await getCredential(env, id) });
		if (request.method === "PATCH") return Response.json({ data: await updateCredential(env, id, parseCredentialEnvelope(await credentialRequestBody(request), true)) });
		if (request.method === "DELETE") {
			await deleteCredential(env, id);
			return new Response(null, { status: 204 });
		}
		allow = "GET, PATCH, DELETE, OPTIONS";
	}
	return Response.json({ error: "Method not allowed" }, { status: 405, headers: { Allow: allow } });
}
