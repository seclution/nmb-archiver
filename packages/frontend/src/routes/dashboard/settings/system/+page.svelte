<script lang="ts">
	import type { PageData } from './$types';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import * as Label from '$lib/components/ui/label';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import * as Select from '$lib/components/ui/select';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte';
	import type { SupportedLanguage } from '@open-archiver/types';
	import { t } from '$lib/translations';

	let { data, form }: { data: PageData; form: any } = $props();
	let settings = $state(data.systemSettings);
	let nmbRevisionProofOverview = $derived(data.nmbRevisionProofOverview);
	let isSaving = $state(false);

	const languageOptions: { value: SupportedLanguage; label: string }[] = [
		{ value: 'en', label: '🇬🇧 English' },
		{ value: 'de', label: '🇩🇪 Deutsch' },
		{ value: 'fr', label: '🇫🇷 Français' },
		{ value: 'et', label: '🇪🇪 Eesti' },
		{ value: 'es', label: '🇪🇸 Español' },
		{ value: 'it', label: '🇮🇹 Italiano' },
		{ value: 'pt', label: '🇵🇹 Português' },
		{ value: 'nl', label: '🇳🇱 Nederlands' },
		{ value: 'el', label: '🇬🇷 Ελληνικά' },
		{ value: 'bg', label: '🇧🇬 български' },
		{ value: 'ja', label: '🇯🇵 日本語' },
	];

	const languageTriggerContent = $derived(
		languageOptions.find((lang) => lang.value === settings.language)?.label ??
			'Select a language'
	);

	$effect(() => {
		if (form?.success) {
			settings = form.settings;
			setAlert({
				type: 'success',
				title: 'Settings Updated',
				message: 'Your changes have been saved successfully.',
				duration: 3000,
				show: true,
			});
		} else if (form?.message) {
			setAlert({
				type: 'error',
				title: 'Update Failed',
				message: form.message,
				duration: 5000,
				show: true,
			});
		}
	});
</script>

