// labeled as "Web client 1" in google console. This is a separate client because google auth is weird and we need to use launchWebAuthFlow for cross browser support
const LOGINFLOW_CLIENT_ID =
	'847025199863-7a24hn6s8mle7legvvfgs3hkcr1aiel8.apps.googleusercontent.com';
const EXTENSION_ID = 'nhimlmlbpdkjaefoniielbgghbnljgid';

document.addEventListener('DOMContentLoaded', async () => {
	const loginBtn = document.getElementById('login');
	loginBtn.addEventListener('click', onLaunchWebAuthFlow);
});

const onLaunchWebAuthFlow = async () => {
	try {
		const authUrl = new URL('https://accounts.google.com/o/oauth2/auth');

		const redirectUri = `https://${EXTENSION_ID}.chromiumapp.org`;

		const state = Math.random().toString(36).substring(7);

		const scopes = 'https://www.googleapis.com/auth/drive';

		authUrl.searchParams.set('state', state);
		authUrl.searchParams.set('client_id', LOGINFLOW_CLIENT_ID);
		authUrl.searchParams.set('redirect_uri', redirectUri);

		authUrl.searchParams.set('scope', scopes);
		authUrl.searchParams.set('response_type', 'code');
		authUrl.searchParams.set('access_type', 'offline');
		authUrl.searchParams.set('include_granted_scopes', 'true');
		authUrl.searchParams.set('prompt', 'consent');

		chrome.identity.launchWebAuthFlow(
			{
				url: authUrl.href,
				interactive: true,
			},
			async (redirectUrl) => {
				try {
					if (chrome.runtime.lastError || !redirectUrl) {
						return new Error(
							`WebAuthFlow failed: ${chrome.runtime.lastError.message}`
						);
					}

					const params = new URLSearchParams(redirectUrl.split('?')[1]);
					const code = params.get('code');

					if (!code) {
						return new Error('No code found');
					}

					let response;

					try {
						response = await fetch(
							'https://driveplusplustokenapi.collin22.dev/api/auth/token',
							{
								method: 'POST',
								headers: {
									'Content-Type': 'application/json',
								},
								body: JSON.stringify({
									code,
								}),
							}
						);

						const { accessToken, expiresAt, refreshToken } =
							await response.json();

						console.log('new access token', accessToken);

						if (accessToken) {
							// save the tokens and expiration time to Chrome Storage
							await chrome.storage.local.set({
								accessToken,
								refreshToken,
								expiresAt,
							});
						}
					} catch (error) {
						throw new Error('Failed to get access token: ' + error.message);
					}
				} catch (error) {
					throw new Error(`OAuth Sign-in failed: ${error.message}`);
				}
			}
		);
	} catch (error) {
		throw new Error(`Sign-in failed: ${error.message}`);
	}
};
