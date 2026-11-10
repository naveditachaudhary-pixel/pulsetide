# First-time Azure setup

This takes about 20 minutes in the [Azure portal](https://portal.azure.com) and only has to be done once. After that, every push to `main` deploys automatically.

You'll create two things:
- a **Function App**, which runs the checks every 5 minutes;
- a **Static Web App**, which hosts the dashboard and its API.

Both share one storage account, which holds the results.

> **No Azure subscription?** Students can get [Azure for Students](https://azure.microsoft.com/free/students) credits with a university email, and no credit card is needed. Pulsetide uses only a few cents of credit a month.

## 1. Create the Function App (the checker)

1. In the portal, search for **Function App** and click **Create**.
2. Choose the **Flex Consumption** hosting option, then **Select**.
3. **Basics** tab:
   - **Resource group:** create a new one called `pulsetide`.
   - **Function App name:** something unique, such as `pulsetide-checker-<your initials>`. Write it down.
   - **Region:** one near you, e.g. *East US 2*.
   - **Runtime stack:** Node.js, **version 22**.
4. **Storage** tab: keep the new storage account it suggests. Pulsetide stores its data there too.
5. Click **Review + create**, then **Create**, and wait about 2 minutes.

## 2. Give the checker access to storage

1. Open the new **storage account**. It's in the `pulsetide` resource group.
2. Go to **Security + networking → Access keys**. Next to *key1 → Connection string*, click **Show**, then copy it.
3. Open the **Function App** and go to **Settings → Environment variables**. Click **+ Add**:
   - **Name:** `PULSETIDE_STORAGE`
   - **Value:** the connection string you copied

   Then click **Apply** and confirm.

## 3. Let GitHub deploy the checker

1. In the Function App, go to **Settings → Configuration → General settings**.
2. Turn **SCM Basic Auth Publishing Credentials** **On**, then click **Save**.
3. Go to **Overview** and click **Get publish profile**. A file downloads.
4. In GitHub, open the `pulsetide` repo and go to **Settings → Secrets and variables → Actions**:
   - **Secrets** tab → **New repository secret**. Name it `AZURE_FUNCTIONAPP_PUBLISH_PROFILE`, open the downloaded file in a text editor, and paste its whole contents as the value.
   - **Variables** tab → **New repository variable**. Name it `AZURE_FUNCTIONAPP_NAME`, with your Function App name as the value.

## 4. Create the Static Web App (the dashboard)

1. In the portal, search for **Static Web Apps** and click **Create**.
2. **Resource group:** `pulsetide`. **Name:** `pulsetide`. **Plan type:** **Free**.
3. **Deployment details → Source:** choose **Other**. GitHub Actions in the repo already handles deploys.
4. Click **Review + create**, then **Create**.
5. Open the new Static Web App:
   - On **Overview**, click **Manage deployment token**, then copy the token. In GitHub, add it as a secret named `AZURE_STATIC_WEB_APPS_API_TOKEN`.
   - Go to **Settings → Environment variables** and add `PULSETIDE_STORAGE` with the same connection string as in step 2. Click **Apply**.

## 5. Deploy

1. In GitHub, go to **Actions → CI/CD → Run workflow**.
2. When it's green, open the URL shown on the Static Web App's **Overview** page. It looks like `https://<random-words>.azurestaticapps.net`.

The first checks run within 5 minutes. Until then the page says *Waiting for the first checks*.

## Checking that it works

- **Function App → Overview → `check-sites` → Invocations** lists each run, with one log line per site.
- If the dashboard says *"The status service isn't configured yet"*, the `PULSETIDE_STORAGE` variable is missing from the **Static Web App**.
- If a deploy job is skipped, its notice in the Actions log says which secret is missing.

Never paste the connection string, the publish profile or the deployment token into code or a GitHub file. They only belong in the Azure settings and in GitHub's **Secrets** page.
