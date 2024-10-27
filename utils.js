/**
 * Gets the user's token.
 * @returns {Promise<string | null>} The user's token or null if the user is not logged in.
 */
export async function getToken() {
	return new Promise((resolve, reject) => {
		chrome.storage.local.get(
			['accessToken', 'refreshToken', 'expiresAt'],
			async (items) => {
				const { accessToken, refreshToken, expiresAt } = items;
				console.log('accessToken', accessToken);

				if (accessToken) {
					const nowInSeconds = Math.floor(Date.now() / 1000);
					const nowPlus60 = nowInSeconds + 60;

					// expired or will expire in the next 60 seconds
					if (expiresAt <= nowPlus60) {
						const response = await fetch(
							'https://driveplusplustokenapi.collin22.dev/api/auth/refresh',
							{
								method: 'POST',
								headers: {
									'Content-Type': 'application/json',
								},
								body: JSON.stringify({
									refresh_token: refreshToken,
								}),
							}
						);

						if (response.ok) {
							const { accessToken, expiresAt } = await response.json();
							chrome.storage.local.set({ accessToken, expiresAt });

							console.log('Access token refreshed');
							resolve(accessToken);
						} else {
							const data = await response.json();
							reject('request failed: ', data);
						}
					} else {
						resolve(accessToken);
					}
				} else {
					resolve(null);
				}
			}
		);
	});
}
