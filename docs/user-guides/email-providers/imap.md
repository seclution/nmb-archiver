# Connecting to a Generic IMAP Server

This guide will walk you through connecting a standard IMAP email account as an ingestion source. This allows you to archive emails from any provider that supports the IMAP protocol, which is common for many self-hosted or traditional email services.

## Step-by-Step Guide

1.  **Navigate to Ingestion Sources:**
    From the main dashboard, go to the **Ingestions** page.

2.  **Create a New Source:**
    Click the **"Create New"** button to open the ingestion source configuration dialog.

3.  **Fill in the Configuration Details:**
    You will see a form with several fields. Here is how to fill them out for an IMAP connection:
    - **Name:** Give your ingestion source a descriptive name that you will easily recognize, such as "Work Email (IMAP)" or "Personal Gmail".

    - **Provider:** From the dropdown menu, select **"Generic IMAP"**. This will reveal the specific fields required for an IMAP connection.

    - **Host:** Enter the server address for your email provider's IMAP service. This often looks like `imap.your-provider.com` or `mail.your-domain.com`.

    - **Port:** Enter the port number for the IMAP server. For a secure connection (which is strongly recommended), this is typically `993`.

    - **Username:** Enter the full email address or username you use to log in to your email account.

    - **Password:** Enter the password for your email account.

4.  **Save Changes:**
    Once you have filled in all the details, click the **"Save changes"** button.

## Security Recommendation: Use an App Password

For enhanced security, we strongly recommend using an **"app password"** (sometimes called an "app-specific password") instead of your main account password.

Many email providers (like Gmail, Outlook, and Fastmail) allow you to generate a unique password that grants access only to a specific application (in this case, the archiving service). If you ever need to revoke access, you can simply delete the app password without affecting your main account login.

Please consult your email provider's documentation to see if they support app passwords and how to create one.

### How to Obtain an App Password for Gmail

1.  **Enable 2-Step Verification:** You must have 2-Step Verification turned on for your Google Account.
2.  **Go to App Passwords:** Visit [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords). You may be asked to sign in again.
3.  **Create the Password:**
    - At the bottom, click **"Select app"** and choose **"Other (Custom name)"**.
    - Give it a name you'll recognize, like "NMB Archiver".
    - Click **"Generate"**.
4.  **Use the Password:** A 16-digit password will be displayed. Copy this password and paste it into the **Password** field in the NMB Archiver ingestion source form.

### How to Obtain an App Password for Outlook/Microsoft Accounts

1.  **Enable Two-Step Verification:** You must have two-step verification enabled for your Microsoft account.
2.  **Go to Security Options:** Sign in to your Microsoft account and navigate to the [Advanced security options](https://account.live.com/proofs/manage/additional).
3.  **Create a New App Password:**
    - Scroll down to the **"App passwords"** section.
    - Click **"Create a new app password"**.
4.  **Use the Password:** A new password will be generated. Use this password in the **Password** field in the NMB Archiver ingestion source form.

## What Happens Next?

After you save the connection, the system will attempt to connect to the IMAP server. The status of the ingestion source will update to reflect its current state:

- **Importing:** The system is performing the initial, one-time import of all emails from your `INBOX`. This may take a while depending on the size of your mailbox.
- **Active:** The initial import is complete, and the system will now periodically check for and archive new emails.
- **Paused:** The connection is valid, but the system will not check for new emails until you resume it.
- **Error:** The system was unable to connect using the provided credentials. Please double-check your Host, Port, Username, and Password and try again.

You can view, edit, pause, or manually sync any of your ingestion sources from the main table on the **Ingestions** page.
