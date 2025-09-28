// During development, use a relative path so Vite dev server proxy forwards requests to the backend.
// In production builds, use the deployed backend URL.
export const ADMIN_PATH = import.meta.env.PROD
	? 'https://eggbucketretailadmin.onrender.com/api/admin'
	: '/api/admin';

// Alternative production endpoints (examples):
// 'https://eggbucketretailadmin.onrender.com/api/admin'
// 'https://eggbucketretailadmin-production.up.railway.app/api/admin'
