#!/usr/bin/env node
import { emitKeypressEvents } from "node:readline";
import { stdin, stdout, stderr, exit, env, argv } from "node:process";

const DEFAULT_ITERATIONS = 600000;
const MIN_ITERATIONS = 100000;
const MAX_ITERATIONS = 2000000;
const SALT_BYTES = 32;
const HASH_BYTES = 32;
const textEncoder = new TextEncoder();

function parseIterations() {
	const raw = env.AUTH_PASSWORD_ITERATIONS?.trim();
	const value = raw ? Number(raw) : DEFAULT_ITERATIONS;

	if (
		!Number.isInteger(value) ||
		value < MIN_ITERATIONS ||
		value > MAX_ITERATIONS
	) {
		throw new Error(
			`AUTH_PASSWORD_ITERATIONS must be an integer from ${MIN_ITERATIONS} to ${MAX_ITERATIONS}.`,
		);
	}

	return value;
}

function base64UrlEncode(bytes) {
	return Buffer.from(bytes).toString("base64url");
}

async function derivePasswordHash(password, salt, iterations) {
	const key = await crypto.subtle.importKey(
		"raw",
		textEncoder.encode(password),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const bits = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt,
			iterations,
			hash: "SHA-256",
		},
		key,
		HASH_BYTES * 8,
	);

	return new Uint8Array(bits);
}

async function promptHidden(prompt) {
	if (!stdin.isTTY) {
		throw new Error("Password input requires an interactive terminal.");
	}

	stdout.write(prompt);
	emitKeypressEvents(stdin);
	stdin.setRawMode(true);

	let value = "";

	return new Promise((resolve) => {
		function cleanup() {
			stdin.setRawMode(false);
			stdin.off("keypress", onKeypress);
			stdout.write("\n");
		}

		function onKeypress(character, key) {
			if (key?.ctrl && key.name === "c") {
				cleanup();
				exit(130);
			}

			if (key?.name === "return" || key?.name === "enter") {
				cleanup();
				resolve(value);
				return;
			}

			if (key?.name === "backspace") {
				value = value.slice(0, -1);
				return;
			}

			if (character) {
				value += character;
			}
		}

		stdin.on("keypress", onKeypress);
	});
}

try {
	if (argv.slice(2).some((argument) => argument.startsWith("--password"))) {
		throw new Error("Password CLI arguments are not accepted.");
	}

	const iterations = parseIterations();
	const password = await promptHidden("Password: ");

	if (!password) {
		throw new Error("Password cannot be empty.");
	}

	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const hash = await derivePasswordHash(password, salt, iterations);

	stdout.write("Copy these values into .dev.vars or Cloudflare Worker secrets:\n");
	stdout.write(`AUTH_PASSWORD_HASH=${base64UrlEncode(hash)}\n`);
	stdout.write(`AUTH_PASSWORD_SALT=${base64UrlEncode(salt)}\n`);
	stdout.write(
		`AUTH_PASSWORD_ITERATIONS=${iterations} # non-secret; this project keeps it in wrangler.jsonc\n`,
	);
} catch (error) {
	stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	exit(1);
}
