import { createHash } from 'crypto';

export interface VerificationManifestAttachment {
	filename: string;
	sizeBytes: number;
	contentHashSha256: string;
}

export interface VerificationManifest {
	emailHashSha256: string;
	attachments: VerificationManifestAttachment[];
}

const sortAttachments = (
	attachments: VerificationManifestAttachment[]
): VerificationManifestAttachment[] =>
	[...attachments].sort((a, b) => {
		if (a.filename !== b.filename) {
			return a.filename.localeCompare(b.filename);
		}
		if (a.sizeBytes !== b.sizeBytes) {
			return a.sizeBytes - b.sizeBytes;
		}
		return a.contentHashSha256.localeCompare(b.contentHashSha256);
	});

export const buildVerificationManifest = (
	emailHashSha256: string,
	attachments: VerificationManifestAttachment[]
): VerificationManifest => ({
	emailHashSha256,
	attachments: sortAttachments(attachments).map((attachment) => ({
		filename: attachment.filename,
		sizeBytes: attachment.sizeBytes,
		contentHashSha256: attachment.contentHashSha256,
	})),
});

export const computeVerificationRootHash = (manifest: VerificationManifest): string => {
	const canonicalManifest = JSON.stringify({
		emailHashSha256: manifest.emailHashSha256,
		attachments: manifest.attachments,
	});

	return createHash('sha256').update(canonicalManifest).digest('hex');
};