<svelte:head>
	<title>{$t('app.system_settings.title')} - OpenArchiver</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold">{$t('app.system_settings.system_settings')}</h1>
		<p class="text-muted-foreground">{$t('app.system_settings.description')}</p>
	</div>

	<form method="POST" class="space-y-8" onsubmit={() => (isSaving = true)}>
		<Card.Root>
			<Card.Content class="space-y-4">
				<!-- Hide language setting for now -->
				<div class="grid gap-2">
					<Label.Root class="mb-1" for="language"
						>{$t('app.system_settings.language')}</Label.Root
					>
					<Select.Root name="language" bind:value={settings.language} type="single">
						<Select.Trigger class="w-[280px]">
							{languageTriggerContent}
						</Select.Trigger>
						<Select.Content>
							{#each languageOptions as lang}
								<Select.Item value={lang.value}>{lang.label}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>

				<div class="grid gap-2">
					<Label.Root class="mb-1">{$t('app.system_settings.default_theme')}</Label.Root>
					<RadioGroup.Root
						bind:value={settings.theme}
						name="theme"
						class="flex items-center gap-4"
					>
						<div class="flex items-center gap-2">
							<RadioGroup.Item value="light" id="light" />
							<Label.Root for="light">{$t('app.system_settings.light')}</Label.Root>
						</div>
						<div class="flex items-center gap-2">
							<RadioGroup.Item value="dark" id="dark" />
							<Label.Root for="dark">{$t('app.system_settings.dark')}</Label.Root>
						</div>
						<div class="flex items-center gap-2">
							<RadioGroup.Item value="system" id="system" />
							<Label.Root for="system">{$t('app.system_settings.system')}</Label.Root>
						</div>
					</RadioGroup.Root>
				</div>

				<div class="grid gap-2">
					<Label.Root class="mb-1" for="nmbRevisionProofInstanceId"
						>NMB Revision-Proof Instance ID</Label.Root
					>
					<Input
						id="nmbRevisionProofInstanceId"
						name="nmbRevisionProofInstanceId"
						type="text"
						placeholder="ArchiverInstanceCustomerX"
						bind:value={settings.nmbRevisionProof.instanceId}
						class="max-w-sm"
					/>
					<p class="text-muted-foreground text-xs">
						Used as the dedicated NMB prefix for revision-proof keys:
						<code>{'{'}instanceId{'}'}:{'{'}mailId{'}'}</code>
					</p>
				</div>

				<div class="grid gap-2">
					<Label.Root class="mb-1" for="nmbRevisionProofBackendUrl"
						>NMB Revision-Proof Backend URL</Label.Root
					>
					<Input
						id="nmbRevisionProofBackendUrl"
						name="nmbRevisionProofBackendUrl"
						type="url"
						placeholder="http://10.99.105.10"
						bind:value={settings.nmbRevisionProof.backendUrl}
						class="max-w-sm"
					/>
				</div>

				<div class="grid gap-2">
					<Label.Root class="mb-1" for="nmbRevisionProofRequestTimeoutMs"
						>NMB Revision-Proof Request Timeout (ms)</Label.Root
					>
					<Input
						id="nmbRevisionProofRequestTimeoutMs"
						name="nmbRevisionProofRequestTimeoutMs"
						type="number"
						min="1000"
						step="500"
						bind:value={settings.nmbRevisionProof.requestTimeoutMs}
						class="max-w-sm"
					/>
				</div>

				<div class="flex items-center gap-2">
					<input
						id="nmbRevisionProofDebugRequests"
						name="nmbRevisionProofDebugRequests"
						type="checkbox"
						bind:checked={settings.nmbRevisionProof.debugRequests}
					/>
					<Label.Root for="nmbRevisionProofDebugRequests"
						>Enable debug logging for NMB revision-proof `/save` and `/verify`</Label.Root
					>
				</div>

				<div class="grid gap-2">
					<Label.Root class="mb-1" for="supportEmail"
						>{$t('app.system_settings.support_email')}</Label.Root
					>
					<Input
						id="supportEmail"
						name="supportEmail"
						type="email"
						placeholder="support@example.com"
						bind:value={settings.supportEmail}
						class="max-w-sm"
					/>
				</div>
			</Card.Content>
			<Card.Footer class="border-t px-6 py-4">
				<Button type="submit" disabled={isSaving}>
					{#if isSaving}
						{$t('app.system_settings.saving')}...
					{:else}
						{$t('app.system_settings.save_changes')}
					{/if}
				</Button>
			</Card.Footer>
		</Card.Root>
	</form>

	<Card.Root>
		<Card.Header>
			<Card.Title>NMB Revision-Proof Status</Card.Title>
			<Card.Description>
				Overview of the dedicated NMB submission pipeline and separate scheduler path.
			</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-4 md:grid-cols-3">
			<div class="rounded-lg border p-4">
				<p class="text-muted-foreground text-sm">Configuration</p>
				<p class="mt-1 text-2xl font-semibold">
					{nmbRevisionProofOverview?.isConfigured ? 'active' : 'not configured'}
				</p>
			</div>
			<div class="rounded-lg border p-4">
				<p class="text-muted-foreground text-sm">Tracked emails</p>
				<p class="mt-1 text-2xl font-semibold">
					{nmbRevisionProofOverview?.totalTrackedEmails ?? 0}
				</p>
			</div>
			<div class="rounded-lg border p-4">
				<p class="text-muted-foreground text-sm">Last submission attempt</p>
				<p class="mt-1 text-sm font-medium">
					{nmbRevisionProofOverview?.lastSubmissionAttemptAt
						? new Date(
								nmbRevisionProofOverview.lastSubmissionAttemptAt
							).toLocaleString()
						: 'No attempts yet'}
				</p>
			</div>
			<div class="rounded-lg border p-4">
				<p class="text-muted-foreground text-sm">Pending</p>
				<p class="mt-1 text-2xl font-semibold">{nmbRevisionProofOverview?.pending ?? 0}</p>
			</div>
			<div class="rounded-lg border p-4">
				<p class="text-muted-foreground text-sm">Submitted</p>
				<p class="mt-1 text-2xl font-semibold">
					{nmbRevisionProofOverview?.submitted ?? 0}
				</p>
			</div>
			<div class="rounded-lg border p-4">
				<p class="text-muted-foreground text-sm">Failed</p>
				<p class="mt-1 text-2xl font-semibold">{nmbRevisionProofOverview?.failed ?? 0}</p>
			</div>
			<div class="rounded-lg border p-4 md:col-span-3">
				<p class="text-muted-foreground text-sm">Skipped not configured</p>
				<p class="mt-1 text-2xl font-semibold">
					{nmbRevisionProofOverview?.skippedNotConfigured ?? 0}
				</p>
			</div>
		</Card.Content>
	</Card.Root>
</div>
