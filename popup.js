import { getToken } from './utils.js';

document.addEventListener('DOMContentLoaded', async () => {
	const loggedInDiv = document.querySelector('.logged-in');
	const loggedOutDiv = document.querySelector('.logged-out');
	const loginBtn = document.querySelector('#login');

	const token = await getToken();
	if (token) {
		loggedInDiv.style.display = 'block';
	} else {
		loggedOutDiv.style.display = 'block';
	}

	loginBtn.addEventListener('click', () => {
		chrome.tabs.create({ url: 'login.html' });
	});
});
