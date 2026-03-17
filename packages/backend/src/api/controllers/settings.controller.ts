import type { Request, Response } from 'express';
import { SettingsService } from '../../services/SettingsService';
import { UserService } from '../../services/UserService';
import { NmbRevisionProofSubmissionService } from '../../services/NmbRevisionProofSubmissionService';

const settingsService = new SettingsService();
const userService = new UserService();
const nmbRevisionProofSubmissionService = new NmbRevisionProofSubmissionService();

export const getSystemSettings = async (req: Request, res: Response) => {
	try {
		const settings = await settingsService.getSystemSettings();
		res.status(200).json(settings);
	} catch (error) {
		// A more specific error could be logged here
		res.status(500).json({ message: req.t('settings.failedToRetrieve') });
	}
};

export const updateSystemSettings = async (req: Request, res: Response) => {
	try {
		// Basic validation can be performed here if necessary
		if (!req.user || !req.user.sub) {
			return res.status(401).json({ message: 'Unauthorized' });
		}
		const actor = await userService.findById(req.user.sub);
		if (!actor) {
			return res.status(401).json({ message: 'Unauthorized' });
		}
		const updatedSettings = await settingsService.updateSystemSettings(
			req.body,
			actor,
			req.ip || 'unknown'
		);
		res.status(200).json(updatedSettings);
	} catch (error) {
		// A more specific error could be logged here
		res.status(500).json({ message: req.t('settings.failedToUpdate') });
	}
};

export const getNmbRevisionProofOverview = async (req: Request, res: Response) => {
	try {
		const overview = await nmbRevisionProofSubmissionService.getOverview();
		res.status(200).json(overview);
	} catch (error) {
		res.status(500).json({ message: req.t('settings.failedToRetrieve') });
	}
};
