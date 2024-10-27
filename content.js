const URLRE = /https:\/\/drive.google.com\/drive\/u\/(.+)\/folders\/(.+)/;

async function main() {
	document.getElementById('drive++')?.remove();
	const match = window.location.href.match(URLRE);
	if (!match) return;
	const id = match[2];
	if (!id) return;

	const body = document.querySelector('body');
	if (!body) return console.error('drive++ could not find the body element');

	const meta = await getMeta(id);

	try {
		// Fetch the HTML template
		const htmlTemplate = await loadHTMLTemplate(
			chrome.runtime.getURL('inject.html')
		);

		// Parse the HTML template and create a DOM element
		const templateElement = document.createElement('div');
		templateElement.innerHTML = htmlTemplate;

		meta.forEach(({ url }, idx) => {
			const inner = document.createElement('span');
			inner.innerText = url;
			inner.classList.add('urla');

			const img = document.createElement('img');
			img.classList.add('urlicon');
			img.src = `https://www.google.com/s2/favicons?domain=${url}`;
			img.alt = 'favicon';

			const x = document.createElement('div');
			x.classList.add('deleteicon');
			x.innerText = '✕';
			x.addEventListener('click', async () => {
				const newMeta = [...meta];
				newMeta.splice(idx, 1);
				await setMeta(id, newMeta);
				templateElement.classList.remove('outershow');
				templateElement.classList.add('outerhidden');
				main();
			});

			const a = document.createElement('a');
			a.href = url;
			a.target = '_blank';
			a.classList.add('urllink');
			a.appendChild(img);
			a.appendChild(inner);

			const outer = document.createElement('div');
			outer.classList.add('urlouter');
			outer.appendChild(a);
			outer.appendChild(x);

			if (idx === meta.length - 1) {
				outer.classList.add('lasturl');
			}

			templateElement.querySelector('.outer').appendChild(outer);
		});

		if (meta.length < 1) {
			templateElement.querySelector('.outer').classList.add('outerhidden');
		} else {
			templateElement.querySelector('.outer').classList.add('outershow');
		}

		document.body.appendChild(templateElement);

		templateElement
			.querySelector('.add')
			.addEventListener('click', async () => {
				const input = prompt('Enter URL to add to Drive++');
				if (!input || (typeof input === 'string' && input.trim().length < 1))
					return;
				await setMeta(id, [...meta, { url: input }]);

				templateElement.classList.remove('outershow');
				templateElement.classList.add('outerhidden');
				main();
			});
	} catch (error) {
		console.error('Error loading HTML template:', error);
	}
}

main();

async function loadHTMLTemplate(url) {
	const response = await fetch(url);
	return response.text();
}

// Override pushState
const originalPushState = history.pushState;
history.pushState = function (...args) {
	originalPushState.apply(this, args);
	main();
};

// Override replaceState
const originalReplaceState = history.replaceState;
history.replaceState = function (...args) {
	originalReplaceState.apply(this, args);
	main();
};

// Listen for the popstate event (back/forward navigation)
window.addEventListener('popstate', main);

// Optionally, listen to hashchange if only the hash part changes
window.addEventListener('hashchange', main);

let lastUrl = window.location.href;

const mainContent = document.querySelector('html');

const observer = new MutationObserver(() => {
	if (window.location.href !== lastUrl) {
		lastUrl = window.location.href;
		main();
	}
});

// Start observing
if (mainContent) {
	observer.observe(mainContent, { childList: true, subtree: true });
}

async function getMeta(folderId) {
	const result = await getMetaFile(folderId);
	if (!result || result.error || !result.id) return [];
	const json = await readFile(result.id);
	return json;
}

async function setMeta(folderId, content) {
	const curr = await getMetaFile(folderId);
	if (curr?.error) return;

	if (!curr) {
		if (content.length < 1) return;
		await createJSONFile('drive++meta.json', folderId, content);
	} else {
		if (content.length < 1) {
			await deleteFile(curr.id);
		} else {
			await updateJSONFile(curr.id, content);
		}
	}
}

/**
 * Gets the user's token.
 * @returns {Promise<string | null>} The user's token or null if the user is not logged in.
 */
async function getToken() {
	return new Promise((resolve, reject) => {
		chrome.storage.local.get(
			['accessToken', 'refreshToken', 'expiresAt'],
			async (items) => {
				const { accessToken, refreshToken, expiresAt } = items;

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

async function getMetaFile(folderId) {
	const token = await getToken();
	if (!token) return { error: 'noauth' };

	const query = `'${folderId}' in parents and name='drive++meta.json' and trashed=false`;
	const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
		query
	)}&fields=files(id, name)`;

	try {
		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		if (!response.ok) {
			throw new Error(`Error: ${response.statusText}`);
		}

		const data = await response.json();
		if (data.files && data.files.length > 0) {
			return data.files[0];
		} else {
			console.log('File not found.');
			return null;
		}
	} catch (error) {
		console.error('Error getting meat file: ', error);
		return null;
	}
}

async function readFile(fileId) {
	const token = await getToken();
	if (!token) return { error: 'noauth' };

	const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

	try {
		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/json', // Specify that we want JSON
			},
		});

		if (!response.ok) {
			throw new Error(`Error fetching file: ${response.statusText}`);
		}

		const jsonData = await response.json();
		return jsonData;
	} catch (error) {
		console.error('Error:', error);
	}
}

async function createJSONFile(fileName, folderId, content) {
	const token = await getToken();
	console.log('create token', token);
	if (!token) return { error: 'noauth' };

	const url =
		'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

	// File metadata (name and MIME type)
	const metadata = {
		name: fileName,
		mimeType: 'application/json',
		parents: [folderId],
	};

	// Boundary for the multipart request
	const boundary = '-------314159265358979323846';
	const delimiter = `\r\n--${boundary}\r\n`;
	const closeDelimiter = `\r\n--${boundary}--`;

	// Constructing the request body with metadata and JSON content
	const body = [
		delimiter,
		'Content-Type: application/json; charset=UTF-8\r\n\r\n',
		JSON.stringify(metadata),
		delimiter,
		'Content-Type: application/json\r\n\r\n',
		JSON.stringify(content),
		closeDelimiter,
	].join('');

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': `multipart/related; boundary="${boundary}"`,
			},
			body: body,
		});

		if (!response.ok) {
			throw new Error(`Error creating file: ${response.statusText}`);
		}

		const result = await response.json();
		return result; // Returns the metadata of the created file
	} catch (error) {
		console.error('Error:', error);
	}
}

async function updateJSONFile(fileId, content) {
	const token = await getToken();
	if (!token) return { error: 'noauth' };

	const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;

	try {
		const response = await fetch(url, {
			method: 'PATCH',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json', // JSON content type
			},
			body: JSON.stringify(content), // Updated JSON data
		});

		if (!response.ok) {
			throw new Error(`Error updating file: ${response.statusText}`);
		}

		const result = await response.json();
		return result; // Returns the metadata of the updated file
	} catch (error) {
		console.error('Error:', error);
	}
}

async function deleteFile(fileId) {
	const token = await getToken();
	if (!token) return { error: 'noauth' };

	const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;

	try {
		const response = await fetch(url, {
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		if (!response.ok) {
			throw new Error(`Error deleting file: ${response.statusText}`);
		}

		console.log(`File with ID ${fileId} deleted successfully.`);
		return { success: true };
	} catch (error) {
		console.error('Error:', error);
		return { error: error.message };
	}
}
