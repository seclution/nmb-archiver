import { Request, Response } from 'express';
import {
	ArchivedEmailService,
	ARCHIVED_EMAIL_NOT_FOUND,
	DELETION_BLOCKED_BY_RETENTION,
	EXTERNAL_TOMBSTONE_SUBMISSION_FAILED,
	MANUAL_DELETE_REASON_REQUIRED,
	MANUAL_DELETE_REASON_TOO_SHORT,
	NOT_AUTHORIZED_TO_DELETE,
} from '../../services/ArchivedEmailService';
import { UserService } from '../../services/UserService';
import { checkDeletionEnabled } from '../../helpers/deletionGuard';

export class ArchivedEmailController {
	private userService = new UserService();
	public getArchivedEmails = async (req: Request, res: Response): Promise<Response> => {
		try {
			const { ingestionSourceId } = req.params;
			const page = parseInt(req.query.page as string, 10) || 1;
			const limit = parseInt(req.query.limit as string, 10) || 10;
			const userId = req.user?.sub;

			if (!userId) {
				return res.status(401).json({ message: req.t('errors.unauthorized') });
			}

			const result = await ArchivedEmailService.getArchivedEmails(
				ingestionSourceId,
				page,
				limit,
				userId
			);
			return res.status(200).json(result);
		} catch (error) {
			console.error('Get archived emails error:', error);
			return res.status(500).json({ message: req.t('errors.internalServerError') });
		}
	};

	public getArchivedEmailById = async (req: Request, res: Response): Promise<Response> => {
		try {
			const { id } = req.params;
			const includeVerification = req.query.includeVerification === 'true';
			const userId = req.user?.sub;

			if (!userId) {
				return res.status(401).json({ message: req.t('errors.unauthorized') });
			}
			const actor = await this.userService.findById(userId);
			if (!actor) {
				return res.status(401).json({ message: req.t('errors.unauthorized') });
			}

			const email = await ArchivedEmailService.getArchivedEmailById(
				id,
				userId,
				actor,
				req.ip || 'unknown',
				{ includeVerification }
			);
			if (!email) {
				return res.status(404).json({ message: req.t('archivedEmail.notFound') });
			}
			return res.status(200).json(email);
		} catch (error) {
			console.error(`Get archived email by id ${req.params.id} error:`, error);
			return res.status(500).json({ message: req.t('errors.internalServerError') });
		}
	};

	public deleteArchivedEmail = async (req: Request, res: Response): Promise<Response> => {
		try {
			checkDeletionEnabled();
			const { id } = req.params;
			const userId = req.user?.sub;
			if (!userId) {
				return res.status(401).json({ message: req.t('errors.unauthorized') });
			}
			const actor = await this.userService.findById(userId);
			if (!actor) {
				return res.status(401).json({ message: req.t('errors.unauthorized') });
			}
			const reason =
				typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
			await ArchivedEmailService.deleteArchivedEmail(id, actor, req.ip || 'unknown', {
				reason,
			});
			return res.status(204).send();
		} catch (error) {
			console.error(`Delete archived email ${req.params.id} error:`, error);
			if (error instanceof Error) {
				if (error.message === ARCHIVED_EMAIL_NOT_FOUND) {
					return res.status(404).json({ message: req.t('archivedEmail.notFound') });
				}
				if (error.message === NOT_AUTHORIZED_TO_DELETE) {
					return res.status(403).json({ message: req.t('errors.noPermissionToAction') });
				}
				if (
					error.message === MANUAL_DELETE_REASON_REQUIRED ||
					error.message === MANUAL_DELETE_REASON_TOO_SHORT
				) {
					return res.status(400).json({ message: error.message });
				}
				if (error.message === DELETION_BLOCKED_BY_RETENTION) {
					return res.status(409).json({ message: error.message });
				}
				if (error.message === EXTERNAL_TOMBSTONE_SUBMISSION_FAILED) {
					return res.status(503).json({ message: error.message });
				}
				return res.status(500).json({ message: error.message });
			}
			return res.status(500).json({ message: req.t('errors.internalServerError') });
		}
	};
}
